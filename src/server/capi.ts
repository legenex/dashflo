import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { capiHash } from "@/lib/hash";

// Meta CAPI event firing. When no access token is configured the exact
// outbound payload is logged to the event log (mock mode) so behavior is
// inspectable offline. Test leads never fire (enforced by callers).

interface CapiLead {
  id: string;
  campaignId: string;
  fieldData: Record<string, unknown>;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  state: string | null;
  salePriceCents: number | null;
}

export function buildCapiPayload(
  lead: CapiLead,
  eventName: "Lead" | "Purchase",
  pixelId: string
): Record<string, unknown> {
  const userData: Record<string, unknown> = {};
  if (lead.normalizedEmail) userData.em = [capiHash(lead.normalizedEmail)];
  if (lead.normalizedPhone) userData.ph = [capiHash(lead.normalizedPhone.replace(/\D/g, ""))];
  const firstName = lead.fieldData.first_name;
  const lastName = lead.fieldData.last_name;
  if (typeof firstName === "string" && firstName) userData.fn = [capiHash(firstName)];
  if (typeof lastName === "string" && lastName) userData.ln = [capiHash(lastName)];
  if (lead.state) userData.st = [capiHash(lead.state)];
  const zip = lead.fieldData.zip;
  if (typeof zip === "string" && zip) userData.zp = [capiHash(zip.slice(0, 5))];

  const event: Record<string, unknown> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: `${lead.id}:${eventName}`,
    action_source: "system_generated",
    user_data: userData,
  };
  if (eventName === "Purchase") {
    event.custom_data = {
      currency: "USD",
      value: (lead.salePriceCents ?? 0) / 100,
    };
  }
  return { data: [event], pixel_id: pixelId };
}

export async function fireCapiEvent(
  organizationId: string,
  lead: CapiLead,
  eventName: "Lead" | "Purchase"
): Promise<void> {
  const db = await getDb();
  const campaign = await db.query.campaigns.findFirst({
    where: (c, { eq: eqOp }) => eqOp(c.id, lead.campaignId),
  });
  const config = campaign?.capiConfig;
  if (!config?.enabled) return;
  if (eventName === "Lead" && !config.events.received) return;
  if (eventName === "Purchase" && !config.events.sold) return;

  const pixelId = config.pixel_id ?? "PIXEL_UNSET";
  const payload = buildCapiPayload(lead, eventName, pixelId);
  const token = config.access_token || process.env.META_CAPI_TOKEN || "";

  let status: "sent" | "mock_logged" | "failed" = "mock_logged";
  let response: Record<string, unknown> = { mode: "mock", note: "no access token set, payload logged locally" };

  if (token) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000),
        }
      );
      response = { status: res.status, body: (await res.text()).slice(0, 1000) };
      status = res.ok ? "sent" : "failed";
    } catch (err) {
      status = "failed";
      response = { error: err instanceof Error ? err.message : "request failed" };
    }
  }

  await db.insert(schema.capiEvents).values({
    id: newId("cev"),
    organizationId,
    campaignId: lead.campaignId,
    leadId: lead.id,
    eventName,
    payload,
    response,
    status,
    at: new Date(),
  });
}

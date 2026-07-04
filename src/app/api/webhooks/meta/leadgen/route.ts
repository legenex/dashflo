import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ingestLeadFormSubmission } from "@/server/integrations";

export const dynamic = "force-dynamic";

// Meta leadgen webhook. GET handles the subscription verification handshake,
// POST receives lead events, fetches the submission with the stored token,
// and routes it through the mapped campaign's full ingest pipeline.

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";

  const db = await getDb();
  const connectors = await db.query.connectorStatuses.findMany({
    where: eq(schema.connectorStatuses.provider, "meta_ads"),
  });
  const valid = connectors.some((c) => String(c.config.verify_token ?? "") === token && token !== "");
  if (mode === "subscribe" && valid) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("verification failed", { status: 403 });
}

interface LeadgenEntry {
  changes?: Array<{ field?: string; value?: { leadgen_id?: string; form_id?: string; page_id?: string } }>;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as { entry?: LeadgenEntry[] };
  const db = await getDb();
  const results: Array<Record<string, unknown>> = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen" || !change.value?.form_id || !change.value.leadgen_id) continue;
      const formId = change.value.form_id;

      const form = await db.query.integrationAssets.findFirst({
        where: and(eq(schema.integrationAssets.kind, "lead_form"), eq(schema.integrationAssets.extId, formId)),
      });
      if (!form) {
        results.push({ form_id: formId, skipped: "unknown form" });
        continue;
      }

      const connector = await db.query.connectorStatuses.findFirst({
        where: and(
          eq(schema.connectorStatuses.organizationId, form.organizationId),
          eq(schema.connectorStatuses.provider, "meta_ads")
        ),
      });
      const token = String(connector?.config.access_token ?? "");
      let fields: Record<string, unknown> = {};
      if (token) {
        try {
          const res = await fetch(
            `https://graph.facebook.com/v21.0/${change.value.leadgen_id}?fields=field_data&access_token=${token}`,
            { signal: AbortSignal.timeout(15000) }
          );
          const lead = (await res.json()) as { field_data?: Array<{ name: string; values: string[] }> };
          for (const f of lead.field_data ?? []) fields[f.name] = f.values?.[0] ?? "";
        } catch {
          results.push({ form_id: formId, error: "graph fetch failed" });
          continue;
        }
      } else {
        results.push({ form_id: formId, error: "no access token stored" });
        continue;
      }

      const result = await ingestLeadFormSubmission({
        organizationId: form.organizationId,
        formExtId: formId,
        fields,
      });
      results.push({ form_id: formId, ok: result.ok, message: result.message });
    }
  }

  return NextResponse.json({ received: true, results });
}

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { emitLive } from "@/lib/sse";
import { invalidateTruthCache } from "./truth-data";
import { rebuildPeriods } from "./matching";
import { httpDeliver } from "./ingest";
import { buildAuthHeaders, buildBody } from "@/domain/routing/pipeline";
import { evaluateMatcher, extractPriceCents } from "@/domain/routing/template";
import { addDays, toDateKey } from "@/lib/transforms";

// Lead lifecycle mutations outside the ingest pipeline.

export async function markLeadReturned(
  organizationId: string,
  leadId: string,
  by: string
): Promise<{ ok: boolean; message: string }> {
  const db = await getDb();
  const lead = await db.query.leads.findFirst({
    where: and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, organizationId)),
  });
  if (!lead) return { ok: false, message: "Lead not found" };
  if (lead.status !== "sold") return { ok: false, message: `Only sold leads can be returned (status: ${lead.status})` };

  await db
    .update(schema.leads)
    .set({ status: "returned", returnedAt: new Date() })
    .where(eq(schema.leads.id, leadId));
  await db.insert(schema.leadEvents).values({
    id: newId("lev"),
    organizationId,
    leadId,
    kind: "returned",
    detail: { by, revenue_clawback_cents: lead.salePriceCents },
    at: new Date(),
  });
  await rebuildPeriods(organizationId);
  invalidateTruthCache(organizationId);
  emitLive({
    organizationId,
    kind: "lead_returned",
    title: "Lead returned, revenue clawed back",
    amountCents: lead.salePriceCents,
    link: `/leads?status=returned`,
  });
  return { ok: true, message: "Lead returned and revenue clawed back" };
}

// Manually deliver a lead to a specific buyer (bypasses filters and caps,
// used from the lead drawer and buyer payload tester flows).
export async function sendLeadToBuyer(
  organizationId: string,
  leadId: string,
  buyerId: string
): Promise<{ ok: boolean; message: string }> {
  const db = await getDb();
  const [lead, buyer] = await Promise.all([
    db.query.leads.findFirst({
      where: and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, organizationId)),
    }),
    db.query.buyers.findFirst({
      where: and(eq(schema.buyers.id, buyerId), eq(schema.buyers.organizationId, organizationId)),
    }),
  ]);
  if (!lead || !buyer) return { ok: false, message: "Lead or buyer not found" };
  if (lead.status === "sold") return { ok: false, message: "Lead is already sold" };

  const config = buyer.deliveryConfig;
  const tokens: Record<string, unknown> = {
    ...lead.fieldData,
    lead_id: lead.id,
    phone: lead.normalizedPhone,
    email: lead.normalizedEmail,
    state: lead.state,
    timestamp: new Date().toISOString(),
  };
  const template = config.body_template ?? config.post_template ?? "{}";
  const headers = buildAuthHeaders(config);
  const body = buildBody(config, template, tokens);
  const result = await httpDeliver({
    url: config.url,
    method: "POST",
    headers,
    body,
    timeoutMs: config.timeout_ms ?? 8000,
  });

  const accepted = !result.error && !result.timedOut && evaluateMatcher(config.success_matcher, result.body, result.parsed);
  const extractedPrice = config.price_path ? extractPriceCents(result.parsed, config.price_path) : null;

  await db.insert(schema.distributionAttempts).values({
    id: newId("att"),
    organizationId,
    leadId,
    buyerId,
    attemptType: "delivery",
    requestPayload: { url: config.url, body, manual: true },
    responsePayload: { status: result.status, body: result.body.slice(0, 4000) },
    responseCode: result.status,
    bidCents: extractedPrice,
    outcome: accepted ? "accepted" : result.timedOut ? "timeout" : result.error ? "error" : "rejected",
    durationMs: result.durationMs,
    at: new Date(),
  });

  if (accepted) {
    const soldAt = new Date();
    const price = extractedPrice && extractedPrice > 0 ? extractedPrice : buyer.priceDefaultCents;
    await db
      .update(schema.leads)
      .set({
        status: "sold",
        buyerId,
        salePriceCents: price,
        soldAt,
        paymentDueDate: addDays(soldAt, buyer.paymentTermsDays),
      })
      .where(eq(schema.leads.id, leadId));
    await db.insert(schema.leadEvents).values({
      id: newId("lev"),
      organizationId,
      leadId,
      kind: "accepted",
      detail: { buyer: buyer.name, manual: true, price_cents: price },
      at: new Date(),
    });
    if (!lead.isTest) {
      await db.insert(schema.leadEvents).values({
        id: newId("lev"),
        organizationId,
        leadId,
        kind: "revenue_booked",
        detail: { amount_cents: price, buyer: buyer.name, due: toDateKey(addDays(soldAt, buyer.paymentTermsDays)) },
        at: new Date(),
      });
      emitLive({
        organizationId,
        kind: "lead_sold",
        title: `Manually sold to ${buyer.name}`,
        amountCents: price,
      });
    }
    invalidateTruthCache(organizationId);
    return { ok: true, message: `Accepted by ${buyer.name}` };
  }

  await db.insert(schema.leadEvents).values({
    id: newId("lev"),
    organizationId,
    leadId,
    kind: "rejected",
    detail: { buyer: buyer.name, manual: true, code: result.status },
    at: new Date(),
  });
  return { ok: false, message: `Buyer responded ${result.status}: not accepted` };
}

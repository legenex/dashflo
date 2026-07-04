import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { sha256Hex } from "@/lib/hash";
import { emitLive } from "@/lib/sse";
import { validateAndTransform } from "@/domain/routing/validate";
import { evaluateFilters } from "@/domain/routing/rules";
import { findDuplicate } from "@/domain/routing/dedupe";
import { CapLedger, type CapUsage } from "@/domain/routing/caps";
import {
  orderBuyers,
  routeDirectPost,
  routePingPost,
  selectEligibleBuyers,
  type HttpDeliver,
  type RoutableBuyer,
  type RouteOutcome,
} from "@/domain/routing/pipeline";
import { fireAutomations } from "./automations";
import { dispatchWebhookEvent } from "./webhooks";
import { fireCapiEvent } from "./capi";
import { invalidateTruthCache } from "./truth-data";
import { addDays, toDateKey } from "@/lib/transforms";
import type { LeadEventKind } from "@/db/schema";

// The ingest pipeline: everything that happens when a lead arrives.

interface CapLedgerGlobal {
  __dashflo_cap_ledger?: CapLedger;
}
const g = globalThis as unknown as CapLedgerGlobal;
const capLedger = (g.__dashflo_cap_ledger ??= new CapLedger());

export const httpDeliver: HttpDeliver = async ({ url, headers, body, timeoutMs }) => {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      body: text,
      parsed,
      durationMs: Date.now() - started,
      timedOut: false,
    };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      ok: false,
      status: 0,
      body: "",
      parsed: null,
      durationMs: Date.now() - started,
      timedOut,
      error: err instanceof Error ? err.message : "request failed",
    };
  }
};

export interface IngestResult {
  code: number;
  body: Record<string, unknown>;
}

async function logEvent(
  organizationId: string,
  leadId: string,
  kind: LeadEventKind,
  detail: Record<string, unknown> = {}
): Promise<void> {
  const db = await getDb();
  await db.insert(schema.leadEvents).values({
    id: newId("lev"),
    organizationId,
    leadId,
    kind,
    detail,
    at: new Date(),
  });
}

async function computeCapUsage(
  organizationId: string,
  buyerIds: string[],
  now: Date
): Promise<Map<string, CapUsage>> {
  const db = await getDb();
  if (buyerIds.length === 0) return new Map();
  const dayStart = new Date(`${toDateKey(now)}T00:00:00Z`);
  const weekStart = addDays(dayStart, -((dayStart.getUTCDay() + 6) % 7));
  const monthStart = new Date(`${toDateKey(now).slice(0, 7)}-01T00:00:00Z`);

  const soldLeads = await db
    .select({
      buyerId: schema.leads.buyerId,
      soldAt: schema.leads.soldAt,
      salePriceCents: schema.leads.salePriceCents,
    })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.organizationId, organizationId),
        inArray(schema.leads.buyerId, buyerIds),
        inArray(schema.leads.status, ["sold", "returned"]),
        eq(schema.leads.isTest, false)
      )
    );

  const usage = new Map<string, CapUsage>();
  for (const id of buyerIds) {
    usage.set(id, {
      leads: { daily: 0, weekly: 0, monthly: 0, total: 0 },
      budget_cents: { daily: 0, weekly: 0, monthly: 0, total: 0 },
    });
  }
  for (const lead of soldLeads) {
    if (!lead.buyerId || !lead.soldAt) continue;
    const u = usage.get(lead.buyerId);
    if (!u) continue;
    const price = lead.salePriceCents ?? 0;
    u.leads.total += 1;
    u.budget_cents.total += price;
    if (lead.soldAt >= monthStart) {
      u.leads.monthly += 1;
      u.budget_cents.monthly += price;
    }
    if (lead.soldAt >= weekStart) {
      u.leads.weekly += 1;
      u.budget_cents.weekly += price;
    }
    if (lead.soldAt >= dayStart) {
      u.leads.daily += 1;
      u.budget_cents.daily += price;
    }
  }
  return usage;
}

export async function ingestLead(args: {
  campaignSlug: string;
  apiKey: string;
  body: Record<string, unknown>;
  ip: string | null;
  isTestFlag?: boolean;
}): Promise<IngestResult> {
  const db = await getDb();
  const now = new Date();

  // 1. Resolve campaign + supplier. Internal tokens come from the org-key
  // v1 route which already authenticated the org.
  const internalMatch = args.apiKey.match(/^__internal__:(.+)$/);
  const supplier = internalMatch
    ? await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, internalMatch[1]) })
    : await db.query.suppliers.findFirst({
        where: eq(schema.suppliers.apiKeyHash, sha256Hex(args.apiKey)),
      });
  if (!supplier) {
    return { code: 401, body: { error: { code: "invalid_api_key", message: "Unknown supplier API key" } } };
  }
  const campaign = await db.query.campaigns.findFirst({
    where: and(
      eq(schema.campaigns.organizationId, supplier.organizationId),
      eq(schema.campaigns.slug, args.campaignSlug)
    ),
  });
  if (!campaign) {
    return { code: 404, body: { error: { code: "campaign_not_found", message: "No campaign with that slug" } } };
  }
  if (supplier.allowedCampaignIds.length > 0 && !supplier.allowedCampaignIds.includes(campaign.id)) {
    return {
      code: 403,
      body: { error: { code: "supplier_not_allowed", message: "Supplier is not attached to this campaign" } },
    };
  }
  const isTest = Boolean(args.isTestFlag || args.body.test === true || args.body.test === "true" || supplier.testMode || campaign.testMode);
  if (campaign.status !== "active" && !(campaign.status === "draft" && isTest)) {
    return {
      code: 409,
      body: { error: { code: "campaign_inactive", message: `Campaign is ${campaign.status}` } },
    };
  }

  const organizationId = supplier.organizationId;
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, organizationId),
  });
  const timezone = org?.timezone ?? "America/New_York";
  const leadId = newId("ld");

  // 2. Validate and transform.
  const validation = validateAndTransform(campaign.fieldMapping, args.body);
  if (!validation.ok) {
    await db.insert(schema.leads).values({
      id: leadId,
      organizationId,
      campaignId: campaign.id,
      supplierId: supplier.id,
      status: "error",
      fieldData: args.body as Record<string, unknown>,
      ip: args.ip,
      isTest,
      receivedAt: now,
      errorMessage: validation.errors.map((e) => `${e.field}: ${e.message}`).join("; "),
      supplierCostCents: null,
    });
    await logEvent(organizationId, leadId, "received", { supplier: supplier.name, test: isTest });
    await logEvent(organizationId, leadId, "validated", { ok: false, errors: validation.errors });
    if (!isTest) {
      emitLive({ organizationId, kind: "lead_error", title: "Lead failed validation", detail: campaign.name, link: `/leads?status=error` });
      void fireAutomations(organizationId, "lead_error", {
        lead_id: leadId, campaign_id: campaign.id, campaign: campaign.name, supplier: supplier.name,
        errors: validation.errors.length,
      });
    }
    return {
      code: 422,
      body: { lead_id: leadId, status: "error", errors: validation.errors },
    };
  }

  const fieldData = validation.values;
  const trustedFormUrl = typeof args.body.trusted_form_url === "string" ? args.body.trusted_form_url : null;
  const jornayaId = typeof args.body.jornaya_id === "string" ? args.body.jornaya_id : null;
  const adMeta = {
    utm_source: str(args.body.utm_source), utm_medium: str(args.body.utm_medium),
    utm_campaign: str(args.body.utm_campaign), utm_content: str(args.body.utm_content),
    ad_id: str(args.body.ad_id), adset_id: str(args.body.adset_id),
    campaign_ext_id: str(args.body.campaign_ext_id), platform: str(args.body.platform),
  };

  // 3. Supplier cost.
  const supplierCostCents =
    supplier.pricingModel === "fixed_cpl" ? supplier.fixedPriceCents ?? 0 : supplier.pricingModel === "rev_share" ? null : null;

  // 4. Dedupe.
  const windowStart = addDays(now, -campaign.dedupeWindowDays);
  const candidates = await db
    .select({
      id: schema.leads.id,
      normalizedPhone: schema.leads.normalizedPhone,
      normalizedEmail: schema.leads.normalizedEmail,
      receivedAt: schema.leads.receivedAt,
    })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.organizationId, organizationId),
        eq(schema.leads.campaignId, campaign.id),
        gte(schema.leads.receivedAt, windowStart)
      )
    );
  const dup = findDuplicate(candidates, {
    normalizedPhone: validation.normalizedPhone,
    normalizedEmail: validation.normalizedEmail,
    now,
    windowDays: campaign.dedupeWindowDays,
  });

  const baseLead = {
    id: leadId,
    organizationId,
    campaignId: campaign.id,
    supplierId: supplier.id,
    externalId: str(args.body.external_id),
    fieldData,
    normalizedPhone: validation.normalizedPhone,
    normalizedEmail: validation.normalizedEmail,
    state: validation.state,
    ip: args.ip,
    sourceUrl: str(args.body.source_url),
    trustedFormUrl,
    jornayaId,
    adMeta,
    supplierCostCents,
    isTest,
    receivedAt: now,
  };

  if (dup) {
    await db.insert(schema.leads).values({ ...baseLead, status: "duplicate", supplierCostCents: null });
    await logEvent(organizationId, leadId, "received", { supplier: supplier.name, test: isTest });
    await logEvent(organizationId, leadId, "dedupe_checked", { duplicate_of: dup.id, window_days: campaign.dedupeWindowDays });
    return { code: 200, body: { lead_id: leadId, status: "duplicate", duplicate_of: dup.id } };
  }

  // 5. Inbound filters.
  const filterResult = evaluateFilters(campaign.inboundFilters, fieldData, { now, timezone });
  if (!filterResult.pass) {
    await db.insert(schema.leads).values({
      ...baseLead,
      status: "rejected",
      failingRule: filterResult.failing ?? null,
      supplierCostCents: null,
    });
    await logEvent(organizationId, leadId, "received", { supplier: supplier.name, test: isTest });
    await logEvent(organizationId, leadId, "validated", { ok: true });
    await logEvent(organizationId, leadId, "dedupe_checked", { duplicate: false });
    await logEvent(organizationId, leadId, "filtered", { failing: filterResult.failing });
    if (!isTest) {
      emitLive({ organizationId, kind: "lead_rejected", title: `Lead rejected: ${campaign.name}`, detail: `${filterResult.failing?.rule.field ?? "filter"}`, link: `/leads?status=rejected` });
      void fireAutomations(organizationId, "lead_rejected", {
        lead_id: leadId, campaign_id: campaign.id, campaign: campaign.name, supplier: supplier.name,
        failing_field: filterResult.failing?.rule.field ?? "",
      });
      void dispatchWebhookEvent(organizationId, "lead.rejected", {
        lead_id: leadId, campaign: campaign.slug, reason: filterResult.failing,
      });
    }
    return {
      code: 200,
      body: { lead_id: leadId, status: "rejected", failing_rule: filterResult.failing },
    };
  }

  // 6. Eligible buyers with caps.
  const attachments = await db
    .select()
    .from(schema.campaignBuyers)
    .innerJoin(schema.buyers, eq(schema.buyers.id, schema.campaignBuyers.buyerId))
    .where(
      and(
        eq(schema.campaignBuyers.campaignId, campaign.id),
        eq(schema.campaignBuyers.status, "active"),
        eq(schema.buyers.status, "active")
      )
    );

  const routable: RoutableBuyer[] = attachments.map((row) => ({
    buyerId: row.buyers.id,
    name: row.buyers.name,
    priority: row.campaign_buyers.priority ?? row.buyers.priority,
    weight: row.campaign_buyers.weight ?? row.buyers.weight,
    deliveryConfig: row.buyers.deliveryConfig,
    caps: row.campaign_buyers.capsOverride ?? row.buyers.caps,
    filters: row.buyers.filters,
    schedule: row.buyers.schedule,
    priceCents: row.campaign_buyers.priceOverrideCents ?? row.buyers.priceDefaultCents,
    paymentTermsDays: row.buyers.paymentTermsDays,
  }));

  const usage = await computeCapUsage(organizationId, routable.map((b) => b.buyerId), now);
  const { eligible, capBlocked, filteredOut } = selectEligibleBuyers({
    buyers: routable,
    leadData: fieldData,
    ctx: { now, timezone },
    usage,
    ledger: capLedger,
  });

  await db.insert(schema.leads).values({ ...baseLead, status: "queued" });
  await logEvent(organizationId, leadId, "received", { supplier: supplier.name, test: isTest });
  await logEvent(organizationId, leadId, "validated", { ok: true });
  await logEvent(organizationId, leadId, "dedupe_checked", { duplicate: false });
  await logEvent(organizationId, leadId, "routed", {
    eligible: eligible.map((b) => b.name),
    cap_blocked: capBlocked,
    filtered_out: filteredOut,
    method: campaign.distributionMethod,
  });
  if (!isTest) {
    emitLive({ organizationId, kind: "lead_received", title: `Lead in: ${campaign.name}`, detail: supplier.name, link: `/leads` });
    void fireCapiEvent(organizationId, { ...baseLead, salePriceCents: null }, "Lead");
  } else {
    await logEvent(organizationId, leadId, "note", { test_badge: true, note: "Test lead, excluded from money and truth" });
  }

  // Cap-hit automation signal.
  if (!isTest && capBlocked.length > 0) {
    for (const blocked of capBlocked) {
      void fireAutomations(organizationId, "buyer_cap_hit", {
        buyer_id: blocked.buyerId, buyer: blocked.buyerName, blocked_by: blocked.blockedBy,
        campaign: campaign.name, campaign_id: campaign.id,
      });
    }
  }

  // 7/8. Route.
  const tokens: Record<string, unknown> = {
    ...fieldData,
    lead_id: leadId,
    campaign: campaign.slug,
    campaign_name: campaign.name,
    supplier: supplier.name,
    timestamp: now.toISOString(),
    state: validation.state,
    phone: validation.normalizedPhone,
    email: validation.normalizedEmail,
  };

  let outcome: RouteOutcome;
  if (campaign.type === "ping_post") {
    // Pings withhold direct contact fields, the winning post carries everything.
    const pingTokens = { ...tokens };
    delete pingTokens.phone;
    delete pingTokens.email;
    delete pingTokens.first_name;
    delete pingTokens.last_name;
    outcome = await routePingPost({
      eligible,
      pingTokens,
      postTokens: tokens,
      deliver: httpDeliver,
      ledger: capLedger,
      capBlocked,
    });
  } else {
    const rng = Math.random;
    let lastBuyerId: string | null = null;
    if (campaign.distributionMethod === "round_robin") {
      const cursor = await db.query.routingCursors.findFirst({
        where: eq(schema.routingCursors.campaignId, campaign.id),
      });
      lastBuyerId = cursor?.lastBuyerId ?? null;
    }
    const ordered = orderBuyers(eligible, campaign.distributionMethod, { rng, lastBuyerId });
    outcome = await routeDirectPost({ ordered, tokens, deliver: httpDeliver, ledger: capLedger, capBlocked });
    if (campaign.distributionMethod === "round_robin" && outcome.buyerId) {
      await db
        .insert(schema.routingCursors)
        .values({ campaignId: campaign.id, organizationId, lastBuyerId: outcome.buyerId })
        .onConflictDoUpdate({
          target: schema.routingCursors.campaignId,
          set: { lastBuyerId: outcome.buyerId },
        });
    }
  }

  // Persist attempts.
  for (const attempt of outcome.attempts) {
    await db.insert(schema.distributionAttempts).values({
      id: newId("att"),
      organizationId,
      leadId,
      buyerId: attempt.buyerId,
      attemptType: attempt.attemptType,
      requestPayload: { url: attempt.request.url, headers: redactAuth(attempt.request.headers), body: attempt.request.body },
      responsePayload: { status: attempt.response.status, body: attempt.response.body },
      responseCode: attempt.response.status,
      bidCents: attempt.bidCents,
      outcome: attempt.outcome,
      durationMs: attempt.durationMs,
      at: new Date(),
    });
    await logEvent(organizationId, leadId, attempt.attemptType === "ping" ? "ping_sent" : "posted", {
      buyer: attempt.buyerName,
      outcome: attempt.outcome,
      code: attempt.response.status,
      bid_cents: attempt.bidCents,
      duration_ms: attempt.durationMs,
    });
    if (attempt.attemptType === "ping" && attempt.bidCents) {
      await logEvent(organizationId, leadId, "bid_received", { buyer: attempt.buyerName, bid_cents: attempt.bidCents });
    }
  }

  // Finalize status.
  if (outcome.status === "sold") {
    const soldAt = new Date();
    const dueDate = addDays(soldAt, outcome.paymentTermsDays ?? 30);
    const revShareCost =
      supplier.pricingModel === "rev_share" && supplier.revSharePct
        ? Math.round(((outcome.salePriceCents ?? 0) * supplier.revSharePct) / 100)
        : null;
    await db
      .update(schema.leads)
      .set({
        status: "sold",
        buyerId: outcome.buyerId,
        salePriceCents: outcome.salePriceCents,
        soldAt,
        paymentDueDate: dueDate,
        supplierCostCents: revShareCost ?? supplierCostCents,
      })
      .where(eq(schema.leads.id, leadId));
    await logEvent(organizationId, leadId, "accepted", { buyer: outcome.buyerName, price_cents: outcome.salePriceCents });
    await logEvent(organizationId, leadId, "delivered", { buyer: outcome.buyerName });
    if (!isTest) {
      await logEvent(organizationId, leadId, "revenue_booked", {
        amount_cents: outcome.salePriceCents,
        buyer: outcome.buyerName,
      });
      await logEvent(organizationId, leadId, "payment_due", { due: toDateKey(dueDate), terms_days: outcome.paymentTermsDays });
      if (revShareCost ?? supplierCostCents) {
        await logEvent(organizationId, leadId, "supplier_cost_accrued", {
          amount_cents: revShareCost ?? supplierCostCents,
          supplier: supplier.name,
        });
      }
      emitLive({
        organizationId, kind: "lead_sold",
        title: `Sold to ${outcome.buyerName}`,
        detail: campaign.name,
        amountCents: outcome.salePriceCents,
        link: `/leads?status=sold`,
      });
      void fireAutomations(organizationId, "lead_sold", {
        lead_id: leadId, campaign_id: campaign.id, campaign: campaign.name,
        buyer_id: outcome.buyerId, buyer: outcome.buyerName,
        price_cents: outcome.salePriceCents, supplier: supplier.name, state: validation.state,
      });
      void dispatchWebhookEvent(organizationId, "lead.sold", {
        lead_id: leadId, campaign: campaign.slug, buyer: outcome.buyerName,
        price_cents: outcome.salePriceCents,
      });
      void fireCapiEvent(
        organizationId,
        { ...baseLead, salePriceCents: outcome.salePriceCents ?? null },
        "Purchase"
      );
    }
  } else {
    const finalStatus = outcome.status; // unsold | unmatched
    await db.update(schema.leads).set({ status: finalStatus }).where(eq(schema.leads.id, leadId));
    await logEvent(organizationId, leadId, "rejected", {
      final: finalStatus,
      cap_blocked: outcome.capBlocked,
      attempts: outcome.attempts.length,
    });
    if (!isTest && finalStatus === "unmatched") {
      void fireAutomations(organizationId, "lead_unmatched", {
        lead_id: leadId, campaign_id: campaign.id, campaign: campaign.name,
        cap_blocked: outcome.capBlocked.map((c) => c.buyerName).join(", "),
      });
    }
  }

  invalidateTruthCache(organizationId);

  return {
    code: 200,
    body: {
      lead_id: leadId,
      status: outcome.status,
      ...(outcome.buyerName ? { buyer: outcome.buyerName } : {}),
      ...(outcome.bidCents ? { bid_cents: outcome.bidCents } : {}),
      ...(outcome.status === "sold" ? { price_cents: outcome.salePriceCents } : {}),
    },
  };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function redactAuth(headers: Record<string, string>): Record<string, string> {
  const out = { ...headers };
  if (out.Authorization) out.Authorization = out.Authorization.slice(0, 12) + "***";
  return out;
}

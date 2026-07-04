import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getDb, schema } from "@/db/client";
import { getOrgContext, writeAudit, canManage, canManageMoney, type OrgContext } from "@/server/org";
import { apiError, apiOk } from "@/server/api-utils";
import { newId } from "@/lib/id";
import { generateApiKey, sha256Hex } from "@/lib/hash";
import { applyMatch, disputeMatch, runAutoMatch, rebuildPeriods, suggestForUnmatched } from "@/server/matching";
import { runInsightGeneration } from "@/server/insights";
import { markLeadReturned, sendLeadToBuyer } from "@/server/leads";
import { ingestLead } from "@/server/ingest";
import { emitLive } from "@/lib/sse";
import { invalidateTruthCache } from "@/server/truth-data";
import { fireAutomations } from "@/server/automations";
import { askAnalyst } from "@/ai/analyst";
import { buildAuthHeaders, buildBody } from "@/domain/routing/pipeline";
import { classifyPayment } from "@/domain/matching/engine";
import { toDateKey } from "@/lib/transforms";
import { validateFormula } from "@/domain/reports/metrics";
import { seedDefaultReportPages } from "@/server/report-pages";
import { testProvider } from "@/ai/providers";
import {
  connectDemoIntegration,
  disconnectIntegration,
  ingestLeadFormSubmission,
  sampleLeadFormFields,
} from "@/server/integrations";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Single validated dispatcher for every UI mutation. Each handler parses its
// payload with Zod, enforces role gates, and audit-logs meaningful changes.

type Handler = (ctx: OrgContext, payload: unknown) => Promise<NextResponse>;

const targetSchema = z.union([
  z.object({ type: z.literal("invoice"), invoiceId: z.string() }),
  z.object({
    type: z.enum(["buyer", "supplier"]),
    id: z.string(),
    periodStart: z.string().optional(),
    periodEnd: z.string().optional(),
  }),
  z.object({ type: z.literal("ad_platform"), id: z.string() }),
]);

const filterGroupSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  logic: z.enum(["and", "or"]),
  rules: z.array(
    z.object({
      field: z.string(),
      operator: z.enum(["equals", "not_equals", "in", "not_in", "contains", "gt", "lt", "gte", "lte", "exists", "regex"]),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional(),
    })
  ),
  schedule: z.object({ days: z.array(z.number()), start_hour: z.number(), end_hour: z.number() }).optional(),
});

const inboundFiltersSchema = z.object({ logic: z.enum(["and", "or"]), groups: z.array(filterGroupSchema) });

const handlers: Record<string, Handler> = {
  // ---- Org and admin ----
  "org.switch": async (ctx, payload) => {
    const p = z.object({ organizationId: z.string() }).parse(payload);
    const allowed = ctx.memberships.some((m) => m.organizationId === p.organizationId);
    if (!allowed && !ctx.isPlatformAdmin) return apiError("forbidden", "Not a member of that org", 403);
    const jar = await cookies();
    jar.set("dashflo_org", p.organizationId, { path: "/", httpOnly: true });
    jar.delete("dashflo_impersonate");
    return apiOk({ ok: true });
  },

  "admin.impersonate": async (ctx, payload) => {
    if (!ctx.isPlatformAdmin) return apiError("forbidden", "Platform admins only", 403);
    const p = z.object({ organizationId: z.string().nullable() }).parse(payload);
    const jar = await cookies();
    if (p.organizationId) {
      jar.set("dashflo_impersonate", p.organizationId, { path: "/", httpOnly: true });
      await writeAudit(
        { db: ctx.db, userId: ctx.userId, organizationId: p.organizationId },
        "impersonation.start", "organization", p.organizationId
      );
    } else {
      await writeAudit(ctx, "impersonation.end", "organization", ctx.organizationId);
      jar.delete("dashflo_impersonate");
    }
    return apiOk({ ok: true });
  },

  "admin.orgStatus": async (ctx, payload) => {
    if (!ctx.isPlatformAdmin) return apiError("forbidden", "Platform admins only", 403);
    const p = z.object({ organizationId: z.string(), status: z.enum(["active", "suspended"]), planTier: z.enum(["starter", "growth", "scale"]).optional() }).parse(payload);
    await ctx.db
      .update(schema.organizations)
      .set({ status: p.status, ...(p.planTier ? { planTier: p.planTier } : {}) })
      .where(eq(schema.organizations.id, p.organizationId));
    await writeAudit(ctx, "admin.org_status", "organization", p.organizationId, { status: p.status });
    return apiOk({ ok: true });
  },

  "org.update": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({
      name: z.string().min(1).optional(),
      timezone: z.string().optional(),
      currency: z.string().optional(),
      varianceThresholdPct: z.number().min(0).max(50).optional(),
      varianceThresholdCents: z.number().min(0).optional(),
      whiteLabel: z.object({ logo_url: z.string().optional(), accent: z.string().optional(), sender_name: z.string().optional() }).optional(),
    }).parse(payload);
    await ctx.db.update(schema.organizations).set(p).where(eq(schema.organizations.id, ctx.organizationId));
    await writeAudit(ctx, "org.update", "organization", ctx.organizationId, p as Record<string, unknown>);
    invalidateTruthCache(ctx.organizationId);
    return apiOk({ ok: true });
  },

  "billing.tier": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ tier: z.enum(["starter", "growth", "scale"]) }).parse(payload);
    // Stubbed checkout: flips the tier directly. Real Stripe billing drops in here.
    const limits = {
      starter: { leads_per_month: 2000, users: 3, ad_accounts: 2, ai_messages: 200 },
      growth: { leads_per_month: 15000, users: 10, ad_accounts: 6, ai_messages: 2000 },
      scale: { leads_per_month: 100000, users: 50, ad_accounts: 20, ai_messages: 20000 },
    }[p.tier];
    await ctx.db
      .update(schema.organizations)
      .set({ planTier: p.tier, planLimits: limits })
      .where(eq(schema.organizations.id, ctx.organizationId));
    await writeAudit(ctx, "billing.tier_change", "organization", ctx.organizationId, { tier: p.tier });
    return apiOk({ ok: true, tier: p.tier });
  },

  "user.invite": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({
      email: z.string().email(),
      name: z.string().min(1),
      role: z.enum(["owner", "admin", "analyst", "finance", "partner"]),
      password: z.string().min(8).default("dashflo2026"),
    }).parse(payload);
    let user = await ctx.db.query.users.findFirst({ where: eq(schema.users.email, p.email.toLowerCase()) });
    if (!user) {
      const id = newId("usr");
      await ctx.db.insert(schema.users).values({
        id, email: p.email.toLowerCase(), name: p.name,
        passwordHash: bcrypt.hashSync(p.password, 10), isPlatformAdmin: false, createdAt: new Date(),
      });
      user = await ctx.db.query.users.findFirst({ where: eq(schema.users.id, id) });
    }
    if (!user) return apiError("invite_failed", "Could not create user", 500);
    const existing = await ctx.db.query.memberships.findFirst({
      where: and(eq(schema.memberships.userId, user.id), eq(schema.memberships.organizationId, ctx.organizationId)),
    });
    if (existing) return apiError("already_member", "Already a member", 409);
    await ctx.db.insert(schema.memberships).values({
      id: newId("mem"), userId: user.id, organizationId: ctx.organizationId, role: p.role, createdAt: new Date(),
    });
    await writeAudit(ctx, "user.invite", "user", user.id, { role: p.role });
    return apiOk({ ok: true, initialPassword: p.password });
  },

  "member.role": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ userId: z.string(), role: z.enum(["owner", "admin", "analyst", "finance", "partner"]) }).parse(payload);
    await ctx.db
      .update(schema.memberships)
      .set({ role: p.role })
      .where(and(eq(schema.memberships.userId, p.userId), eq(schema.memberships.organizationId, ctx.organizationId)));
    await writeAudit(ctx, "member.role_change", "user", p.userId, { role: p.role });
    return apiOk({ ok: true });
  },

  // ---- Connectors ----
  "connector.toggle": async (ctx, payload) => {
    if (!canManageMoney(ctx)) return apiError("forbidden", "Finance roles only", 403);
    const p = z.object({ provider: z.string(), status: z.enum(["active", "inactive"]) }).parse(payload);
    await ctx.db
      .update(schema.connectorStatuses)
      .set({ status: p.status, ...(p.status === "active" ? { lastSyncAt: new Date() } : {}) })
      .where(and(
        eq(schema.connectorStatuses.organizationId, ctx.organizationId),
        eq(schema.connectorStatuses.provider, p.provider as "stripe")
      ));
    invalidateTruthCache(ctx.organizationId);
    await writeAudit(ctx, "connector.toggle", "connector", p.provider, { status: p.status });
    emitLive({
      organizationId: ctx.organizationId, kind: "connector_changed",
      title: `${p.provider} ${p.status === "active" ? "connected" : "deactivated"}`,
      detail: p.status === "inactive" ? "Downstream metrics now show Needs Source" : "Verification restored",
    });
    return apiOk({ ok: true });
  },

  "connector.sync": async (ctx, payload) => {
    const p = z.object({ provider: z.string() }).parse(payload);
    await ctx.db
      .update(schema.connectorStatuses)
      .set({ lastSyncAt: new Date() })
      .where(and(
        eq(schema.connectorStatuses.organizationId, ctx.organizationId),
        eq(schema.connectorStatuses.provider, p.provider as "stripe")
      ));
    // Local build: sync refreshes matching and periods from what is already stored.
    const result = await runAutoMatch(ctx.organizationId);
    invalidateTruthCache(ctx.organizationId);
    return apiOk({ ok: true, synced: p.provider, auto_matched: result.applied });
  },

  // ---- Matching ----
  "match.apply": async (ctx, payload) => {
    if (!canManageMoney(ctx)) return apiError("forbidden", "Finance roles only", 403);
    const p = z.object({
      paymentId: z.string(),
      target: targetSchema,
      confidence: z.number().min(0).max(100).default(100),
      splitAmountCents: z.number().positive().optional(),
    }).parse(payload);
    const result = await applyMatch({
      organizationId: ctx.organizationId,
      paymentId: p.paymentId,
      target: p.target,
      confidence: p.confidence,
      manual: true,
      splitAmountCents: p.splitAmountCents,
    });
    if (!result.ok) return apiError("match_failed", result.message, 409);
    await writeAudit(ctx, "match.apply", "payment", p.paymentId, { target: p.target });
    return apiOk({ ok: true, message: result.message });
  },

  "match.dispute": async (ctx, payload) => {
    if (!canManageMoney(ctx)) return apiError("forbidden", "Finance roles only", 403);
    const p = z.object({ paymentId: z.string() }).parse(payload);
    await disputeMatch(ctx.organizationId, p.paymentId);
    await writeAudit(ctx, "match.dispute", "payment", p.paymentId);
    return apiOk({ ok: true });
  },

  "match.autorun": async (ctx) => {
    if (!canManageMoney(ctx)) return apiError("forbidden", "Finance roles only", 403);
    const result = await runAutoMatch(ctx.organizationId);
    return apiOk({ ok: true, ...result });
  },

  "period.resolve": async (ctx, payload) => {
    if (!canManageMoney(ctx)) return apiError("forbidden", "Finance roles only", 403);
    const p = z.object({ periodId: z.string(), note: z.string().optional() }).parse(payload);
    await ctx.db
      .update(schema.reconciliationPeriods)
      .set({ status: "resolved", notes: p.note ?? null })
      .where(and(
        eq(schema.reconciliationPeriods.id, p.periodId),
        eq(schema.reconciliationPeriods.organizationId, ctx.organizationId)
      ));
    invalidateTruthCache(ctx.organizationId);
    return apiOk({ ok: true });
  },

  "rule.save": async (ctx, payload) => {
    if (!canManageMoney(ctx)) return apiError("forbidden", "Finance roles only", 403);
    const p = z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      counterpartyPattern: z.string().min(1),
      amountTolerancePct: z.number().min(0).max(100),
      dateWindowDays: z.number().min(0).max(365),
      target: z.enum(["buyer", "supplier", "ad_platform"]),
      targetId: z.string().nullable(),
      active: z.boolean().default(true),
    }).parse(payload);
    if (p.id) {
      await ctx.db.update(schema.matchRules).set(p).where(and(eq(schema.matchRules.id, p.id), eq(schema.matchRules.organizationId, ctx.organizationId)));
    } else {
      await ctx.db.insert(schema.matchRules).values({ ...p, id: newId("mr"), organizationId: ctx.organizationId });
    }
    return apiOk({ ok: true });
  },

  "rule.delete": async (ctx, payload) => {
    if (!canManageMoney(ctx)) return apiError("forbidden", "Finance roles only", 403);
    const p = z.object({ id: z.string() }).parse(payload);
    await ctx.db.delete(schema.matchRules).where(and(eq(schema.matchRules.id, p.id), eq(schema.matchRules.organizationId, ctx.organizationId)));
    return apiOk({ ok: true });
  },

  "rule.test": async (ctx, payload) => {
    const p = z.object({ counterpartyPattern: z.string() }).parse(payload);
    let re: RegExp;
    try {
      re = new RegExp(p.counterpartyPattern, "i");
    } catch {
      return apiError("invalid_regex", "Pattern is not a valid regular expression", 422);
    }
    const payments = await ctx.db.query.paymentRecords.findMany({
      where: and(eq(schema.paymentRecords.organizationId, ctx.organizationId), eq(schema.paymentRecords.matchStatus, "unmatched")),
    });
    const hits = payments.filter((pay) => re.test(`${pay.counterpartyName} ${pay.memo ?? ""}`));
    return apiOk({
      ok: true,
      hits: hits.map((h) => ({ id: h.id, counterparty: h.counterpartyName, amount_cents: h.amountCents, date: h.date })),
    });
  },

  // ---- Action items and insights ----
  "action.update": async (ctx, payload) => {
    const p = z.object({
      id: z.string(),
      status: z.enum(["open", "in_progress", "resolved", "dismissed"]).optional(),
      ownerUserId: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      resolutionNote: z.string().optional(),
      priority: z.enum(["critical", "high", "medium", "low"]).optional(),
    }).parse(payload);
    const updates: Record<string, unknown> = {};
    if (p.status) {
      updates.status = p.status;
      if (p.status === "resolved") updates.resolvedAt = new Date();
    }
    if (p.ownerUserId !== undefined) updates.ownerUserId = p.ownerUserId;
    if (p.dueDate !== undefined) updates.dueDate = p.dueDate;
    if (p.resolutionNote !== undefined) updates.resolutionNote = p.resolutionNote;
    if (p.priority) updates.priority = p.priority;
    await ctx.db
      .update(schema.actionItems)
      .set(updates)
      .where(and(eq(schema.actionItems.id, p.id), eq(schema.actionItems.organizationId, ctx.organizationId)));
    if (p.status === "resolved") {
      emitLive({ organizationId: ctx.organizationId, kind: "action_resolved", title: "Action item resolved" });
    }
    return apiOk({ ok: true });
  },

  "action.create": async (ctx, payload) => {
    const p = z.object({
      issueType: z.enum(["revenue_gap", "payment_overdue", "short_paid", "unmatched_income", "unmatched_cost", "spend_gap", "supplier_cost_gap", "missing_source", "unknown_margin", "zero_sold_spend", "data_quality", "review"]).default("review"),
      entityType: z.string(),
      entityId: z.string(),
      entityName: z.string(),
      priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
      amountAtRiskCents: z.number().nullable().default(null),
      description: z.string().min(1),
      dueDate: z.string().nullable().default(null),
    }).parse(payload);
    await ctx.db.insert(schema.actionItems).values({
      ...p, id: newId("act"), organizationId: ctx.organizationId, source: "manual", status: "open", createdAt: new Date(),
    });
    return apiOk({ ok: true });
  },

  "insight.status": async (ctx, payload) => {
    const p = z.object({ id: z.string(), status: z.enum(["acknowledged", "dismissed"]) }).parse(payload);
    await ctx.db
      .update(schema.aiInsights)
      .set({ status: p.status })
      .where(and(eq(schema.aiInsights.id, p.id), eq(schema.aiInsights.organizationId, ctx.organizationId)));
    return apiOk({ ok: true });
  },

  "insights.run": async (ctx) => {
    const result = await runInsightGeneration(ctx.organizationId);
    return apiOk({ ok: true, created: result.created });
  },

  // ---- Leads ----
  "lead.return": async (ctx, payload) => {
    const p = z.object({ leadId: z.string() }).parse(payload);
    const result = await markLeadReturned(ctx.organizationId, p.leadId, ctx.userEmail);
    if (!result.ok) return apiError("return_failed", result.message, 409);
    await writeAudit(ctx, "lead.return", "lead", p.leadId);
    return apiOk({ ok: true, message: result.message });
  },

  "lead.send": async (ctx, payload) => {
    const p = z.object({ leadId: z.string(), buyerId: z.string() }).parse(payload);
    const result = await sendLeadToBuyer(ctx.organizationId, p.leadId, p.buyerId);
    return apiOk({ ok: result.ok, message: result.message });
  },

  "lead.reroute": async (ctx, payload) => {
    const p = z.object({ leadId: z.string() }).parse(payload);
    const lead = await ctx.db.query.leads.findFirst({
      where: and(eq(schema.leads.id, p.leadId), eq(schema.leads.organizationId, ctx.organizationId)),
    });
    if (!lead) return apiError("not_found", "Lead not found", 404);
    if (lead.status === "sold") return apiError("invalid_state", "Lead is already sold", 409);
    const attachments = await ctx.db
      .select()
      .from(schema.campaignBuyers)
      .innerJoin(schema.buyers, eq(schema.buyers.id, schema.campaignBuyers.buyerId))
      .where(and(eq(schema.campaignBuyers.campaignId, lead.campaignId), eq(schema.buyers.status, "active")));
    const ordered = attachments.sort((a, b) => a.campaign_buyers.priority - b.campaign_buyers.priority);
    for (const row of ordered) {
      const result = await sendLeadToBuyer(ctx.organizationId, p.leadId, row.buyers.id);
      if (result.ok) return apiOk({ ok: true, message: result.message });
    }
    return apiOk({ ok: false, message: "No buyer accepted the lead on re-route" });
  },

  // ---- Campaigns ----
  "campaign.save": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      slug: z.string().regex(/^[a-z0-9-]+$/),
      vertical: z.enum(["mva", "mass_tort", "workers_comp", "home_services", "insurance", "solar", "other"]),
      type: z.enum(["direct_post", "ping_post"]),
      status: z.enum(["draft", "active", "paused", "archived"]).default("draft"),
      distributionMethod: z.enum(["priority", "weighted", "round_robin"]).default("priority"),
      fieldMapping: z.array(z.object({
        key: z.string(), label: z.string(),
        type: z.enum(["text", "number", "date", "select", "boolean", "state", "zip", "phone", "email"]),
        required: z.boolean(), options: z.array(z.string()).optional(),
        transforms: z.array(z.enum(["trim", "lowercase", "phone_e164", "date_normalize", "state_2letter"])).optional(),
      })),
      inboundFilters: inboundFiltersSchema.nullable().optional(),
      dedupeWindowDays: z.number().min(0).max(365).default(30),
      paymentTermsDays: z.number().min(0).max(180).default(30),
      description: z.string().optional(),
      buyers: z.array(z.object({
        buyerId: z.string(), priority: z.number(), weight: z.number().default(1),
        priceOverrideCents: z.number().nullable().default(null),
      })).optional(),
    }).parse(payload);

    const campaignId = p.id ?? newId("cmp");
    const base = {
      name: p.name, slug: p.slug, vertical: p.vertical, type: p.type, status: p.status,
      distributionMethod: p.distributionMethod, fieldMapping: p.fieldMapping,
      inboundFilters: p.inboundFilters ?? null, dedupeWindowDays: p.dedupeWindowDays,
      paymentTermsDays: p.paymentTermsDays, description: p.description ?? null,
    };
    if (p.id) {
      await ctx.db.update(schema.campaigns).set(base).where(and(eq(schema.campaigns.id, p.id), eq(schema.campaigns.organizationId, ctx.organizationId)));
    } else {
      await ctx.db.insert(schema.campaigns).values({ ...base, id: campaignId, organizationId: ctx.organizationId, testMode: false, createdAt: new Date() });
    }
    if (p.buyers) {
      await ctx.db.delete(schema.campaignBuyers).where(eq(schema.campaignBuyers.campaignId, campaignId));
      for (const b of p.buyers) {
        await ctx.db.insert(schema.campaignBuyers).values({
          id: newId("cb"), organizationId: ctx.organizationId, campaignId,
          buyerId: b.buyerId, priority: b.priority, weight: b.weight,
          priceOverrideCents: b.priceOverrideCents, status: "active",
        });
      }
    }
    await writeAudit(ctx, p.id ? "campaign.update" : "campaign.create", "campaign", campaignId);
    invalidateTruthCache(ctx.organizationId);
    return apiOk({ ok: true, campaignId });
  },

  "campaign.status": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ id: z.string(), status: z.enum(["draft", "active", "paused", "archived"]) }).parse(payload);
    await ctx.db.update(schema.campaigns).set({ status: p.status }).where(and(eq(schema.campaigns.id, p.id), eq(schema.campaigns.organizationId, ctx.organizationId)));
    await writeAudit(ctx, "campaign.status", "campaign", p.id, { status: p.status });
    return apiOk({ ok: true });
  },

  "campaign.routing": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ campaignId: z.string(), order: z.array(z.object({ buyerId: z.string(), priority: z.number() })) }).parse(payload);
    for (const item of p.order) {
      await ctx.db
        .update(schema.campaignBuyers)
        .set({ priority: item.priority })
        .where(and(
          eq(schema.campaignBuyers.campaignId, p.campaignId),
          eq(schema.campaignBuyers.buyerId, item.buyerId),
          eq(schema.campaignBuyers.organizationId, ctx.organizationId)
        ));
    }
    return apiOk({ ok: true });
  },

  "campaign.capi": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({
      campaignId: z.string(),
      config: z.object({
        enabled: z.boolean(),
        pixel_id: z.string().optional(),
        access_token: z.string().optional(),
        events: z.object({ received: z.boolean(), sold: z.boolean() }),
      }),
    }).parse(payload);
    await ctx.db
      .update(schema.campaigns)
      .set({ capiConfig: p.config })
      .where(and(eq(schema.campaigns.id, p.campaignId), eq(schema.campaigns.organizationId, ctx.organizationId)));
    return apiOk({ ok: true });
  },

  "campaign.testLead": async (ctx, payload) => {
    const p = z.object({ campaignId: z.string() }).parse(payload);
    const campaign = await ctx.db.query.campaigns.findFirst({
      where: and(eq(schema.campaigns.id, p.campaignId), eq(schema.campaigns.organizationId, ctx.organizationId)),
    });
    if (!campaign) return apiError("not_found", "Campaign not found", 404);
    const supplier = await ctx.db.query.suppliers.findFirst({
      where: eq(schema.suppliers.organizationId, ctx.organizationId),
    });
    if (!supplier) return apiError("no_supplier", "Create a supplier first", 409);

    const sample: Record<string, unknown> = { test: true };
    for (const field of campaign.fieldMapping) {
      sample[field.key] = sampleValue(field.key, field.type, field.options);
    }
    const result = await ingestLead({
      campaignSlug: campaign.slug,
      apiKey: `__internal__:${supplier.id}`,
      body: sample,
      ip: "127.0.0.1",
      isTestFlag: true,
    });
    return apiOk({ ok: true, result: result.body, sent: sample });
  },

  // ---- Buyers ----
  "buyer.save": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      contactEmail: z.string().email().nullable().optional(),
      priceDefaultCents: z.number().min(0),
      priority: z.number().default(100),
      weight: z.number().default(1),
      paymentTermsDays: z.number().min(0).max(180).default(30),
      caps: z.record(z.unknown()).default({}),
      deliveryConfig: z.record(z.unknown()),
      notes: z.string().nullable().optional(),
    }).parse(payload);
    const values = {
      name: p.name, contactEmail: p.contactEmail ?? null,
      priceDefaultCents: p.priceDefaultCents, priority: p.priority, weight: p.weight,
      paymentTermsDays: p.paymentTermsDays,
      caps: p.caps as typeof schema.buyers.$inferInsert.caps,
      deliveryConfig: p.deliveryConfig as unknown as typeof schema.buyers.$inferInsert.deliveryConfig,
      notes: p.notes ?? null,
    };
    if (p.id) {
      await ctx.db.update(schema.buyers).set(values).where(and(eq(schema.buyers.id, p.id), eq(schema.buyers.organizationId, ctx.organizationId)));
    } else {
      await ctx.db.insert(schema.buyers).values({
        ...values, id: newId("buy"), organizationId: ctx.organizationId, status: "active",
        portalAccess: false, createdAt: new Date(),
      });
    }
    invalidateTruthCache(ctx.organizationId);
    return apiOk({ ok: true });
  },

  "buyer.status": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ id: z.string(), status: z.enum(["active", "paused", "archived"]) }).parse(payload);
    await ctx.db.update(schema.buyers).set({ status: p.status }).where(and(eq(schema.buyers.id, p.id), eq(schema.buyers.organizationId, ctx.organizationId)));
    await writeAudit(ctx, "buyer.status", "buyer", p.id, { status: p.status });
    return apiOk({ ok: true });
  },

  "buyer.payloadTest": async (ctx, payload) => {
    const p = z.object({ buyerId: z.string() }).parse(payload);
    const buyer = await ctx.db.query.buyers.findFirst({
      where: and(eq(schema.buyers.id, p.buyerId), eq(schema.buyers.organizationId, ctx.organizationId)),
    });
    if (!buyer) return apiError("not_found", "Buyer not found", 404);
    const config = buyer.deliveryConfig;
    const tokens = {
      lead_id: "ld_test_payload", first_name: "Test", last_name: "Lead",
      phone: "+15551234567", email: "test@dashflo.dev", state: "TX", zip: "78701",
      incident_date: "2026-06-01", incident_state: "TX", at_fault: "false",
      injury_type: "whiplash", attorney_status: "none", currently_represented: "false",
      campaign: "payload-test", supplier: "DashFlo Tester", timestamp: new Date().toISOString(),
    };
    const template = config.body_template ?? config.post_template ?? "{}";
    const headers = buildAuthHeaders(config);
    const body = buildBody(config, template, tokens);
    const started = Date.now();
    try {
      const res = await fetch(config.url, {
        method: "POST", headers, body, signal: AbortSignal.timeout(config.timeout_ms ?? 8000),
      });
      const text = await res.text();
      return apiOk({
        ok: true,
        request: { url: config.url, headers, body },
        response: { status: res.status, body: text.slice(0, 4000), duration_ms: Date.now() - started },
      });
    } catch (err) {
      return apiOk({
        ok: false,
        request: { url: config.url, headers, body },
        response: { status: 0, body: err instanceof Error ? err.message : "request failed", duration_ms: Date.now() - started },
      });
    }
  },

  // ---- Suppliers ----
  "supplier.save": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      contactEmail: z.string().email().nullable().optional(),
      pricingModel: z.enum(["fixed_cpl", "rev_share", "none"]),
      fixedPriceCents: z.number().nullable().optional(),
      revSharePct: z.number().nullable().optional(),
      paymentTermsDays: z.number().default(30),
      allowedCampaignIds: z.array(z.string()).default([]),
      notes: z.string().nullable().optional(),
    }).parse(payload);
    if (p.id) {
      await ctx.db.update(schema.suppliers).set({
        name: p.name, contactEmail: p.contactEmail ?? null, pricingModel: p.pricingModel,
        fixedPriceCents: p.fixedPriceCents ?? null, revSharePct: p.revSharePct ?? null,
        paymentTermsDays: p.paymentTermsDays, allowedCampaignIds: p.allowedCampaignIds, notes: p.notes ?? null,
      }).where(and(eq(schema.suppliers.id, p.id), eq(schema.suppliers.organizationId, ctx.organizationId)));
      return apiOk({ ok: true });
    }
    const { key, prefix, hash } = generateApiKey("supplier");
    await ctx.db.insert(schema.suppliers).values({
      id: newId("sup"), organizationId: ctx.organizationId, name: p.name,
      contactEmail: p.contactEmail ?? null, status: "active",
      apiKeyPrefix: prefix, apiKeyHash: hash, pricingModel: p.pricingModel,
      fixedPriceCents: p.fixedPriceCents ?? null, revSharePct: p.revSharePct ?? null,
      allowedCampaignIds: p.allowedCampaignIds, portalAccess: false, testMode: false,
      paymentTermsDays: p.paymentTermsDays, notes: p.notes ?? null, createdAt: new Date(),
    });
    return apiOk({ ok: true, apiKey: key });
  },

  "supplier.attachCampaign": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ supplierId: z.string(), campaignId: z.string(), attach: z.boolean() }).parse(payload);
    const supplier = await ctx.db.query.suppliers.findFirst({
      where: and(eq(schema.suppliers.id, p.supplierId), eq(schema.suppliers.organizationId, ctx.organizationId)),
    });
    if (!supplier) return apiError("not_found", "Supplier not found", 404);
    const current = new Set(supplier.allowedCampaignIds);
    if (p.attach) current.add(p.campaignId);
    else current.delete(p.campaignId);
    await ctx.db
      .update(schema.suppliers)
      .set({ allowedCampaignIds: [...current] })
      .where(eq(schema.suppliers.id, p.supplierId));
    return apiOk({ ok: true });
  },

  "supplier.rotateKey": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ id: z.string() }).parse(payload);
    const { key, prefix, hash } = generateApiKey("supplier");
    await ctx.db
      .update(schema.suppliers)
      .set({ apiKeyPrefix: prefix, apiKeyHash: hash })
      .where(and(eq(schema.suppliers.id, p.id), eq(schema.suppliers.organizationId, ctx.organizationId)));
    await writeAudit(ctx, "supplier.rotate_key", "supplier", p.id);
    return apiOk({ ok: true, apiKey: key });
  },

  "supplier.status": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ id: z.string(), status: z.enum(["active", "paused", "archived"]) }).parse(payload);
    await ctx.db.update(schema.suppliers).set({ status: p.status }).where(and(eq(schema.suppliers.id, p.id), eq(schema.suppliers.organizationId, ctx.organizationId)));
    return apiOk({ ok: true });
  },

  // ---- Automations ----
  "automation.save": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      trigger: z.enum(["lead_sold", "lead_rejected", "lead_error", "lead_unmatched", "buyer_cap_hit", "supplier_error_spike", "payment_received", "invoice_overdue", "variance_flagged", "short_paid", "action_item_created", "insight_created", "daily_summary"]),
      conditions: inboundFiltersSchema.nullable().default(null),
      actions: z.array(z.object({ kind: z.enum(["webhook", "email", "slack", "update_lead_field", "pause_buyer", "pause_campaign", "create_action_item"]), config: z.record(z.unknown()) })),
      status: z.enum(["enabled", "disabled"]).default("enabled"),
    }).parse(payload);
    if (p.id) {
      await ctx.db.update(schema.automations).set({
        name: p.name, trigger: p.trigger, conditions: p.conditions, actions: p.actions, status: p.status,
      }).where(and(eq(schema.automations.id, p.id), eq(schema.automations.organizationId, ctx.organizationId)));
    } else {
      await ctx.db.insert(schema.automations).values({
        id: newId("aut"), organizationId: ctx.organizationId,
        name: p.name, trigger: p.trigger, conditions: p.conditions, actions: p.actions, status: p.status,
      });
    }
    return apiOk({ ok: true });
  },

  "automation.status": async (ctx, payload) => {
    const p = z.object({ id: z.string(), status: z.enum(["enabled", "disabled"]) }).parse(payload);
    await ctx.db.update(schema.automations).set({ status: p.status }).where(and(eq(schema.automations.id, p.id), eq(schema.automations.organizationId, ctx.organizationId)));
    return apiOk({ ok: true });
  },

  "automation.delete": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ id: z.string() }).parse(payload);
    await ctx.db.delete(schema.automations).where(and(eq(schema.automations.id, p.id), eq(schema.automations.organizationId, ctx.organizationId)));
    return apiOk({ ok: true });
  },

  "automation.test": async (ctx, payload) => {
    const p = z.object({ id: z.string() }).parse(payload);
    const automation = await ctx.db.query.automations.findFirst({
      where: and(eq(schema.automations.id, p.id), eq(schema.automations.organizationId, ctx.organizationId)),
    });
    if (!automation) return apiError("not_found", "Automation not found", 404);
    await fireAutomations(ctx.organizationId, automation.trigger, {
      test: true, campaign: "Test Campaign", buyer: "Test Buyer", supplier: "Test Supplier",
      amount: "$123.45", amount_cents: 12345, price_cents: 9500, counterparty: "Test Counterparty",
      period: "2026-06-01 to 2026-06-30", variance_cents: 145000, overdue: "$4,200.00",
    });
    return apiOk({ ok: true, message: "Test payload fired, check the run log" });
  },

  // ---- API keys and webhooks ----
  "apikey.create": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ name: z.string().min(1), scopes: z.array(z.string()).default(["*"]) }).parse(payload);
    const { key, prefix, hash } = generateApiKey("org");
    await ctx.db.insert(schema.apiKeys).values({
      id: newId("key"), organizationId: ctx.organizationId, name: p.name,
      keyPrefix: prefix, hashedKey: hash, scopes: p.scopes, status: "active", createdAt: new Date(),
    });
    await writeAudit(ctx, "apikey.create", "api_key", prefix, { name: p.name });
    return apiOk({ ok: true, apiKey: key, note: "Shown once, store it now" });
  },

  "apikey.revoke": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ id: z.string() }).parse(payload);
    await ctx.db.update(schema.apiKeys).set({ status: "revoked" }).where(and(eq(schema.apiKeys.id, p.id), eq(schema.apiKeys.organizationId, ctx.organizationId)));
    await writeAudit(ctx, "apikey.revoke", "api_key", p.id);
    return apiOk({ ok: true });
  },

  "webhook.save": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({
      id: z.string().optional(),
      url: z.string().url(),
      events: z.array(z.string()).min(1),
    }).parse(payload);
    if (p.id) {
      await ctx.db.update(schema.webhookSubscriptions).set({ url: p.url, events: p.events }).where(and(eq(schema.webhookSubscriptions.id, p.id), eq(schema.webhookSubscriptions.organizationId, ctx.organizationId)));
      return apiOk({ ok: true });
    }
    const secret = generateApiKey("org").key.replace("df_live", "whsec");
    await ctx.db.insert(schema.webhookSubscriptions).values({
      id: newId("wh"), organizationId: ctx.organizationId, url: p.url, events: p.events,
      signingSecret: secret, status: "active",
    });
    return apiOk({ ok: true, signingSecret: secret });
  },

  "webhook.delete": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ id: z.string() }).parse(payload);
    await ctx.db.delete(schema.webhookSubscriptions).where(and(eq(schema.webhookSubscriptions.id, p.id), eq(schema.webhookSubscriptions.organizationId, ctx.organizationId)));
    return apiOk({ ok: true });
  },

  // ---- Money records ----
  "invoice.create": async (ctx, payload) => {
    if (!canManageMoney(ctx)) return apiError("forbidden", "Finance roles only", 403);
    const p = z.object({
      direction: z.enum(["receivable", "payable"]),
      counterpartyType: z.enum(["buyer", "supplier", "vendor"]),
      counterpartyId: z.string(),
      externalRef: z.string().nullable().default(null),
      issueDate: z.string(),
      dueDate: z.string(),
      amountCents: z.number().positive(),
      periodStart: z.string().nullable().default(null),
      periodEnd: z.string().nullable().default(null),
    }).parse(payload);
    await ctx.db.insert(schema.invoices).values({
      ...p, id: newId("inv"), organizationId: ctx.organizationId, source: "manual",
      amountPaidCents: 0, status: "sent", lineItems: [], createdAt: new Date(),
    });
    await rebuildPeriods(ctx.organizationId);
    return apiOk({ ok: true });
  },

  "cost.save": async (ctx, payload) => {
    if (!canManageMoney(ctx)) return apiError("forbidden", "Finance roles only", 403);
    const p = z.object({
      id: z.string().optional(),
      date: z.string(),
      category: z.enum(["media", "data", "software", "telecom", "rev_share", "other"]),
      description: z.string().min(1),
      amountCents: z.number().positive(),
      campaignId: z.string().nullable().default(null),
      supplierId: z.string().nullable().default(null),
      recurring: z.boolean().default(false),
      paidStatus: z.enum(["accrued", "paid"]).default("accrued"),
    }).parse(payload);
    if (p.id) {
      const { id, ...rest } = p;
      await ctx.db.update(schema.costEntries).set(rest).where(and(eq(schema.costEntries.id, id), eq(schema.costEntries.organizationId, ctx.organizationId)));
    } else {
      await ctx.db.insert(schema.costEntries).values({ ...p, id: newId("cost"), organizationId: ctx.organizationId, matchedPaymentId: null });
    }
    invalidateTruthCache(ctx.organizationId);
    return apiOk({ ok: true });
  },

  "cost.delete": async (ctx, payload) => {
    if (!canManageMoney(ctx)) return apiError("forbidden", "Finance roles only", 403);
    const p = z.object({ id: z.string() }).parse(payload);
    await ctx.db.delete(schema.costEntries).where(and(eq(schema.costEntries.id, p.id), eq(schema.costEntries.organizationId, ctx.organizationId)));
    invalidateTruthCache(ctx.organizationId);
    return apiOk({ ok: true });
  },

  // ---- Spend ----
  "spend.ruleSave": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({
      id: z.string().optional(),
      pattern: z.string().min(1),
      matchField: z.enum(["campaign_name", "adset_name"]),
      targetCampaignId: z.string().nullable(),
      brand: z.enum(["AAT", "CMC", "CAC", "DontSettle", "other"]).nullable(),
      active: z.boolean().default(true),
    }).parse(payload);
    if (p.id) {
      const { id, ...rest } = p;
      await ctx.db.update(schema.spendMappingRules).set(rest).where(and(eq(schema.spendMappingRules.id, id), eq(schema.spendMappingRules.organizationId, ctx.organizationId)));
    } else {
      await ctx.db.insert(schema.spendMappingRules).values({ ...p, id: newId("smr"), organizationId: ctx.organizationId });
    }
    return apiOk({ ok: true });
  },

  "spend.ruleDelete": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ id: z.string() }).parse(payload);
    await ctx.db.delete(schema.spendMappingRules).where(and(eq(schema.spendMappingRules.id, p.id), eq(schema.spendMappingRules.organizationId, ctx.organizationId)));
    return apiOk({ ok: true });
  },

  "spend.applyRules": async (ctx) => {
    const [rules, rows] = await Promise.all([
      ctx.db.query.spendMappingRules.findMany({
        where: and(eq(schema.spendMappingRules.organizationId, ctx.organizationId), eq(schema.spendMappingRules.active, true)),
      }),
      ctx.db.query.adSpendRecords.findMany({
        where: eq(schema.adSpendRecords.organizationId, ctx.organizationId),
      }),
    ]);
    let mapped = 0;
    for (const row of rows) {
      if (row.mappedCampaignId) continue;
      for (const rule of rules) {
        let re: RegExp;
        try {
          re = new RegExp(rule.pattern, "i");
        } catch {
          continue;
        }
        const haystack = rule.matchField === "campaign_name" ? row.campaignName : row.adsetName;
        if (re.test(haystack)) {
          await ctx.db.update(schema.adSpendRecords).set({
            mappedCampaignId: rule.targetCampaignId, mappedBrand: rule.brand,
          }).where(eq(schema.adSpendRecords.id, row.id));
          mapped++;
          break;
        }
      }
    }
    invalidateTruthCache(ctx.organizationId);
    return apiOk({ ok: true, mapped });
  },

  "spend.map": async (ctx, payload) => {
    const p = z.object({
      spendId: z.string(),
      campaignId: z.string().nullable(),
      brand: z.enum(["AAT", "CMC", "CAC", "DontSettle", "other"]).nullable(),
    }).parse(payload);
    await ctx.db.update(schema.adSpendRecords).set({
      mappedCampaignId: p.campaignId, mappedBrand: p.brand,
    }).where(and(eq(schema.adSpendRecords.id, p.spendId), eq(schema.adSpendRecords.organizationId, ctx.organizationId)));
    invalidateTruthCache(ctx.organizationId);
    return apiOk({ ok: true });
  },

  "spend.importCsv": async (ctx, payload) => {
    if (!canManageMoney(ctx)) return apiError("forbidden", "Finance roles only", 403);
    const p = z.object({
      platform: z.enum(["meta", "google", "tiktok"]),
      rows: z.array(z.object({
        date: z.string(), campaign_name: z.string(), adset_name: z.string().default(""),
        ad_name: z.string().default(""), spend: z.number(),
        impressions: z.number().default(0), clicks: z.number().default(0),
      })).max(5000),
    }).parse(payload);
    let account = await ctx.db.query.adAccounts.findFirst({
      where: and(eq(schema.adAccounts.organizationId, ctx.organizationId), eq(schema.adAccounts.platform, p.platform)),
    });
    if (!account) {
      const id = newId("acc");
      await ctx.db.insert(schema.adAccounts).values({
        id, organizationId: ctx.organizationId, platform: p.platform,
        accountExtId: `${p.platform}-import`, name: `${p.platform} (CSV import)`,
        status: "connected", config: {}, lastSyncAt: new Date(),
      });
      account = await ctx.db.query.adAccounts.findFirst({ where: eq(schema.adAccounts.id, id) });
    }
    if (!account) return apiError("account_failed", "Could not resolve ad account", 500);
    for (const row of p.rows) {
      await ctx.db.insert(schema.adSpendRecords).values({
        id: newId("sp"), organizationId: ctx.organizationId, adAccountId: account.id,
        date: row.date, campaignExtId: row.campaign_name, campaignName: row.campaign_name,
        adsetExtId: row.adset_name, adsetName: row.adset_name,
        adExtId: row.ad_name, adName: row.ad_name,
        spendCents: Math.round(row.spend * 100), impressions: row.impressions, clicks: row.clicks,
        paidStatus: "tracked",
      });
    }
    invalidateTruthCache(ctx.organizationId);
    return apiOk({ ok: true, imported: p.rows.length });
  },

  "payments.importCsv": async (ctx, payload) => {
    if (!canManageMoney(ctx)) return apiError("forbidden", "Finance roles only", 403);
    const p = z.object({
      source: z.enum(["stripe", "mercury", "xero", "manual"]),
      rows: z.array(z.object({
        date: z.string(), amount: z.number(), direction: z.enum(["in", "out"]),
        counterparty: z.string(), memo: z.string().default(""), external_ref: z.string().default(""),
      })).max(5000),
    }).parse(payload);
    for (const row of p.rows) {
      await ctx.db.insert(schema.paymentRecords).values({
        id: newId("pay"), organizationId: ctx.organizationId, source: p.source,
        externalRef: row.external_ref || null, date: row.date,
        amountCents: Math.round(Math.abs(row.amount) * 100),
        direction: row.direction, counterpartyName: row.counterparty,
        memo: row.memo || null, matchStatus: "unmatched", confidence: 0, raw: {},
      });
    }
    const result = await runAutoMatch(ctx.organizationId);
    return apiOk({ ok: true, imported: p.rows.length, auto_matched: result.applied });
  },

  // ---- Reports and briefs ----
  "report.save": async (ctx, payload) => {
    const p = z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      config: z.record(z.unknown()).optional(),
      kind: z.enum(["custom", "brief"]).default("custom"),
      schedule: z.string().nullable().default(null),
    }).parse(payload);
    if (p.id) {
      await ctx.db
        .update(schema.savedReports)
        .set({ name: p.name, schedule: p.schedule, ...(p.config && Object.keys(p.config).length > 0 ? { config: p.config } : {}) })
        .where(and(eq(schema.savedReports.id, p.id), eq(schema.savedReports.organizationId, ctx.organizationId)));
      return apiOk({ ok: true, id: p.id });
    }
    const id = newId("rpt");
    await ctx.db.insert(schema.savedReports).values({
      id, organizationId: ctx.organizationId, name: p.name, config: p.config ?? {},
      kind: p.kind, schedule: p.schedule, createdAt: new Date(),
    });
    return apiOk({ ok: true, id });
  },

  "report.delete": async (ctx, payload) => {
    const p = z.object({ id: z.string() }).parse(payload);
    await ctx.db.delete(schema.savedReports).where(and(eq(schema.savedReports.id, p.id), eq(schema.savedReports.organizationId, ctx.organizationId)));
    return apiOk({ ok: true });
  },

  "brief.render": async (ctx, payload) => {
    const p = z.object({ id: z.string() }).parse(payload);
    const report = await ctx.db.query.savedReports.findFirst({
      where: and(eq(schema.savedReports.id, p.id), eq(schema.savedReports.organizationId, ctx.organizationId)),
    });
    if (!report) return apiError("not_found", "Brief not found", 404);
    const kind = String(report.config.brief_kind ?? "daily");
    const question =
      kind === "monthly"
        ? "Write the monthly P&L narrative. Lead with booked vs verified vs gap, who owes what, then what to scale, watch, and cut. Numbers first, no filler."
        : kind === "weekly"
          ? "Write the weekly review. Lead with cash truth: booked vs verified vs gap this week, who owes what, top risks, and what to scale, watch, and cut. Numbers first."
          : "Write the daily ops brief. Booked vs verified vs gap, who owes what right now, overnight anomalies, and the top three actions. Numbers first, no filler.";
    const answer = await askAnalyst({ organizationId: ctx.organizationId, question, history: [] });
    await ctx.db.update(schema.savedReports).set({
      lastRenderedAt: new Date(), lastRenderedBody: answer.text,
    }).where(eq(schema.savedReports.id, p.id));
    return apiOk({ ok: true, body: answer.text, mode: answer.mode });
  },

  // ---- Misc ----
  "notification.readAll": async (ctx) => {
    await ctx.db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notifications.organizationId, ctx.organizationId), eq(schema.notifications.userId, ctx.userId)));
    return apiOk({ ok: true });
  },

  "adperf.kill": async (ctx, payload) => {
    const p = z.object({ adName: z.string(), spendCents: z.number(), campaignName: z.string() }).parse(payload);
    await ctx.db.insert(schema.actionItems).values({
      id: newId("act"), organizationId: ctx.organizationId,
      issueType: "zero_sold_spend", entityType: "ad", entityId: p.adName, entityName: p.adName,
      priority: "high", amountAtRiskCents: p.spendCents,
      description: `Kill ad "${p.adName}" (${p.campaignName}): spent $${(p.spendCents / 100).toFixed(2)} with zero sold leads. Turn it off in the ad platform and confirm here.`,
      source: "manual", status: "open", createdAt: new Date(),
      dedupeKey: `kill:${p.adName}:${toDateKey(new Date())}`,
    });
    // Suggested automation, created disabled so the user opts in.
    const existing = await ctx.db.query.automations.findFirst({
      where: and(eq(schema.automations.organizationId, ctx.organizationId), eq(schema.automations.name, "Alert on zero-sold spend")),
    });
    if (!existing) {
      await ctx.db.insert(schema.automations).values({
        id: newId("aut"), organizationId: ctx.organizationId,
        name: "Alert on zero-sold spend", trigger: "insight_created",
        conditions: { logic: "and", groups: [{ id: "g1", logic: "and", rules: [{ field: "type", operator: "equals", value: "risk" }] }] },
        actions: [{ kind: "slack", config: { message: "Zero-sold spend detected: {{title}}" } }],
        status: "disabled",
      });
    }
    emitLive({ organizationId: ctx.organizationId, kind: "notification", title: `Kill queued for ${p.adName}`, amountCents: p.spendCents });
    return apiOk({ ok: true, message: "Kill action item created, suggested automation added (disabled)" });
  },

  "slack.test": async (ctx, payload) => {
    const p = z.object({ webhookUrl: z.string().url().optional() }).parse(payload);
    const url = p.webhookUrl ?? process.env.SLACK_WEBHOOK_URL;
    if (!url) {
      console.log("[slack.test] no webhook configured, logging instead: DashFlo test message");
      return apiOk({ ok: true, delivered: false, note: "No webhook URL set, message logged to console" });
    }
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "DashFlo test: Slack connection works." }),
        signal: AbortSignal.timeout(6000),
      });
      return apiOk({ ok: res.ok, delivered: res.ok, status: res.status });
    } catch {
      return apiOk({ ok: false, delivered: false, note: "Webhook unreachable" });
    }
  },

  // ---- Report pages ----
  "report.page.save": async (ctx, payload) => {
    const p = z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      slug: z.string().regex(/^[a-z0-9-]+$/),
      kind: z.enum(["overview", "daily", "buyer", "supplier", "campaign", "quality", "custom"]).default("custom"),
      description: z.string().nullable().default(null),
      entityType: z.enum(["buyer", "supplier", "campaign"]).nullable().default(null),
      entityId: z.string().nullable().default(null),
      portalVisible: z.boolean().default(false),
      config: z.object({
        cards: z.array(z.string()),
        widgets: z.array(z.object({
          id: z.string(),
          type: z.enum(["state_table", "daily_table", "buyer_table", "supplier_table", "campaign_table", "truth_chart", "funnel"]),
          title: z.string().optional(),
          metrics: z.array(z.string()).optional(),
          limit: z.number().optional(),
        })),
        filters: z.array(z.object({
          id: z.string(), label: z.string(), field: z.string(),
          operator: z.enum(["within_days", "equals", "not_equals", "in", "contains", "gt", "lt", "exists"]),
          value: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
          enabled: z.boolean(),
        })),
        customMetrics: z.array(z.object({
          id: z.string(), label: z.string(), formula: z.string(),
          format: z.enum(["money", "number", "pct"]),
        })),
      }),
    }).parse(payload);

    for (const metric of p.config.customMetrics) {
      const check = validateFormula(metric.formula);
      if (!check.ok) return apiError("invalid_formula", `${metric.label}: ${check.error}`, 422);
    }

    if (p.id) {
      await ctx.db.update(schema.reportPages).set({
        name: p.name, slug: p.slug, kind: p.kind, description: p.description,
        entityType: p.entityType, entityId: p.entityId,
        portalVisible: p.portalVisible, config: p.config,
      }).where(and(eq(schema.reportPages.id, p.id), eq(schema.reportPages.organizationId, ctx.organizationId)));
      return apiOk({ ok: true, id: p.id, slug: p.slug });
    }
    const id = newId("rpg");
    await ctx.db.insert(schema.reportPages).values({
      id, organizationId: ctx.organizationId,
      name: p.name, slug: p.slug, kind: p.kind, description: p.description,
      entityType: p.entityType, entityId: p.entityId,
      config: p.config, portalVisible: p.portalVisible, isDefault: false, sortOrder: 100,
      createdAt: new Date(),
    });
    return apiOk({ ok: true, id, slug: p.slug });
  },

  "report.page.clone": async (ctx, payload) => {
    const p = z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      entityType: z.enum(["buyer", "supplier", "campaign"]).nullable().optional(),
      entityId: z.string().nullable().optional(),
      portalVisible: z.boolean().optional(),
    }).parse(payload);
    const source = await ctx.db.query.reportPages.findFirst({
      where: and(eq(schema.reportPages.id, p.id), eq(schema.reportPages.organizationId, ctx.organizationId)),
    });
    if (!source) return apiError("not_found", "Report page not found", 404);
    const name = p.name ?? `${source.name} (copy)`;
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${newId("x").slice(-4)}`;
    const id = newId("rpg");
    await ctx.db.insert(schema.reportPages).values({
      id, organizationId: ctx.organizationId,
      name, slug, kind: source.kind, description: source.description,
      entityType: p.entityType !== undefined ? p.entityType : source.entityType,
      entityId: p.entityId !== undefined ? p.entityId : source.entityId,
      config: source.config,
      portalVisible: p.portalVisible ?? source.portalVisible,
      isDefault: false, sortOrder: source.sortOrder + 1, createdAt: new Date(),
    });
    return apiOk({ ok: true, id, slug });
  },

  "report.page.delete": async (ctx, payload) => {
    const p = z.object({ id: z.string() }).parse(payload);
    await ctx.db.delete(schema.reportPages).where(and(eq(schema.reportPages.id, p.id), eq(schema.reportPages.organizationId, ctx.organizationId)));
    return apiOk({ ok: true });
  },

  "report.pages.restoreDefaults": async (ctx) => {
    const created = await seedDefaultReportPages(ctx.organizationId);
    return apiOk({ ok: true, created });
  },

  // ---- AI providers ----
  "ai.provider.save": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({
      provider: z.enum(["anthropic", "openai", "grok", "gemini"]),
      apiKey: z.string(),
      model: z.string().min(1),
      baseUrl: z.string().nullable().default(null),
    }).parse(payload);
    const existing = await ctx.db.query.aiProviders.findFirst({
      where: and(eq(schema.aiProviders.organizationId, ctx.organizationId), eq(schema.aiProviders.provider, p.provider)),
    });
    if (existing) {
      await ctx.db.update(schema.aiProviders).set({
        apiKey: p.apiKey || existing.apiKey, model: p.model, baseUrl: p.baseUrl,
        status: p.apiKey ? "disconnected" : existing.status,
      }).where(eq(schema.aiProviders.id, existing.id));
    } else {
      await ctx.db.insert(schema.aiProviders).values({
        id: newId("aip"), organizationId: ctx.organizationId,
        provider: p.provider, apiKey: p.apiKey, model: p.model, baseUrl: p.baseUrl,
        status: "disconnected", active: false,
      });
    }
    await writeAudit(ctx, "ai_provider.save", "ai_provider", p.provider);
    return apiOk({ ok: true });
  },

  "ai.provider.test": async (ctx, payload) => {
    const p = z.object({ provider: z.enum(["anthropic", "openai", "grok", "gemini"]) }).parse(payload);
    const row = await ctx.db.query.aiProviders.findFirst({
      where: and(eq(schema.aiProviders.organizationId, ctx.organizationId), eq(schema.aiProviders.provider, p.provider)),
    });
    if (!row || !row.apiKey) return apiError("no_key", "Save an API key first", 409);
    const result = await testProvider({ provider: row.provider, apiKey: row.apiKey, model: row.model, baseUrl: row.baseUrl });
    await ctx.db.update(schema.aiProviders).set({
      status: result.ok ? "connected" : "error", lastTestedAt: new Date(), note: result.message,
    }).where(eq(schema.aiProviders.id, row.id));
    return apiOk({ ok: result.ok, message: result.message });
  },

  "ai.provider.activate": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ provider: z.enum(["anthropic", "openai", "grok", "gemini"]).nullable() }).parse(payload);
    await ctx.db.update(schema.aiProviders).set({ active: false }).where(eq(schema.aiProviders.organizationId, ctx.organizationId));
    if (p.provider) {
      await ctx.db.update(schema.aiProviders).set({ active: true }).where(and(
        eq(schema.aiProviders.organizationId, ctx.organizationId),
        eq(schema.aiProviders.provider, p.provider)
      ));
    }
    await writeAudit(ctx, "ai_provider.activate", "ai_provider", p.provider ?? "none");
    return apiOk({ ok: true });
  },

  "ai.provider.delete": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ provider: z.enum(["anthropic", "openai", "grok", "gemini"]) }).parse(payload);
    await ctx.db.delete(schema.aiProviders).where(and(
      eq(schema.aiProviders.organizationId, ctx.organizationId),
      eq(schema.aiProviders.provider, p.provider)
    ));
    return apiOk({ ok: true });
  },

  // ---- Ad platform integrations ----
  "integration.config": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({
      platform: z.enum(["meta", "google", "tiktok"]),
      config: z.record(z.string()),
    }).parse(payload);
    const connector = await ctx.db.query.connectorStatuses.findFirst({
      where: and(
        eq(schema.connectorStatuses.organizationId, ctx.organizationId),
        eq(schema.connectorStatuses.provider, `${p.platform}_ads` as "meta_ads")
      ),
    });
    if (!connector) return apiError("not_found", "Connector not found", 404);
    await ctx.db.update(schema.connectorStatuses).set({
      config: { ...connector.config, ...p.config },
    }).where(eq(schema.connectorStatuses.id, connector.id));
    return apiOk({ ok: true });
  },

  "integration.connectDemo": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ platform: z.enum(["meta", "google", "tiktok"]) }).parse(payload);
    const result = await connectDemoIntegration(ctx.organizationId, p.platform);
    invalidateTruthCache(ctx.organizationId);
    return apiOk({ ok: true, created: result.created });
  },

  "integration.disconnect": async (ctx, payload) => {
    if (!canManage(ctx)) return apiError("forbidden", "Owners and admins only", 403);
    const p = z.object({ platform: z.enum(["meta", "google", "tiktok"]) }).parse(payload);
    await disconnectIntegration(ctx.organizationId, p.platform);
    invalidateTruthCache(ctx.organizationId);
    return apiOk({ ok: true });
  },

  "leadform.update": async (ctx, payload) => {
    const p = z.object({
      id: z.string(),
      mappedCampaignId: z.string().nullable().optional(),
      enabled: z.boolean().optional(),
    }).parse(payload);
    const form = await ctx.db.query.integrationAssets.findFirst({
      where: and(eq(schema.integrationAssets.id, p.id), eq(schema.integrationAssets.organizationId, ctx.organizationId)),
    });
    if (!form) return apiError("not_found", "Lead form not found", 404);
    const mapped = p.mappedCampaignId !== undefined ? p.mappedCampaignId : form.mappedCampaignId;
    if (p.enabled === true && !mapped) {
      return apiError("not_mapped", "Map the form to a campaign before enabling it", 409);
    }
    await ctx.db.update(schema.integrationAssets).set({
      ...(p.mappedCampaignId !== undefined ? { mappedCampaignId: p.mappedCampaignId } : {}),
      ...(p.enabled !== undefined ? { enabled: p.enabled } : {}),
    }).where(eq(schema.integrationAssets.id, p.id));
    return apiOk({ ok: true });
  },

  "leadform.simulate": async (ctx, payload) => {
    const p = z.object({ id: z.string() }).parse(payload);
    const form = await ctx.db.query.integrationAssets.findFirst({
      where: and(eq(schema.integrationAssets.id, p.id), eq(schema.integrationAssets.organizationId, ctx.organizationId)),
    });
    if (!form) return apiError("not_found", "Lead form not found", 404);
    const result = await ingestLeadFormSubmission({
      organizationId: ctx.organizationId,
      formExtId: form.extId,
      fields: sampleLeadFormFields(),
    });
    return apiOk({ ok: result.ok, message: result.message, leadId: result.leadId });
  },

  "matchqueue.preview": async (ctx, payload) => {
    // Live preview of the truth delta before applying a match.
    const p = z.object({ paymentId: z.string(), target: targetSchema }).parse(payload);
    const payment = await ctx.db.query.paymentRecords.findFirst({
      where: and(eq(schema.paymentRecords.id, p.paymentId), eq(schema.paymentRecords.organizationId, ctx.organizationId)),
    });
    if (!payment) return apiError("not_found", "Payment not found", 404);
    let targetName = "";
    let currentVerifiedCents = 0;
    if (p.target.type === "invoice") {
      const inv = await ctx.db.query.invoices.findFirst({ where: eq(schema.invoices.id, p.target.invoiceId) });
      targetName = inv ? `Invoice ${inv.externalRef ?? inv.id}` : "Invoice";
      currentVerifiedCents = inv?.amountPaidCents ?? 0;
    } else if (p.target.type === "buyer") {
      const b = await ctx.db.query.buyers.findFirst({ where: eq(schema.buyers.id, p.target.id) });
      targetName = b?.name ?? "Buyer";
    } else if (p.target.type === "supplier") {
      const s = await ctx.db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, p.target.id) });
      targetName = s?.name ?? "Supplier";
    } else {
      targetName = `${p.target.id} ad spend`;
    }
    return apiOk({
      ok: true,
      preview: {
        target_name: targetName,
        amount_cents: payment.amountCents,
        effect:
          payment.direction === "in"
            ? `Verified income +$${(payment.amountCents / 100).toFixed(2)}, revenue gap shrinks by the same amount`
            : `Verified outflow +$${(payment.amountCents / 100).toFixed(2)}, ${p.target.type === "ad_platform" ? "spend becomes paid-verified" : "supplier cost paid increases"}`,
        current_verified_cents: currentVerifiedCents,
      },
    });
  },

  "match.suggestions": async (ctx) => {
    const suggestions = await suggestForUnmatched(ctx.organizationId);
    return apiOk({ ok: true, suggestions });
  },
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await getOrgContext();
  if (!ctx) return apiError("unauthorized", "Sign in required", 401);

  const envelope = z.object({ action: z.string(), payload: z.unknown().default({}) });
  const parsed = envelope.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_body", "Expected {action, payload}", 400);

  const handler = handlers[parsed.data.action];
  if (!handler) return apiError("unknown_action", `No action ${parsed.data.action}`, 404);

  try {
    return await handler(ctx, parsed.data.payload);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError("validation_failed", "Payload failed validation", 422, err.flatten());
    }
    console.error(`[actions] ${parsed.data.action} failed:`, err);
    return apiError("internal_error", err instanceof Error ? err.message : "Action failed", 500);
  }
}

function sampleValue(key: string, type: string, options?: string[]): unknown {
  const samples: Record<string, unknown> = {
    first_name: "Taylor", last_name: "Testcase", phone: "(512) 555-0188", email: "taylor.test@example.com",
    incident_date: "2026-05-14", incident_state: "TX", at_fault: "no", attorney_status: "none",
    injury_type: options?.[0] ?? "whiplash", currently_represented: "no",
    description: "Rear-ended at a stoplight, neck and back pain since.",
    zip: "78701", trusted_form_url: "https://cert.trustedform.com/test", jornaya_id: "TEST-JORNAYA-TOKEN",
  };
  if (key in samples) return samples[key];
  switch (type) {
    case "phone": return "(512) 555-0188";
    case "email": return "taylor.test@example.com";
    case "date": return "2026-05-14";
    case "state": return "TX";
    case "zip": return "78701";
    case "number": return 42;
    case "boolean": return "no";
    case "select": return options?.[0] ?? "";
    default: return "test value";
  }
}

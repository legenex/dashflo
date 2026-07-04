import { NextResponse, type NextRequest } from "next/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getOrgContext, maskPhone } from "@/server/org";
import { apiError, apiOk } from "@/server/api-utils";
import { assembleTruthDataset } from "@/server/truth-data";
import { computeTruth } from "@/domain/truth/compute";
import { suggestForUnmatched } from "@/server/matching";
import { resolveReportPage } from "@/server/report-pages";
import type { TruthScope } from "@/domain/truth/types";

export const dynamic = "force-dynamic";

// Read endpoint for drawers, the match queue, the command palette, and
// client-side refreshes after mutations.

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await getOrgContext();
  if (!ctx) return apiError("unauthorized", "Sign in required", 401);
  const db = await getDb();
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "";
  const orgId = ctx.organizationId;

  switch (kind) {
    case "lead.detail": {
      const id = url.searchParams.get("id") ?? "";
      const lead = await db.query.leads.findFirst({
        where: and(eq(schema.leads.id, id), eq(schema.leads.organizationId, orgId)),
      });
      if (!lead) return apiError("not_found", "Lead not found", 404);
      const [events, attempts, campaign, buyer, supplier, payments] = await Promise.all([
        db.query.leadEvents.findMany({ where: eq(schema.leadEvents.leadId, id), orderBy: asc(schema.leadEvents.at) }),
        db.query.distributionAttempts.findMany({
          where: eq(schema.distributionAttempts.leadId, id),
          orderBy: asc(schema.distributionAttempts.at),
        }),
        db.query.campaigns.findFirst({ where: eq(schema.campaigns.id, lead.campaignId) }),
        lead.buyerId ? db.query.buyers.findFirst({ where: eq(schema.buyers.id, lead.buyerId) }) : null,
        db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, lead.supplierId) }),
        lead.matchedPaymentIds.length > 0
          ? db.query.paymentRecords.findMany({ where: inArray(schema.paymentRecords.id, lead.matchedPaymentIds) })
          : [],
      ]);
      return apiOk({
        lead: {
          ...lead,
          normalizedPhone: maskPhone(lead.normalizedPhone, ctx.role),
          fieldData: ctx.role === "analyst" || ctx.role === "partner"
            ? Object.fromEntries(Object.entries(lead.fieldData).map(([k, v]) =>
                k === "phone" ? [k, maskPhone(String(v), ctx.role)] : [k, v]))
            : lead.fieldData,
        },
        campaign: campaign ? { id: campaign.id, name: campaign.name, slug: campaign.slug } : null,
        buyer: buyer ? { id: buyer.id, name: buyer.name, paymentTermsDays: buyer.paymentTermsDays } : null,
        supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
        events,
        attempts,
        matchedPayments: payments.map((p) => ({
          id: p.id, source: p.source, date: p.date, amountCents: p.amountCents,
          counterpartyName: p.counterpartyName, externalRef: p.externalRef,
        })),
      });
    }

    case "matchqueue.list": {
      const [payments, suggestions, invoices, buyers, suppliers] = await Promise.all([
        db.query.paymentRecords.findMany({
          where: and(eq(schema.paymentRecords.organizationId, orgId), inArray(schema.paymentRecords.matchStatus, ["unmatched", "disputed"])),
          orderBy: desc(schema.paymentRecords.date),
        }),
        suggestForUnmatched(orgId),
        db.query.invoices.findMany({
          where: and(eq(schema.invoices.organizationId, orgId)),
        }),
        db.query.buyers.findMany({ where: eq(schema.buyers.organizationId, orgId) }),
        db.query.suppliers.findMany({ where: eq(schema.suppliers.organizationId, orgId) }),
      ]);
      const nameOf = (type: string, id: string) =>
        type === "buyer"
          ? buyers.find((b) => b.id === id)?.name ?? id
          : type === "supplier"
            ? suppliers.find((s) => s.id === id)?.name ?? id
            : id;
      return apiOk({
        payments,
        suggestions: suggestions.map((s) => ({
          ...s,
          targetName:
            s.target.type === "invoice"
              ? (() => {
                  const inv = invoices.find((i) => i.id === (s.target as { invoiceId: string }).invoiceId);
                  return inv ? `Invoice ${inv.externalRef ?? inv.id.slice(0, 10)} (${nameOf(inv.counterpartyType, inv.counterpartyId)})` : "Invoice";
                })()
              : s.target.type === "ad_platform"
                ? `${s.target.id} ad spend`
                : nameOf(s.target.type, (s.target as { id: string }).id),
        })),
        targets: {
          invoices: invoices
            .filter((i) => i.status !== "paid" && i.status !== "void")
            .map((i) => ({
              id: i.id, label: `${i.externalRef ?? i.id.slice(0, 12)} · ${nameOf(i.counterpartyType, i.counterpartyId)} · $${((i.amountCents - i.amountPaidCents) / 100).toFixed(2)} open`,
              direction: i.direction,
            })),
          buyers: buyers.map((b) => ({ id: b.id, label: b.name })),
          suppliers: suppliers.map((s) => ({ id: s.id, label: s.name })),
          platforms: [
            { id: "meta", label: "Meta ads" },
            { id: "google", label: "Google ads" },
            { id: "tiktok", label: "TikTok ads" },
          ],
        },
      });
    }

    case "buyer.drawer": {
      const id = url.searchParams.get("id") ?? "";
      const buyer = await db.query.buyers.findFirst({
        where: and(eq(schema.buyers.id, id), eq(schema.buyers.organizationId, orgId)),
      });
      if (!buyer) return apiError("not_found", "Buyer not found", 404);
      const [periods, payments, leads, suggestions] = await Promise.all([
        db.query.reconciliationPeriods.findMany({
          where: and(
            eq(schema.reconciliationPeriods.organizationId, orgId),
            eq(schema.reconciliationPeriods.counterpartyType, "buyer"),
            eq(schema.reconciliationPeriods.counterpartyId, id)
          ),
        }),
        db.query.paymentRecords.findMany({ where: eq(schema.paymentRecords.organizationId, orgId) }),
        db.query.leads.findMany({
          where: and(eq(schema.leads.organizationId, orgId), eq(schema.leads.buyerId, id), eq(schema.leads.isTest, false)),
          orderBy: desc(schema.leads.receivedAt),
          limit: 300,
        }),
        suggestForUnmatched(orgId),
      ]);
      const matched = payments.filter(
        (p) =>
          (p.matchedEntity?.type === "buyer" && p.matchedEntity.id === id) ||
          (p.matchedInvoiceId !== null && p.matchStatus !== "unmatched" && p.direction === "in")
      );
      return apiOk({
        buyer,
        periods: periods.sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1)),
        matchedPayments: matched.slice(0, 50),
        unmatchedCandidates: suggestions.filter(
          (s) => (s.target.type === "buyer" && (s.target as { id: string }).id === id) ||
            (s.target.type === "invoice")
        ).slice(0, 10),
        returns: leads.filter((l) => l.status === "returned").slice(0, 30),
        recentLeads: leads.slice(0, 60).map((l) => ({
          id: l.id, status: l.status, receivedAt: l.receivedAt, salePriceCents: l.salePriceCents,
          paidAllocatedCents: l.paidAllocatedCents, reconciliationStatus: l.reconciliationStatus,
          state: l.state, paymentDueDate: l.paymentDueDate,
        })),
      });
    }

    case "supplier.drawer": {
      const id = url.searchParams.get("id") ?? "";
      const supplier = await db.query.suppliers.findFirst({
        where: and(eq(schema.suppliers.id, id), eq(schema.suppliers.organizationId, orgId)),
      });
      if (!supplier) return apiError("not_found", "Supplier not found", 404);
      const [periods, payments, leads, campaigns] = await Promise.all([
        db.query.reconciliationPeriods.findMany({
          where: and(
            eq(schema.reconciliationPeriods.organizationId, orgId),
            eq(schema.reconciliationPeriods.counterpartyType, "supplier"),
            eq(schema.reconciliationPeriods.counterpartyId, id)
          ),
        }),
        db.query.paymentRecords.findMany({ where: eq(schema.paymentRecords.organizationId, orgId) }),
        db.query.leads.findMany({
          where: and(eq(schema.leads.organizationId, orgId), eq(schema.leads.supplierId, id), eq(schema.leads.isTest, false)),
          orderBy: desc(schema.leads.receivedAt),
          limit: 300,
        }),
        db.query.campaigns.findMany({ where: eq(schema.campaigns.organizationId, orgId) }),
      ]);
      const allowed = campaigns.filter(
        (c) => supplier.allowedCampaignIds.length === 0 || supplier.allowedCampaignIds.includes(c.id)
      );
      return apiOk({
        supplier: { ...supplier, apiKeyHash: undefined },
        periods: periods.sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1)),
        payments: payments
          .filter((p) => p.matchedEntity?.type === "supplier" && p.matchedEntity.id === id)
          .slice(0, 50),
        leadStats: {
          total: leads.length,
          sold: leads.filter((l) => l.status === "sold" || l.status === "returned").length,
          duplicates: leads.filter((l) => l.status === "duplicate").length,
          rejected: leads.filter((l) => l.status === "rejected").length,
          errors: leads.filter((l) => l.status === "error").length,
        },
        campaigns: allowed.map((c) => ({ id: c.id, name: c.name, slug: c.slug, fieldMapping: c.fieldMapping })),
      });
    }

    case "truth": {
      const scope = (url.searchParams.get("scope") ?? "org") as TruthScope;
      const from = url.searchParams.get("from") ?? undefined;
      const to = url.searchParams.get("to") ?? undefined;
      const dataset = await assembleTruthDataset(orgId);
      const result = computeTruth(dataset, {
        scope,
        range: from && to ? { from, to } : undefined,
      });
      return apiOk(result);
    }

    case "notifications.list": {
      const rows = await db.query.notifications.findMany({
        where: and(eq(schema.notifications.organizationId, orgId), eq(schema.notifications.userId, ctx.userId)),
        orderBy: desc(schema.notifications.at),
        limit: 30,
      });
      return apiOk({ notifications: rows, unread: rows.filter((n) => !n.readAt).length });
    }

    case "automation.runs": {
      const id = url.searchParams.get("id") ?? "";
      const rows = await db.query.automationRuns.findMany({
        where: and(eq(schema.automationRuns.organizationId, orgId), eq(schema.automationRuns.automationId, id)),
        orderBy: desc(schema.automationRuns.at),
        limit: 50,
      });
      return apiOk({ runs: rows });
    }

    case "search": {
      const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
      if (q.length < 2) return apiOk({ results: [] });
      const [campaigns, buyers, suppliers, actions, leads] = await Promise.all([
        db.query.campaigns.findMany({ where: eq(schema.campaigns.organizationId, orgId) }),
        db.query.buyers.findMany({ where: eq(schema.buyers.organizationId, orgId) }),
        db.query.suppliers.findMany({ where: eq(schema.suppliers.organizationId, orgId) }),
        db.query.actionItems.findMany({
          where: and(eq(schema.actionItems.organizationId, orgId), eq(schema.actionItems.status, "open")),
          limit: 200,
        }),
        db.query.leads.findMany({
          where: eq(schema.leads.organizationId, orgId),
          orderBy: desc(schema.leads.receivedAt),
          limit: 500,
        }),
      ]);
      const results: Array<{ type: string; id: string; title: string; subtitle: string; link: string }> = [];
      const fuzzy = (s: string) => s.toLowerCase().includes(q);
      for (const c of campaigns.filter((c) => fuzzy(c.name))) {
        results.push({ type: "campaign", id: c.id, title: c.name, subtitle: `Campaign · ${c.status}`, link: `/distribution/campaigns/${c.id}` });
      }
      for (const b of buyers.filter((b) => fuzzy(b.name))) {
        results.push({ type: "buyer", id: b.id, title: b.name, subtitle: `Buyer · ${b.status}`, link: `/distribution/buyers?open=${b.id}` });
      }
      for (const s of suppliers.filter((s) => fuzzy(s.name))) {
        results.push({ type: "supplier", id: s.id, title: s.name, subtitle: `Supplier · ${s.status}`, link: `/distribution/suppliers?open=${s.id}` });
      }
      for (const a of actions.filter((a) => fuzzy(a.entityName) || fuzzy(a.description)).slice(0, 5)) {
        results.push({ type: "action", id: a.id, title: a.entityName, subtitle: `Action · ${a.issueType.replace(/_/g, " ")}`, link: `/ai/insights?tab=actions` });
      }
      for (const l of leads.filter((l) => {
        const name = `${String(l.fieldData.first_name ?? "")} ${String(l.fieldData.last_name ?? "")}`.toLowerCase();
        return name.includes(q) || (l.normalizedPhone ?? "").includes(q) || (l.normalizedEmail ?? "").includes(q) || l.id.includes(q);
      }).slice(0, 5)) {
        results.push({
          type: "lead", id: l.id,
          title: `${String(l.fieldData.first_name ?? "Lead")} ${String(l.fieldData.last_name ?? "")}`.trim(),
          subtitle: `Lead · ${l.status} · ${l.state ?? ""}`,
          link: `/leads?open=${l.id}`,
        });
      }
      const settingsPages = [
        { title: "Data Sources", link: "/settings/data-sources" },
        { title: "API Keys", link: "/settings/api-keys" },
        { title: "Users & Roles", link: "/settings/users" },
        { title: "Billing & Plan", link: "/settings/billing" },
        { title: "Cost Entries", link: "/settings/costs" },
        { title: "White Label", link: "/settings/white-label" },
        { title: "Error Logs", link: "/settings/errors" },
      ].filter((s) => fuzzy(s.title));
      for (const s of settingsPages) {
        results.push({ type: "settings", id: s.link, title: s.title, subtitle: "Settings", link: s.link });
      }
      return apiOk({ results: results.slice(0, 15) });
    }

    case "custom.report": {
      const dimension = url.searchParams.get("dimension") ?? "campaign";
      const from = url.searchParams.get("from") ?? undefined;
      const to = url.searchParams.get("to") ?? undefined;
      const scopeMap: Record<string, TruthScope> = {
        date: "day", campaign: "campaign", buyer: "buyer", supplier: "supplier", state: "state",
      };
      const dataset = await assembleTruthDataset(orgId);
      if (dimension === "brand" || dimension === "platform") {
        const groups = new Map<string, { spend: number; paid: number }>();
        for (const row of dataset.spend) {
          if (from && row.date < from) continue;
          if (to && row.date > to) continue;
          const key = dimension === "brand" ? row.brand ?? "unmapped" : row.platform;
          const g = groups.get(key) ?? { spend: 0, paid: 0 };
          g.spend += row.spendCents;
          if (row.paidStatus === "paid_verified") g.paid += row.spendCents;
          groups.set(key, g);
        }
        return apiOk({
          rows: [...groups.entries()].map(([key, g]) => ({
            key, name: key,
            performance: { leads: 0, sold: 0, sold_rate: null, dq_rate: null, return_rate: null, duplicate_rate: null, accept_rate: null, avg_response_ms: null },
            booked: { booked_revenue: 0, supplier_cost_accrued: 0, media_cost_tracked: g.spend, other_costs: 0, reported_profit: null, booked_margin: null, reported_cpl: null },
            verified: { verified_income: null, supplier_cost_paid: null, media_spend_paid: g.paid, cash_profit: null, cash_margin: null, true_cpl: null },
            gap: { spend_gap: g.spend - g.paid },
          })),
        });
      }
      const result = computeTruth(dataset, {
        scope: scopeMap[dimension] ?? "campaign",
        range: from && to ? { from, to } : undefined,
      });
      return apiOk({ rows: result.rows, totals: result.totals });
    }

    case "report.data": {
      const slug = url.searchParams.get("slug") ?? "";
      const page = await db.query.reportPages.findFirst({
        where: and(eq(schema.reportPages.organizationId, orgId), eq(schema.reportPages.slug, slug)),
      });
      if (!page) return apiError("not_found", "Report page not found", 404);

      // Partner users may only read pages published to their portal entity.
      if (ctx.role === "partner") {
        const scopeId = ctx.partnerScope?.buyer_id ?? ctx.partnerScope?.supplier_id ?? null;
        if (!page.portalVisible || !page.entityId || page.entityId !== scopeId) {
          return apiError("forbidden", "This report is not published to your portal", 403);
        }
      }

      const from = url.searchParams.get("from") ?? undefined;
      const to = url.searchParams.get("to") ?? undefined;
      const filtersRaw = url.searchParams.get("filters");
      let runtimeFilters;
      if (filtersRaw) {
        try {
          runtimeFilters = JSON.parse(filtersRaw) as typeof page.config.filters;
        } catch {
          runtimeFilters = undefined;
        }
      }
      const data = await resolveReportPage({
        organizationId: orgId,
        config: page.config,
        entityType: page.entityType,
        entityId: page.entityId,
        from, to, runtimeFilters,
        extra: {
          campaignIds: url.searchParams.get("campaigns")?.split(",").filter(Boolean),
          buyerIds: url.searchParams.get("buyers")?.split(",").filter(Boolean),
          supplierIds: url.searchParams.get("suppliers")?.split(",").filter(Boolean),
        },
      });
      return apiOk({ page: { id: page.id, name: page.name, slug: page.slug }, ...data });
    }

    case "integrations.assets": {
      const platform = (url.searchParams.get("platform") ?? "meta") as "meta" | "google" | "tiktok";
      const [assets, campaigns] = await Promise.all([
        db.query.integrationAssets.findMany({
          where: and(eq(schema.integrationAssets.organizationId, orgId), eq(schema.integrationAssets.platform, platform)),
        }),
        db.query.campaigns.findMany({ where: eq(schema.campaigns.organizationId, orgId) }),
      ]);
      return apiOk({
        businesses: assets.filter((a) => a.kind === "business"),
        adAccounts: assets.filter((a) => a.kind === "ad_account"),
        pages: assets.filter((a) => a.kind === "page"),
        leadForms: assets.filter((a) => a.kind === "lead_form").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
        campaigns: campaigns.map((c) => ({ id: c.id, name: c.name })),
      });
    }

    default:
      return apiError("unknown_query", `No query kind ${kind}`, 404);
  }
}

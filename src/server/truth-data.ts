import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { TruthDataset } from "@/domain/truth/types";
import { toDateKey } from "@/lib/transforms";

// Assembles the TruthDataset the pure truth engine computes over.
// Cached per request burst (2s TTL) because several panels on one page
// ask for different scopes of the same data.

interface CacheEntry {
  at: number;
  data: TruthDataset;
}

interface CacheGlobal {
  __dashflo_truth_cache?: Map<string, CacheEntry>;
}

const g = globalThis as unknown as CacheGlobal;

export function invalidateTruthCache(organizationId?: string): void {
  if (!g.__dashflo_truth_cache) return;
  if (organizationId) {
    g.__dashflo_truth_cache.delete(organizationId);
  } else {
    g.__dashflo_truth_cache.clear();
  }
}

const AD_ACCOUNT_PLATFORM = new Map<string, "meta" | "google" | "tiktok">();

export async function assembleTruthDataset(organizationId: string): Promise<TruthDataset> {
  const cache = (g.__dashflo_truth_cache ??= new Map());
  const hit = cache.get(organizationId);
  if (hit && Date.now() - hit.at < 2000) return hit.data;

  const db = await getDb();

  const [leads, spendRows, adAccounts, costs, attempts, periods, payments, connectors, campaigns, buyers, suppliers] =
    await Promise.all([
      db.query.leads.findMany({ where: eq(schema.leads.organizationId, organizationId) }),
      db.query.adSpendRecords.findMany({ where: eq(schema.adSpendRecords.organizationId, organizationId) }),
      db.query.adAccounts.findMany({ where: eq(schema.adAccounts.organizationId, organizationId) }),
      db.query.costEntries.findMany({ where: eq(schema.costEntries.organizationId, organizationId) }),
      db.query.distributionAttempts.findMany({
        where: eq(schema.distributionAttempts.organizationId, organizationId),
      }),
      db.query.reconciliationPeriods.findMany({
        where: eq(schema.reconciliationPeriods.organizationId, organizationId),
      }),
      db.query.paymentRecords.findMany({ where: eq(schema.paymentRecords.organizationId, organizationId) }),
      db.query.connectorStatuses.findMany({ where: eq(schema.connectorStatuses.organizationId, organizationId) }),
      db.query.campaigns.findMany({ where: eq(schema.campaigns.organizationId, organizationId) }),
      db.query.buyers.findMany({ where: eq(schema.buyers.organizationId, organizationId) }),
      db.query.suppliers.findMany({ where: eq(schema.suppliers.organizationId, organizationId) }),
    ]);

  for (const acc of adAccounts) AD_ACCOUNT_PLATFORM.set(acc.id, acc.platform);

  const connectorMap: TruthDataset["connectors"] = {};
  for (const c of connectors) connectorMap[c.provider] = c.status;

  const data: TruthDataset = {
    leads: leads.map((l) => ({
      id: l.id,
      campaignId: l.campaignId,
      buyerId: l.buyerId,
      supplierId: l.supplierId,
      status: l.status,
      state: l.state,
      salePriceCents: l.salePriceCents,
      supplierCostCents: l.supplierCostCents,
      paidAllocatedCents: l.paidAllocatedCents,
      supplierPaidCents: l.supplierPaidCents,
      isTest: l.isTest,
      receivedAt: toDateKey(l.receivedAt),
      soldAt: l.soldAt ? toDateKey(l.soldAt) : null,
      returnedAt: l.returnedAt ? toDateKey(l.returnedAt) : null,
      paymentDueDate: l.paymentDueDate ? toDateKey(l.paymentDueDate) : null,
    })),
    spend: spendRows.map((s) => ({
      date: s.date,
      platform: AD_ACCOUNT_PLATFORM.get(s.adAccountId) ?? "meta",
      mappedCampaignId: s.mappedCampaignId,
      brand: s.mappedBrand,
      spendCents: s.spendCents,
      paidStatus: s.paidStatus,
      impressions: s.impressions,
      clicks: s.clicks,
    })),
    costs: costs.map((c) => ({
      date: c.date,
      campaignId: c.campaignId,
      supplierId: c.supplierId,
      amountCents: c.amountCents,
      paidStatus: c.paidStatus,
      category: c.category,
    })),
    attempts: attempts.map((a) => ({
      leadId: a.leadId,
      buyerId: a.buyerId,
      outcome: a.outcome,
      attemptType: a.attemptType,
      durationMs: a.durationMs,
      date: toDateKey(a.at),
    })),
    periods: periods.map((p) => ({
      counterpartyType: p.counterpartyType,
      counterpartyId: p.counterpartyId,
      granularity: p.granularity,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      expectedCents: p.expectedCents,
      paidCents: p.paidCents,
      varianceCents: p.varianceCents,
      status: p.status,
    })),
    payments: payments.map((p) => ({
      direction: p.direction,
      amountCents: p.amountCents,
      matchStatus: p.matchStatus,
      date: p.date,
    })),
    connectors: connectorMap,
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, paymentTermsDays: c.paymentTermsDays })),
    buyers: buyers.map((b) => ({ id: b.id, name: b.name, paymentTermsDays: b.paymentTermsDays })),
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name, paymentTermsDays: s.paymentTermsDays })),
    today: toDateKey(new Date()),
  };

  cache.set(organizationId, { at: Date.now(), data });
  return data;
}

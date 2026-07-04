import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { emitLive } from "@/lib/sse";
import { generateInsights } from "@/domain/insights/generate";
import { computeTruth } from "@/domain/truth/compute";
import { assembleTruthDataset } from "./truth-data";
import { fireAutomations } from "./automations";
import { fmtCents } from "@/lib/money";
import type { ActionPriority, IssueType } from "@/db/schema";

// Insight + action item generation. Idempotent via dedupe keys, safe to run
// on every seed, cron tick, or manual trigger.

export async function runInsightGeneration(organizationId: string): Promise<{ created: number }> {
  const db = await getDb();
  const dataset = await assembleTruthDataset(organizationId);
  const drafts = generateInsights(dataset);

  let created = 0;
  for (const draft of drafts) {
    const existing = await db.query.aiInsights.findFirst({
      where: and(
        eq(schema.aiInsights.organizationId, organizationId),
        eq(schema.aiInsights.dedupeKey, draft.dedupeKey)
      ),
    });
    if (existing) continue;
    await db.insert(schema.aiInsights).values({
      id: newId("ins"),
      organizationId,
      type: draft.type,
      severity: draft.severity,
      title: draft.title,
      body: draft.body,
      related: draft.related,
      metricSnapshot: draft.metricSnapshot,
      status: "new",
      dedupeKey: draft.dedupeKey,
      createdAt: new Date(),
    });
    created++;
    emitLive({
      organizationId,
      kind: "insight_created",
      title: draft.title,
      link: "/ai/insights",
    });
    void fireAutomations(organizationId, "insight_created", {
      title: draft.title,
      severity: draft.severity,
      type: draft.type,
    });
  }

  await syncActionItems(organizationId);
  return { created };
}

// Truth-engine-driven action items: overdue buyers, missing sources, at-risk
// revenue, unmatched income, spend gaps. Dedupe keyed so resolves stick.
export async function syncActionItems(organizationId: string): Promise<void> {
  const db = await getDb();
  const dataset = await assembleTruthDataset(organizationId);

  const upsert = async (item: {
    dedupeKey: string;
    issueType: IssueType;
    entityType: string;
    entityId: string;
    entityName: string;
    priority: ActionPriority;
    amountAtRiskCents: number | null;
    description: string;
  }): Promise<void> => {
    const existing = await db.query.actionItems.findFirst({
      where: and(
        eq(schema.actionItems.organizationId, organizationId),
        eq(schema.actionItems.dedupeKey, item.dedupeKey)
      ),
    });
    if (existing) return;
    await db.insert(schema.actionItems).values({
      id: newId("act"),
      organizationId,
      ...item,
      source: "truth_engine",
      status: "open",
      createdAt: new Date(),
    });
    void fireAutomations(organizationId, "action_item_created", {
      issue_type: item.issueType,
      entity_name: item.entityName,
      amount_cents: item.amountAtRiskCents ?? 0,
    });
  };

  const buyerTruth = computeTruth(dataset, { scope: "buyer" });
  for (const row of buyerTruth.rows) {
    if ((row.gap.overdue ?? 0) > 0) {
      await upsert({
        dedupeKey: `overdue:${row.key}`,
        issueType: "payment_overdue",
        entityType: "buyer",
        entityId: row.key,
        entityName: row.name,
        priority: (row.gap.overdue ?? 0) > 200000 ? "critical" : "high",
        amountAtRiskCents: row.gap.overdue,
        description: `${row.name} is ${fmtCents(row.gap.overdue)} past payment terms. Chase the balance or pause deliveries before the exposure grows.`,
      });
      void fireAutomations(organizationId, "invoice_overdue", {
        buyer: row.name,
        buyer_id: row.key,
        amount_cents: row.gap.overdue,
        overdue: `$${(((row.gap.overdue ?? 0)) / 100).toFixed(2)}`,
      });
    }
    if (row.gap.payment_status === "no_payment_source" && row.booked.booked_revenue > 0) {
      await upsert({
        dedupeKey: `no_source:${row.key}`,
        issueType: "missing_source",
        entityType: "buyer",
        entityId: row.key,
        entityName: row.name,
        priority: "high",
        amountAtRiskCents: row.booked.booked_revenue,
        description: `No payment source verifies ${row.name}. ${fmtCents(row.booked.booked_revenue)} of booked revenue is At-Risk until Stripe, Mercury, or a manual record covers it.`,
      });
    }
  }

  const campaignTruth = computeTruth(dataset, { scope: "campaign" });
  for (const row of campaignTruth.rows) {
    if (row.profit_truth === "false_profit") {
      await upsert({
        dedupeKey: `false_profit_action:${row.key}`,
        issueType: "revenue_gap",
        entityType: "campaign",
        entityId: row.key,
        entityName: row.name,
        priority: "critical",
        amountAtRiskCents: row.gap.revenue_gap,
        description: `${row.name} shows false profit: ${fmtCents(row.booked.reported_profit)} reported while verified income is ${fmtCents(row.verified.verified_income)} of ${fmtCents(row.booked.booked_revenue)} booked. Do not treat this campaign as profitable until cash lands.`,
      });
    }
    if ((row.gap.spend_gap ?? 0) > 50000) {
      await upsert({
        dedupeKey: `spend_gap:${row.key}:${dataset.today.slice(0, 7)}`,
        issueType: "spend_gap",
        entityType: "campaign",
        entityId: row.key,
        entityName: row.name,
        priority: "medium",
        amountAtRiskCents: row.gap.spend_gap,
        description: `${fmtCents(row.gap.spend_gap)} of tracked ad spend on ${row.name} has no matching bank outflow yet. Match Mercury transactions or the true CPL is understated.`,
      });
    }
  }

  const orgTruth = computeTruth(dataset, { scope: "org" });
  if ((orgTruth.totals.gap.unmatched_in ?? 0) > 0) {
    await upsert({
      dedupeKey: `unmatched_in:${dataset.today.slice(0, 7)}`,
      issueType: "unmatched_income",
      entityType: "org",
      entityId: organizationId,
      entityName: "Unmatched income",
      priority: "high",
      amountAtRiskCents: orgTruth.totals.gap.unmatched_in,
      description: `${fmtCents(orgTruth.totals.gap.unmatched_in)} of incoming payments sit unmatched in the queue. Match them so verified income and buyer balances are accurate.`,
    });
  }

  const supplierTruth = computeTruth(dataset, { scope: "supplier" });
  for (const row of supplierTruth.rows) {
    if ((row.gap.supplier_cost_gap ?? 0) > 25000) {
      await upsert({
        dedupeKey: `supplier_gap:${row.key}`,
        issueType: "supplier_cost_gap",
        entityType: "supplier",
        entityId: row.key,
        entityName: row.name,
        priority: "medium",
        amountAtRiskCents: row.gap.supplier_cost_gap,
        description: `${row.name} has ${fmtCents(row.gap.supplier_cost_gap)} accrued but unpaid. Confirm the payable or the cash forecast is wrong.`,
      });
    }
  }
}

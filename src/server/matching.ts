import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { emitLive } from "@/lib/sse";
import {
  allocateAcrossLeads,
  classifyPayment,
  invoiceStatusAfterPayment,
  AUTO_APPLY_THRESHOLD,
  type MatchSuggestion,
} from "@/domain/matching/engine";
import { buildPeriods, varianceNarrative } from "@/domain/matching/periods";
import { toDateKey, startOfMonthKey, endOfMonthKey } from "@/lib/transforms";
import { invalidateTruthCache } from "./truth-data";
import { fireAutomations } from "./automations";
import { dispatchWebhookEvent } from "./webhooks";

// Matching services: suggestion generation for the queue, match application
// with every downstream effect, and the reconciliation period rebuild.

export async function suggestForUnmatched(organizationId: string): Promise<MatchSuggestion[]> {
  const db = await getDb();
  const [payments, invoices, rules, buyers, suppliers] = await Promise.all([
    db.query.paymentRecords.findMany({
      where: and(
        eq(schema.paymentRecords.organizationId, organizationId),
        eq(schema.paymentRecords.matchStatus, "unmatched")
      ),
    }),
    db.query.invoices.findMany({ where: eq(schema.invoices.organizationId, organizationId) }),
    db.query.matchRules.findMany({
      where: and(eq(schema.matchRules.organizationId, organizationId), eq(schema.matchRules.active, true)),
    }),
    db.query.buyers.findMany({ where: eq(schema.buyers.organizationId, organizationId) }),
    db.query.suppliers.findMany({ where: eq(schema.suppliers.organizationId, organizationId) }),
  ]);

  const counterpartyName = (type: string, id: string): string => {
    if (type === "buyer") return buyers.find((b) => b.id === id)?.name ?? id;
    if (type === "supplier") return suppliers.find((s) => s.id === id)?.name ?? id;
    return id;
  };

  const ctx = {
    invoices: invoices.map((inv) => ({
      id: inv.id,
      direction: inv.direction,
      counterpartyType: inv.counterpartyType,
      counterpartyId: inv.counterpartyId,
      counterpartyName: counterpartyName(inv.counterpartyType, inv.counterpartyId),
      externalRef: inv.externalRef,
      dueDate: inv.dueDate,
      issueDate: inv.issueDate,
      amountCents: inv.amountCents,
      amountPaidCents: inv.amountPaidCents,
      status: inv.status,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
    })),
    rules: rules.map((r) => ({
      id: r.id,
      name: r.name,
      counterpartyPattern: r.counterpartyPattern,
      amountTolerancePct: r.amountTolerancePct,
      dateWindowDays: r.dateWindowDays,
      target: r.target,
      targetId: r.targetId,
    })),
    counterparties: [
      ...buyers.map((b) => ({ id: b.id, type: "buyer" as const, name: b.name })),
      ...suppliers.map((s) => ({ id: s.id, type: "supplier" as const, name: s.name })),
    ],
  };

  const suggestions: MatchSuggestion[] = [];
  for (const payment of payments) {
    const s = classifyPayment(
      {
        id: payment.id,
        externalRef: payment.externalRef,
        date: payment.date,
        amountCents: payment.amountCents,
        direction: payment.direction,
        counterpartyName: payment.counterpartyName,
        memo: payment.memo,
      },
      ctx
    );
    if (s) suggestions.push(s);
  }
  return suggestions;
}

// Apply a match: the one mutation that touches everything downstream.
export async function applyMatch(args: {
  organizationId: string;
  paymentId: string;
  target:
    | { type: "invoice"; invoiceId: string }
    | { type: "buyer" | "supplier"; id: string; periodStart?: string; periodEnd?: string }
    | { type: "ad_platform"; id: string };
  confidence: number;
  manual: boolean;
  splitAmountCents?: number; // partial allocation
}): Promise<{ ok: boolean; message: string }> {
  const db = await getDb();
  const payment = await db.query.paymentRecords.findFirst({
    where: and(
      eq(schema.paymentRecords.id, args.paymentId),
      eq(schema.paymentRecords.organizationId, args.organizationId)
    ),
  });
  if (!payment) return { ok: false, message: "Payment not found" };
  if (payment.matchStatus !== "unmatched" && payment.matchStatus !== "disputed") {
    return { ok: false, message: "Payment already matched" };
  }

  const amount = Math.min(args.splitAmountCents ?? payment.amountCents, payment.amountCents);
  const today = toDateKey(new Date());
  let counterparty: { type: "buyer" | "supplier"; id: string } | null = null;

  if (args.target.type === "invoice") {
    const invoice = await db.query.invoices.findFirst({
      where: and(
        eq(schema.invoices.id, args.target.invoiceId),
        eq(schema.invoices.organizationId, args.organizationId)
      ),
    });
    if (!invoice) return { ok: false, message: "Invoice not found" };
    const next = invoiceStatusAfterPayment(
      invoice.amountCents,
      invoice.amountPaidCents,
      amount,
      invoice.dueDate,
      today
    );
    await db
      .update(schema.invoices)
      .set({ amountPaidCents: next.amountPaidCents, status: next.status })
      .where(eq(schema.invoices.id, invoice.id));
    if (invoice.counterpartyType === "buyer" || invoice.counterpartyType === "supplier") {
      counterparty = { type: invoice.counterpartyType, id: invoice.counterpartyId };
    }
    await db
      .update(schema.paymentRecords)
      .set({
        matchedInvoiceId: invoice.id,
        matchedEntity: {
          type: "invoice",
          id: invoice.id,
          period_start: invoice.periodStart ?? undefined,
          period_end: invoice.periodEnd ?? undefined,
        },
        matchStatus: args.manual ? "manually_matched" : "auto_matched",
        confidence: args.confidence,
      })
      .where(eq(schema.paymentRecords.id, payment.id));
  } else if (args.target.type === "ad_platform") {
    // Mark unpaid spend rows for that platform as paid, oldest first, up to the amount.
    const accounts = await db.query.adAccounts.findMany({
      where: and(
        eq(schema.adAccounts.organizationId, args.organizationId),
        eq(schema.adAccounts.platform, args.target.id as "meta" | "google" | "tiktok")
      ),
    });
    const accountIds = accounts.map((a) => a.id);
    if (accountIds.length > 0) {
      const spendRows = await db
        .select()
        .from(schema.adSpendRecords)
        .where(
          and(
            eq(schema.adSpendRecords.organizationId, args.organizationId),
            inArray(schema.adSpendRecords.adAccountId, accountIds),
            eq(schema.adSpendRecords.paidStatus, "tracked")
          )
        )
        .orderBy(asc(schema.adSpendRecords.date));
      let remaining = amount;
      for (const row of spendRows) {
        if (remaining <= 0) break;
        await db
          .update(schema.adSpendRecords)
          .set({ paidStatus: "paid_verified", matchedPaymentId: payment.id })
          .where(eq(schema.adSpendRecords.id, row.id));
        remaining -= row.spendCents;
      }
    }
    await db
      .update(schema.paymentRecords)
      .set({
        matchedEntity: { type: "ad_platform", id: args.target.id },
        matchStatus: args.manual ? "manually_matched" : "auto_matched",
        confidence: args.confidence,
      })
      .where(eq(schema.paymentRecords.id, payment.id));
  } else {
    counterparty = { type: args.target.type, id: args.target.id };
    await db
      .update(schema.paymentRecords)
      .set({
        matchedEntity: {
          type: args.target.type,
          id: args.target.id,
          period_start: args.target.periodStart,
          period_end: args.target.periodEnd,
        },
        matchStatus: args.manual ? "manually_matched" : "auto_matched",
        confidence: args.confidence,
      })
      .where(eq(schema.paymentRecords.id, payment.id));
  }

  // Allocate across the counterparty's leads (revenue in, supplier cost out).
  if (counterparty) {
    if (counterparty.type === "buyer" && payment.direction === "in") {
      const soldLeads = await db
        .select()
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.organizationId, args.organizationId),
            eq(schema.leads.buyerId, counterparty.id),
            eq(schema.leads.status, "sold"),
            eq(schema.leads.isTest, false)
          )
        )
        .orderBy(asc(schema.leads.soldAt));
      const allocations = allocateAcrossLeads(
        amount,
        soldLeads
          .filter((l) => l.soldAt !== null && (l.salePriceCents ?? 0) > l.paidAllocatedCents)
          .map((l) => ({
            id: l.id,
            salePriceCents: l.salePriceCents ?? 0,
            alreadyAllocatedCents: l.paidAllocatedCents,
            soldAt: l.soldAt as Date,
          }))
      );
      for (const alloc of allocations) {
        const lead = soldLeads.find((l) => l.id === alloc.leadId);
        if (!lead) continue;
        await db
          .update(schema.leads)
          .set({
            paidAllocatedCents: lead.paidAllocatedCents + alloc.allocatedCents,
            reconciliationStatus: alloc.resulting,
            matchedPaymentIds: [...lead.matchedPaymentIds, payment.id],
          })
          .where(eq(schema.leads.id, alloc.leadId));
        await db.insert(schema.leadEvents).values({
          id: newId("lev"),
          organizationId: args.organizationId,
          leadId: alloc.leadId,
          kind: "payment_matched",
          detail: {
            payment_id: payment.id,
            source: payment.source,
            amount_cents: alloc.allocatedCents,
            counterparty: payment.counterpartyName,
          },
          at: new Date(),
        });
      }
    }
    if (counterparty.type === "supplier" && payment.direction === "out") {
      const supplierLeads = await db
        .select()
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.organizationId, args.organizationId),
            eq(schema.leads.supplierId, counterparty.id),
            eq(schema.leads.isTest, false)
          )
        )
        .orderBy(asc(schema.leads.receivedAt));
      const allocatable = supplierLeads
        .filter((l) => (l.supplierCostCents ?? 0) > l.supplierPaidCents)
        .map((l) => ({
          id: l.id,
          salePriceCents: l.supplierCostCents ?? 0,
          alreadyAllocatedCents: l.supplierPaidCents,
          soldAt: l.receivedAt,
        }));
      const allocations = allocateAcrossLeads(amount, allocatable);
      for (const alloc of allocations) {
        const lead = supplierLeads.find((l) => l.id === alloc.leadId);
        if (!lead) continue;
        await db
          .update(schema.leads)
          .set({ supplierPaidCents: lead.supplierPaidCents + alloc.allocatedCents })
          .where(eq(schema.leads.id, alloc.leadId));
        await db.insert(schema.leadEvents).values({
          id: newId("lev"),
          organizationId: args.organizationId,
          leadId: alloc.leadId,
          kind: "supplier_payment_matched",
          detail: { payment_id: payment.id, amount_cents: alloc.allocatedCents },
          at: new Date(),
        });
      }
    }
  }

  // Close related action items.
  if (counterparty) {
    const openItems = await db.query.actionItems.findMany({
      where: and(
        eq(schema.actionItems.organizationId, args.organizationId),
        eq(schema.actionItems.entityId, counterparty.id),
        eq(schema.actionItems.status, "open")
      ),
    });
    for (const item of openItems) {
      if (["unmatched_income", "revenue_gap", "payment_overdue"].includes(item.issueType)) {
        await db
          .update(schema.actionItems)
          .set({
            status: "resolved",
            resolvedAt: new Date(),
            resolutionNote: `Auto-resolved: payment ${payment.externalRef ?? payment.id} matched for $${(amount / 100).toFixed(2)}`,
          })
          .where(eq(schema.actionItems.id, item.id));
        emitLive({
          organizationId: args.organizationId,
          kind: "action_resolved",
          title: `Action item resolved: ${item.entityName}`,
          amountCents: item.amountAtRiskCents,
        });
      }
    }
  }

  await rebuildPeriods(args.organizationId);
  invalidateTruthCache(args.organizationId);

  emitLive({
    organizationId: args.organizationId,
    kind: "payment_matched",
    title: `Payment matched: ${payment.counterpartyName}`,
    amountCents: amount,
    link: "/reconciliation?tab=queue",
  });
  void fireAutomations(args.organizationId, "payment_received", {
    payment_id: payment.id,
    amount_cents: amount,
    counterparty: payment.counterpartyName,
    direction: payment.direction,
  });
  void dispatchWebhookEvent(args.organizationId, "payment.received", {
    payment_id: payment.id,
    amount_cents: amount,
    counterparty: payment.counterpartyName,
  });

  return { ok: true, message: "Match applied" };
}

export async function disputeMatch(organizationId: string, paymentId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.paymentRecords)
    .set({ matchStatus: "disputed" })
    .where(
      and(eq(schema.paymentRecords.id, paymentId), eq(schema.paymentRecords.organizationId, organizationId))
    );
  invalidateTruthCache(organizationId);
}

// Rebuild reconciliation periods for every buyer and supplier, both granularities.
export async function rebuildPeriods(organizationId: string): Promise<void> {
  const db = await getDb();
  const [org, buyers, suppliers, leads, invoices, payments] = await Promise.all([
    db.query.organizations.findFirst({ where: eq(schema.organizations.id, organizationId) }),
    db.query.buyers.findMany({ where: eq(schema.buyers.organizationId, organizationId) }),
    db.query.suppliers.findMany({ where: eq(schema.suppliers.organizationId, organizationId) }),
    db.query.leads.findMany({
      where: and(eq(schema.leads.organizationId, organizationId), eq(schema.leads.isTest, false)),
    }),
    db.query.invoices.findMany({ where: eq(schema.invoices.organizationId, organizationId) }),
    db.query.paymentRecords.findMany({ where: eq(schema.paymentRecords.organizationId, organizationId) }),
  ]);

  const variance = {
    pctThreshold: org?.varianceThresholdPct ?? 2,
    centsThreshold: org?.varianceThresholdCents ?? 25000,
  };
  const today = toDateKey(new Date());

  const buyerLeads = leads
    .filter((l) => (l.status === "sold" || l.status === "returned") && l.buyerId && l.soldAt)
    .map((l) => ({
      id: l.id,
      counterpartyId: l.buyerId as string,
      amountCents: l.salePriceCents ?? 0,
      date: toDateKey(l.soldAt as Date),
      returned: l.status === "returned",
      isTest: l.isTest,
    }));

  const supplierLeads = leads
    .filter((l) => (l.supplierCostCents ?? 0) > 0 && !["duplicate", "error"].includes(l.status))
    .map((l) => ({
      id: l.id,
      counterpartyId: l.supplierId,
      amountCents: l.supplierCostCents ?? 0,
      date: toDateKey(l.receivedAt),
      returned: false,
      isTest: l.isTest,
    }));

  // Payments bucket to the period they COVER (matched entity period or the
  // invoice's period), falling back to the bank date. A July payment for the
  // June invoice belongs to June.
  const paymentsFor = (type: "buyer" | "supplier") =>
    payments
      .filter(
        (p) =>
          p.matchStatus !== "unmatched" &&
          p.matchStatus !== "disputed" &&
          ((p.matchedEntity?.type === type && p.matchedEntity.id) ||
            (p.matchedEntity?.type === "invoice" &&
              invoices.find((i) => i.id === p.matchedInvoiceId)?.counterpartyType === type))
      )
      .map((p) => {
        const invoice = p.matchedInvoiceId ? invoices.find((i) => i.id === p.matchedInvoiceId) : undefined;
        const cpId =
          p.matchedEntity?.type === type ? p.matchedEntity.id : invoice?.counterpartyId ?? "";
        const coveredDate = p.matchedEntity?.period_start ?? invoice?.periodStart ?? p.date;
        return { counterpartyId: cpId, amountCents: p.amountCents, date: coveredDate };
      })
      .filter((p) => p.counterpartyId !== "");

  const invoicesFor = (type: "buyer" | "supplier") =>
    invoices
      .filter((i) => i.counterpartyType === type)
      .map((i) => ({
        counterpartyId: i.counterpartyId,
        amountCents: i.amountCents,
        periodStart: i.periodStart,
        periodEnd: i.periodEnd,
        issueDate: i.issueDate,
      }));

  const allBuilt: Array<{
    counterpartyType: "buyer" | "supplier";
    period: ReturnType<typeof buildPeriods>[number];
  }> = [];

  for (const granularity of ["week", "month"] as const) {
    for (const built of buildPeriods({
      leads: buyerLeads, invoices: invoicesFor("buyer"), payments: paymentsFor("buyer"),
      granularity, variance, today,
    })) {
      allBuilt.push({ counterpartyType: "buyer", period: built });
    }
    for (const built of buildPeriods({
      leads: supplierLeads, invoices: invoicesFor("supplier"), payments: paymentsFor("supplier"),
      granularity, variance, today,
    })) {
      allBuilt.push({ counterpartyType: "supplier", period: built });
    }
  }

  // Preserve resolved status on periods a human already handled.
  const existing = await db.query.reconciliationPeriods.findMany({
    where: eq(schema.reconciliationPeriods.organizationId, organizationId),
  });
  const resolvedKeys = new Set(
    existing
      .filter((p) => p.status === "resolved")
      .map((p) => `${p.counterpartyType}|${p.counterpartyId}|${p.granularity}|${p.periodStart}`)
  );

  await db
    .delete(schema.reconciliationPeriods)
    .where(eq(schema.reconciliationPeriods.organizationId, organizationId));

  for (const { counterpartyType, period } of allBuilt) {
    const key = `${counterpartyType}|${period.counterpartyId}|${period.granularity}|${period.periodStart}`;
    const status = resolvedKeys.has(key) ? "resolved" : period.status;
    await db.insert(schema.reconciliationPeriods).values({
      id: newId("rp"),
      organizationId,
      counterpartyType,
      counterpartyId: period.counterpartyId,
      granularity: period.granularity,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      expectedCents: period.expectedCents,
      invoicedCents: period.invoicedCents,
      paidCents: period.paidCents,
      varianceCents: period.varianceCents,
      status,
    });

    // Variance flags become action items + automation triggers (monthly only to avoid noise).
    if (status === "variance_flagged" && period.granularity === "month" && period.paidCents > 0) {
      const nameRow =
        counterpartyType === "buyer"
          ? buyers.find((b) => b.id === period.counterpartyId)
          : suppliers.find((s) => s.id === period.counterpartyId);
      const name = nameRow?.name ?? period.counterpartyId;
      const narrative = varianceNarrative({
        counterpartyName: name,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        varianceCents: period.varianceCents,
        expectedCents: period.expectedCents,
        leadCount: period.leadCount,
      });
      const dedupeKey = `short_paid:${key}`;
      const already = await db.query.actionItems.findFirst({
        where: and(
          eq(schema.actionItems.organizationId, organizationId),
          eq(schema.actionItems.dedupeKey, dedupeKey)
        ),
      });
      if (!already) {
        await db.insert(schema.actionItems).values({
          id: newId("act"),
          organizationId,
          issueType: "short_paid",
          entityType: counterpartyType,
          entityId: period.counterpartyId,
          entityName: name,
          priority: "critical",
          amountAtRiskCents: Math.abs(period.varianceCents),
          description: narrative,
          source: "matching",
          status: "open",
          dedupeKey,
          createdAt: new Date(),
        });
        void fireAutomations(organizationId, "variance_flagged", {
          counterparty: name,
          period: `${period.periodStart} to ${period.periodEnd}`,
          variance_cents: period.varianceCents,
          amount: `$${(Math.abs(period.varianceCents) / 100).toFixed(2)}`,
        });
        void dispatchWebhookEvent(organizationId, "variance.flagged", {
          counterparty: name,
          period_start: period.periodStart,
          variance_cents: period.varianceCents,
        });
      }
    }
  }
}

// Auto-match sweep: classify unmatched payments, apply anything >= threshold.
export async function runAutoMatch(organizationId: string): Promise<{ applied: number; suggested: number }> {
  const suggestions = await suggestForUnmatched(organizationId);
  let applied = 0;
  for (const s of suggestions) {
    if (s.confidence >= AUTO_APPLY_THRESHOLD) {
      const target =
        s.target.type === "invoice"
          ? ({ type: "invoice", invoiceId: s.target.invoiceId } as const)
          : s.target.type === "ad_platform"
            ? ({ type: "ad_platform", id: s.target.id } as const)
            : ({ type: s.target.type, id: s.target.id } as const);
      const result = await applyMatch({
        organizationId,
        paymentId: s.paymentId,
        target,
        confidence: s.confidence,
        manual: false,
      });
      if (result.ok) applied++;
    }
  }
  return { applied, suggested: suggestions.length - applied };
}

// Monthly period helper for invoice creation UIs.
export function monthPeriodFor(date: string): { start: string; end: string } {
  return { start: startOfMonthKey(date), end: endOfMonthKey(date) };
}

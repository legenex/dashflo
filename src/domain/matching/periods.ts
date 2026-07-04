import { startOfMonthKey, endOfMonthKey, startOfWeekKey, addDays, toDateKey } from "@/lib/transforms";

// Reconciliation period builder. Rolls sold leads (or accrued supplier cost)
// into weekly and monthly expectations per counterparty, overlays invoiced and
// paid, and flags variances beyond the org threshold.

export interface PeriodLead {
  id: string;
  counterpartyId: string; // buyerId or supplierId
  amountCents: number; // sale price for buyers, supplier cost for suppliers
  date: string; // sold date (buyers) or received date (suppliers), YYYY-MM-DD
  returned: boolean;
  isTest: boolean;
}

export interface PeriodInvoice {
  counterpartyId: string;
  amountCents: number;
  periodStart: string | null;
  periodEnd: string | null;
  issueDate: string;
}

export interface PeriodPayment {
  counterpartyId: string;
  amountCents: number;
  date: string;
}

export interface VarianceConfig {
  pctThreshold: number; // e.g. 2 means 2 percent
  centsThreshold: number; // e.g. 25000 means $250
}

export interface BuiltPeriod {
  counterpartyId: string;
  granularity: "week" | "month";
  periodStart: string;
  periodEnd: string;
  expectedCents: number;
  invoicedCents: number;
  paidCents: number;
  varianceCents: number;
  status: "open" | "matched" | "variance_flagged";
  leadCount: number;
}

function periodKeyFor(date: string, granularity: "week" | "month"): { start: string; end: string } {
  if (granularity === "month") {
    return { start: startOfMonthKey(date), end: endOfMonthKey(date) };
  }
  const start = startOfWeekKey(date);
  const end = toDateKey(addDays(new Date(`${start}T00:00:00Z`), 6));
  return { start, end };
}

export function buildPeriods(args: {
  leads: PeriodLead[];
  invoices: PeriodInvoice[];
  payments: PeriodPayment[];
  granularity: "week" | "month";
  variance: VarianceConfig;
  today: string; // only flag variance for completed periods
}): BuiltPeriod[] {
  const map = new Map<string, BuiltPeriod>();

  const ensure = (counterpartyId: string, date: string): BuiltPeriod => {
    const { start, end } = periodKeyFor(date, args.granularity);
    const key = `${counterpartyId}|${start}`;
    let p = map.get(key);
    if (!p) {
      p = {
        counterpartyId,
        granularity: args.granularity,
        periodStart: start,
        periodEnd: end,
        expectedCents: 0,
        invoicedCents: 0,
        paidCents: 0,
        varianceCents: 0,
        status: "open",
        leadCount: 0,
      };
      map.set(key, p);
    }
    return p;
  };

  for (const lead of args.leads) {
    if (lead.isTest) continue;
    const p = ensure(lead.counterpartyId, lead.date);
    if (!lead.returned) {
      p.expectedCents += lead.amountCents;
      p.leadCount += 1;
    }
  }

  for (const inv of args.invoices) {
    const anchor = inv.periodStart ?? inv.issueDate;
    const p = ensure(inv.counterpartyId, anchor);
    p.invoicedCents += inv.amountCents;
  }

  for (const pay of args.payments) {
    const p = ensure(pay.counterpartyId, pay.date);
    p.paidCents += pay.amountCents;
  }

  const out = [...map.values()];
  for (const p of out) {
    p.varianceCents = p.expectedCents - p.paidCents;
    const threshold = Math.max(
      Math.round((args.variance.pctThreshold / 100) * p.expectedCents),
      args.variance.centsThreshold
    );
    const completed = p.periodEnd < args.today;
    if (p.expectedCents > 0 && p.paidCents >= p.expectedCents - Math.round(p.expectedCents * 0.005)) {
      p.status = "matched";
    } else if (completed && Math.abs(p.varianceCents) > threshold) {
      p.status = "variance_flagged";
    } else {
      p.status = "open";
    }
  }

  return out.sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));
}

// Plain language variance narrative used by ActionItems and AiInsights.
export function varianceNarrative(args: {
  counterpartyName: string;
  periodStart: string;
  periodEnd: string;
  varianceCents: number;
  expectedCents: number;
  leadCount: number;
}): string {
  const dollars = (Math.abs(args.varianceCents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
  });
  const avg = args.leadCount > 0 ? args.expectedCents / args.leadCount : 0;
  const approxLeads = avg > 0 ? Math.max(1, Math.round(Math.abs(args.varianceCents) / avg)) : 0;
  const direction = args.varianceCents > 0 ? "underpaid" : "overpaid";
  const leadNote =
    approxLeads > 0 && args.varianceCents > 0
      ? ` That is roughly ${approxLeads} lead${approxLeads === 1 ? "" : "s"} at the period average price.`
      : "";
  return `${args.counterpartyName} ${direction} the period ${args.periodStart} to ${args.periodEnd} by $${dollars}.${leadNote}`;
}

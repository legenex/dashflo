// Payment matching engine. Pure functions: classification produces suggestions
// with confidence, application planning produces the downstream mutations the
// server layer persists.

export interface MatchableInvoice {
  id: string;
  direction: "receivable" | "payable";
  counterpartyType: "buyer" | "supplier" | "vendor";
  counterpartyId: string;
  counterpartyName: string;
  externalRef: string | null;
  dueDate: string;
  issueDate: string;
  amountCents: number;
  amountPaidCents: number;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface MatchablePayment {
  id: string;
  externalRef: string | null;
  date: string;
  amountCents: number;
  direction: "in" | "out";
  counterpartyName: string;
  memo: string | null;
}

export interface MatchRuleDef {
  id: string;
  name: string;
  counterpartyPattern: string;
  amountTolerancePct: number;
  dateWindowDays: number;
  target: "buyer" | "supplier" | "ad_platform";
  targetId: string | null;
}

export interface MatchSuggestion {
  paymentId: string;
  confidence: number; // 0-100
  tier: "external_ref" | "amount_date" | "rule" | "fuzzy";
  target:
    | { type: "invoice"; invoiceId: string; counterpartyType: string; counterpartyId: string }
    | { type: "buyer" | "supplier" | "ad_platform"; id: string };
  reason: string;
  ruleId?: string;
}

function daysApart(a: string, b: string): number {
  return Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000;
}

function withinPct(a: number, b: number, pct: number): boolean {
  if (b === 0) return a === 0;
  return Math.abs(a - b) / Math.abs(b) <= pct / 100;
}

export function normalizeTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !["llc", "inc", "the", "ltd", "corp", "company"].includes(t));
}

export function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalizeTokens(a));
  const tb = new Set(normalizeTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits++;
  return hits / Math.min(ta.size, tb.size);
}

export interface CounterpartyRef {
  id: string;
  type: "buyer" | "supplier";
  name: string;
}

// Classify one payment against open invoices, rules, and counterparties.
// Returns the best suggestion or null when nothing plausible exists.
export function classifyPayment(
  payment: MatchablePayment,
  ctx: {
    invoices: MatchableInvoice[];
    rules: MatchRuleDef[];
    counterparties: CounterpartyRef[];
  }
): MatchSuggestion | null {
  const openInvoices = ctx.invoices.filter(
    (inv) =>
      inv.status !== "paid" &&
      inv.status !== "void" &&
      (payment.direction === "in" ? inv.direction === "receivable" : inv.direction === "payable")
  );

  // Tier 1: external ref exact match, confidence 100.
  if (payment.externalRef) {
    const hit = openInvoices.find(
      (inv) => inv.externalRef !== null && inv.externalRef === payment.externalRef
    );
    if (hit) {
      return {
        paymentId: payment.id,
        confidence: 100,
        tier: "external_ref",
        target: {
          type: "invoice",
          invoiceId: hit.id,
          counterpartyType: hit.counterpartyType,
          counterpartyId: hit.counterpartyId,
        },
        reason: `External reference ${payment.externalRef} matches invoice exactly`,
      };
    }
  }

  // Tier 2: amount within 1 percent AND date within 7 days of the due date,
  // same counterparty name overlap. Confidence starts at 85 and decays one
  // point per day of date distance beyond 2 days (floor 76, still auto-apply).
  for (const inv of openInvoices) {
    const remaining = inv.amountCents - inv.amountPaidCents;
    const nameMatches = tokenOverlap(payment.counterpartyName, inv.counterpartyName) >= 0.5;
    const distance = daysApart(payment.date, inv.dueDate);
    if (nameMatches && withinPct(payment.amountCents, remaining, 1) && distance <= 7) {
      return {
        paymentId: payment.id,
        confidence: Math.max(76, 85 - Math.max(0, Math.round(distance) - 2)),
        tier: "amount_date",
        target: {
          type: "invoice",
          invoiceId: inv.id,
          counterpartyType: inv.counterpartyType,
          counterpartyId: inv.counterpartyId,
        },
        reason: `Amount within 1% of invoice balance and dated within 7 days of due date`,
      };
    }
  }

  // Tier 3: match rules (regex on counterparty or memo), confidence 75.
  for (const rule of ctx.rules) {
    let re: RegExp;
    try {
      re = new RegExp(rule.counterpartyPattern, "i");
    } catch {
      continue;
    }
    const haystack = `${payment.counterpartyName} ${payment.memo ?? ""}`;
    if (!re.test(haystack)) continue;
    if (!rule.targetId) continue;
    return {
      paymentId: payment.id,
      confidence: 75,
      tier: "rule",
      target: { type: rule.target, id: rule.targetId },
      reason: `Matched rule "${rule.name}" on counterparty pattern`,
      ruleId: rule.id,
    };
  }

  // Tier 4: fuzzy counterparty with plausible amount, suggestion only, confidence 55.
  // Payments toward an open invoice balance within 40 percent count as plausible.
  let best: { suggestion: MatchSuggestion; score: number } | null = null;
  for (const inv of openInvoices) {
    const overlap = tokenOverlap(payment.counterpartyName, inv.counterpartyName);
    if (overlap < 0.5) continue;
    const remaining = inv.amountCents - inv.amountPaidCents;
    if (remaining <= 0) continue;
    const plausible = payment.amountCents <= remaining * 1.05 && payment.amountCents >= remaining * 0.3;
    if (!plausible) continue;
    const closeness = 1 - Math.min(1, Math.abs(payment.amountCents - remaining) / remaining);
    const score = overlap + closeness;
    if (!best || score > best.score) {
      best = {
        score,
        suggestion: {
          paymentId: payment.id,
          confidence: 55,
          tier: "fuzzy",
          target: {
            type: "invoice",
            invoiceId: inv.id,
            counterpartyType: inv.counterpartyType,
            counterpartyId: inv.counterpartyId,
          },
          reason: `Counterparty name similar to ${inv.counterpartyName} with a plausible amount`,
        },
      };
    }
  }
  if (best) return best.suggestion;

  // Fuzzy against bare counterparties (no invoice) for suggestion queue visibility.
  for (const cp of ctx.counterparties) {
    if (tokenOverlap(payment.counterpartyName, cp.name) >= 0.6) {
      return {
        paymentId: payment.id,
        confidence: 55,
        tier: "fuzzy",
        target: { type: cp.type, id: cp.id },
        reason: `Counterparty name similar to ${cp.name}`,
      };
    }
  }

  return null;
}

export const AUTO_APPLY_THRESHOLD = 75;

// Allocation: spread a payment across sold leads oldest first.
export interface AllocatableLead {
  id: string;
  salePriceCents: number;
  alreadyAllocatedCents: number;
  soldAt: Date;
}

export interface LeadAllocation {
  leadId: string;
  allocatedCents: number;
  resulting: "matched" | "partial";
}

export function allocateAcrossLeads(amountCents: number, leadsInput: AllocatableLead[]): LeadAllocation[] {
  const sorted = [...leadsInput].sort((a, b) => a.soldAt.getTime() - b.soldAt.getTime());
  const allocations: LeadAllocation[] = [];
  let remaining = amountCents;
  for (const lead of sorted) {
    if (remaining <= 0) break;
    const need = lead.salePriceCents - lead.alreadyAllocatedCents;
    if (need <= 0) continue;
    const take = Math.min(need, remaining);
    remaining -= take;
    allocations.push({
      leadId: lead.id,
      allocatedCents: take,
      resulting: take + lead.alreadyAllocatedCents >= lead.salePriceCents ? "matched" : "partial",
    });
  }
  return allocations;
}

// Invoice status transition after applying a payment amount.
export function invoiceStatusAfterPayment(
  amountCents: number,
  amountPaidCents: number,
  addCents: number,
  dueDate: string,
  today: string
): { amountPaidCents: number; status: "sent" | "partial" | "paid" | "overdue" } {
  const paid = amountPaidCents + addCents;
  if (paid >= amountCents) return { amountPaidCents: paid, status: "paid" };
  if (paid > 0) return { amountPaidCents: paid, status: "partial" };
  return { amountPaidCents: paid, status: dueDate < today ? "overdue" : "sent" };
}

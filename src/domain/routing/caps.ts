import type { BuyerCaps, CapWindows } from "@/db/schema";

// Cap accounting. Usage is computed from persisted leads plus in-flight
// reservations. reserve() is synchronous within the process, which makes the
// check-and-reserve atomic per node process (PGlite runs single-process).

export interface CapUsage {
  leads: { daily: number; weekly: number; monthly: number; total: number };
  budget_cents: { daily: number; weekly: number; monthly: number; total: number };
}

export interface CapCheck {
  available: boolean;
  blockedBy?: string; // e.g. "leads.daily", "budget_cents.monthly"
}

function windowExceeded(
  limits: CapWindows | undefined,
  usage: { daily: number; weekly: number; monthly: number; total: number },
  addend: number
): string | null {
  if (!limits) return null;
  const checks: Array<[keyof CapWindows, number]> = [
    ["daily", usage.daily],
    ["weekly", usage.weekly],
    ["monthly", usage.monthly],
    ["total", usage.total],
  ];
  for (const [window, used] of checks) {
    const limit = limits[window];
    if (limit !== undefined && limit !== null && used + addend > limit) {
      return window;
    }
  }
  return null;
}

export function checkCaps(caps: BuyerCaps, usage: CapUsage, priceCents: number): CapCheck {
  const leadBlock = windowExceeded(caps.leads, usage.leads, 1);
  if (leadBlock) return { available: false, blockedBy: `leads.${leadBlock}` };
  const budgetBlock = windowExceeded(caps.budget_cents, usage.budget_cents, priceCents);
  if (budgetBlock) return { available: false, blockedBy: `budget_cents.${budgetBlock}` };
  return { available: true };
}

// In-memory reservation ledger keyed by buyer id. Reservations are released
// after the delivery attempt settles (success converts to persisted usage).
export interface Reservation {
  buyerId: string;
  leads: number;
  budgetCents: number;
}

export class CapLedger {
  private reservations = new Map<string, { leads: number; budgetCents: number }>();

  pendingFor(buyerId: string): { leads: number; budgetCents: number } {
    return this.reservations.get(buyerId) ?? { leads: 0, budgetCents: 0 };
  }

  // Atomic check-and-reserve: usage must already include persisted counts.
  tryReserve(buyerId: string, caps: BuyerCaps, persisted: CapUsage, priceCents: number): CapCheck {
    const pending = this.pendingFor(buyerId);
    const usage: CapUsage = {
      leads: {
        daily: persisted.leads.daily + pending.leads,
        weekly: persisted.leads.weekly + pending.leads,
        monthly: persisted.leads.monthly + pending.leads,
        total: persisted.leads.total + pending.leads,
      },
      budget_cents: {
        daily: persisted.budget_cents.daily + pending.budgetCents,
        weekly: persisted.budget_cents.weekly + pending.budgetCents,
        monthly: persisted.budget_cents.monthly + pending.budgetCents,
        total: persisted.budget_cents.total + pending.budgetCents,
      },
    };
    const check = checkCaps(caps, usage, priceCents);
    if (!check.available) return check;
    this.reservations.set(buyerId, {
      leads: pending.leads + 1,
      budgetCents: pending.budgetCents + priceCents,
    });
    return { available: true };
  }

  release(buyerId: string, priceCents: number): void {
    const pending = this.pendingFor(buyerId);
    this.reservations.set(buyerId, {
      leads: Math.max(0, pending.leads - 1),
      budgetCents: Math.max(0, pending.budgetCents - priceCents),
    });
  }
}

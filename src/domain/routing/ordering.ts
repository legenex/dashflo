// Buyer ordering per distribution method. Deterministic given an injected rng.

export interface OrderableBuyer {
  buyerId: string;
  priority: number; // lower routes first
  weight: number;
}

export function orderByPriority<T extends OrderableBuyer>(buyers: T[]): T[] {
  return [...buyers].sort((a, b) => a.priority - b.priority || a.buyerId.localeCompare(b.buyerId));
}

// Weighted random without replacement: repeatedly draw proportionally to weight.
export function orderByWeight<T extends OrderableBuyer>(buyers: T[], rng: () => number): T[] {
  const pool = [...buyers];
  const out: T[] = [];
  while (pool.length > 0) {
    const totalWeight = pool.reduce((s, b) => s + Math.max(1, b.weight), 0);
    let pick = rng() * totalWeight;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      pick -= Math.max(1, pool[i].weight);
      if (pick <= 0) {
        idx = i;
        break;
      }
    }
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

// Round robin: rotate the priority ordering so the buyer after lastBuyerId goes first.
export function orderRoundRobin<T extends OrderableBuyer>(buyers: T[], lastBuyerId: string | null): T[] {
  const sorted = orderByPriority(buyers);
  if (!lastBuyerId) return sorted;
  const lastIdx = sorted.findIndex((b) => b.buyerId === lastBuyerId);
  if (lastIdx < 0) return sorted;
  return [...sorted.slice(lastIdx + 1), ...sorted.slice(0, lastIdx + 1)];
}

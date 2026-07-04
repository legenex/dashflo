// Duplicate detection: same normalized phone OR email inside the campaign
// window. The candidate list is fetched by the caller, decision logic is pure.

export interface DedupeCandidate {
  id: string;
  normalizedPhone: string | null;
  normalizedEmail: string | null;
  receivedAt: Date;
}

export function findDuplicate(
  candidates: DedupeCandidate[],
  input: { normalizedPhone: string | null; normalizedEmail: string | null; now: Date; windowDays: number }
): DedupeCandidate | null {
  const cutoff = input.now.getTime() - input.windowDays * 86400000;
  for (const c of candidates) {
    if (c.receivedAt.getTime() < cutoff) continue;
    const phoneHit =
      input.normalizedPhone !== null && c.normalizedPhone !== null && c.normalizedPhone === input.normalizedPhone;
    const emailHit =
      input.normalizedEmail !== null && c.normalizedEmail !== null && c.normalizedEmail === input.normalizedEmail;
    if (phoneHit || emailHit) return c;
  }
  return null;
}

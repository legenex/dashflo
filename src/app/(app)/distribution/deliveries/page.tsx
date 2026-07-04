import { desc, eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { DeliveriesClient } from "./DeliveriesClient";

export const dynamic = "force-dynamic";

export default async function DeliveriesPage() {
  const ctx = await requireOrg();
  const [attempts, buyers, leads] = await Promise.all([
    ctx.db
      .select()
      .from(schema.distributionAttempts)
      .where(eq(schema.distributionAttempts.organizationId, ctx.organizationId))
      .orderBy(desc(schema.distributionAttempts.at))
      .limit(500),
    ctx.db.query.buyers.findMany({ where: eq(schema.buyers.organizationId, ctx.organizationId) }),
    ctx.db.query.campaigns.findMany({ where: eq(schema.campaigns.organizationId, ctx.organizationId) }),
  ]);

  const buyerName = new Map(buyers.map((b) => [b.id, b.name]));

  const durations = attempts.map((a) => a.durationMs).sort((a, b) => a - b);
  const pct = (p: number) => (durations.length > 0 ? durations[Math.min(durations.length - 1, Math.floor((p / 100) * durations.length))] : 0);

  return (
    <DeliveriesClient
      attempts={attempts.map((a) => ({
        id: a.id, leadId: a.leadId, buyer: buyerName.get(a.buyerId) ?? a.buyerId,
        type: a.attemptType, outcome: a.outcome, code: a.responseCode,
        bidCents: a.bidCents, durationMs: a.durationMs, at: a.at.toISOString(),
        request: a.requestPayload, response: a.responsePayload,
      }))}
      stats={{
        total: attempts.length,
        accepted: attempts.filter((a) => a.outcome === "accepted").length,
        p50: pct(50), p90: pct(90), p99: pct(99),
      }}
      campaignsCount={leads.length}
    />
  );
}

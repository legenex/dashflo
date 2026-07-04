import { desc, eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { AutomationsClient } from "./AutomationsClient";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const ctx = await requireOrg();
  const [automations, runs, buyers, campaigns] = await Promise.all([
    ctx.db.query.automations.findMany({ where: eq(schema.automations.organizationId, ctx.organizationId) }),
    ctx.db
      .select()
      .from(schema.automationRuns)
      .where(eq(schema.automationRuns.organizationId, ctx.organizationId))
      .orderBy(desc(schema.automationRuns.at))
      .limit(100),
    ctx.db.query.buyers.findMany({ where: eq(schema.buyers.organizationId, ctx.organizationId) }),
    ctx.db.query.campaigns.findMany({ where: eq(schema.campaigns.organizationId, ctx.organizationId) }),
  ]);

  const nameById = new Map(automations.map((a) => [a.id, a.name]));

  return (
    <AutomationsClient
      automations={automations.map((a) => ({
        id: a.id, name: a.name, trigger: a.trigger, conditions: a.conditions,
        actions: a.actions, status: a.status, lastRunAt: a.lastRunAt?.toISOString() ?? null,
      }))}
      runs={runs.map((r) => ({
        id: r.id, automation: nameById.get(r.automationId) ?? r.automationId,
        triggerPayload: r.triggerPayload, results: r.results, status: r.status,
        durationMs: r.durationMs, at: r.at.toISOString(),
      }))}
      buyers={buyers.map((b) => ({ id: b.id, name: b.name }))}
      campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}

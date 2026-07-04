import { and, eq, gte } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { startOfMonthKey, toDateKey } from "@/lib/transforms";
import { BillingClient } from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const ctx = await requireOrg();
  const monthStart = new Date(`${startOfMonthKey(toDateKey(new Date()))}T00:00:00Z`);
  const [leadsThisMonth, members, adAccounts, threads] = await Promise.all([
    ctx.db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(and(eq(schema.leads.organizationId, ctx.organizationId), gte(schema.leads.receivedAt, monthStart))),
    ctx.db.query.memberships.findMany({ where: eq(schema.memberships.organizationId, ctx.organizationId) }),
    ctx.db.query.adAccounts.findMany({ where: eq(schema.adAccounts.organizationId, ctx.organizationId) }),
    ctx.db.query.aiChatThreads.findMany({ where: eq(schema.aiChatThreads.organizationId, ctx.organizationId) }),
  ]);

  const aiMessages = threads.reduce((s, t) => s + t.messages.length, 0);

  return (
    <BillingClient
      tier={ctx.organization.planTier}
      limits={ctx.organization.planLimits}
      usage={{
        leads: leadsThisMonth.length,
        users: members.length,
        adAccounts: adAccounts.length,
        aiMessages,
      }}
    />
  );
}

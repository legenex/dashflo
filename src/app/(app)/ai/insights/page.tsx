import { desc, eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { InsightsClient } from "./InsightsClient";

export const dynamic = "force-dynamic";

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requireOrg();
  const [insights, actions, members] = await Promise.all([
    ctx.db
      .select()
      .from(schema.aiInsights)
      .where(eq(schema.aiInsights.organizationId, ctx.organizationId))
      .orderBy(desc(schema.aiInsights.createdAt)),
    ctx.db
      .select()
      .from(schema.actionItems)
      .where(eq(schema.actionItems.organizationId, ctx.organizationId))
      .orderBy(desc(schema.actionItems.amountAtRiskCents)),
    ctx.db
      .select({ userId: schema.memberships.userId, name: schema.users.name })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.organizationId, ctx.organizationId)),
  ]);

  return (
    <InsightsClient
      initialTab={params.tab ?? "insights"}
      insights={insights.map((i) => ({
        id: i.id, type: i.type, severity: i.severity, title: i.title, body: i.body,
        related: i.related, metricSnapshot: i.metricSnapshot, status: i.status,
        createdAt: i.createdAt.toISOString(),
      }))}
      actions={actions.map((a) => ({
        id: a.id, issueType: a.issueType, entityType: a.entityType, entityName: a.entityName,
        priority: a.priority, amountAtRiskCents: a.amountAtRiskCents, description: a.description,
        source: a.source, status: a.status, ownerUserId: a.ownerUserId, dueDate: a.dueDate,
        createdAt: a.createdAt.toISOString(), resolutionNote: a.resolutionNote,
      }))}
      members={members}
    />
  );
}

import { eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { ScheduledClient } from "./ScheduledClient";

export const dynamic = "force-dynamic";

export default async function ScheduledReportsPage() {
  const ctx = await requireOrg();
  const reports = await ctx.db.query.savedReports.findMany({
    where: eq(schema.savedReports.organizationId, ctx.organizationId),
  });
  return (
    <ScheduledClient
      briefs={reports
        .filter((r) => r.kind === "brief")
        .map((r) => ({
          id: r.id, name: r.name, schedule: r.schedule,
          lastRenderedAt: r.lastRenderedAt?.toISOString() ?? null,
          lastRenderedBody: r.lastRenderedBody,
        }))}
      custom={reports
        .filter((r) => r.kind === "custom")
        .map((r) => ({ id: r.id, name: r.name, schedule: r.schedule }))}
      aiConfigured={Boolean(process.env.ANTHROPIC_API_KEY)}
    />
  );
}

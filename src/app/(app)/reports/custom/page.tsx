import { and, eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { CustomReportClient } from "./CustomReportClient";

export const dynamic = "force-dynamic";

export default async function CustomReportPage() {
  const ctx = await requireOrg();
  const saved = await ctx.db.query.savedReports.findMany({
    where: and(eq(schema.savedReports.organizationId, ctx.organizationId), eq(schema.savedReports.kind, "custom")),
  });
  return (
    <CustomReportClient
      saved={saved.map((s) => ({ id: s.id, name: s.name, config: s.config }))}
    />
  );
}

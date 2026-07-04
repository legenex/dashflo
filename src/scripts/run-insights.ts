import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { runInsightGeneration } from "@/server/insights";

// Run the insight generator once for every active org. Note: while `pnpm dev`
// holds the PGlite lock, use the in-app runner instead (AI Analyst > Insights
// > Run now), which shares the server process.
async function main(): Promise<void> {
  const db = await getDb();
  const orgs = await db.query.organizations.findMany({
    where: eq(schema.organizations.status, "active"),
  });
  for (const org of orgs) {
    const result = await runInsightGeneration(org.id);
    console.log(`[insights] ${org.name}: ${result.created} new insight(s)`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

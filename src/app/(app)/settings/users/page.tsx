import { eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { UsersClient } from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const ctx = await requireOrg();
  const members = await ctx.db
    .select({
      userId: schema.memberships.userId,
      role: schema.memberships.role,
      partnerScope: schema.memberships.partnerScope,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.organizationId, ctx.organizationId));

  return <UsersClient members={members} currentUserId={ctx.userId} />;
}

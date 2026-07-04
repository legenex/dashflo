import { desc, eq } from "drizzle-orm";
import { requirePlatformAdmin } from "@/server/org";
import { getDb, schema } from "@/db/client";
import { startOfMonthKey, toDateKey } from "@/lib/transforms";
import { AdminClient } from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requirePlatformAdmin();
  const db = await getDb();
  const [orgs, memberships, leads, audit] = await Promise.all([
    db.query.organizations.findMany(),
    db.query.memberships.findMany(),
    db.query.leads.findMany(),
    db.select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.at)).limit(40),
  ]);

  const monthStart = startOfMonthKey(toDateKey(new Date()));
  const users = await db.query.users.findMany();
  const userName = new Map(users.map((u) => [u.id, u.name]));

  const MRR_BY_TIER: Record<string, number> = { starter: 14900, growth: 44900, scale: 124900 };

  return (
    <AdminClient
      orgs={orgs.map((o) => ({
        id: o.id, name: o.name, slug: o.slug, planTier: o.planTier, status: o.status,
        users: memberships.filter((m) => m.organizationId === o.id).length,
        leadsThisMonth: leads.filter(
          (l) => l.organizationId === o.id && toDateKey(l.receivedAt) >= monthStart
        ).length,
        totalLeads: leads.filter((l) => l.organizationId === o.id).length,
        mrrCents: o.status === "active" ? MRR_BY_TIER[o.planTier] ?? 0 : 0,
        createdAt: o.createdAt.toISOString(),
        members: memberships
          .filter((m) => m.organizationId === o.id)
          .map((m) => ({ name: userName.get(m.userId) ?? m.userId, role: m.role })),
      }))}
      platform={{
        tenants: orgs.length,
        totalLeads: leads.length,
        mrrCents: orgs.reduce((s, o) => s + (o.status === "active" ? MRR_BY_TIER[o.planTier] ?? 0 : 0), 0),
      }}
      audit={audit.map((a) => ({
        id: a.id, action: a.action, entityType: a.entityType, entityId: a.entityId,
        user: userName.get(a.userId) ?? a.userId, at: a.at.toISOString(),
      }))}
    />
  );
}

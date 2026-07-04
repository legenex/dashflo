import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, schema, type Db } from "@/db/client";
import { newId } from "@/lib/id";
import type { Role } from "@/db/schema";

// Org context resolution for every server page and app API route.
// Active org comes from the dashflo_org cookie; platform admins may
// impersonate any org via dashflo_impersonate (audit logged at entry).

export interface OrgContext {
  db: Db;
  userId: string;
  userName: string;
  userEmail: string;
  isPlatformAdmin: boolean;
  organizationId: string;
  organization: typeof schema.organizations.$inferSelect;
  role: Role;
  partnerScope: { buyer_id?: string; supplier_id?: string } | null;
  impersonating: boolean;
  memberships: Array<{ organizationId: string; organizationName: string; role: Role }>;
}

export async function getOrgContext(): Promise<OrgContext | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const db = await getDb();
  const jar = await cookies();

  const membershipRows = await db
    .select({
      organizationId: schema.memberships.organizationId,
      role: schema.memberships.role,
      partnerScope: schema.memberships.partnerScope,
      orgName: schema.organizations.name,
      orgStatus: schema.organizations.status,
    })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.organizationId))
    .where(eq(schema.memberships.userId, session.user.id));

  const impersonateOrgId = session.user.isPlatformAdmin
    ? jar.get("dashflo_impersonate")?.value ?? null
    : null;

  let organizationId: string | null = null;
  let role: Role = "analyst";
  let partnerScope: OrgContext["partnerScope"] = null;
  let impersonating = false;

  if (impersonateOrgId) {
    organizationId = impersonateOrgId;
    role = "owner";
    impersonating = true;
  } else {
    const preferred = jar.get("dashflo_org")?.value;
    const active =
      membershipRows.find((m) => m.organizationId === preferred) ?? membershipRows[0] ?? null;
    if (active) {
      organizationId = active.organizationId;
      role = active.role;
      partnerScope = active.partnerScope ?? null;
    }
  }

  if (!organizationId) return null;

  const organization = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, organizationId),
  });
  if (!organization) return null;

  return {
    db,
    userId: session.user.id,
    userName: session.user.name ?? "",
    userEmail: session.user.email ?? "",
    isPlatformAdmin: session.user.isPlatformAdmin,
    organizationId,
    organization,
    role,
    partnerScope,
    impersonating,
    memberships: membershipRows.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.orgName,
      role: m.role,
    })),
  };
}

export async function requireOrg(): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function requirePlatformAdmin(): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx || !ctx.isPlatformAdmin) redirect("/");
  return ctx;
}

// Role gates. Owner/admin manage everything; finance manages money surfaces;
// analyst reads with PII masking; partner sees only their scoped entity.
const MANAGE_ROLES: Role[] = ["owner", "admin"];
const MONEY_ROLES: Role[] = ["owner", "admin", "finance"];

export function canManage(ctx: OrgContext): boolean {
  return MANAGE_ROLES.includes(ctx.role);
}

export function canManageMoney(ctx: OrgContext): boolean {
  return MONEY_ROLES.includes(ctx.role);
}

export function maskPhone(phone: string | null, role: Role): string {
  if (!phone) return "";
  if (role === "analyst" || role === "partner") {
    return `***-${phone.slice(-4)}`;
  }
  return phone;
}

export async function writeAudit(
  ctx: Pick<OrgContext, "db" | "userId" | "organizationId">,
  action: string,
  entityType: string,
  entityId: string | null,
  diff: Record<string, unknown> = {}
): Promise<void> {
  await ctx.db.insert(schema.auditLogs).values({
    id: newId("aud"),
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action,
    entityType,
    entityId,
    diff,
    at: new Date(),
  });
}

// Tenant guard for queries that arrive with an entity id from the client.
export async function assertOrgOwned(
  db: Db,
  table: "campaigns" | "buyers" | "suppliers" | "leads",
  id: string,
  organizationId: string
): Promise<boolean> {
  const t = schema[table];
  const row = await db
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.id, id), eq(t.organizationId, organizationId)))
    .limit(1);
  return row.length > 0;
}

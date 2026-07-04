import { asc, eq } from "drizzle-orm";
import { Sidebar, type ReportNavItem } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();

  // Report pages feed the tiered Reports dropdown in the sidebar:
  // generic pages at the first level, per-entity portal pages nested under
  // their kind (Buyer Performance > AG1 Walker Performance, ...).
  const pages = await ctx.db
    .select({
      name: schema.reportPages.name,
      slug: schema.reportPages.slug,
      kind: schema.reportPages.kind,
      entityId: schema.reportPages.entityId,
    })
    .from(schema.reportPages)
    .where(eq(schema.reportPages.organizationId, ctx.organizationId))
    .orderBy(asc(schema.reportPages.sortOrder), asc(schema.reportPages.name));

  const generic = pages.filter((p) => !p.entityId);
  const entityPages = pages.filter((p) => p.entityId);
  const claimed = new Set<string>();

  const reportNav: ReportNavItem[] = generic.map((g) => {
    const children = entityPages
      .filter((e) => e.kind === g.kind)
      .map((e) => {
        claimed.add(e.slug);
        return { label: e.name, href: `/reports/view/${e.slug}` };
      });
    return {
      label: g.name,
      href: `/reports/view/${g.slug}`,
      children: children.length > 0 ? children : undefined,
    };
  });
  for (const orphan of entityPages.filter((e) => !claimed.has(e.slug))) {
    reportNav.push({ label: orphan.name, href: `/reports/view/${orphan.slug}` });
  }
  reportNav.push(
    { label: "P&L", href: "/reports/pnl" },
    { label: "Ad Performance", href: "/reports/ad-performance" },
    { label: "Scheduled", href: "/reports/scheduled" },
    { label: "Report Settings", href: "/reports" }
  );

  return (
    <div className="min-h-screen">
      <Sidebar
        isPlatformAdmin={ctx.isPlatformAdmin}
        accent={ctx.organization.whiteLabel.accent}
        role={ctx.role}
        reportNav={reportNav}
      />
      <div className="lg:pl-56">
        <TopBar
          userName={ctx.userName}
          orgName={ctx.organization.name}
          memberships={ctx.memberships}
          activeOrgId={ctx.organizationId}
          impersonating={ctx.impersonating}
          isPlatformAdmin={ctx.isPlatformAdmin}
        />
        <main className="mx-auto max-w-[1400px] p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

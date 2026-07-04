import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { requireOrg } from "@/server/org";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  return (
    <div className="min-h-screen">
      <Sidebar isPlatformAdmin={ctx.isPlatformAdmin} accent={ctx.organization.whiteLabel.accent} role={ctx.role} />
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

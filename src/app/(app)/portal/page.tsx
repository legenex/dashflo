import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { GlassPanel, Chip } from "@/components/ui/primitives";
import { ReportPageView } from "@/components/reports/ReportPageView";

export const dynamic = "force-dynamic";

// The partner portal: buyers and suppliers log in with a partner-scoped user
// and see only the report pages published to them, locked to their entity.
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireOrg();

  const scopeBuyerId = ctx.partnerScope?.buyer_id ?? null;
  const scopeSupplierId = ctx.partnerScope?.supplier_id ?? null;
  const isPartner = ctx.role === "partner";

  // Internal roles can preview any published portal page; partners see theirs.
  const allPages = await ctx.db.query.reportPages.findMany({
    where: and(eq(schema.reportPages.organizationId, ctx.organizationId), eq(schema.reportPages.portalVisible, true)),
  });
  const pages = isPartner
    ? allPages.filter((p) => p.entityId !== null && (p.entityId === scopeBuyerId || p.entityId === scopeSupplierId))
    : allPages;

  const entityName = async (): Promise<string | null> => {
    if (scopeBuyerId) {
      return (await ctx.db.query.buyers.findFirst({ where: eq(schema.buyers.id, scopeBuyerId) }))?.name ?? null;
    }
    if (scopeSupplierId) {
      return (await ctx.db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, scopeSupplierId) }))?.name ?? null;
    }
    return null;
  };
  const partnerName = await entityName();

  const activeSlug = sp.page ?? pages[0]?.slug;
  const active = pages.find((p) => p.slug === activeSlug) ?? pages[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-title">
          {isPartner ? `${partnerName ?? ctx.organization.name} Portal` : "Partner Portal Preview"}
        </h1>
        <p className="text-xs text-label">
          {isPartner
            ? `Performance published to you by ${ctx.organization.name}.`
            : "What partners see when they log in. Publish pages from Reports with the portal toggle."}
        </p>
      </div>

      {pages.length === 0 ? (
        <GlassPanel className="p-8 text-center">
          <p className="text-sm font-semibold text-title">No reports published yet</p>
          <p className="mt-1 text-xs text-label">
            {isPartner
              ? "Your account manager has not published a report to your portal yet."
              : "Clone a buyer or supplier report page, scope it to a partner, and enable the portal toggle."}
          </p>
          {!isPartner && (
            <Link href="/reports" className="mt-3 inline-block text-xs text-accent hover:underline">Open Reports</Link>
          )}
        </GlassPanel>
      ) : (
        <>
          {pages.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {pages.map((p) => (
                <Link
                  key={p.id}
                  href={`/portal?page=${p.slug}`}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    active?.id === p.id ? "df-grad-bg text-white" : "border border-panelborder text-label hover:text-body"
                  }`}
                >
                  {p.name}
                </Link>
              ))}
            </div>
          )}
          {active && (
            <>
              {!isPartner && (
                <div className="flex items-center gap-2 text-[11px] text-label">
                  <Chip tone="info">preview</Chip> Viewing as the partner would.
                </div>
              )}
              <ReportPageView
                page={{
                  id: active.id, name: active.name, slug: active.slug, kind: active.kind,
                  description: active.description, entityType: active.entityType, entityId: active.entityId,
                  portalVisible: active.portalVisible, config: active.config,
                }}
                editable={false}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

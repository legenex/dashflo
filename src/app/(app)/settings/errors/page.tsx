import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { GlassPanel, Chip, SectionLabel, EmptyState } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function ErrorLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requireOrg();
  const kind = params.kind ?? "all";

  const [errorLeads, failedAttempts] = await Promise.all([
    ctx.db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.organizationId, ctx.organizationId), eq(schema.leads.status, "error")))
      .orderBy(desc(schema.leads.receivedAt))
      .limit(100),
    ctx.db
      .select()
      .from(schema.distributionAttempts)
      .where(and(
        eq(schema.distributionAttempts.organizationId, ctx.organizationId),
        inArray(schema.distributionAttempts.outcome, ["timeout", "error"])
      ))
      .orderBy(desc(schema.distributionAttempts.at))
      .limit(100),
  ]);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex gap-1.5">
        {["all", "ingest", "delivery"].map((k) => (
          <Link key={k} href={`/settings/errors?kind=${k}`}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${kind === k ? "df-grad-bg text-white" : "border border-panelborder text-label"}`}>
            {k}
          </Link>
        ))}
      </div>

      {(kind === "all" || kind === "ingest") && (
        <GlassPanel className="p-4">
          <SectionLabel className="mb-2">Ingest errors ({errorLeads.length})</SectionLabel>
          {errorLeads.length === 0 ? (
            <EmptyState title="No ingest errors" />
          ) : (
            <div className="space-y-1">
              {errorLeads.map((l) => (
                <Link key={l.id} href={`/leads?open=${l.id}&status=errors`} className="flex flex-wrap items-center gap-3 rounded-lg border border-panelborder px-3 py-1.5 hover:border-[rgba(239,68,68,0.4)]">
                  <span className="font-mono-money text-[11px] text-label">{l.receivedAt.toISOString().slice(0, 16).replace("T", " ")}</span>
                  <Chip tone="danger">validation</Chip>
                  <span className="min-w-0 flex-1 truncate text-xs text-body">{l.errorMessage}</span>
                </Link>
              ))}
            </div>
          )}
        </GlassPanel>
      )}

      {(kind === "all" || kind === "delivery") && (
        <GlassPanel className="p-4">
          <SectionLabel className="mb-2">Delivery errors ({failedAttempts.length})</SectionLabel>
          {failedAttempts.length === 0 ? (
            <EmptyState title="No delivery errors" hint="Timeouts and transport failures land here." />
          ) : (
            <div className="space-y-1">
              {failedAttempts.map((a) => (
                <Link key={a.id} href={`/leads?open=${a.leadId}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-panelborder px-3 py-1.5 hover:border-[rgba(239,68,68,0.4)]">
                  <span className="font-mono-money text-[11px] text-label">{a.at.toISOString().slice(0, 16).replace("T", " ")}</span>
                  <Chip tone={a.outcome === "timeout" ? "warning" : "danger"}>{a.outcome}</Chip>
                  <span className="font-mono-money text-[11px] text-label">{a.durationMs}ms</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-body">lead {a.leadId}</span>
                </Link>
              ))}
            </div>
          )}
        </GlassPanel>
      )}
    </div>
  );
}

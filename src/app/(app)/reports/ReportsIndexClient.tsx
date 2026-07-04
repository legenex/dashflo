"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Globe, Plus, RotateCcw, Trash2 } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel } from "@/components/ui/primitives";
import { act } from "@/lib/client-api";

interface PageRow {
  id: string; name: string; slug: string; kind: string; description: string | null;
  entityType: string | null; entityId: string | null; entityName: string | null;
  portalVisible: boolean; isDefault: boolean;
}

const KIND_LABEL: Record<string, string> = {
  overview: "Overview", daily: "Daily", buyer: "Buyer", supplier: "Supplier",
  campaign: "Campaign", quality: "Quality", custom: "Custom",
};

export function ReportsIndexClient({
  pages, buyers, suppliers,
}: {
  pages: PageRow[];
  buyers: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [cloneFor, setCloneFor] = useState<PageRow | null>(null);
  const [cloneEntity, setCloneEntity] = useState("");
  const [busy, setBusy] = useState(false);

  const generic = pages.filter((p) => !p.entityId);
  const entityPages = pages.filter((p) => p.entityId);

  const cloneOptions = cloneFor?.kind === "supplier" ? suppliers : buyers;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-title">Reports</h1>
          <p className="text-xs text-label">
            Performance report pages: customizable cards, widgets, and filters. Clone a buyer or supplier page to
            publish it to their portal.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/reports/view/new?edit=1">
            <GradientButton><Plus size={13} /> New page</GradientButton>
          </Link>
          <GradientButton variant="ghost" onClick={async () => {
            await act("report.pages.restoreDefaults");
            router.refresh();
          }}>
            <RotateCcw size={12} /> Restore defaults
          </GradientButton>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-label">
        System reports:
        <Link className="text-accent hover:underline" href="/reports/pnl">P&L</Link>
        <Link className="text-accent hover:underline" href="/reports/ad-performance">Ad Performance</Link>
        <Link className="text-accent hover:underline" href="/reports/custom">Legacy Builder</Link>
        <Link className="text-accent hover:underline" href="/reports/scheduled">Scheduled Briefs</Link>
      </div>

      <SectionLabel>Report pages</SectionLabel>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {generic.map((p) => (
          <PageCard key={p.id} page={p} onClone={() => { setCloneFor(p); setCloneEntity(""); }} />
        ))}
      </div>

      <SectionLabel>Partner pages (per buyer / supplier)</SectionLabel>
      {entityPages.length === 0 ? (
        <GlassPanel className="p-4 text-xs text-label">
          No partner pages yet. Clone Buyer Performance or Supplier Performance for a specific partner, then flip
          Portal on so they can see it when they log in.
        </GlassPanel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {entityPages.map((p) => (
            <PageCard key={p.id} page={p} onClone={() => { setCloneFor(p); setCloneEntity(""); }} />
          ))}
        </div>
      )}

      {cloneFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,6,20,0.75)] p-4" onClick={() => setCloneFor(null)}>
          <GlassPanel className="df-gradient-border w-full max-w-md space-y-3 p-5" >
            <div onClick={(e) => e.stopPropagation()} className="space-y-3">
              <div className="text-sm font-bold text-title">Clone &quot;{cloneFor.name}&quot;</div>
              {(cloneFor.kind === "buyer" || cloneFor.kind === "supplier") && (
                <label className="flex flex-col gap-1">
                  <span className="df-label">Scope to a specific {cloneFor.kind} (for their portal)</span>
                  <select className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs text-body" value={cloneEntity} onChange={(e) => setCloneEntity(e.target.value)}>
                    <option value="">No scope (org-wide copy)</option>
                    {cloneOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
              )}
              <div className="flex gap-2">
                <GradientButton disabled={busy} onClick={async () => {
                  setBusy(true);
                  const entity = cloneEntity ? cloneOptions.find((o) => o.id === cloneEntity) : null;
                  const res = await act<{ slug?: string }>("report.page.clone", {
                    id: cloneFor.id,
                    ...(entity
                      ? {
                          name: `${entity.name} Performance`,
                          entityType: cloneFor.kind, entityId: entity.id, portalVisible: true,
                        }
                      : {}),
                  });
                  setBusy(false);
                  setCloneFor(null);
                  if (res.data.slug) router.push(`/reports/view/${res.data.slug}`);
                  else router.refresh();
                }}>
                  {busy ? "Cloning..." : "Clone"}
                </GradientButton>
                <GradientButton variant="ghost" onClick={() => setCloneFor(null)}>Cancel</GradientButton>
              </div>
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}

function PageCard({ page, onClone }: { page: PageRow; onClone: () => void }) {
  const router = useRouter();
  return (
    <GlassPanel className="flex flex-col p-4">
      <div className="flex items-start gap-2">
        <Link href={`/reports/view/${page.slug}`} className="min-w-0 flex-1">
          <div className="text-sm font-bold text-title hover:text-accent">{page.name}</div>
          <div className="mt-0.5 line-clamp-2 text-[11px] text-label">{page.description}</div>
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Chip tone="info">{KIND_LABEL[page.kind] ?? page.kind}</Chip>
        {page.entityName && <Chip tone="queued">{page.entityName}</Chip>}
        {page.portalVisible && <Chip tone="verified"><Globe size={9} /> portal</Chip>}
        {page.isDefault && <Chip tone="dim">default</Chip>}
        <span className="ml-auto flex gap-1">
          <button type="button" className="cursor-pointer rounded p-1 text-label hover:text-title" title="Clone" onClick={onClone}>
            <Copy size={13} />
          </button>
          <button
            type="button"
            className="cursor-pointer rounded p-1 text-label hover:text-danger"
            title="Delete"
            onClick={async () => {
              if (!confirm(`Delete report page "${page.name}"?`)) return;
              await act("report.page.delete", { id: page.id });
              router.refresh();
            }}
          >
            <Trash2 size={13} />
          </button>
        </span>
      </div>
    </GlassPanel>
  );
}

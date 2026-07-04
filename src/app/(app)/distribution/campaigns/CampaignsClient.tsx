"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { TruthGrid, type TruthGridRow } from "@/components/truthgrid/TruthGrid";
import { FilterBar } from "@/components/ui/filterbar";
import { GradientButton, decisionChip, profitTruthChip, Chip } from "@/components/ui/primitives";
import { fmtPct } from "@/lib/money";
import { act } from "@/lib/client-api";

interface CampaignRow {
  id: string;
  name: string;
  slug: string;
  vertical: string;
  type: string;
  status: string;
  spark: number[];
  truth: {
    leads: number;
    soldRate: number | null;
    booked: number;
    verified: number | null;
    gap: number | null;
    profitTruth: string;
    decision: string | null;
    missingSources: string[];
  } | null;
}

export function CampaignsClient({ rows }: { rows: CampaignRow[] }) {
  const router = useRouter();

  const gridRows: TruthGridRow[] = rows.map((c) => {
    const d = decisionChip(c.truth?.decision ?? null);
    const pt = profitTruthChip(c.truth?.profitTruth ?? "unknown");
    return {
      key: c.id,
      identity: {
        title: c.name,
        sub: `${c.vertical.replace("_", " ")} · ${c.type === "ping_post" ? "ping post" : "direct post"} · ${c.status}`,
        spark: c.spark,
      },
      stat: { label: "Sold rate", value: c.truth ? `${c.truth.leads} · ${fmtPct(c.truth.soldRate)}` : "-" },
      booked: { value: c.truth?.booked ?? 0 },
      verified: {
        value: c.truth?.verified ?? null,
        tone: "verified",
        chip: c.truth?.verified === null ? "Needs Source" : undefined,
      },
      gap: { value: c.truth?.gap ?? null, tone: "gap", chip: c.truth?.gap === null ? "Needs Source" : undefined },
      chip: pt,
      chip2: d.label ? d : undefined,
      glow: c.truth?.profitTruth === "false_profit" ? "danger" : c.truth?.profitTruth === "cash_verified" ? "verified" : null,
      actions: [
        { label: "Open campaign", onClick: () => router.push(`/distribution/campaigns/${c.id}`) },
        { label: "View truth", onClick: () => router.push(`/distribution/campaigns/${c.id}`) },
        {
          label: c.status === "active" ? "Pause" : "Activate",
          onClick: () => void act("campaign.status", { id: c.id, status: c.status === "active" ? "paused" : "active" }).then(() => router.refresh()),
        },
        { label: "Match payments", onClick: () => router.push("/reconciliation?tab=queue") },
        {
          label: "Create action item",
          onClick: () => void act("action.create", {
            entityType: "campaign", entityId: c.id, entityName: c.name,
            description: `Manual review requested for campaign ${c.name}`,
          }).then(() => router.refresh()),
        },
      ],
      sortValues: { stat: c.truth?.soldRate ?? 0 },
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-title">Campaigns</h1>
          <p className="text-xs text-label">Every campaign shows its decision on cash truth, not booked claims.</p>
        </div>
        <div className="flex items-center gap-2">
          <FilterBar showCompare={false} />
          <Link href="/distribution/campaigns/new">
            <GradientButton><Plus size={14} /> New Campaign</GradientButton>
          </Link>
        </div>
      </div>
      {rows.some((r) => (r.truth?.missingSources.length ?? 0) > 0) && (
        <div className="flex items-center gap-2 rounded-lg border border-panelborder bg-[rgba(245,158,11,0.06)] px-3 py-2 text-[11px] text-label">
          <Chip tone="dim">Needs Source</Chip>
          Some money fields are UNKNOWN because a connected source is inactive. Fix it in Settings, Data Sources.
        </div>
      )}
      <TruthGrid
        rows={gridRows}
        renderDrawer={(row) => {
          const c = rows.find((x) => x.id === row.key);
          if (!c) return null;
          return (
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="text-xs text-label">
                Open the campaign for the full truth header, routing panel, leads, ingest cURL, and settings.
              </div>
              <Link href={`/distribution/campaigns/${c.id}`}>
                <GradientButton variant="cyan">Open {c.name}</GradientButton>
              </Link>
            </div>
          );
        }}
      />
    </div>
  );
}

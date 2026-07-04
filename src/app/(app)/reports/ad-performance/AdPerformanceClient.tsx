"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Skull } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel } from "@/components/ui/primitives";
import { TruthGrid, type TruthGridRow } from "@/components/truthgrid/TruthGrid";
import { Heatmap } from "@/components/ui/charts";
import { FilterBar } from "@/components/ui/filterbar";
import { fmtCents } from "@/lib/money";
import { act } from "@/lib/client-api";

interface AdAgg {
  key: string; name: string; sub: string; brand: string | null; platform: string;
  spend: number; paid: number; impressions: number; clicks: number;
  leads: number; sold: number; booked: number; verified: number;
  roas: number | null; cashRoas: number | null;
}

const GRAINS = [
  { id: "platform", label: "Platform" },
  { id: "campaign", label: "Campaign" },
  { id: "adset", label: "Adset" },
  { id: "ad", label: "Ad" },
];

export function AdPerformanceClient(props: {
  rangeLabel: string;
  funnel: { spend: number; impressions: number; clicks: number; leads: number; sold: number; booked: number; verified: number };
  byPlatform: AdAgg[];
  byCampaign: AdAgg[];
  byAdset: AdAgg[];
  byAd: AdAgg[];
  heatVolume: number[][];
  heatSold: number[][];
}) {
  const router = useRouter();
  const [grain, setGrain] = useState("ad");
  const [killed, setKilled] = useState<string[]>([]);

  const data = grain === "platform" ? props.byPlatform : grain === "campaign" ? props.byCampaign : grain === "adset" ? props.byAdset : props.byAd;
  const sorted = [...data].sort((a, b) => b.spend - a.spend);
  const cashRoasValues = sorted.filter((g) => g.cashRoas !== null).map((g) => g.cashRoas ?? 0).sort((a, b) => b - a);
  const topDecileCut = cashRoasValues[Math.max(0, Math.floor(cashRoasValues.length / 10) - 1)] ?? Infinity;

  const rows: TruthGridRow[] = sorted.map((g) => {
    const zeroSold = g.spend > 5000 && g.sold === 0;
    const isTop = g.cashRoas !== null && g.cashRoas >= topDecileCut && g.cashRoas > 1 && cashRoasValues.length >= 3;
    return {
      key: g.key,
      identity: {
        title: g.name,
        sub: `${g.sub}${g.brand ? ` · ${g.brand}` : ""} · ${g.platform} · ${g.impressions.toLocaleString()} imp · ${g.clicks.toLocaleString()} clicks`,
      },
      stat: { label: "ROAS / cash", value: `${g.roas ?? "-"} / ${g.cashRoas ?? "-"}` },
      booked: { value: g.spend, tone: "default", chip: `${Math.round((g.paid / Math.max(1, g.spend)) * 100)}% paid` },
      verified: { value: g.booked, tone: "verified", chip: `${g.sold} sold` },
      gap: { value: g.verified, tone: g.verified > 0 ? "verified" : "dim", chip: "cash in" },
      chip: zeroSold
        ? { tone: "danger", label: killed.includes(g.key) ? "kill queued" : "zero sold" }
        : isTop
          ? { tone: "verified", label: "top decile" }
          : { tone: "neutral", label: `${g.leads} leads` },
      glow: zeroSold ? "danger" : isTop ? "verified" : null,
      actions: [
        ...(zeroSold
          ? [{
              label: "Kill this ad",
              danger: true,
              onClick: () => {
                void act("adperf.kill", { adName: g.name, spendCents: g.spend, campaignName: g.sub }).then(() => {
                  setKilled((k) => [...k, g.key]);
                  router.refresh();
                });
              },
            }]
          : []),
        { label: "Open spend matching", onClick: () => router.push("/reconciliation?tab=spend") },
      ],
      sortValues: { stat: g.cashRoas ?? -1 },
    };
  });

  const f = props.funnel;
  const funnelSteps = [
    { label: "Spend", value: fmtCents(f.spend), pct: null as number | null },
    { label: "Impressions", value: f.impressions.toLocaleString(), pct: null },
    { label: "Clicks", value: f.clicks.toLocaleString(), pct: f.impressions > 0 ? (f.clicks / f.impressions) * 100 : null },
    { label: "Leads", value: String(f.leads), pct: f.clicks > 0 ? (f.leads / f.clicks) * 100 : null },
    { label: "Sold", value: String(f.sold), pct: f.leads > 0 ? (f.sold / f.leads) * 100 : null },
    { label: "Booked", value: fmtCents(f.booked), pct: null },
    { label: "Verified", value: fmtCents(f.verified), pct: f.booked > 0 ? (f.verified / f.booked) * 100 : null },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-title">Ad Performance</h1>
          <p className="text-xs text-label">Spend to cash: the funnel ends at verified income, not booked revenue. {props.rangeLabel}.</p>
        </div>
        <FilterBar showCompare={false} />
      </div>

      <GlassPanel className="p-4">
        <SectionLabel className="mb-3">Spend-to-cash funnel</SectionLabel>
        <div className="grid grid-cols-4 gap-2 md:grid-cols-7">
          {funnelSteps.map((s, i) => (
            <div key={s.label} className="relative rounded-lg border border-panelborder bg-[rgba(11,14,35,0.4)] p-2.5 text-center">
              <div className={`font-mono-money text-sm font-bold ${i >= 5 ? (i === 6 ? "text-verified" : "text-title") : "text-title"}`}>{s.value}</div>
              <div className="df-label mt-0.5">{s.label}</div>
              {s.pct !== null && <div className="mt-0.5 text-[10px] text-accent">{s.pct.toFixed(1)}% conv</div>}
            </div>
          ))}
        </div>
      </GlassPanel>

      <div className="flex gap-1.5">
        {GRAINS.map((g) => (
          <button key={g.id} type="button" onClick={() => setGrain(g.id)}
            className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold ${grain === g.id ? "df-grad-bg text-white" : "border border-panelborder text-label hover:text-body"}`}>
            {g.label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-label">
          <Skull size={12} className="text-danger" /> red rows spent with zero sold leads, one-click Kill
        </span>
      </div>

      <TruthGrid
        rows={rows}
        bookedHeader="SPEND"
        verifiedHeader="BOOKED REV"
        gapHeader="VERIFIED"
        emptyTitle="No spend in range"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel className="p-4">
          <SectionLabel className="mb-2">Lead volume by day and hour (UTC)</SectionLabel>
          <Heatmap matrix={props.heatVolume} maxLabel="more leads" />
        </GlassPanel>
        <GlassPanel className="p-4">
          <SectionLabel className="mb-2">Sold leads by day and hour (UTC)</SectionLabel>
          <Heatmap matrix={props.heatSold} maxLabel="more sales" />
        </GlassPanel>
      </div>
    </div>
  );
}

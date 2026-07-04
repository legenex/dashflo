"use client";

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel, type ChipTone } from "@/components/ui/primitives";
import { fmtCents, fmtPct } from "@/lib/money";

interface LayerSummary {
  performance: { leads: number; sold: number; soldRate: number | null };
  booked: { revenue: number; supplierCost: number; media: number | null; other: number; profit: number | null };
  verified: { income: number | null; supplierPaid: number | null; mediaPaid: number | null; cashProfit: number | null };
  gap: { revenueGap: number | null; profitGap: number | null; overdue: number | null; shortPaid: number | null; spendGap: number | null; supplierGap: number | null; missingSources: string[] };
  profitTruth: string;
}

interface Period {
  month: string;
  totals: LayerSummary;
  campaigns: Array<{ key: string; name: string } & LayerSummary>;
  buyersByCampaign: Record<string, Array<{ name: string } & LayerSummary>>;
}

function periodChips(s: LayerSummary): Array<{ tone: ChipTone; label: string }> {
  const chips: Array<{ tone: ChipTone; label: string }> = [];
  if (s.verified.income !== null && s.booked.revenue > 0 && s.verified.income >= s.booked.revenue * 0.99) {
    chips.push({ tone: "verified", label: "Fully Verified" });
  }
  if ((s.gap.revenueGap ?? 0) > 0) chips.push({ tone: "warning", label: "Revenue Pending" });
  if (s.gap.missingSources.some((m) => m.includes("ads"))) chips.push({ tone: "dim", label: "Spend Missing" });
  if ((s.gap.supplierGap ?? 0) > 0) chips.push({ tone: "unmatched", label: "Supplier Cost Unpaid" });
  if ((s.gap.overdue ?? 0) > 0) chips.push({ tone: "danger", label: "Buyer Overdue" });
  if ((s.gap.shortPaid ?? 0) > 0) chips.push({ tone: "danger", label: "Short Paid" });
  if (s.verified.income === null) chips.push({ tone: "dim", label: "Unknown Profit" });
  if (chips.length === 0) chips.push({ tone: "neutral", label: "Needs Matching" });
  return chips;
}

export function PnlClient({ periods }: { periods: Period[] }) {
  const [openMonth, setOpenMonth] = useState<string | null>(periods[0]?.month ?? null);
  const [openCampaign, setOpenCampaign] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);

  const exportCsv = () => {
    const header = "month,scope,name,leads,sold,booked_revenue,supplier_cost,media_tracked,reported_profit,verified_income,supplier_paid,media_paid,cash_profit,revenue_gap,profit_truth";
    const val = (v: number | null) => (v === null ? "UNKNOWN" : (v / 100).toFixed(2));
    const lines: string[] = [header];
    for (const p of periods) {
      const t = p.totals;
      lines.push(`${p.month},total,All,${t.performance.leads},${t.performance.sold},${val(t.booked.revenue)},${val(t.booked.supplierCost)},${val(t.booked.media)},${val(t.booked.profit)},${val(t.verified.income)},${val(t.verified.supplierPaid)},${val(t.verified.mediaPaid)},${val(t.verified.cashProfit)},${val(t.gap.revenueGap)},${t.profitTruth}`);
      for (const c of p.campaigns) {
        lines.push(`${p.month},campaign,"${c.name}",${c.performance.leads},${c.performance.sold},${val(c.booked.revenue)},${val(c.booked.supplierCost)},${val(c.booked.media)},${val(c.booked.profit)},${val(c.verified.income)},${val(c.verified.supplierPaid)},${val(c.verified.mediaPaid)},${val(c.verified.cashProfit)},${val(c.gap.revenueGap)},${c.profitTruth}`);
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dashflo-pnl.csv";
    a.click();
  };

  const visible = compareMode ? periods : periods.slice(0, 3);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-title">P&L</h1>
          <p className="text-xs text-label">Four layers per period: performance, booked, verified, gap. Zero only ever means verified zero.</p>
        </div>
        <div className="flex gap-2">
          <GradientButton variant="ghost" className="!text-[11px]" onClick={() => setCompareMode((c) => !c)}>
            {compareMode ? "Last 3 months" : "6-month compare"}
          </GradientButton>
          <GradientButton variant="cyan" className="!text-[11px]" onClick={exportCsv}><Download size={12} /> CSV</GradientButton>
        </div>
      </div>

      {visible.map((p) => (
        <GlassPanel key={p.month} className="overflow-hidden">
          <button
            type="button"
            className="flex w-full cursor-pointer flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-[rgba(26,31,66,0.4)]"
            onClick={() => setOpenMonth(openMonth === p.month ? null : p.month)}
          >
            <span className="font-mono-money text-sm font-bold text-title">{p.month}</span>
            <span className="text-[11px] text-label">{p.totals.performance.leads} leads · {fmtPct(p.totals.performance.soldRate)} sold</span>
            <div className="flex flex-wrap gap-1">
              {periodChips(p.totals).map((c) => <Chip key={c.label} tone={c.tone}>{c.label}</Chip>)}
            </div>
            <span className="ml-auto flex items-center gap-4">
              <span className="text-[11px] text-label">booked <span className="font-mono-money text-title">{fmtCents(p.totals.booked.profit)}</span></span>
              <span className="text-[11px] text-label">cash <span className={`font-mono-money font-bold ${(p.totals.verified.cashProfit ?? 0) < 0 ? "text-danger" : "text-verified"}`}>{fmtCents(p.totals.verified.cashProfit)}</span></span>
              <ChevronDown size={14} className={`text-label transition-transform ${openMonth === p.month ? "rotate-180" : ""}`} />
            </span>
          </button>

          {openMonth === p.month && (
            <div className="border-t border-panelborder">
              <LayerTable summary={p.totals} />
              <div className="space-y-1 px-4 pb-4">
                <SectionLabel className="mb-1">By campaign</SectionLabel>
                {p.campaigns.map((c) => (
                  <div key={c.key} className="rounded-lg border border-panelborder bg-[rgba(11,14,35,0.4)]">
                    <button
                      type="button"
                      className="flex w-full cursor-pointer flex-wrap items-center gap-3 px-3 py-2 text-left"
                      onClick={() => setOpenCampaign(openCampaign === `${p.month}:${c.key}` ? null : `${p.month}:${c.key}`)}
                    >
                      <span className="text-xs font-semibold text-title">{c.name}</span>
                      <Chip tone={c.profitTruth === "false_profit" ? "danger" : c.profitTruth === "cash_verified" ? "verified" : "neutral"}>
                        {c.profitTruth.replace(/_/g, " ")}
                      </Chip>
                      <span className="ml-auto text-[11px] text-label">
                        booked <span className="font-mono-money text-body">{fmtCents(c.booked.revenue)}</span>
                        {" · verified "}<span className="font-mono-money text-verified">{fmtCents(c.verified.income)}</span>
                        {" · cash "}<span className={`font-mono-money ${(c.verified.cashProfit ?? 0) < 0 ? "text-danger" : "text-verified"}`}>{fmtCents(c.verified.cashProfit)}</span>
                      </span>
                      <ChevronDown size={12} className="text-label" />
                    </button>
                    {openCampaign === `${p.month}:${c.key}` && (
                      <div className="border-t border-panelborder px-3 py-2">
                        <SectionLabel className="mb-1">By buyer</SectionLabel>
                        {(p.buyersByCampaign[c.key] ?? []).map((b) => (
                          <div key={b.name} className="flex flex-wrap items-center gap-3 py-1 text-[11px]">
                            <span className="w-32 font-semibold text-body">{b.name}</span>
                            <span className="text-label">booked <span className="font-mono-money text-body">{fmtCents(b.booked.revenue)}</span></span>
                            <span className="text-label">verified <span className="font-mono-money text-verified">{fmtCents(b.verified.income)}</span></span>
                            <span className="text-label">gap <span className="font-mono-money text-warning">{fmtCents(b.gap.revenueGap)}</span></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassPanel>
      ))}
    </div>
  );
}

function LayerTable({ summary }: { summary: LayerSummary }) {
  const rows: Array<{ label: string; layer: string; value: number | null; tone?: string }> = [
    { label: "Booked revenue", layer: "booked", value: summary.booked.revenue },
    { label: "Supplier cost accrued", layer: "booked", value: -summary.booked.supplierCost },
    { label: "Media tracked", layer: "booked", value: summary.booked.media === null ? null : -summary.booked.media },
    { label: "Other costs", layer: "booked", value: -summary.booked.other },
    { label: "Reported profit", layer: "booked", value: summary.booked.profit, tone: "title" },
    { label: "Verified income", layer: "verified", value: summary.verified.income, tone: "verified" },
    { label: "Supplier cost paid", layer: "verified", value: summary.verified.supplierPaid === null ? null : -summary.verified.supplierPaid },
    { label: "Media paid", layer: "verified", value: summary.verified.mediaPaid === null ? null : -summary.verified.mediaPaid },
    { label: "Cash profit", layer: "verified", value: summary.verified.cashProfit, tone: "verified" },
    { label: "Revenue gap", layer: "gap", value: summary.gap.revenueGap, tone: "warning" },
    { label: "Profit gap", layer: "gap", value: summary.gap.profitGap, tone: "warning" },
    { label: "Overdue", layer: "gap", value: summary.gap.overdue, tone: "danger" },
    { label: "Short paid", layer: "gap", value: summary.gap.shortPaid, tone: "danger" },
  ];
  return (
    <div className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between text-xs">
          <span className="text-label">
            <span className="mr-1.5 inline-block w-14 text-[9px] uppercase tracking-wide opacity-60">{r.layer}</span>
            {r.label}
          </span>
          <span className={`font-mono-money font-semibold ${
            r.value === null ? "text-label" : r.tone === "verified" ? "text-verified" : r.tone === "danger" ? "text-danger" : r.tone === "warning" ? "text-warning" : "text-title"
          }`}>
            {r.value === null ? "UNKNOWN" : fmtCents(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

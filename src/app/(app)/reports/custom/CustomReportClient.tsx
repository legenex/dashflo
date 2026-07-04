"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Save, Trash2 } from "lucide-react";
import { GlassPanel, GradientButton, SectionLabel, Skeleton } from "@/components/ui/primitives";
import { MiniChart } from "@/components/ui/charts";
import { fmtCents } from "@/lib/money";
import { act, query } from "@/lib/client-api";

// Custom report builder: any dimension x any metric from the four layers.

const DIMENSIONS = [
  { id: "date", label: "Date" },
  { id: "campaign", label: "Campaign" },
  { id: "buyer", label: "Buyer" },
  { id: "supplier", label: "Supplier" },
  { id: "brand", label: "Brand" },
  { id: "platform", label: "Platform" },
  { id: "state", label: "State" },
];

const METRICS: Array<{ id: string; label: string; layer: string; path: (r: TruthRowLite) => number | null; money: boolean }> = [
  { id: "leads", label: "Leads", layer: "performance", path: (r) => r.performance.leads, money: false },
  { id: "sold", label: "Sold", layer: "performance", path: (r) => r.performance.sold, money: false },
  { id: "sold_rate", label: "Sold rate %", layer: "performance", path: (r) => (r.performance.sold_rate === null ? null : Math.round(r.performance.sold_rate * 100)), money: false },
  { id: "booked_revenue", label: "Booked revenue", layer: "booked", path: (r) => r.booked.booked_revenue, money: true },
  { id: "supplier_cost", label: "Supplier cost accrued", layer: "booked", path: (r) => r.booked.supplier_cost_accrued, money: true },
  { id: "media_tracked", label: "Media tracked", layer: "booked", path: (r) => r.booked.media_cost_tracked, money: true },
  { id: "reported_profit", label: "Reported profit", layer: "booked", path: (r) => r.booked.reported_profit, money: true },
  { id: "verified_income", label: "Verified income", layer: "verified", path: (r) => r.verified.verified_income, money: true },
  { id: "supplier_paid", label: "Supplier paid", layer: "verified", path: (r) => r.verified.supplier_cost_paid, money: true },
  { id: "media_paid", label: "Media paid", layer: "verified", path: (r) => r.verified.media_spend_paid, money: true },
  { id: "cash_profit", label: "Cash profit", layer: "verified", path: (r) => r.verified.cash_profit, money: true },
  { id: "revenue_gap", label: "Revenue gap", layer: "gap", path: (r) => r.gap.revenue_gap ?? null, money: true },
  { id: "outstanding", label: "Outstanding", layer: "gap", path: (r) => r.gap.outstanding ?? null, money: true },
  { id: "overdue", label: "Overdue", layer: "gap", path: (r) => r.gap.overdue ?? null, money: true },
  { id: "spend_gap", label: "Spend gap", layer: "gap", path: (r) => r.gap.spend_gap ?? null, money: true },
];

interface TruthRowLite {
  key: string;
  name: string;
  performance: { leads: number; sold: number; sold_rate: number | null };
  booked: { booked_revenue: number; supplier_cost_accrued: number; media_cost_tracked: number | null; reported_profit: number | null };
  verified: { verified_income: number | null; supplier_cost_paid: number | null; media_spend_paid: number | null; cash_profit: number | null };
  gap: { revenue_gap?: number | null; outstanding?: number | null; overdue?: number | null; spend_gap?: number | null };
}

export function CustomReportClient({ saved }: { saved: Array<{ id: string; name: string; config: Record<string, unknown> }> }) {
  const router = useRouter();
  const [dimension, setDimension] = useState("campaign");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["booked_revenue", "verified_income", "revenue_gap", "cash_profit"]);
  const [view, setView] = useState<"table" | "chart">("table");
  const [rows, setRows] = useState<TruthRowLite[] | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(() => {
    setRows(null);
    void query<{ rows: TruthRowLite[] }>("custom.report", { dimension }).then((d) => setRows(d?.rows ?? []));
  }, [dimension]);
  useEffect(load, [load]);

  const metrics = METRICS.filter((m) => selectedMetrics.includes(m.id));

  const exportCsv = () => {
    if (!rows) return;
    const header = ["dimension", ...metrics.map((m) => m.id)].join(",");
    const lines = rows.map((r) =>
      [r.name, ...metrics.map((m) => {
        const v = m.path(r);
        return v === null ? "UNKNOWN" : m.money ? (v / 100).toFixed(2) : v;
      })].join(",")
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dashflo-${dimension}-report.csv`;
    a.click();
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-title">Custom Reports</h1>
        <p className="text-xs text-label">Any dimension times any metric from all four layers. UNKNOWN stays UNKNOWN in exports too.</p>
      </div>

      <GlassPanel className="flex flex-wrap items-center gap-3 p-3">
        <span className="df-label">Dimension</span>
        <select className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs text-body" value={dimension} onChange={(e) => setDimension(e.target.value)}>
          {DIMENSIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        <span className="df-label">Metrics</span>
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-lg border border-panelborder bg-elevated px-2.5 py-1.5 text-xs text-body">
            {selectedMetrics.length} selected
          </summary>
          <div className="absolute left-0 top-9 z-30 max-h-72 w-64 overflow-y-auto rounded-lg border border-panelborder bg-elevated p-1.5 shadow-2xl">
            {METRICS.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-body hover:bg-[rgba(59,130,246,0.1)]">
                <input type="checkbox" className="accent-[var(--grad-to)]" checked={selectedMetrics.includes(m.id)}
                  onChange={() => setSelectedMetrics((prev) => prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id])} />
                <span className="w-14 text-[9px] uppercase text-label">{m.layer}</span>
                {m.label}
              </label>
            ))}
          </div>
        </details>
        <div className="flex gap-1">
          {(["table", "chart"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold ${view === v ? "df-grad-bg text-white" : "border border-panelborder text-label"}`}>
              {v}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input placeholder="Report name" className="w-40 rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs text-body" value={name} onChange={(e) => setName(e.target.value)} />
          <GradientButton variant="ghost" className="!text-[11px]" disabled={!name} onClick={async () => {
            await act("report.save", { name, config: { dimension, metrics: selectedMetrics, view }, kind: "custom" });
            setName("");
            router.refresh();
          }}>
            <Save size={12} /> Save
          </GradientButton>
          <GradientButton variant="cyan" className="!text-[11px]" onClick={exportCsv}><Download size={12} /> CSV</GradientButton>
        </div>
      </GlassPanel>

      {saved.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="df-label">Saved:</span>
          {saved.map((s) => (
            <span key={s.id} className="flex items-center gap-1 rounded-lg border border-panelborder bg-panel px-2 py-1 text-[11px] text-body">
              <button type="button" className="cursor-pointer hover:text-title" onClick={() => {
                const config = s.config as { dimension?: string; metrics?: string[] };
                if (config.dimension) setDimension(config.dimension);
                if (config.metrics) setSelectedMetrics(config.metrics);
              }}>
                {s.name}
              </button>
              <button type="button" className="cursor-pointer text-label hover:text-danger" onClick={async () => {
                await act("report.delete", { id: s.id });
                router.refresh();
              }} aria-label={`Delete ${s.name}`}>
                <Trash2 size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {!rows ? (
        <GlassPanel className="space-y-2 p-4"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-2/3" /></GlassPanel>
      ) : view === "chart" ? (
        <GlassPanel className="p-4">
          <SectionLabel className="mb-2">{metrics[0]?.label ?? "Metric"}{metrics[1] ? ` vs ${metrics[1].label}` : ""} by {dimension}</SectionLabel>
          <MiniChart
            kind={dimension === "date" ? "line" : "bar"}
            height={300}
            prefix={metrics[0]?.money ? "$" : ""}
            data={rows.slice(0, 20).map((r) => ({
              label: r.name.slice(0, 16),
              value: toDisplay(metrics[0]?.path(r) ?? null, metrics[0]?.money ?? false) ?? 0,
              ...(metrics[1] ? { value2: toDisplay(metrics[1].path(r), metrics[1].money) ?? 0 } : {}),
            }))}
            series={metrics[1] ? [metrics[0]?.label ?? "", metrics[1].label] : undefined}
          />
        </GlassPanel>
      ) : (
        <GlassPanel className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="flex border-b border-panelborder bg-[rgba(11,14,35,0.4)] px-3 py-2">
              <span className="df-label w-44">{dimension}</span>
              {metrics.map((m) => <span key={m.id} className="df-label flex-1 text-right">{m.label}</span>)}
            </div>
            {rows.map((r) => (
              <div key={r.key} className="flex border-b border-[rgba(38,43,77,0.5)] px-3 py-1.5 hover:bg-[rgba(26,31,66,0.4)]">
                <span className="w-44 truncate text-xs font-semibold text-title">{r.name}</span>
                {metrics.map((m) => {
                  const v = m.path(r);
                  return (
                    <span key={m.id} className={`font-mono-money flex-1 text-right text-xs ${v === null ? "text-label" : "text-body"}`}>
                      {v === null ? "UNKNOWN" : m.money ? fmtCents(v) : v}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </GlassPanel>
      )}
    </div>
  );
}

function toDisplay(v: number | null, money: boolean): number | null {
  if (v === null) return null;
  return money ? Math.round(v / 100) : v;
}

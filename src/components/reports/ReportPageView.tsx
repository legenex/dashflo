"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Pencil, Plus, Save, Trash2, X, Globe } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel, Skeleton, Ticker } from "@/components/ui/primitives";
import { RevenueTruthChart } from "@/components/ui/charts";
import { fmtCents } from "@/lib/money";
import { act, query } from "@/lib/client-api";
import type { ReportFieldFilter, ReportPageConfig, ReportWidget, ReportCustomMetric } from "@/db/schema";

// The report page renderer + inline editor. Used by /reports/view/[slug]
// (editable) and the partner portal (read-only, entity-scoped).

export interface ReportPageMeta {
  id: string | null;
  name: string;
  slug: string;
  kind: string;
  description: string | null;
  entityType: "buyer" | "supplier" | "campaign" | null;
  entityId: string | null;
  entityName?: string | null;
  portalVisible: boolean;
  config: ReportPageConfig;
}

interface CardValue {
  id: string; label: string; format: "money" | "number" | "pct";
  value: number | null; verified?: number | null;
}

interface WidgetData {
  id: string; type: string; title: string;
  columns: Array<{ id: string; label: string; format: "money" | "number" | "pct" }>;
  rows: Array<{ key: string; label: string; values: Array<number | null> }>;
  chart?: Array<{ date: string; booked: number; verified: number | null; spend: number | null }>;
}

interface PageData {
  cards: CardValue[];
  widgets: WidgetData[];
  availableFields: Array<{ key: string; label: string }>;
}

export const ALL_METRICS = [
  { id: "revenue", label: "Revenue" }, { id: "net_revenue", label: "Net Revenue" },
  { id: "verified_income", label: "Verified Income" }, { id: "cost", label: "Cost" },
  { id: "cpl", label: "CPL" }, { id: "profit", label: "Profit" },
  { id: "net_profit", label: "Net Profit (cash)" }, { id: "revenue_gap", label: "Revenue Gap" },
  { id: "avg_price", label: "Avg Sale Price" }, { id: "total_leads", label: "Total Leads" },
  { id: "sold_leads", label: "Sold Leads" }, { id: "conversions", label: "Conversions" },
  { id: "conv_rate", label: "Conv Rate" }, { id: "fake_leads", label: "Fake Leads" },
  { id: "returns", label: "Returns" }, { id: "duplicates", label: "Duplicates" },
  { id: "errors", label: "Errors" }, { id: "dup_rate", label: "Dup Rate" },
  { id: "return_rate", label: "Return Rate" }, { id: "gp_margin", label: "GP Margin" },
];

const WIDGET_TYPES = [
  { id: "state_table", label: "State Table" },
  { id: "daily_table", label: "Daily Table" },
  { id: "buyer_table", label: "Buyer Table" },
  { id: "supplier_table", label: "Supplier Table" },
  { id: "campaign_table", label: "Campaign Table" },
  { id: "truth_chart", label: "Truth Chart" },
];

const DATE_PRESETS = [
  { id: "today", label: "Today", days: 0 },
  { id: "7d", label: "Last 7", days: 6 },
  { id: "30d", label: "Last 30", days: 29 },
  { id: "60d", label: "Last 60", days: 59 },
  { id: "90d", label: "Last 90", days: 89 },
];

function dateKey(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
}

function fmtMetric(value: number | null, format: "money" | "number" | "pct"): string {
  if (value === null) return "UNKNOWN";
  if (format === "money") return fmtCents(Math.round(value));
  if (format === "pct") return `${(value * 100).toFixed(1).replace(/\.0$/, "")}%`;
  return Math.round(value * 100) % 100 === 0 ? String(Math.round(value)) : value.toFixed(2);
}

export function ReportPageView({
  page: initialPage,
  editable,
  startInEdit = false,
}: {
  page: ReportPageMeta;
  editable: boolean;
  startInEdit?: boolean;
}) {
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const [config, setConfig] = useState<ReportPageConfig>(initialPage.config);
  const [editing, setEditing] = useState(startInEdit && editable);
  const [preset, setPreset] = useState("60d");
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [runtimeFilters, setRuntimeFilters] = useState<ReportFieldFilter[]>(initialPage.config.filters);
  const [message, setMessage] = useState<string | null>(null);

  const range = useMemo(() => {
    const p = DATE_PRESETS.find((x) => x.id === preset) ?? DATE_PRESETS[3];
    return { from: dateKey(p.days), to: dateKey(0) };
  }, [preset]);

  const load = useCallback(async () => {
    if (!page.id) {
      // Unsaved new page: preview with a local resolve through the generic slug is
      // not possible, show empty until saved.
      setData({ cards: [], widgets: [], availableFields: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await query<PageData>("report.data", {
      slug: page.slug,
      from: range.from,
      to: range.to,
      filters: JSON.stringify(runtimeFilters),
    });
    setData(result);
    setLoading(false);
  }, [page.id, page.slug, range.from, range.to, runtimeFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const res = await act<{ id?: string; slug?: string }>("report.page.save", {
      ...(page.id ? { id: page.id } : {}),
      name: page.name,
      slug: page.slug,
      kind: page.kind,
      description: page.description,
      entityType: page.entityType,
      entityId: page.entityId,
      portalVisible: page.portalVisible,
      config: { ...config, filters: runtimeFilters },
    });
    if (!res.ok) {
      setMessage(res.error ?? "Save failed");
      return;
    }
    setMessage("Saved");
    setTimeout(() => setMessage(null), 1500);
    if (!page.id && res.data.slug) {
      router.replace(`/reports/view/${res.data.slug}`);
      router.refresh();
    } else {
      setPage((p) => ({ ...p, config: { ...config, filters: runtimeFilters } }));
      setEditing(false);
      void load();
      router.refresh();
    }
  };

  const input = "rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs text-body outline-none";

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              className={`${input} !text-base !font-bold !text-title w-72`}
              value={page.name}
              onChange={(e) => {
                const name = e.target.value;
                setPage((p) => ({
                  ...p, name,
                  slug: p.id ? p.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
                }));
              }}
            />
          ) : (
            <h1 className="text-xl font-bold text-title">{page.name}</h1>
          )}
          <p className="text-xs text-label">
            {page.entityName ? `Scoped to ${page.entityName} · ` : ""}
            {page.description ?? ""}
          </p>
        </div>
        {page.portalVisible && <Chip tone="verified"><Globe size={9} /> published to portal</Chip>}
        {editable && !editing && (
          <GradientButton variant="ghost" onClick={() => setEditing(true)}><Pencil size={12} /> Edit page</GradientButton>
        )}
        {editing && (
          <>
            <GradientButton onClick={() => void save()}><Save size={12} /> Save</GradientButton>
            <GradientButton variant="ghost" onClick={() => { setEditing(false); setConfig(page.config); }}>
              <X size={12} /> Cancel
            </GradientButton>
          </>
        )}
        {message && <span className="text-xs text-accent">{message}</span>}
      </div>

      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-panelborder bg-panel p-1">
          <CalendarRange size={13} className="ml-1 text-label" />
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`cursor-pointer rounded-md px-2 py-1 text-[11px] font-semibold ${preset === p.id ? "df-grad-bg text-white" : "text-label hover:text-body"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {/* field filter toggles */}
        {runtimeFilters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setRuntimeFilters(runtimeFilters.map((x) => (x.id === f.id ? { ...x, enabled: !x.enabled } : x)))}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
              f.enabled ? "border-[rgba(34,211,238,0.4)] bg-[rgba(34,211,238,0.12)] text-accent" : "border-panelborder text-label hover:text-body"
            }`}
            title={`${f.field} ${f.operator} ${String(f.value ?? "")}`}
          >
            {f.label || `${f.field} ${f.operator} ${String(f.value ?? "")}`}
            {editing && (
              <X size={11} className="hover:text-danger" onClick={(e) => {
                e.stopPropagation();
                setRuntimeFilters(runtimeFilters.filter((x) => x.id !== f.id));
              }} />
            )}
          </button>
        ))}
        {editing && data && (
          <FilterAdder fields={data.availableFields} onAdd={(f) => setRuntimeFilters([...runtimeFilters, f])} />
        )}
      </div>

      {/* cards */}
      {loading || !data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {data.cards.map((c) => (
            <GlassPanel key={c.id} className="relative p-3">
              <SectionLabel>{c.label}</SectionLabel>
              <div className="mt-1">
                <Ticker
                  value={c.value === null ? null : Math.round(c.value * (c.format === "pct" ? 1000 : 1))}
                  format={(v) => fmtMetric(v === null ? null : c.format === "pct" ? v / 1000 : v, c.format)}
                  className={`text-lg font-bold ${c.value === null ? "text-label" : c.format === "money" && c.value < 0 ? "text-danger" : "text-title"}`}
                />
              </div>
              {c.verified !== undefined && (
                <div className="mt-0.5 text-[10px] text-label">
                  verified <span className={`font-mono-money ${c.verified === null ? "" : "text-verified"}`}>{fmtMetric(c.verified, "money")}</span>
                </div>
              )}
              {editing && (
                <button
                  type="button"
                  className="absolute right-1.5 top-1.5 cursor-pointer text-label hover:text-danger"
                  onClick={() => setConfig({ ...config, cards: config.cards.filter((x) => x !== c.id) })}
                  aria-label={`Remove ${c.label}`}
                >
                  <X size={12} />
                </button>
              )}
            </GlassPanel>
          ))}
          {editing && (
            <CardAdder
              config={config}
              onAdd={(id) => setConfig({ ...config, cards: [...config.cards, id] })}
              onAddCustom={(m) => setConfig({ ...config, customMetrics: [...config.customMetrics, m], cards: [...config.cards, m.id] })}
            />
          )}
        </div>
      )}

      {/* widgets */}
      {data?.widgets.map((w) => (
        <GlassPanel key={w.id} className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <SectionLabel>{w.title}</SectionLabel>
            {editing && (
              <button type="button" className="cursor-pointer text-label hover:text-danger" onClick={() => setConfig({ ...config, widgets: config.widgets.filter((x) => x.id !== w.id) })} aria-label="Remove widget">
                <Trash2 size={13} />
              </button>
            )}
          </div>
          {w.chart ? (
            <RevenueTruthChart data={w.chart} height={240} />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="flex border-b border-panelborder pb-1.5">
                  <span className="df-label w-36">{w.type === "daily_table" ? "Date" : w.type.replace("_table", "").replace(/^./, (c) => c.toUpperCase())}</span>
                  {w.columns.map((c) => <span key={c.id} className="df-label flex-1 text-right">{c.label}</span>)}
                </div>
                {w.rows.length === 0 && <div className="py-6 text-center text-xs text-label">No data in this range</div>}
                {w.rows.map((r) => (
                  <div key={r.key} className="flex border-b border-[rgba(38,43,77,0.4)] py-1.5 hover:bg-[rgba(26,31,66,0.4)]">
                    <span className="w-36 truncate text-xs font-semibold text-title">{r.label}</span>
                    {r.values.map((v, i) => (
                      <span key={i} className={`font-mono-money flex-1 text-right text-xs ${v === null ? "text-label" : "text-body"}`}>
                        {fmtMetric(v, w.columns[i]?.format ?? "number")}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassPanel>
      ))}

      {editing && (
        <GlassPanel className="flex flex-wrap items-center gap-2 p-3">
          <SectionLabel>Add widget</SectionLabel>
          {WIDGET_TYPES.map((t) => (
            <GradientButton
              key={t.id}
              variant="ghost"
              className="!px-2 !py-1 !text-[10px]"
              onClick={() => {
                const w: ReportWidget = {
                  id: `w_${Date.now().toString(36)}`,
                  type: t.id as ReportWidget["type"],
                  title: t.label,
                  metrics: t.id === "truth_chart" ? undefined : ["total_leads", "sold_leads", "conv_rate", "net_revenue", "cpl", "profit"],
                };
                setConfig({ ...config, widgets: [...config.widgets, w] });
              }}
            >
              <Plus size={10} /> {t.label}
            </GradientButton>
          ))}
          <span className="ml-auto flex items-center gap-2 text-[11px] text-label">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-[var(--grad-to)]"
                checked={page.portalVisible}
                onChange={(e) => setPage({ ...page, portalVisible: e.target.checked })}
              />
              Publish to partner portal
            </label>
          </span>
        </GlassPanel>
      )}
      {editing && (
        <p className="text-[11px] text-label">
          Changes preview after Save. Cards and widget columns pick from the base metric registry plus your custom
          metrics. Money values stay UNKNOWN when a source is missing, never zero.
        </p>
      )}
    </div>
  );
}

function CardAdder({
  config,
  onAdd,
  onAddCustom,
}: {
  config: ReportPageConfig;
  onAdd: (id: string) => void;
  onAddCustom: (m: ReportCustomMetric) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customFormula, setCustomFormula] = useState("");
  const [customFormat, setCustomFormat] = useState<"money" | "number" | "pct">("number");
  const available = ALL_METRICS.filter((m) => !config.cards.includes(m.id));

  return (
    <GlassPanel className="relative flex items-center justify-center p-3">
      <button type="button" className="flex cursor-pointer flex-col items-center gap-1 text-label hover:text-accent" onClick={() => setOpen((o) => !o)}>
        <Plus size={18} />
        <span className="text-[10px] font-semibold uppercase">Add metric</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded-xl border border-panelborder bg-elevated p-2 shadow-2xl">
          <div className="max-h-44 overflow-y-auto">
            {available.map((m) => (
              <button key={m.id} type="button" className="block w-full cursor-pointer rounded px-2 py-1 text-left text-xs text-body hover:bg-[rgba(59,130,246,0.1)]" onClick={() => { onAdd(m.id); setOpen(false); }}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="mt-2 space-y-1.5 border-t border-panelborder pt-2">
            <div className="df-label">Custom metric</div>
            <input placeholder="Name (e.g. Rev per Sold)" className="w-full rounded border border-panelborder bg-[#070a1c] px-2 py-1 text-xs text-body" value={customName} onChange={(e) => setCustomName(e.target.value)} />
            <input placeholder="Formula: net_revenue / sold_leads" className="w-full rounded border border-panelborder bg-[#070a1c] px-2 py-1 font-mono-money text-xs text-body" value={customFormula} onChange={(e) => setCustomFormula(e.target.value)} />
            <div className="flex items-center gap-2">
              <select className="rounded border border-panelborder bg-[#070a1c] px-2 py-1 text-xs text-body" value={customFormat} onChange={(e) => setCustomFormat(e.target.value as "money")}>
                <option value="money">money</option><option value="number">number</option><option value="pct">percent</option>
              </select>
              <GradientButton
                variant="cyan"
                className="!px-2 !py-1 !text-[10px]"
                disabled={!customName || !customFormula}
                onClick={() => {
                  onAddCustom({
                    id: `custom_${customName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
                    label: customName, formula: customFormula, format: customFormat,
                  });
                  setCustomName(""); setCustomFormula(""); setOpen(false);
                }}
              >
                Add custom
              </GradientButton>
            </div>
            <p className="text-[10px] text-label">Combine base metric ids with + - * / and parentheses.</p>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}

function FilterAdder({
  fields,
  onAdd,
}: {
  fields: Array<{ key: string; label: string }>;
  onAdd: (f: ReportFieldFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState("");
  const [operator, setOperator] = useState<ReportFieldFilter["operator"]>("within_days");
  const [value, setValue] = useState("7");

  return (
    <div className="relative">
      <GradientButton variant="ghost" className="!px-2 !py-1 !text-[10px]" onClick={() => setOpen((o) => !o)}>
        <Plus size={10} /> Add filter
      </GradientButton>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-72 space-y-1.5 rounded-xl border border-panelborder bg-elevated p-2.5 shadow-2xl">
          <select className="w-full rounded border border-panelborder bg-[#070a1c] px-2 py-1 text-xs text-body" value={field} onChange={(e) => setField(e.target.value)}>
            <option value="">field...</option>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label} ({f.key})</option>)}
          </select>
          <div className="flex gap-1.5">
            <select className="flex-1 rounded border border-panelborder bg-[#070a1c] px-2 py-1 text-xs text-body" value={operator} onChange={(e) => setOperator(e.target.value as ReportFieldFilter["operator"])}>
              {["within_days", "equals", "not_equals", "in", "contains", "gt", "lt", "exists"].map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
            </select>
            {operator !== "exists" && (
              <input className="flex-1 rounded border border-panelborder bg-[#070a1c] px-2 py-1 text-xs text-body" placeholder={operator === "within_days" ? "days" : "value"} value={value} onChange={(e) => setValue(e.target.value)} />
            )}
          </div>
          <GradientButton
            variant="cyan"
            className="!px-2 !py-1 !text-[10px]"
            disabled={!field}
            onClick={() => {
              const fieldLabel = fields.find((f) => f.key === field)?.label ?? field;
              const label =
                operator === "within_days" ? `${fieldLabel} within ${value} days`
                : operator === "exists" ? `Has ${fieldLabel}`
                : `${fieldLabel} ${operator.replace("_", " ")} ${value}`;
              onAdd({
                id: `f_${Date.now().toString(36)}`,
                label, field, operator,
                value: operator === "within_days" || operator === "gt" || operator === "lt" ? Number(value) : value,
                enabled: true,
              });
              setOpen(false);
              setField("");
            }}
          >
            Add filter
          </GradientButton>
        </div>
      )}
    </div>
  );
}

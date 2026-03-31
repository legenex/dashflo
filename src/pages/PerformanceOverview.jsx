import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths, subDays } from "date-fns";
import { TrendingUp, TrendingDown, RefreshCw, Plus, X, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveContainer, LineChart, Line, Tooltip, YAxis } from "recharts";

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = {
  currency: v => v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  integer:  v => v == null ? '—' : Math.round(Number(v)).toLocaleString(),
  percent:  v => v == null ? '—' : Number(v).toFixed(2) + '%',
  number:   v => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }),
};

const fmtDate = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const delta = (curr, prev) => {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
};

const sum = (rows, field) => rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);
const avg = (rows, field) => rows.length ? sum(rows, field) / rows.length : 0;

// ─── KPI card with sparkline ─────────────────────────────────────────────────

function KPISparkCard({ label, value, displayFmt, prevValue, sparkData, sparkField, color }) {
  const d = delta(value, prevValue);
  const up = d >= 0;
  const sparkColor = color || '#00d4ff';

  return (
    <div className="glass-card border border-white/10 rounded-xl p-4 flex flex-col gap-1 min-w-0">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider truncate">{label}</p>
      <p className="text-2xl font-bold text-white">{fmt[displayFmt]?.(value) ?? value}</p>
      {d !== null && (
        <div className={`flex items-center gap-1 text-xs font-medium ${up ? 'text-green-400' : 'text-red-400'}`}>
          {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {Math.abs(d).toFixed(1)}%
          <span className="text-gray-500 font-normal">vs prior</span>
        </div>
      )}
      {sparkData?.length > 1 && sparkField && (
        <div className="mt-2 h-16">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: '#1a1a3e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                labelFormatter={l => fmtDate(l)}
                formatter={v => [fmt[displayFmt]?.(v) ?? v, label]}
              />
              <Line
                type="monotone"
                dataKey={sparkField}
                stroke={sparkColor}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function PerformanceOverview() {
  const today = new Date();
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(today), 'yyyy-MM-dd'),
    end:   format(endOfMonth(today),   'yyyy-MM-dd'),
  });

  // Preset ranges
  const presets = [
    { label: 'This Month',  start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') },
    { label: 'Last Month',  start: format(startOfMonth(subMonths(today,1)), 'yyyy-MM-dd'), end: format(endOfMonth(subMonths(today,1)), 'yyyy-MM-dd') },
    { label: 'Last 7 Days', start: format(subDays(today,6), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') },
    { label: 'Last 30 Days',start: format(subDays(today,29), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') },
  ];

  // Prior period (same duration, immediately before)
  const priorRange = useMemo(() => {
    const s = new Date(dateRange.start);
    const e = new Date(dateRange.end);
    const days = Math.max(1, Math.round((e - s) / 86400000) + 1);
    const pe = new Date(s); pe.setDate(pe.getDate() - 1);
    const ps = new Date(pe); ps.setDate(ps.getDate() - days + 1);
    return { start: format(ps, 'yyyy-MM-dd'), end: format(pe, 'yyyy-MM-dd') };
  }, [dateRange]);

  // ── user-selected KPI metrics ──────────────────────────────────────────────
  const DEFAULT_KPIS = [
    { field: 'Revenue',    fn: 'sum', label: 'Revenue',     fmt: 'currency', color: '#00d4ff' },
    { field: 'Net_Revenue',fn: 'sum', label: 'Net Revenue',  fmt: 'currency', color: '#a855f7' },
    { field: 'Payout',     fn: 'sum', label: 'Cost',         fmt: 'currency', color: '#f97316' },
    { field: 'CPL',        fn: 'avg', label: 'CPL',          fmt: 'currency', color: '#eab308' },
    { field: 'Profit',     fn: 'sum', label: 'Profit',       fmt: 'currency', color: '#22c55e' },
    { field: 'Net_Profit', fn: 'sum', label: 'Net Profit',   fmt: 'currency', color: '#ec4899' },
  ];
  const [selectedKPIs, setSelectedKPIs] = useState(DEFAULT_KPIS);
  const [showPicker, setShowPicker] = useState(false);

  const KPI_COLORS = ['#00d4ff','#a855f7','#f97316','#eab308','#22c55e','#ec4899','#3b82f6','#14b8a6','#f43f5e','#84cc16'];

  // ── aggregations to send ──────────────────────────────────────────────────
  const AGGS = selectedKPIs.map(k => ({ function: k.fn, field: k.field, alias: k.label.replace(/ /g,'_') }));

  const AFFILIATE_AGGS = [
    { function: 'COUNT',    field: '*',          alias: 'Total_Leads' },
    { function: 'COUNT_IF', field: 'status',     alias: 'Sold_Leads',   value: 'sold' },
    { function: 'sum',      field: 'Revenue',    alias: 'Revenue' },
    { function: 'sum',      field: 'Payout',     alias: 'Cost' },
    { function: 'avg',      field: 'CPL',        alias: 'CPL' },
  ];

  // ── resolve data source ───────────────────────────────────────────────────
  const { data: syncConfigs = [] } = useQuery({
    queryKey: ['sync-configs-perf'],
    queryFn: () => base44.entities.SyncConfiguration.list(),
    initialData: [],
  });

  const activeSync = useMemo(() => (
    syncConfigs.find(s => s.sync_type === 'cloud_run' && s.enabled) ||
    syncConfigs.find(s => s.enabled) ||
    syncConfigs[0] || null
  ), [syncConfigs]);

  const dataSource = activeSync?.local_table_name || activeSync?.name || null;

  // ── derive available fields from schema ────────────────────────────────────
  const sourceFields = useMemo(() => {
    const schema = activeSync?.detected_schema;
    if (!schema) return [];
    const fields = Array.isArray(schema) ? schema : (schema.fields || Object.entries(schema).map(([name, type]) => ({ name, type })));
    return fields.filter(f => {
      const t = (f.type || '').toLowerCase();
      return t.includes('int') || t.includes('float') || t.includes('num') || t.includes('decimal') || t.includes('double') || t === 'number';
    });
  }, [activeSync]);

  const addKPI = (field, fn = 'sum') => {
    if (selectedKPIs.find(k => k.field === field && k.fn === fn)) return;
    const color = KPI_COLORS[selectedKPIs.length % KPI_COLORS.length];
    setSelectedKPIs(prev => [...prev, { field, fn, label: field, fmt: 'number', color }]);
  };

  const removeKPI = (idx) => setSelectedKPIs(prev => prev.filter((_, i) => i !== idx));

  const updateKPIFn = (idx, fn) => setSelectedKPIs(prev => prev.map((k, i) => i === idx ? { ...k, fn } : k));

  // ── affiliate conversion fetch ───────────────────────────────────────────
  const fetchByAffiliate = async () => {
    if (!dataSource) return [];
    const res = await base44.functions.invoke('fetchWidgetData', {
      data_source: dataSource,
      query_config: { group_by: 'source', aggregations: AFFILIATE_AGGS, columns: [], filters: [] },
      date_range: dateRange,
      custom_filters: [],
    });
    const rows = (res.data || []).map(r => ({
      ...r,
      conv_rate: r.Total_Leads > 0 ? (r.Sold_Leads / r.Total_Leads) * 100 : 0,
    }));
    return rows.sort((a, b) => b.Revenue - a.Revenue);
  };

  const { data: affiliateData = [], isFetching: loadingAffiliate } = useQuery({
    queryKey: ['perf-affiliate', dateRange, dataSource],
    queryFn: fetchByAffiliate,
    enabled: !!dataSource,
    initialData: [],
  });

  // ── daily grouped fetch (for sparklines + table) ──────────────────────────
  const fetchDaily = async (range) => {
    if (!dataSource) return [];
    const res = await base44.functions.invoke('fetchWidgetData', {
      data_source: dataSource,
      query_config: { group_by: 'date', aggregations: AGGS, columns: [], filters: [] },
      date_range: range,
      custom_filters: [],
    });
    return (res.data || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const { data: dailyData = [], isFetching: loadingCurr, refetch } = useQuery({
    queryKey: ['perf-daily-curr', dateRange, dataSource],
    queryFn: () => fetchDaily(dateRange),
    enabled: !!dataSource,
    initialData: [],
  });

  const { data: priorData = [] } = useQuery({
    queryKey: ['perf-daily-prior', priorRange, dataSource],
    queryFn: () => fetchDaily(priorRange),
    enabled: !!dataSource,
    initialData: [],
  });

  // ── MTD totals (dynamic based on selectedKPIs) ───────────────────────────
  const totals = useMemo(() => {
    const t = {};
    selectedKPIs.forEach(k => {
      const alias = k.label.replace(/ /g,'_');
      t[alias] = k.fn === 'avg' ? avg(dailyData, alias) : sum(dailyData, alias);
    });
    return t;
  }, [dailyData, selectedKPIs]);

  const priorTotals = useMemo(() => {
    const t = {};
    selectedKPIs.forEach(k => {
      const alias = k.label.replace(/ /g,'_');
      t[alias] = k.fn === 'avg' ? avg(priorData, alias) : sum(priorData, alias);
    });
    return t;
  }, [priorData, selectedKPIs]);

  // ── KPI cards config (dynamic) ──────────────────────────────────────────
  const kpis = selectedKPIs.map(k => ({
    label: k.label,
    key: k.label.replace(/ /g,'_'),
    sparkField: k.label.replace(/ /g,'_'),
    displayFmt: k.fmt,
    color: k.color,
  }));

  // ── daily table columns ───────────────────────────────────────────────────
  const TABLE_COLS = [
    { key: 'date',        label: 'Date',        fmt: 'date' },
    { key: 'Total',       label: 'Total',       fmt: 'integer' },
    { key: 'Sold',        label: 'Sold',        fmt: 'integer' },
    { key: 'Unsold',      label: 'Unsold',      fmt: 'integer' },
    { key: 'Returns',     label: 'Returns',     fmt: 'integer' },
    { key: 'DQ',          label: 'DQ',          fmt: 'integer' },
    { key: 'Revenue',     label: 'Revenue',     fmt: 'currency' },
    { key: 'Cost',        label: 'Cost',        fmt: 'currency' },
    { key: 'CPL',         label: 'CPL',         fmt: 'currency' },
    { key: 'Net_Profit',  label: 'Net Profit',  fmt: 'currency' },
    { key: 'Profit',      label: 'Profit',      fmt: 'currency' },
  ];

  // Grand total row
  const grandTotal = useMemo(() => {
    if (!dailyData.length) return null;
    const row = { date: 'Grand Total' };
    TABLE_COLS.slice(1).forEach(col => {
      if (col.fmt === 'currency' || col.fmt === 'integer') {
        row[col.key] = col.key === 'CPL' ? avg(dailyData, col.key) : sum(dailyData, col.key);
      }
    });
    return row;
  }, [dailyData]);

  const formatCell = (val, type, key) => {
    if (type === 'date') return fmtDate(val);
    if (val === null || val === undefined) return '—';
    if (type === 'currency') return fmt.currency(val);
    if (type === 'integer') return fmt.integer(val);
    if (type === 'percent') return fmt.percent(val);
    return val;
  };

  const isNegative = (val, type) => (type === 'currency' || type === 'integer') && Number(val) < 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Performance Overview</h1>
          <p className="text-gray-400 text-sm">MTD analytics from your data source</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {presets.map(p => (
            <button
              key={p.label}
              onClick={() => setDateRange({ start: p.start, end: p.end })}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-all ${
                dateRange.start === p.start && dateRange.end === p.end
                  ? 'bg-[#00d4ff]/20 border-[#00d4ff]/50 text-[#00d4ff]'
                  : 'border-white/10 text-gray-400 hover:text-white hover:border-white/30'
              }`}
            >
              {p.label}
            </button>
          ))}
          <Button variant="outline" onClick={() => refetch()} className="glass-card border-white/10 text-white h-8 px-3">
            <RefreshCw className={`w-3 h-3 mr-1.5 ${loadingCurr ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {!dataSource && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-400 text-sm">
          No data source configured. Go to Data Sync to connect your Cloud Run API.
        </div>
      )}

      {/* KPI Row */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">KPI Metrics</p>
        <button onClick={() => setShowPicker(p => !p)} className="flex items-center gap-1 px-2 py-1 text-xs border border-white/10 rounded text-gray-400 hover:text-white hover:border-white/30 transition-all">
          <Settings2 className="w-3 h-3" /> Configure
        </button>
      </div>

      {/* Metric Picker */}
      {showPicker && (
        <div className="glass-card border border-white/10 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-white uppercase tracking-wider">Select Metrics from Source</p>
          {sourceFields.length === 0 ? (
            <p className="text-gray-500 text-xs">No schema detected yet. Fetch schema in Data Sync settings first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sourceFields.map(f => {
                const alreadyAdded = selectedKPIs.find(k => k.field === f.name);
                return (
                  <button
                    key={f.name}
                    onClick={() => alreadyAdded ? null : addKPI(f.name)}
                    disabled={!!alreadyAdded}
                    className={`px-2.5 py-1 text-xs rounded border font-medium transition-all ${
                      alreadyAdded
                        ? 'border-[#00d4ff]/40 bg-[#00d4ff]/10 text-[#00d4ff] cursor-default'
                        : 'border-white/10 text-gray-400 hover:text-white hover:border-white/30 cursor-pointer'
                    }`}
                  >
                    {alreadyAdded ? '✓ ' : '+ '}{f.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="border-t border-white/10 pt-3">
            <p className="text-xs text-gray-500 mb-2">Active KPIs</p>
            <div className="flex flex-wrap gap-2">
              {selectedKPIs.map((k, idx) => (
                <div key={idx} className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 bg-white/5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: k.color }} />
                  <span className="text-xs text-white">{k.label}</span>
                  <select
                    value={k.fn}
                    onChange={e => updateKPIFn(idx, e.target.value)}
                    className="text-xs bg-transparent text-gray-400 border-none outline-none cursor-pointer ml-1"
                  >
                    <option value="sum">SUM</option>
                    <option value="avg">AVG</option>
                    <option value="COUNT">COUNT</option>
                  </select>
                  <button onClick={() => removeKPI(idx)} className="text-gray-600 hover:text-red-400 ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(kpi => (
          <KPISparkCard
            key={kpi.key}
            label={kpi.label}
            value={totals[kpi.key]}
            displayFmt={kpi.displayFmt}
            prevValue={priorTotals[kpi.key]}
            sparkData={[...dailyData].reverse()}
            sparkField={kpi.sparkField}
            color={kpi.color}
          />
        ))}
      </div>

      {/* Affiliate Conversion Rate Table */}
      <div className="glass-card border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[#a855f7] text-xs font-bold uppercase tracking-wider">Affiliate</span>
            <span className="text-white text-xs font-bold uppercase tracking-wider">Conversion Rates by Source</span>
          </div>
          {loadingAffiliate && <RefreshCw className="w-3 h-3 text-gray-500 animate-spin" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {[{l:'Source',a:'left'},{l:'Total Leads',a:'right'},{l:'Sold',a:'right'},{l:'Conv. Rate',a:'right'},{l:'Revenue',a:'right'},{l:'Cost',a:'right'},{l:'CPL',a:'right'}].map(col => (
                  <th key={col.l} className={`px-3 py-2 text-xs font-bold text-gray-300 uppercase tracking-wide whitespace-nowrap text-${col.a}`}>{col.l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingAffiliate ? (
                Array.from({length: 5}).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {Array.from({length: 7}).map((_, j) => <td key={j} className="px-3 py-2"><div className="h-4 bg-white/5 rounded animate-pulse" /></td>)}
                  </tr>
                ))
              ) : affiliateData.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">No data for this period</td></tr>
              ) : (
                affiliateData.map((row, idx) => (
                  <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-3 py-2 text-white font-medium">{row.source || '—'}</td>
                    <td className="px-3 py-2 text-right text-white">{fmt.integer(row.Total_Leads)}</td>
                    <td className="px-3 py-2 text-right text-white">{fmt.integer(row.Sold_Leads)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-bold ${
                        row.conv_rate >= 20 ? 'text-green-400' :
                        row.conv_rate >= 10 ? 'text-yellow-400' : 'text-red-400'
                      }`}>{fmt.percent(row.conv_rate)}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-white">{fmt.currency(row.Revenue)}</td>
                    <td className="px-3 py-2 text-right text-white">{fmt.currency(row.Cost)}</td>
                    <td className="px-3 py-2 text-right text-white">{fmt.currency(row.CPL)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily table + MTD panel */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">

        {/* Daily breakdown table — 3/4 width */}
        <div className="xl:col-span-3 glass-card border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[#00d4ff] text-xs font-bold uppercase tracking-wider">Daily</span>
              <span className="text-white text-xs font-bold uppercase tracking-wider">Metrics</span>
            </div>
            {loadingCurr && <RefreshCw className="w-3 h-3 text-gray-500 animate-spin" />}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  {TABLE_COLS.map(col => (
                    <th key={col.key} className={`px-3 py-2 text-xs font-bold text-gray-300 uppercase tracking-wide whitespace-nowrap ${col.fmt !== 'date' ? 'text-right' : 'text-left'}`}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingCurr ? (
                  Array.from({length: 5}).map((_, i) => (
                    <tr key={i} className="border-b border-white/5">
                      {TABLE_COLS.map(col => (
                        <td key={col.key} className="px-3 py-2">
                          <div className="h-4 bg-white/5 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : dailyData.length === 0 ? (
                  <tr><td colSpan={TABLE_COLS.length} className="px-4 py-8 text-center text-gray-500 text-sm">No data for this period</td></tr>
                ) : (
                  dailyData.map((row, idx) => (
                    <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      {TABLE_COLS.map(col => {
                        const val = row[col.key];
                        const neg = isNegative(val, col.fmt);
                        return (
                          <td key={col.key} className={`px-3 py-2 whitespace-nowrap ${col.fmt !== 'date' ? 'text-right' : 'text-left'} ${neg ? 'text-red-400' : 'text-white'}`}>
                            {formatCell(val, col.fmt, col.key)}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
                {grandTotal && (
                  <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                    {TABLE_COLS.map(col => {
                      const val = grandTotal[col.key];
                      const neg = isNegative(val, col.fmt);
                      return (
                        <td key={col.key} className={`px-3 py-2 whitespace-nowrap text-xs font-bold ${col.fmt !== 'date' ? 'text-right' : 'text-left'} ${neg ? 'text-red-400' : 'text-gray-300'}`}>
                          {formatCell(val, col.fmt, col.key)}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MTD Performance panel — 1/4 width */}
        <div className="glass-card border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-[#ec4899] text-xs font-bold uppercase tracking-wider">MTD</span>
              <span className="text-white text-xs font-bold uppercase tracking-wider">Performance</span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {[
              { label: 'Revenue',    value: totals.Revenue,    prev: priorTotals.Revenue,    f: 'currency' },
              { label: 'Net Revenue',value: totals.Net_Revenue, prev: priorTotals.Net_Revenue,f: 'currency' },
              { label: 'Cost',       value: totals.Cost,       prev: priorTotals.Cost,       f: 'currency' },
              { label: 'CPL',        value: totals.CPL,        prev: priorTotals.CPL,        f: 'currency' },
              { label: 'Profit',     value: totals.Profit,     prev: priorTotals.Profit,     f: 'currency' },
              { label: 'Net Profit', value: totals.Net_Profit, prev: priorTotals.Net_Profit, f: 'currency' },
            ].map(item => {
              const d = delta(item.value, item.prev);
              const up = d >= 0;
              return (
                <div key={item.label} className="flex items-center justify-between gap-2">
                  <span className="text-gray-400 text-xs truncate">{item.label}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-bold ${Number(item.value) < 0 ? 'text-red-400' : 'text-white'}`}>
                      {fmt[item.f](item.value)}
                    </span>
                    {d !== null && (
                      <span className={`text-[10px] font-medium ${up ? 'text-green-400' : 'text-red-400'}`}>
                        {up ? '↑' : '↓'}{Math.abs(d).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
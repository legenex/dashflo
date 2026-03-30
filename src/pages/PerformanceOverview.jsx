import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths, subDays } from "date-fns";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveContainer, LineChart, Line, Tooltip, YAxis } from "recharts";

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
              <Line type="monotone" dataKey={sparkField} stroke={sparkColor} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function PerformanceOverview() {
  const today = new Date();
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(today), 'yyyy-MM-dd'),
    end:   format(endOfMonth(today),   'yyyy-MM-dd'),
  });

  const presets = [
    { label: 'This Month',   start: format(startOfMonth(today), 'yyyy-MM-dd'),              end: format(endOfMonth(today), 'yyyy-MM-dd') },
    { label: 'Last Month',   start: format(startOfMonth(subMonths(today,1)), 'yyyy-MM-dd'),  end: format(endOfMonth(subMonths(today,1)), 'yyyy-MM-dd') },
    { label: 'Last 7 Days',  start: format(subDays(today,6), 'yyyy-MM-dd'),                 end: format(today, 'yyyy-MM-dd') },
    { label: 'Last 30 Days', start: format(subDays(today,29), 'yyyy-MM-dd'),                end: format(today, 'yyyy-MM-dd') },
  ];

  const priorRange = useMemo(() => {
    const s = new Date(dateRange.start);
    const e = new Date(dateRange.end);
    const days = Math.max(1, Math.round((e - s) / 86400000) + 1);
    const pe = new Date(s); pe.setDate(pe.getDate() - 1);
    const ps = new Date(pe); ps.setDate(ps.getDate() - days + 1);
    return { start: format(ps, 'yyyy-MM-dd'), end: format(pe, 'yyyy-MM-dd') };
  }, [dateRange]);

  const AGGS = [
    { function: 'sum', field: 'Revenue',     alias: 'Revenue' },
    { function: 'sum', field: 'Net_Revenue',  alias: 'Net_Revenue' },
    { function: 'sum', field: 'Payout',      alias: 'Cost' },
    { function: 'avg', field: 'CPL',         alias: 'CPL' },
    { function: 'sum', field: 'Profit',      alias: 'Profit' },
    { function: 'sum', field: 'Net_Profit',  alias: 'Net_Profit' },
    { function: 'sum', field: 'Total',       alias: 'Total' },
    { function: 'sum', field: 'Sold',        alias: 'Sold' },
    { function: 'sum', field: 'Unsold',      alias: 'Unsold' },
    { function: 'sum', field: 'Returns',     alias: 'Returns' },
    { function: 'sum', field: 'DQ',          alias: 'DQ' },
  ];

  const { data: syncConfigs = [] } = useQuery({
    queryKey: ['sync-configs'],
    queryFn: () => base44.entities.SyncConfiguration.list(),
    initialData: [],
  });

  const activeSync = useMemo(() => (
    syncConfigs.find(s => s.sync_type === 'cloud_run' && s.enabled) ||
    syncConfigs.find(s => s.enabled) ||
    syncConfigs[0] || null
  ), [syncConfigs]);

  const dataSource = activeSync?.local_table_name || activeSync?.name || null;

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

  const totals = useMemo(() => ({
    Revenue:     sum(dailyData, 'Revenue'),
    Net_Revenue: sum(dailyData, 'Net_Revenue'),
    Cost:        sum(dailyData, 'Cost'),
    CPL:         avg(dailyData, 'CPL'),
    Profit:      sum(dailyData, 'Profit'),
    Net_Profit:  sum(dailyData, 'Net_Profit'),
  }), [dailyData]);

  const priorTotals = useMemo(() => ({
    Revenue:     sum(priorData, 'Revenue'),
    Net_Revenue: sum(priorData, 'Net_Revenue'),
    Cost:        sum(priorData, 'Cost'),
    CPL:         avg(priorData, 'CPL'),
    Profit:      sum(priorData, 'Profit'),
    Net_Profit:  sum(priorData, 'Net_Profit'),
  }), [priorData]);

  const kpis = [
    { label: 'Revenue',     key: 'Revenue',     sparkField: 'Revenue',     displayFmt: 'currency', color: '#00d4ff' },
    { label: 'Net Revenue', key: 'Net_Revenue',  sparkField: 'Net_Revenue', displayFmt: 'currency', color: '#a855f7' },
    { label: 'Cost',        key: 'Cost',         sparkField: 'Cost',        displayFmt: 'currency', color: '#f97316' },
    { label: 'CPL',         key: 'CPL',          sparkField: 'CPL',         displayFmt: 'currency', color: '#eab308' },
    { label: 'Profit',      key: 'Profit',       sparkField: 'Profit',      displayFmt: 'currency', color: '#22c55e' },
    { label: 'Net Profit',  key: 'Net_Profit',   sparkField: 'Net_Profit',  displayFmt: 'currency', color: '#ec4899' },
  ];

  const TABLE_COLS = [
    { key: 'date',       label: 'Date',       fmt: 'date' },
    { key: 'Total',      label: 'Total',      fmt: 'integer' },
    { key: 'Sold',       label: 'Sold',       fmt: 'integer' },
    { key: 'Unsold',     label: 'Unsold',     fmt: 'integer' },
    { key: 'Returns',    label: 'Returns',    fmt: 'integer' },
    { key: 'DQ',         label: 'DQ',         fmt: 'integer' },
    { key: 'Revenue',    label: 'Revenue',    fmt: 'currency' },
    { key: 'Cost',       label: 'Cost',       fmt: 'currency' },
    { key: 'CPL',        label: 'CPL',        fmt: 'currency' },
    { key: 'Net_Profit', label: 'Net Profit', fmt: 'currency' },
    { key: 'Profit',     label: 'Profit',     fmt: 'currency' },
  ];

  const grandTotal = useMemo(() => {
    if (!dailyData.length) return null;
    const row = { date: 'Grand Total' };
    TABLE_COLS.slice(1).forEach(col => {
      row[col.key] = col.key === 'CPL' ? avg(dailyData, col.key) : sum(dailyData, col.key);
    });
    return row;
  }, [dailyData]);

  const formatCell = (val, type) => {
    if (type === 'date') return fmtDate(val);
    if (val === null || val === undefined) return '—';
    if (type === 'currency') return fmt.currency(val);
    if (type === 'integer') return fmt.integer(val);
    return val;
  };

  const mtdItems = [
    { label: 'Revenue',     value: totals.Revenue,    prev: priorTotals.Revenue,    f: 'currency' },
    { label: 'Net Revenue', value: totals.Net_Revenue, prev: priorTotals.Net_Revenue, f: 'currency' },
    { label: 'Cost',        value: totals.Cost,        prev: priorTotals.Cost,        f: 'currency' },
    { label: 'CPL',         value: totals.CPL,         prev: priorTotals.CPL,         f: 'currency' },
    { label: 'Profit',      value: totals.Profit,      prev: priorTotals.Profit,      f: 'currency' },
    { label: 'Net Profit',  value: totals.Net_Profit,  prev: priorTotals.Net_Profit,  f: 'currency' },
  ];

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

      {/* Daily table + MTD panel */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Daily table — 3/4 */}
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
                        const neg = (col.fmt === 'currency' || col.fmt === 'integer') && Number(val) < 0;
                        return (
                          <td key={col.key} className={`px-3 py-2 whitespace-nowrap ${col.fmt !== 'date' ? 'text-right' : 'text-left'} ${neg ? 'text-red-400' : 'text-white'}`}>
                            {formatCell(val, col.fmt)}
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
                      const neg = (col.fmt === 'currency' || col.fmt === 'integer') && Number(val) < 0;
                      return (
                        <td key={col.key} className={`px-3 py-2 whitespace-nowrap text-xs font-bold ${col.fmt !== 'date' ? 'text-right' : 'text-left'} ${neg ? 'text-red-400' : 'text-gray-300'}`}>
                          {formatCell(val, col.fmt)}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MTD panel — 1/4 */}
        <div className="glass-card border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-[#ec4899] text-xs font-bold uppercase tracking-wider">MTD</span>
              <span className="text-white text-xs font-bold uppercase tracking-wider">Performance</span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {mtdItems.map(item => {
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
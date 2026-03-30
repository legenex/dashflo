import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths, subDays } from "date-fns";
import { TrendingUp, TrendingDown, RefreshCw, Settings, X, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveContainer, LineChart, Line, Tooltip, YAxis } from "recharts";

// ─── format helpers ───────────────────────────────────────────────────────────
const FMTS = {
  currency: v => v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  integer:  v => v == null ? '—' : Math.round(Number(v)).toLocaleString(),
  percent:  v => v == null ? '—' : Number(v).toFixed(2) + '%',
  number:   v => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }),
};
const fv = (val, fmt) => FMTS[fmt]?.(val) ?? (val == null ? '—' : String(val));
const fmtDate = iso => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const sumField = (rows, f) => rows.reduce((s, r) => s + (Number(r[f]) || 0), 0);
const avgField = (rows, f) => rows.length ? sumField(rows, f) / rows.length : 0;
const delta = (c, p) => (!p || p === 0) ? null : ((c - p) / Math.abs(p)) * 100;

const SPARK_COLORS = ['#00d4ff','#a855f7','#f97316','#eab308','#22c55e','#ec4899','#3b82f6','#ef4444','#14b8a6','#f43f5e'];

// ─── KPI Spark Card ───────────────────────────────────────────────────────────
function KPISparkCard({ metric, value, prevValue, sparkData, color, editMode, onRemove }) {
  const d = delta(value, prevValue);
  const up = d !== null && d >= 0;
  return (
    <div className={`glass-card border rounded-xl p-4 flex flex-col gap-1 min-w-0 relative group transition-all ${editMode ? 'border-[#00d4ff]/40' : 'border-white/10'}`}>
      {editMode && (
        <button onClick={onRemove} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <X className="w-3 h-3" />
        </button>
      )}
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider truncate pr-6">{metric?.name || '—'}</p>
      <p className="text-2xl font-bold text-white">{fv(value, metric?.format || 'number')}</p>
      {d !== null && (
        <div className={`flex items-center gap-1 text-xs font-medium ${up ? 'text-green-400' : 'text-red-400'}`}>
          {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {Math.abs(d).toFixed(1)}%
          <span className="text-gray-500 font-normal ml-1">vs prior</span>
        </div>
      )}
      {sparkData?.length > 1 && metric?.field_id && (
        <div className="mt-2 h-14">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <YAxis hide domain={['auto','auto']} />
              <Tooltip
                contentStyle={{ background:'#1a1a3e', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, fontSize:11 }}
                labelFormatter={fmtDate}
                formatter={v => [fv(v, metric?.format || 'number'), metric?.name]}
              />
              <Line type="monotone" dataKey={metric.field_id} stroke={color} strokeWidth={1.5} dot={false} activeDot={{ r:3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Metric picker ────────────────────────────────────────────────────────────
function MetricPicker({ title, selectedIds, allMetrics, onChange }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{title}</p>
      <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
        {allMetrics.map(m => {
          const selected = selectedIds.includes(m.field_id);
          return (
            <button key={m.field_id}
              onClick={() => onChange(selected ? selectedIds.filter(id => id !== m.field_id) : [...selectedIds, m.field_id])}
              className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-all border ${selected ? 'bg-[#00d4ff]/15 border-[#00d4ff]/40 text-[#00d4ff]' : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'}`}>
              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected ? 'bg-[#00d4ff] border-[#00d4ff]' : 'border-white/30'}`}>
                {selected && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span className="flex-1 truncate">{m.name}</span>
              <span className="text-[10px] text-gray-600 shrink-0">{m.format}</span>
            </button>
          );
        })}
        {allMetrics.length === 0 && (
          <p className="text-xs text-gray-600 px-3 py-2">No metrics in library. Go to Metrics Library to create some.</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PerformanceOverview() {
  const queryClient = useQueryClient();
  const today = new Date();

  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(today), 'yyyy-MM-dd'),
    end:   format(endOfMonth(today),   'yyyy-MM-dd'),
  });
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState(null);
  const [draftKpis, setDraftKpis] = useState([]);
  const [draftCols, setDraftCols] = useState([]);

  useEffect(() => {
    base44.auth.me().then(u => setUserId(u?.id)).catch(() => {});
  }, []);

  const presets = [
    { label: 'This Month',   start: format(startOfMonth(today),'yyyy-MM-dd'), end: format(endOfMonth(today),'yyyy-MM-dd') },
    { label: 'Last Month',   start: format(startOfMonth(subMonths(today,1)),'yyyy-MM-dd'), end: format(endOfMonth(subMonths(today,1)),'yyyy-MM-dd') },
    { label: 'Last 7 Days',  start: format(subDays(today,6),'yyyy-MM-dd'), end: format(today,'yyyy-MM-dd') },
    { label: 'Last 30 Days', start: format(subDays(today,29),'yyyy-MM-dd'), end: format(today,'yyyy-MM-dd') },
  ];

  const priorRange = useMemo(() => {
    const s = new Date(dateRange.start), e = new Date(dateRange.end);
    const days = Math.max(1, Math.round((e - s) / 86400000) + 1);
    const pe = new Date(s); pe.setDate(pe.getDate() - 1);
    const ps = new Date(pe); ps.setDate(ps.getDate() - days + 1);
    return { start: format(ps,'yyyy-MM-dd'), end: format(pe,'yyyy-MM-dd') };
  }, [dateRange]);

  const { data: savedConfigs = [] } = useQuery({
    queryKey: ['perf-view-config'],
    queryFn: () => base44.entities.PerformanceViewConfig.list(),
    initialData: [],
  });
  const savedConfig = useMemo(() =>
    savedConfigs.find(c => c.owner_id === userId) || savedConfigs[0] || null,
    [savedConfigs, userId]
  );

  const { data: dbMetrics = [] } = useQuery({
    queryKey: ['custom-metrics-perf'],
    queryFn: () => base44.entities.CustomMetric.filter({ is_active: true }),
    initialData: [],
  });

  const activeKpiIds = useMemo(() =>
    savedConfig?.kpi_metric_ids?.length ? savedConfig.kpi_metric_ids : dbMetrics.slice(0,6).map(m => m.field_id),
    [savedConfig, dbMetrics]
  );
  const activeColIds = useMemo(() =>
    savedConfig?.table_column_ids?.length ? savedConfig.table_column_ids : dbMetrics.slice(0,8).map(m => m.field_id),
    [savedConfig, dbMetrics]
  );

  const enterEdit = () => { setDraftKpis([...activeKpiIds]); setDraftCols([...activeColIds]); setEditMode(true); };
  const cancelEdit = () => setEditMode(false);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const payload = { kpi_metric_ids: draftKpis, table_column_ids: draftCols, owner_id: userId, name: 'default' };
      if (savedConfig?.id) {
        await base44.entities.PerformanceViewConfig.update(savedConfig.id, payload);
      } else {
        await base44.entities.PerformanceViewConfig.create(payload);
      }
      queryClient.invalidateQueries(['perf-view-config']);
      setEditMode(false);
    } catch(e) { alert('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const { data: syncConfigs = [] } = useQuery({
    queryKey: ['sync-configs'],
    queryFn: () => base44.entities.SyncConfiguration.list(),
    initialData: [],
  });
  const activeSync = useMemo(() =>
    syncConfigs.find(s => s.sync_type === 'cloud_run' && s.enabled) ||
    syncConfigs.find(s => s.enabled) || syncConfigs[0] || null,
    [syncConfigs]
  );
  const dataSource = activeSync?.local_table_name || activeSync?.name || null;

  const currentKpiIds = editMode ? draftKpis : activeKpiIds;
  const currentColIds = editMode ? draftCols : activeColIds;
  const allActiveIds = useMemo(() => [...new Set([...currentKpiIds, ...currentColIds])], [currentKpiIds, currentColIds]);

  const activeMetrics = useMemo(() => dbMetrics.filter(m => allActiveIds.includes(m.field_id)), [dbMetrics, allActiveIds]);

  const aggregations = useMemo(() =>
    activeMetrics
      .filter(m => m.source_field && m.aggregation !== 'FORMULA' && m.aggregation !== 'RATIO')
      .map(m => ({ field: m.source_field, function: m.aggregation?.toLowerCase() || 'sum', alias: m.field_id })),
    [activeMetrics]
  );

  const fetchDaily = async (range) => {
    if (!dataSource || !aggregations.length) return [];
    const res = await base44.functions.invoke('fetchWidgetData', {
      data_source: dataSource,
      query_config: { group_by: 'date', aggregations, columns: [], filters: [] },
      date_range: range,
      custom_filters: [],
    });
    return (res.data || []).sort((a,b) => new Date(b.date) - new Date(a.date));
  };

  const { data: dailyData = [], isFetching: loading, refetch } = useQuery({
    queryKey: ['perf-daily', dateRange, dataSource, allActiveIds.join(',')],
    queryFn: () => fetchDaily(dateRange),
    enabled: !!dataSource && aggregations.length > 0,
    initialData: [],
  });

  const { data: priorData = [] } = useQuery({
    queryKey: ['perf-prior', priorRange, dataSource, allActiveIds.join(',')],
    queryFn: () => fetchDaily(priorRange),
    enabled: !!dataSource && aggregations.length > 0,
    initialData: [],
  });

  const totals = useMemo(() => {
    const t = {};
    activeMetrics.forEach(m => { t[m.field_id] = m.aggregation === 'AVG' ? avgField(dailyData, m.field_id) : sumField(dailyData, m.field_id); });
    return t;
  }, [dailyData, activeMetrics]);

  const priorTotals = useMemo(() => {
    const t = {};
    activeMetrics.forEach(m => { t[m.field_id] = m.aggregation === 'AVG' ? avgField(priorData, m.field_id) : sumField(priorData, m.field_id); });
    return t;
  }, [priorData, activeMetrics]);

  const kpiMetrics = useMemo(() =>
    currentKpiIds.map((id, i) => ({ metric: dbMetrics.find(m => m.field_id === id), color: SPARK_COLORS[i % SPARK_COLORS.length] })).filter(x => x.metric),
    [currentKpiIds, dbMetrics]
  );
  const tableMetrics = useMemo(() =>
    currentColIds.map(id => dbMetrics.find(m => m.field_id === id)).filter(Boolean),
    [currentColIds, dbMetrics]
  );

  const grandTotal = useMemo(() => {
    if (!dailyData.length || !tableMetrics.length) return null;
    const row = { date: 'Grand Total' };
    tableMetrics.forEach(m => { row[m.field_id] = m.aggregation === 'AVG' ? avgField(dailyData, m.field_id) : sumField(dailyData, m.field_id); });
    return row;
  }, [dailyData, tableMetrics]);

  const sparkData = useMemo(() => [...dailyData].reverse(), [dailyData]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Performance Overview</h1>
          <p className="text-gray-400 text-sm">{dataSource ? `Source: ${activeSync?.name}` : 'No data source connected'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {presets.map(p => (
            <button key={p.label} onClick={() => setDateRange({ start: p.start, end: p.end })}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-all ${dateRange.start === p.start && dateRange.end === p.end ? 'bg-[#00d4ff]/20 border-[#00d4ff]/50 text-[#00d4ff]' : 'border-white/10 text-gray-400 hover:text-white'}`}>
              {p.label}
            </button>
          ))}
          <Button variant="outline" onClick={() => refetch()} className="glass-card border-white/10 text-white h-8 px-3">
            <RefreshCw className={`w-3 h-3 mr-1.5 ${loading ? 'animate-spin' : ''}`} />Refresh
          </Button>
          {!editMode ? (
            <Button onClick={enterEdit} className="bg-[#00d4ff]/20 border border-[#00d4ff]/40 text-[#00d4ff] h-8 px-3 text-xs hover:bg-[#00d4ff]/30">
              <Settings className="w-3 h-3 mr-1.5" />Edit Layout
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button onClick={cancelEdit} variant="outline" className="glass-card border-white/10 text-white h-8 px-3 text-xs">Cancel</Button>
              <Button onClick={saveConfig} disabled={saving} className="bg-[#00d4ff] text-white h-8 px-3 text-xs">
                {saving ? 'Saving…' : '✓ Save Layout'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Edit config panel */}
      {editMode && (
        <div className="glass-card border border-[#00d4ff]/30 rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          <MetricPicker title="KPI Cards (top row)" selectedIds={draftKpis} allMetrics={dbMetrics} onChange={setDraftKpis} />
          <MetricPicker title="Table Columns" selectedIds={draftCols} allMetrics={dbMetrics} onChange={setDraftCols} />
        </div>
      )}

      {!dataSource && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-400 text-sm">
          No data source configured. Go to Data Sync to connect your Cloud Run API.
        </div>
      )}
      {dbMetrics.length === 0 && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 text-blue-400 text-sm">
          No metrics defined yet. Go to <strong>Metrics Library</strong> to create metrics, then click Edit Layout to add them here.
        </div>
      )}

      {/* KPI Row */}
      {kpiMetrics.length > 0 && (
        <div className={`grid gap-4 ${kpiMetrics.length <= 3 ? 'grid-cols-1 md:grid-cols-3' : kpiMetrics.length <= 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'}`}>
          {kpiMetrics.map(({ metric, color }) => (
            <KPISparkCard key={metric.field_id} metric={metric} value={totals[metric.field_id]} prevValue={priorTotals[metric.field_id]}
              sparkData={sparkData} color={color} editMode={editMode}
              onRemove={() => setDraftKpis(draftKpis.filter(id => id !== metric.field_id))} />
          ))}
          {editMode && (
            <div className="glass-card border-2 border-dashed border-white/20 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-gray-600 min-h-[120px]">
              <Plus className="w-6 h-6" />
              <span className="text-xs text-center">Select metrics above</span>
            </div>
          )}
        </div>
      )}

      {/* Table + MTD */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className={`glass-card border border-white/10 rounded-xl overflow-hidden ${kpiMetrics.length > 0 ? 'xl:col-span-3' : 'xl:col-span-4'}`}>
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[#00d4ff] text-xs font-bold uppercase tracking-wider">Daily</span>
              <span className="text-white text-xs font-bold uppercase tracking-wider">Breakdown</span>
              {dailyData.length > 0 && <span className="text-gray-600 text-xs">({dailyData.length} days)</span>}
            </div>
            {loading && <RefreshCw className="w-3 h-3 text-gray-500 animate-spin" />}
          </div>

          {tableMetrics.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              {editMode ? 'Select table columns above.' : 'No columns configured. Click Edit Layout to add table columns.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="px-3 py-2 text-xs font-bold text-gray-300 uppercase tracking-wide text-left whitespace-nowrap">Date</th>
                    {tableMetrics.map(m => (
                      <th key={m.field_id} className="px-3 py-2 text-xs font-bold text-gray-300 uppercase tracking-wide text-right whitespace-nowrap">{m.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? Array.from({length:5}).map((_,i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="px-3 py-2"><div className="h-4 bg-white/5 rounded animate-pulse w-24" /></td>
                      {tableMetrics.map(m => <td key={m.field_id} className="px-3 py-2"><div className="h-4 bg-white/5 rounded animate-pulse" /></td>)}
                    </tr>
                  )) : dailyData.length === 0 ? (
                    <tr><td colSpan={tableMetrics.length + 1} className="px-4 py-8 text-center text-gray-500">No data for this period</td></tr>
                  ) : dailyData.map((row, idx) => (
                    <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-3 py-2 text-white whitespace-nowrap">{fmtDate(row.date)}</td>
                      {tableMetrics.map(m => {
                        const val = row[m.field_id];
                        return (
                          <td key={m.field_id} className={`px-3 py-2 text-right whitespace-nowrap ${typeof val === 'number' && val < 0 ? 'text-red-400' : 'text-white'}`}>
                            {fv(val, m.format || 'number')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {grandTotal && !loading && (
                    <tr className="border-t-2 border-white/20 bg-white/5">
                      <td className="px-3 py-2 text-xs font-bold text-gray-300">Grand Total</td>
                      {tableMetrics.map(m => {
                        const val = grandTotal[m.field_id];
                        return (
                          <td key={m.field_id} className={`px-3 py-2 text-right text-xs font-bold whitespace-nowrap ${typeof val === 'number' && val < 0 ? 'text-red-400' : 'text-gray-300'}`}>
                            {fv(val, m.format || 'number')}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {kpiMetrics.length > 0 && (
          <div className="glass-card border border-white/10 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-[#ec4899] text-xs font-bold uppercase tracking-wider">MTD</span>
                <span className="text-white text-xs font-bold uppercase tracking-wider">Performance</span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {kpiMetrics.map(({ metric }) => {
                const val = totals[metric.field_id];
                const prev = priorTotals[metric.field_id];
                const d = delta(val, prev);
                const up = d !== null && d >= 0;
                return (
                  <div key={metric.field_id} className="flex items-center justify-between gap-2">
                    <span className="text-gray-400 text-xs truncate">{metric.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm font-bold ${Number(val) < 0 ? 'text-red-400' : 'text-white'}`}>{fv(val, metric.format || 'number')}</span>
                      {d !== null && (
                        <span className={`text-[10px] font-medium ${up ? 'text-green-400' : 'text-red-400'}`}>{up ? '↑' : '↓'}{Math.abs(d).toFixed(1)}%</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
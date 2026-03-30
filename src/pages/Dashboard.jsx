import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RefreshCcw, Filter, Settings, ChevronDown, Plus, BarChart3 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { format, subDays, startOfMonth, endOfMonth, startOfDay, endOfDay, subMonths } from "date-fns";

import SavedFilterBar from "../components/dashboard/SavedFilterBar";
import FilterManager from "../components/dashboard/FilterManager";
import WidgetCanvas from "../components/dashboard/WidgetCanvas";
import AddWidgetDrawer from "../components/dashboard/AddWidgetDrawer";
import WidgetConfigDrawer from "../components/dashboard/WidgetConfigDrawer";
import ManageMetricsDrawer from "../components/dashboard/ManageMetricsDrawer";
import { buildAggregationsFromMetrics, priorRange } from "../utils/metricUtils";

// ─── System metric seeds ─────────────────────────────────────────────────────
const SYSTEM_METRICS = [
  { name:"Total Leads",  field_id:"total_leads",  source_field:"Total",        aggregation:"SUM",     format:"integer",  tier:"system", is_active:true },
  { name:"Sold",         field_id:"sold",          source_field:"Sold",         aggregation:"SUM",     format:"integer",  tier:"system", is_active:true },
  { name:"Unsold",       field_id:"unsold",        source_field:"Unsold",       aggregation:"SUM",     format:"integer",  tier:"system", is_active:true },
  { name:"Returns",      field_id:"returns",       source_field:"Returns",      aggregation:"SUM",     format:"integer",  tier:"system", is_active:true },
  { name:"DQ",           field_id:"dq",            source_field:"DQ",           aggregation:"SUM",     format:"integer",  tier:"system", is_active:true },
  { name:"Fakes",        field_id:"fakes",         source_field:"Fakes",        aggregation:"SUM",     format:"integer",  tier:"system", is_active:true },
  { name:"Cvrt",         field_id:"cvrt",          source_field:"Cvrt",         aggregation:"SUM",     format:"integer",  tier:"system", is_active:true },
  { name:"Revenue",      field_id:"revenue",       source_field:"Revenue",      aggregation:"SUM",     format:"currency", tier:"system", is_active:true },
  { name:"Net Revenue",  field_id:"net_revenue",   source_field:"Net Revenue",  aggregation:"SUM",     format:"currency", tier:"system", is_active:true },
  { name:"Cost",         field_id:"cost",          source_field:"Cost",         aggregation:"SUM",     format:"currency", tier:"system", is_active:true },
  { name:"CPL",          field_id:"cpl",           source_field:"CPL",          aggregation:"AVG",     format:"currency", tier:"system", is_active:true },
  { name:"IPL",          field_id:"ipl",           source_field:"IPL",          aggregation:"AVG",     format:"currency", tier:"system", is_active:true },
  { name:"Profit",       field_id:"profit",        source_field:"Profit",       aggregation:"SUM",     format:"currency", tier:"system", is_active:true },
  { name:"Net Profit",   field_id:"net_profit",    source_field:"Net Profit",   aggregation:"SUM",     format:"currency", tier:"system", is_active:true },
  { name:"GP Margin",    field_id:"gp_margin",     formula:"({profit} / Math.max({revenue},1))*100",   aggregation:"FORMULA", format:"percent",  tier:"system", is_active:true },
  { name:"Conv Rate",    field_id:"conv_rate",     formula:"({sold} / Math.max({total_leads},1))*100", aggregation:"FORMULA", format:"percent",  tier:"system", is_active:true },
  { name:"Return Rate",  field_id:"return_rate",   formula:"({returns} / Math.max({sold},1))*100",     aggregation:"FORMULA", format:"percent",  tier:"system", is_active:true },
  { name:"Sold Rate",    field_id:"sold_rate",     formula:"({sold} / Math.max({total_leads},1))*100", aggregation:"FORMULA", format:"percent",  tier:"system", is_active:true },
  { name:"Return %",     field_id:"return_pct",    formula:"({returns} / Math.max({total_leads},1))*100", aggregation:"FORMULA", format:"percent", tier:"system", is_active:true },
];

const DATE_PRESETS = [
  { label:"Today",       getValue: () => ({ start: format(startOfDay(new Date()),'yyyy-MM-dd'),    end: format(endOfDay(new Date()),'yyyy-MM-dd') }) },
  { label:"Yesterday",   getValue: () => ({ start: format(subDays(new Date(),1),'yyyy-MM-dd'),     end: format(subDays(new Date(),1),'yyyy-MM-dd') }) },
  { label:"Last 7 days", getValue: () => ({ start: format(subDays(new Date(),7),'yyyy-MM-dd'),     end: format(new Date(),'yyyy-MM-dd') }) },
  { label:"Last 30 days",getValue: () => ({ start: format(subDays(new Date(),30),'yyyy-MM-dd'),    end: format(new Date(),'yyyy-MM-dd') }) },
  { label:"This month",  getValue: () => ({ start: format(startOfMonth(new Date()),'yyyy-MM-dd'),  end: format(endOfMonth(new Date()),'yyyy-MM-dd') }) },
  { label:"Last month",  getValue: () => { const lm = subMonths(new Date(),1); return { start: format(startOfMonth(lm),'yyyy-MM-dd'), end: format(endOfMonth(lm),'yyyy-MM-dd') }; } },
  { label:"Custom",      getValue: null },
];

export default function Dashboard() {
  const queryClient = useQueryClient();

  // ─── Filter state ──────────────────────────────────────────────────────────
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  });
  const [selectedPreset, setSelectedPreset] = useState('This month');
  const [customFilters, setCustomFilters] = useState([]);
  const [savedFilterValues, setSavedFilterValues] = useState({});
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);

  // ─── UI state ─────────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [showManageMetrics, setShowManageMetrics] = useState(false);
  const [configWidget, setConfigWidget] = useState(null);

  // ─── Queries ───────────────────────────────────────────────────────────────
  const { data: dbMetrics = [] } = useQuery({
    queryKey: ['custom-metrics'],
    queryFn: () => base44.entities.CustomMetric.filter({ is_active: true }),
    initialData: [],
  });

  const { data: allLayouts = [] } = useQuery({
    queryKey: ['dash-layouts'],
    queryFn: () => base44.entities.DashboardLayout.list(),
    initialData: [],
  });

  const { data: allWidgets = [] } = useQuery({
    queryKey: ['dash-widgets'],
    queryFn: () => base44.entities.DashboardWidget.list('position'),
    initialData: [],
  });

  const { data: syncConfigs = [] } = useQuery({
    queryKey: ['sync-configs'],
    queryFn: () => base44.entities.SyncConfiguration.list(),
    initialData: [],
  });

  const { data: savedFilters = [] } = useQuery({
    queryKey: ['saved-filters', 'Dashboard'],
    queryFn: () => base44.entities.SavedFilter.filter({ dashboard_page: 'Dashboard', enabled: true }, 'position'),
    initialData: [],
  });

  // ─── Current user layout ───────────────────────────────────────────────────
  const [userId, setUserId] = useState(null);
  useEffect(() => { base44.auth.me().then(u => setUserId(u?.id)).catch(() => {}); }, []);

  const layout = useMemo(
    () => allLayouts.find(l => l.owner_id === userId) || allLayouts[0] || null,
    [allLayouts, userId]
  );

  // ─── Seed system metrics (once) ────────────────────────────────────────────
  useEffect(() => {
    const seed = async () => {
      if (localStorage.getItem('sys_metrics_seeded_v3')) return;
      const existing = await base44.entities.CustomMetric.filter({ tier: 'system' });
      if (existing.length === 0) {
        await base44.entities.CustomMetric.bulkCreate(SYSTEM_METRICS);
        queryClient.invalidateQueries(['custom-metrics']);
      }
      localStorage.setItem('sys_metrics_seeded_v3', '1');
    };
    seed().catch(console.error);
  }, []);

  // ─── Merged metrics (system + custom from DB) ──────────────────────────────
  const allMetrics = useMemo(() => {
    const sysIds = new Set(SYSTEM_METRICS.map(m => m.field_id));
    const extras = dbMetrics.filter(m => !sysIds.has(m.field_id));
    return [...SYSTEM_METRICS, ...extras];
  }, [dbMetrics]);

  // ─── Ordered widgets for this layout ──────────────────────────────────────
  const orderedWidgets = useMemo(() => {
    if (!layout?.widget_ids?.length) return [];
    return layout.widget_ids.map(id => allWidgets.find(w => w.id === id)).filter(Boolean);
  }, [layout, allWidgets]);

  // ─── Active data source ────────────────────────────────────────────────────
  const activeDataSource = useMemo(() => {
    const s = syncConfigs.find(c => c.detected_schema && c.enabled) || syncConfigs[0];
    return s?.local_table_name || s?.name;
  }, [syncConfigs]);

  // ─── Global daily data fetch (for metric cards / stat bars) ───────────────
  const aggregations = useMemo(() => buildAggregationsFromMetrics(allMetrics), [allMetrics]);
  const prior = useMemo(() => priorRange(dateRange), [dateRange]);

  const fetchDaily = async (range) => {
    if (!activeDataSource) return [];
    const res = await base44.functions.invoke('fetchWidgetData', {
      data_source: activeDataSource,
      query_config: { group_by: 'date', aggregations, columns: [], filters: customFilters || [] },
      date_range: range,
      custom_filters: customFilters || [],
    });
    return res.data || [];
  };

  const { data: currentDailyData = [] } = useQuery({
    queryKey: ['daily-curr', dateRange, customFilters, activeDataSource],
    queryFn: () => fetchDaily(dateRange),
    enabled: !!activeDataSource,
    initialData: [],
  });

  const { data: priorDailyData = [] } = useQuery({
    queryKey: ['daily-prior', prior, customFilters, activeDataSource],
    queryFn: () => fetchDaily(prior),
    enabled: !!activeDataSource,
    initialData: [],
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handlePresetChange = (preset) => {
    setSelectedPreset(preset.label);
    if (preset.getValue) setDateRange(preset.getValue());
  };

  const handleSavedFilterChange = (field, value, operator) => {
    setSavedFilterValues(v => ({ ...v, [field]: value }));
    setCustomFilters(prev => {
      const idx = prev.findIndex(f => f.field === field);
      if (!value) return prev.filter((_, i) => i !== idx);
      const entry = { field, value, operator };
      if (idx >= 0) { const n = [...prev]; n[idx] = entry; return n; }
      return [...prev, entry];
    });
  };

  const handleFilterReorder = (reordered) => {
    Promise.all(reordered.map(f => base44.entities.SavedFilter.update(f.id, { position: f.position })))
      .then(() => queryClient.invalidateQueries(['saved-filters']));
  };

  const handleDragEnd = async (result) => {
    if (!result.destination || !layout) return;
    const ids = [...(layout.widget_ids || [])];
    const [moved] = ids.splice(result.source.index, 1);
    ids.splice(result.destination.index, 0, moved);
    await base44.entities.DashboardLayout.update(layout.id, { widget_ids: ids });
    queryClient.invalidateQueries(['dash-layouts']);
  };

  const handleAddWidgets = async (newWidgetIds) => {
    let lid = layout?.id;
    const currentIds = layout?.widget_ids || [];
    if (!lid) {
      const created = await base44.entities.DashboardLayout.create({ name: 'Overview', owner_id: userId, widget_ids: [...currentIds, ...newWidgetIds] });
      lid = created.id;
    } else {
      await base44.entities.DashboardLayout.update(lid, { widget_ids: [...currentIds, ...newWidgetIds] });
    }
    queryClient.invalidateQueries(['dash-layouts']);
    queryClient.invalidateQueries(['dash-widgets']);
  };

  const handleRemoveWidget = async (widgetId) => {
    if (!layout || !confirm('Remove this widget from the dashboard?')) return;
    const ids = (layout.widget_ids || []).filter(id => id !== widgetId);
    await base44.entities.DashboardLayout.update(layout.id, { widget_ids: ids });
    queryClient.invalidateQueries(['dash-layouts']);
  };

  const handleWidgetUpdate = (updated) => {
    queryClient.invalidateQueries(['dash-widgets']);
  };

  const handleResetLayout = async () => {
    if (!layout || !confirm('Reset layout? All widgets will be removed from the canvas (not deleted).')) return;
    await base44.entities.DashboardLayout.update(layout.id, { widget_ids: [] });
    queryClient.invalidateQueries(['dash-layouts']);
  };

  const refetch = () => {
    queryClient.invalidateQueries(['daily-curr']);
    queryClient.invalidateQueries(['daily-prior']);
    queryClient.invalidateQueries(['tbl']);
    queryClient.invalidateQueries(['chart']);
  };

  const isEmpty = orderedWidgets.length === 0;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Dashboard Overview</h1>
          <p className="text-gray-400 text-sm">Your configurable analytics canvas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="glass-card border-white/10 text-white" onClick={refetch}>
            <RefreshCcw className="w-4 h-4 mr-2" />Refresh
          </Button>
          <Button
            onClick={() => setEditMode(e => !e)}
            variant={editMode ? "default" : "outline"}
            className={editMode ? "bg-[#00d4ff] text-white" : "glass-card border-white/10 text-white"}
          >
            <Settings className="w-4 h-4 mr-2" />{editMode ? 'Exit Edit Mode' : 'Edit Layout'}
          </Button>
        </div>
      </div>

      {/* ── Edit toolbar ── */}
      {editMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-[#00d4ff]/30 bg-[#00d4ff]/5">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setShowAddWidget(true)} className="bg-[#00d4ff] text-white h-8">
              <Plus className="w-3 h-3 mr-1.5" />Add Widget
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowManageMetrics(true)} className="glass-card border-white/10 text-white h-8">
              <Settings className="w-3 h-3 mr-1.5" />Manage Metrics
            </Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleResetLayout} className="border-red-500/30 text-red-400 hover:bg-red-500/10 h-8">
              ↺ Reset Layout
            </Button>
            <Button size="sm" onClick={() => setEditMode(false)} className="bg-emerald-600 text-white h-8">
              ✓ Done
            </Button>
          </div>
        </div>
      )}

      {/* ── Filter bar ── */}
      <Card className="glass-card border-white/10">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px] max-w-[200px]">
              <Label className="text-white text-sm">Date Range</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full glass-card border-white/10 text-white justify-between mt-1 h-9">
                    {selectedPreset}<ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="glass-card border-white/10 w-44">
                  {DATE_PRESETS.slice(0,2).map(p => <DropdownMenuItem key={p.label} onClick={() => handlePresetChange(p)} className="text-white hover:bg-white/10">{p.label}</DropdownMenuItem>)}
                  <DropdownMenuSeparator className="bg-white/10" />
                  {DATE_PRESETS.slice(2).map(p => <DropdownMenuItem key={p.label} onClick={() => p.getValue ? handlePresetChange(p) : setSelectedPreset('Custom')} className="text-white hover:bg-white/10">{p.label}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex-1 min-w-[150px]">
              <Label className="text-white text-sm">Start</Label>
              <Input type="date" value={dateRange.start} onChange={e => { setSelectedPreset('Custom'); setDateRange(d => ({ ...d, start: e.target.value })); }} className="glass-card border-white/10 text-white mt-1 h-9" />
            </div>
            <div className="flex-1 min-w-[150px]">
              <Label className="text-white text-sm">End</Label>
              <Input type="date" value={dateRange.end} onChange={e => { setSelectedPreset('Custom'); setDateRange(d => ({ ...d, end: e.target.value })); }} className="glass-card border-white/10 text-white mt-1 h-9" />
            </div>
            <Button variant="outline" onClick={() => setShowFilterBuilder(f => !f)} className="glass-card border-white/10 text-white mt-5">
              <Filter className="w-4 h-4 mr-2" />Filters
              {customFilters.length > 0 && <Badge className="ml-2 bg-[#00d4ff] text-white text-xs">{customFilters.length}</Badge>}
            </Button>
            <Button onClick={refetch} className="bg-[#00d4ff] text-white mt-5 h-9">Apply</Button>
          </div>

          {savedFilters.length > 0 && (
            <div className="border-t border-white/10 pt-4">
              <SavedFilterBar savedFilters={savedFilters} filterValues={savedFilterValues} onChange={handleSavedFilterChange} onReorder={handleFilterReorder} />
            </div>
          )}
          {showFilterBuilder && (
            <div className="border-t border-white/10 pt-4">
              <FilterManager dashboardPage="Dashboard" availableFields={[]} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Canvas ── */}
      {isEmpty ? (
        <div className={`rounded-xl border-2 border-dashed ${editMode ? 'border-[#00d4ff]/40 bg-[#00d4ff]/5' : 'border-white/10'} p-16 flex flex-col items-center justify-center text-center gap-4`}>
          <BarChart3 className="w-16 h-16 text-gray-600" />
          <h3 className="text-xl font-bold text-white">Your dashboard is empty</h3>
          <p className="text-gray-400 max-w-sm">
            {editMode
              ? 'Click "+ Add Widget" above to start building your dashboard'
              : 'Click "Edit Layout" to start adding metrics, tables, and charts'}
          </p>
          {editMode && (
            <Button onClick={() => setShowAddWidget(true)} className="bg-[#00d4ff] text-white mt-2">
              <Plus className="w-4 h-4 mr-2" />Add Your First Widget
            </Button>
          )}
        </div>
      ) : (
        <WidgetCanvas
          widgets={orderedWidgets}
          metrics={allMetrics}
          layout={layout}
          dataSource={activeDataSource}
          dateRange={dateRange}
          customFilters={customFilters}
          currentDailyData={currentDailyData}
          priorDailyData={priorDailyData}
          editMode={editMode}
          onDragEnd={handleDragEnd}
          onEditWidget={setConfigWidget}
          onRemoveWidget={handleRemoveWidget}
        />
      )}

      {/* ── Drawers & Modals ── */}
      <AddWidgetDrawer
        open={showAddWidget}
        onClose={() => setShowAddWidget(false)}
        allMetrics={allMetrics}
        onAdd={handleAddWidgets}
      />

      <WidgetConfigDrawer
        open={!!configWidget}
        onClose={() => setConfigWidget(null)}
        widget={configWidget}
        allMetrics={allMetrics}
        onUpdate={handleWidgetUpdate}
      />

      <ManageMetricsDrawer
        open={showManageMetrics}
        onClose={() => setShowManageMetrics(false)}
        allMetrics={allMetrics}
        onRefresh={() => queryClient.invalidateQueries(['custom-metrics'])}
      />
    </div>
  );
}
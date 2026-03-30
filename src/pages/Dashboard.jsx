import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Filter, RefreshCcw, Settings, ChevronDown } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, startOfDay, endOfDay, subMonths } from "date-fns";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import SavedFilterBar from "../components/dashboard/SavedFilterBar";
import FilterManager from "../components/dashboard/FilterManager";
import SummaryStatBar from "../components/dashboard/SummaryStatBar";
import KPITrendCard from "../components/dashboard/KPITrendCard";
import DashboardDataTable from "../components/dashboard/DashboardDataTable";
import DashboardEditToolbar from "../components/dashboard/DashboardEditToolbar";
import MetricBuilderModal from "../components/dashboard/MetricBuilderModal";
import TableBuilderModal from "../components/dashboard/TableBuilderModal";
import { computeAggregates, buildAggregations } from "../utils/metricUtils";

// ─── Date presets ───────────────────────────────────────────────────────────
const DATE_PRESETS = [
  { label: 'Today', getValue: () => ({ start: format(startOfDay(new Date()), 'yyyy-MM-dd'), end: format(endOfDay(new Date()), 'yyyy-MM-dd') }) },
  { label: 'Yesterday', getValue: () => ({ start: format(subDays(new Date(), 1), 'yyyy-MM-dd'), end: format(subDays(new Date(), 1), 'yyyy-MM-dd') }) },
  { label: 'Last 7 days', getValue: () => ({ start: format(subDays(new Date(), 7), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'Last 30 days', getValue: () => ({ start: format(subDays(new Date(), 30), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'This month', getValue: () => ({ start: format(startOfMonth(new Date()), 'yyyy-MM-dd'), end: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
  {
    label: 'Last month', getValue: () => {
      const lm = subMonths(new Date(), 1);
      return { start: format(startOfMonth(lm), 'yyyy-MM-dd'), end: format(endOfMonth(lm), 'yyyy-MM-dd') };
    }
  },
  { label: 'Custom', getValue: null },
];

// ─── System metric seeds ─────────────────────────────────────────────────────
const SYSTEM_METRICS = [
  { name: "Total Leads",  field_id: "total_leads",  source_field: "Total",      aggregation: "SUM",  format: "integer",  tier: "system", is_active: true },
  { name: "Sold",         field_id: "sold",          source_field: "Sold",       aggregation: "SUM",  format: "integer",  tier: "system", is_active: true },
  { name: "Unsold",       field_id: "unsold",        source_field: "Unsold",     aggregation: "SUM",  format: "integer",  tier: "system", is_active: true },
  { name: "Returns",      field_id: "returns",       source_field: "Returns",    aggregation: "SUM",  format: "integer",  tier: "system", is_active: true },
  { name: "DQ",           field_id: "dq",            source_field: "DQ",         aggregation: "SUM",  format: "integer",  tier: "system", is_active: true },
  { name: "Fakes",        field_id: "fakes",         source_field: "Fakes",      aggregation: "SUM",  format: "integer",  tier: "system", is_active: true },
  { name: "Cvrt",         field_id: "cvrt",          source_field: "Cvrt",       aggregation: "SUM",  format: "integer",  tier: "system", is_active: true },
  { name: "Revenue",      field_id: "revenue",       source_field: "Revenue",    aggregation: "SUM",  format: "currency", tier: "system", is_active: true },
  { name: "Net Revenue",  field_id: "net_revenue",   source_field: "Net Revenue",aggregation: "SUM",  format: "currency", tier: "system", is_active: true },
  { name: "Cost",         field_id: "cost",          source_field: "Cost",       aggregation: "SUM",  format: "currency", tier: "system", is_active: true },
  { name: "CPL",          field_id: "cpl",           source_field: "CPL",        aggregation: "AVG",  format: "currency", tier: "system", is_active: true },
  { name: "IPL",          field_id: "ipl",           source_field: "IPL",        aggregation: "AVG",  format: "currency", tier: "system", is_active: true },
  { name: "Profit",       field_id: "profit",        source_field: "Profit",     aggregation: "SUM",  format: "currency", tier: "system", is_active: true },
  { name: "Net Profit",   field_id: "net_profit",    source_field: "Net Profit", aggregation: "SUM",  format: "currency", tier: "system", is_active: true },
  { name: "GP Margin",    field_id: "gp_margin",     formula: "({profit} / Math.max({revenue}, 1)) * 100",     aggregation: "FORMULA", format: "percent",  tier: "system", is_active: true },
  { name: "Conv Rate",    field_id: "conv_rate",     formula: "({sold} / Math.max({total_leads}, 1)) * 100",   aggregation: "FORMULA", format: "percent",  tier: "system", is_active: true },
  { name: "Return Rate",  field_id: "return_rate",   formula: "({returns} / Math.max({sold}, 1)) * 100",       aggregation: "FORMULA", format: "percent",  tier: "system", is_active: true },
];

// ─── Default table seeds ─────────────────────────────────────────────────────
const DEFAULT_TABLES = [
  { name: "Daily Metrics", dimension_field: "date", metric_field_ids: ["total_leads","sold","unsold","return_rate","cvrt","dq","revenue","cost","cpl","ipl","net_profit","profit","gp_margin","conv_rate"], default_sort_field: "date", default_sort_direction: "desc", is_system: true, position: 0 },
  { name: "Buyers Performance", dimension_field: "Buyer", metric_field_ids: ["total_leads","sold","returns","return_rate","revenue","cost","cpl","ipl","net_profit","gp_margin","conv_rate"], default_sort_field: "revenue", default_sort_direction: "desc", is_system: true, position: 1 },
  { name: "Suppliers Performance", dimension_field: "Supplier", metric_field_ids: ["total_leads","sold","returns","revenue","ipl","cost","cpl","profit","gp_margin","conv_rate"], default_sort_field: "revenue", default_sort_direction: "desc", is_system: true, position: 2 },
  { name: "States Performance", dimension_field: "State", metric_field_ids: ["total_leads","sold","returns","revenue","ipl","cost","cpl","profit","conv_rate"], default_sort_field: "revenue", default_sort_direction: "desc", is_system: true, position: 3 },
  { name: "Buyer Feedback / Dispo", dimension_field: "Feedback", metric_field_ids: ["fakes","total_leads","revenue"], default_sort_field: "total_leads", default_sort_direction: "desc", is_system: true, position: 4 },
  { name: "Accident Date", dimension_field: "Accident SOL", metric_field_ids: ["sold","returns","cvrt","conv_rate"], default_sort_field: "sold", default_sort_direction: "desc", is_system: true, position: 5 },
  { name: "Treatment Time", dimension_field: "Treatment_Time", metric_field_ids: ["sold","returns","conv_rate"], default_sort_field: "sold", default_sort_direction: "desc", is_system: true, position: 6 },
  { name: "Phone Verification", dimension_field: "Phone Verification", metric_field_ids: ["total_leads","sold","conv_rate"], default_sort_field: "total_leads", default_sort_direction: "desc", is_system: true, position: 7 },
  { name: "UTM Source", dimension_field: "UTM Source", metric_field_ids: ["sold","cvrt","conv_rate"], default_sort_field: "sold", default_sort_direction: "desc", is_system: true, position: 8 },
];

const KPI_METRIC_IDS   = ["revenue", "net_revenue", "cost", "cpl", "profit", "net_profit"];
const STAT_BAR_IDS     = ["total_leads", "returns", "sold", "dq", "unsold", "cvrt", "fakes", "conv_rate", "gp_margin"];

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
  const [showMetricBuilder, setShowMetricBuilder] = useState(false);
  const [showTableBuilder, setShowTableBuilder] = useState(false);
  const [editingMetric, setEditingMetric] = useState(null);
  const [editingTable, setEditingTable] = useState(null);

  // ─── Queries ───────────────────────────────────────────────────────────────
  const { data: syncConfigs = [] } = useQuery({
    queryKey: ['sync-configs'],
    queryFn: () => base44.entities.SyncConfiguration.list(),
    initialData: [],
  });

  const { data: dbMetrics = [] } = useQuery({
    queryKey: ['custom-metrics'],
    queryFn: () => base44.entities.CustomMetric.filter({ is_active: true }),
    initialData: [],
  });

  const { data: dashboardTables = [] } = useQuery({
    queryKey: ['dashboard-tables'],
    queryFn: () => base44.entities.DashboardTable.list('position'),
    initialData: [],
  });

  const { data: savedFilters = [] } = useQuery({
    queryKey: ['saved-filters', 'Dashboard'],
    queryFn: () => base44.entities.SavedFilter.filter({ dashboard_page: 'Dashboard', enabled: true }, 'position'),
    initialData: [],
  });

  // ─── Seeding (runs once) ───────────────────────────────────────────────────
  useEffect(() => {
    const seed = async () => {
      if (localStorage.getItem('dashboard_seeded_v2')) return;
      const existing = await base44.entities.CustomMetric.filter({ tier: 'system' });
      if (existing.length === 0) {
        await base44.entities.CustomMetric.bulkCreate(SYSTEM_METRICS);
        queryClient.invalidateQueries(['custom-metrics']);
      }
      const existingTables = await base44.entities.DashboardTable.list();
      if (existingTables.length === 0) {
        await base44.entities.DashboardTable.bulkCreate(DEFAULT_TABLES);
        queryClient.invalidateQueries(['dashboard-tables']);
      }
      localStorage.setItem('dashboard_seeded_v2', '1');
    };
    seed().catch(console.error);
  }, []);

  // ─── Derived state ─────────────────────────────────────────────────────────
  const activeDataSource = useMemo(() => {
    const s = syncConfigs.find(c => c.detected_schema && c.enabled) || syncConfigs[0];
    return s?.local_table_name || s?.name;
  }, [syncConfigs]);

  // Merge system metrics with any extras from DB (custom metrics not in SYSTEM_METRICS)
  const allMetrics = useMemo(() => {
    const sysIds = new Set(SYSTEM_METRICS.map(m => m.field_id));
    const extras = dbMetrics.filter(m => !sysIds.has(m.field_id));
    return [...SYSTEM_METRICS, ...extras];
  }, [dbMetrics]);

  // Prior period
  const priorDateRange = useMemo(() => {
    const s = new Date(dateRange.start);
    const e = new Date(dateRange.end);
    const days = Math.round((e - s) / 86400000) + 1;
    const priorEnd = new Date(s);
    priorEnd.setDate(priorEnd.getDate() - 1);
    const priorStart = new Date(priorEnd);
    priorStart.setDate(priorStart.getDate() - days + 1);
    return { start: format(priorStart, 'yyyy-MM-dd'), end: format(priorEnd, 'yyyy-MM-dd') };
  }, [dateRange]);

  const aggregations = useMemo(() => buildAggregations(allMetrics), [allMetrics]);

  // ─── Data fetching ─────────────────────────────────────────────────────────
  const fetchDailyData = async (range) => {
    if (!activeDataSource) return [];
    const res = await base44.functions.invoke('fetchWidgetData', {
      data_source: activeDataSource,
      query_config: { group_by: 'date', aggregations, columns: [], filters: customFilters || [] },
      date_range: range,
      custom_filters: customFilters || [],
    });
    return res.data || [];
  };

  const { data: currentData = [], isLoading: currentLoading } = useQuery({
    queryKey: ['dash-current', dateRange, customFilters, activeDataSource, aggregations.length],
    queryFn: () => fetchDailyData(dateRange),
    enabled: !!activeDataSource,
    initialData: [],
  });

  const { data: priorData = [] } = useQuery({
    queryKey: ['dash-prior', priorDateRange, customFilters, activeDataSource, aggregations.length],
    queryFn: () => fetchDailyData(priorDateRange),
    enabled: !!activeDataSource,
    initialData: [],
  });

  const currentTotals = useMemo(() => computeAggregates(currentData, allMetrics), [currentData, allMetrics]);
  const priorTotals   = useMemo(() => computeAggregates(priorData, allMetrics),   [priorData, allMetrics]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handlePresetChange = (preset) => {
    setSelectedPreset(preset.label);
    if (preset.getValue) setDateRange(preset.getValue());
  };

  const handleManualDateChange = (key, value) => {
    setSelectedPreset('Custom');
    setDateRange(d => ({ ...d, [key]: value }));
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

  const refetch = () => {
    queryClient.invalidateQueries(['dash-current']);
    queryClient.invalidateQueries(['dash-prior']);
    queryClient.invalidateQueries(['table-data']);
  };

  const statBarMetrics = allMetrics.filter(m => STAT_BAR_IDS.includes(m.field_id));

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Dashboard Overview</h1>
          <p className="text-gray-400 text-sm">Monitor your lead generation performance in real-time</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="glass-card border-white/10 text-white hover:bg-white/10"
            onClick={refetch}
          >
            <RefreshCcw className="w-4 h-4 mr-2" />Refresh
          </Button>
          <Button
            onClick={() => setEditMode(e => !e)}
            className={editMode
              ? "bg-[#00d4ff] text-white hover:bg-[#00d4ff]/90"
              : "glass-card border-white/10 text-white hover:bg-white/10"}
            variant={editMode ? "default" : "outline"}
          >
            <Settings className="w-4 h-4 mr-2" />
            {editMode ? 'Exit Edit Mode' : 'Edit Layout'}
          </Button>
        </div>
      </div>

      {/* ── Edit toolbar ── */}
      {editMode && (
        <DashboardEditToolbar
          onAddMetric={() => { setEditingMetric(null); setShowMetricBuilder(true); }}
          onAddTable={() => { setEditingTable(null); setShowTableBuilder(true); }}
          onManageMetrics={() => { setEditingMetric(null); setShowMetricBuilder(true); }}
        />
      )}

      {/* ── Filter bar ── */}
      <Card className="glass-card border-white/10">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px] max-w-[200px]">
              <Label className="text-white text-sm">Date Range</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full glass-card border-white/10 text-white justify-between mt-1">
                    {selectedPreset}<ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="glass-card border-white/10 w-48">
                  {DATE_PRESETS.slice(0, 2).map(p => (
                    <DropdownMenuItem key={p.label} onClick={() => handlePresetChange(p)} className="text-white hover:bg-white/10 cursor-pointer">{p.label}</DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator className="bg-white/10" />
                  {DATE_PRESETS.slice(2).map(p => (
                    <DropdownMenuItem key={p.label} onClick={() => p.getValue ? handlePresetChange(p) : setSelectedPreset('Custom')} className="text-white hover:bg-white/10 cursor-pointer">{p.label}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex-1 min-w-[160px]">
              <Label className="text-white text-sm">Start Date</Label>
              <Input type="date" value={dateRange.start} onChange={e => handleManualDateChange('start', e.target.value)} className="glass-card border-white/10 text-white mt-1" />
            </div>
            <div className="flex-1 min-w-[160px]">
              <Label className="text-white text-sm">End Date</Label>
              <Input type="date" value={dateRange.end} onChange={e => handleManualDateChange('end', e.target.value)} className="glass-card border-white/10 text-white mt-1" />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilterBuilder(f => !f)}
              className="glass-card border-white/10 text-white mt-1"
            >
              <Filter className="w-4 h-4 mr-2" />
              {showFilterBuilder ? 'Hide Filters' : 'Filters'}
              {customFilters.length > 0 && <Badge className="ml-2 bg-[#00d4ff] text-white text-xs">{customFilters.length}</Badge>}
            </Button>
            <Button onClick={refetch} className="bg-[#00d4ff] hover:bg-[#00d4ff]/90 text-white mt-1">Apply</Button>
          </div>

          {savedFilters.length > 0 && (
            <div className="border-t border-white/10 pt-4">
              <SavedFilterBar
                savedFilters={savedFilters}
                filterValues={savedFilterValues}
                onChange={handleSavedFilterChange}
                onReorder={handleFilterReorder}
              />
            </div>
          )}

          {showFilterBuilder && (
            <div className="border-t border-white/10 pt-4">
              <FilterManager dashboardPage="Dashboard" availableFields={[]} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Summary stat bar ── */}
      <SummaryStatBar
        metrics={statBarMetrics}
        currentTotals={currentTotals}
        isLoading={currentLoading && currentData.length === 0}
      />

      {/* ── KPI trend cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {KPI_METRIC_IDS.map(field_id => {
          const metric = allMetrics.find(m => m.field_id === field_id);
          if (!metric) return null;
          return (
            <KPITrendCard
              key={field_id}
              metric={metric}
              currentValue={currentTotals[field_id]}
              priorValue={priorTotals[field_id]}
              currentDailyData={currentData}
              priorDailyData={priorData}
              isLoading={currentLoading && currentData.length === 0}
            />
          );
        })}
      </div>

      {/* ── Dashboard tables ── */}
      {dashboardTables.map(table => (
        <DashboardDataTable
          key={table.id}
          tableConfig={table}
          dataSource={activeDataSource}
          dateRange={dateRange}
          customFilters={customFilters}
          allMetrics={allMetrics}
          editMode={editMode}
          onEdit={() => { setEditingTable(table); setShowTableBuilder(true); }}
        />
      ))}

      {dashboardTables.length === 0 && !currentLoading && (
        <Card className="glass-card border-white/10">
          <CardContent className="p-8 text-center text-gray-400">
            <p className="text-sm">No tables configured. Enter edit mode and click "Add Table" to get started.</p>
          </CardContent>
        </Card>
      )}

      {/* ── Modals ── */}
      {showMetricBuilder && (
        <MetricBuilderModal
          metric={editingMetric}
          allMetrics={allMetrics}
          onClose={() => {
            setShowMetricBuilder(false);
            setEditingMetric(null);
            queryClient.invalidateQueries(['custom-metrics']);
          }}
        />
      )}
      {showTableBuilder && (
        <TableBuilderModal
          table={editingTable}
          allMetrics={allMetrics}
          syncConfigs={syncConfigs}
          onClose={() => {
            setShowTableBuilder(false);
            setEditingTable(null);
            queryClient.invalidateQueries(['dashboard-tables']);
          }}
        />
      )}
    </div>
  );
}
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";
import { TrendingUp, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Pencil, MoreVertical, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import KPIWithTrendWidget from "./KPIWithTrendWidget";
import StatsBarWidget from "./StatsBarWidget";

const COLORS = ['#00d4ff', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

export default function WidgetRenderer({ widget, dateRange, customFilters, onEdit, onDelete }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: libraryMetrics } = useQuery({
    queryKey: ['library-metrics', widget.query_config?.metric_ids],
    queryFn: async () => {
      if (!widget.query_config?.metric_ids || widget.query_config.metric_ids.length === 0) {
        return [];
      }
      const allMetrics = await base44.entities.MetricDefinition.list();
      return widget.query_config.metric_ids.map((id) => allMetrics.find((m) => m.id === id)).filter(Boolean);
    },
    enabled: !!(widget.query_config?.metric_ids && widget.query_config.metric_ids.length > 0),
    initialData: []
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['widget-data', widget.id, dateRange, customFilters],
    queryFn: async () => {
      const response = await base44.functions.invoke('fetchWidgetData', {
        data_source: widget.data_source,
        query_config: widget.query_config,
        date_range: dateRange,
        custom_filters: customFilters
      });
      return response.data;
    },
    refetchInterval: widget.display_config?.refresh_interval || 0,
    enabled: widget.enabled
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Widget.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['dashboard-widgets']);
    }
  });

  const handleEdit = () => {
    if (onEdit) {
      onEdit(widget);
    } else {
      navigate(createPageUrl(`WidgetBuilder?edit=${widget.id}`));
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(widget);
    } else if (confirm(`Are you sure you want to delete "${widget.name}"?`)) {
      deleteMutation.mutate(widget.id);
    }
  };

  if (!widget.enabled) return null;

  const widthClass = {
    full: 'col-span-full',
    half: 'col-span-full lg:col-span-6',
    third: 'col-span-full lg:col-span-4',
    quarter: 'col-span-full lg:col-span-3',
    sixth: 'col-span-full lg:col-span-2'
  }[widget.display_config?.width || 'full'];

  const showTitle = widget.display_config?.show_title !== false;

  const WidgetMenu = (
    <div className="absolute top-4 right-4 z-10">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="glass-card border-white/10">
          <DropdownMenuItem onClick={handleEdit} className="text-white hover:bg-white/10 cursor-pointer">
            <Pencil className="w-4 h-4 mr-2" />
            Edit Widget
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDelete} className="text-red-400 hover:bg-red-500/20 cursor-pointer">
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Widget
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  if (isLoading) {
    return (
      <Card className={`glass-card border-white/10 ${widthClass} relative group`}>
        {WidgetMenu}
        {showTitle && (
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-sm">{widget.name}</CardTitle>
          </CardHeader>
        )}
        <CardContent className={showTitle ? 'pt-0' : 'pt-6'}>
          <Skeleton className="h-[300px] w-full bg-white/5" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    const is404 = error.message?.includes('404') || error.message?.includes('not found');
    
    return (
      <Card className={`glass-card border-white/10 ${widthClass} relative group`}>
        {WidgetMenu}
        {showTitle && (
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-sm">{widget.name}</CardTitle>
          </CardHeader>
        )}
        <CardContent className={showTitle ? 'pt-0' : 'pt-6'}>
          <div className="space-y-2">
            <div className="text-red-400 text-sm font-semibold">
              {is404 ? '⚠️ Data Source Not Found' : '⚠️ Error Loading Data'}
            </div>
            {is404 ? (
              <div className="text-gray-400 text-xs space-y-1">
                <p>The data source "<span className="text-white font-mono">{widget.data_source}</span>" doesn't exist.</p>
                <p className="mt-2">To fix this:</p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>Check if the sync configuration exists in Data Sync Sources</li>
                  <li>Edit this widget and select an existing data source</li>
                  <li>Or create a new sync configuration with this name</li>
                </ul>
              </div>
            ) : (
              <div className="text-gray-400 text-xs">
                <p className="font-mono text-red-300">{error.message}</p>
                <p className="mt-2">Try refreshing or check the widget configuration.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return (
      <Card className={`glass-card border-white/10 ${widthClass} relative group`}>
        {WidgetMenu}
        {showTitle && (
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-sm">{widget.name}</CardTitle>
          </CardHeader>
        )}
        <CardContent className={showTitle ? 'pt-0' : 'pt-6'}>
          <div className="text-gray-400 text-sm">No data available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`glass-card border-white/10 ${widthClass} relative group overflow-hidden ${widget.type === 'kpi_with_trend' ? 'h-[280px]' : ''}`}>
      {WidgetMenu}
      {showTitle && (
        <CardHeader className="px-3 py-2 text-sm flex flex-col space-y-1.5">
          <CardTitle className="text-white text-sm font-bold uppercase tracking-wide">{widget.name}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={`${showTitle ? 'pt-0' : 'pt-6'} ${widget.type === 'kpi_with_trend' ? 'p-0 h-full' : ''}`}>
        {widget.type === 'table' && <TableWidget data={data} config={widget} libraryMetrics={libraryMetrics} />}
        {widget.type === 'kpi_card' && <KPIWidget data={data} config={widget} libraryMetrics={libraryMetrics} />}
        {widget.type === 'kpi_with_trend' && <KPIWithTrendWidget data={data} config={widget} />}
        {widget.type === 'stats_bar' && <StatsBarWidget data={data} config={widget} />}
        {widget.type === 'line_chart' && <LineChartWidget data={data} config={widget} libraryMetrics={libraryMetrics} />}
        {widget.type === 'bar_chart' && <BarChartWidget data={data} config={widget} libraryMetrics={libraryMetrics} />}
        {widget.type === 'pie_chart' && <PieChartWidget data={data} config={widget} libraryMetrics={libraryMetrics} />}
        {widget.type === 'area_chart' && <AreaChartWidget data={data} config={widget} libraryMetrics={libraryMetrics} />}
      </CardContent>
    </Card>
  );
}

function TableWidget({ data, config, libraryMetrics }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(config.display_config?.page_size || 10);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');

  let columns = [];

  if (config.query_config?.group_by) {
    columns.push(config.query_config.group_by);
    libraryMetrics.forEach((metric) => {
      if (metric.definition.visible !== false) {
        columns.push(metric.definition.alias || metric.name);
      }
    });
    config.query_config.aggregations?.forEach((agg) => {
      if (agg.visible !== false) {
        columns.push(agg.alias || `${agg.function}_${agg.field}`);
      }
    });
    if (config.query_config.calculated_fields && config.query_config.calculated_fields.length > 0) {
      config.query_config.calculated_fields.forEach((cf) => {
        if (cf.visible !== false && cf.name) {
          columns.push(cf.name);
        }
      });
    }
  } else if ((config.query_config?.aggregations?.length > 0 || libraryMetrics?.length > 0) && data && data.length > 0) {
    columns = Object.keys(data[0]);
  } else {
    columns = config.query_config?.columns || [];
    if (columns.length === 0 && data && data.length > 0) {
      columns = Object.keys(data[0]);
    }
  }

  if (columns.length === 0) {
    return <div className="text-gray-400">No columns configured</div>;
  }

  // Create a mapping of field names to their display names (aliases)
  const columnDisplayNames = {};
  const configColumns = config.query_config?.columns || [];
  
  configColumns.forEach(col => {
    // Handle both old string format and new object format
    if (typeof col === 'string') {
      // No alias mapping needed for string-only column definitions, as they don't have explicit aliases
    } else if (typeof col === 'object' && col.field) {
      // New format: object with field, alias, visible
      if (col.alias && col.alias.trim() !== '') {
        columnDisplayNames[col.field] = col.alias;
      }
    }
  });

  // Helper function to get display name for a column
  const getColumnDisplayName = (columnName) => {
    if (columnDisplayNames[columnName]) {
      return columnDisplayNames[columnName];
    }
    return columnName;
  };

  // Helper function to get actual field name
  const getFieldName = (column) => {
    // Handle both string format and object format
    if (typeof column === 'string') {
      return column;
    }
    if (typeof column === 'object' && column.field) {
      return column.field;
    }
    return column;
  };

  const handleSort = (column) => {
    const fieldName = getFieldName(column);
    if (sortColumn === fieldName) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(fieldName);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  let sortedData = [...data];
  if (sortColumn) {
    sortedData.sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      if (aVal === null || aVal === undefined) return bVal === null || bVal === undefined ? 0 : sortDirection === 'asc' ? 1 : -1;
      if (bVal === null || bVal === undefined) return sortDirection === 'asc' ? -1 : 1;
      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else if (typeof aVal === 'string' && typeof bVal === 'string') {
        const aDate = new Date(aVal);
        const bDate = new Date(bVal);
        if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
          comparison = aDate.getTime() - bDate.getTime();
        } else {
          comparison = aVal.localeCompare(bVal);
        }
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  const totalPages = Math.ceil(sortedData.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedData = sortedData.slice(startIndex, endIndex);

  const handlePageSizeChange = (newSize) => {
    setPageSize(Number(newSize));
    setCurrentPage(1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const totals = {};
  const showTotals = config.display_config?.show_totals !== false;

  if (showTotals) {
    columns.forEach((col) => {
      const fieldName = getFieldName(col);
      const values = sortedData.map((row) => row[fieldName]).filter((v) => typeof v === 'number');
      if (values.length > 0) {
        totals[fieldName] = values.reduce((sum, val) => sum + val, 0);
      }
    });
  }

  const applyFormat = (val, fmt) => {
    const numVal = typeof val === 'string' ? parseFloat(val) : val;
    switch (fmt) {
      case 'currency':
        if (isNaN(numVal)) return String(val);
        return '$' + numVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'percentage':
        if (isNaN(numVal)) return String(val);
        const isPositive = numVal > 0;
        return <span className={`px-2 py-1 rounded ${isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{numVal.toFixed(2)}%</span>;
      case 'number':
        if (isNaN(numVal)) return String(val);
        return numVal.toLocaleString();
      case 'date':
        if (typeof val === 'string') {
          try {
            const date = new Date(val);
            if (!isNaN(date.getTime())) return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          } catch (e) {}
        }
        return String(val);
      case 'text':
        return String(val);
      default:
        return String(val);
    }
  };

  const autoFormat = (val, column) => {
    const columnLower = column.toLowerCase();
    const isPercentageColumn = columnLower.includes('rate') || columnLower.includes('%') || columnLower.includes('margin') || columnLower.includes('conversion_rate') || columnLower.endsWith('_rate') || columnLower.endsWith('_margin') || columnLower.endsWith('_percentage');
    if (isPercentageColumn) {
      const numValue = typeof val === 'string' ? parseFloat(val) : val;
      if (!isNaN(numValue)) {
        const isPositive = numValue > 0;
        return <span className={`px-2 py-1 rounded ${isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{numValue.toFixed(2)}%</span>;
      }
    }
    if (columnLower.includes('revenue') || columnLower.includes('cost') || columnLower.includes('cpl') || columnLower.includes('profit') || columnLower.includes('payout') || columnLower.includes('price') || columnLower.includes('cpa') || columnLower.includes('cpc')) {
      const numValue = typeof val === 'string' ? parseFloat(val) : val;
      if (!isNaN(numValue)) return '$' + numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (typeof val === 'number') return val.toLocaleString();
    if (columnLower.includes('date') && typeof val === 'string') {
      try {
        const date = new Date(val);
        if (!isNaN(date.getTime())) return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      } catch (e) {}
    }
    return String(val);
  };

  const formatCell = (value, column) => {
    if (value === null || value === undefined) return '-';
    const fieldName = getFieldName(column);
    const columnLower = fieldName.toLowerCase();
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (columnLower.includes('return') && (columnLower.includes('rate') || columnLower.includes('%')) || columnLower === 'return rate' || columnLower === 'return %') {
      if (!isNaN(numValue)) {
        const colorClass = numValue > 5 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400';
        return <span className={`px-2 py-1 rounded ${colorClass}`}>{numValue.toFixed(2)}%</span>;
      }
    }
    if (columnLower.includes('conversion') && columnLower.includes('rate') || columnLower === 'conversion rate' || columnLower === 'cpl') {
      if (!isNaN(numValue)) {
        let colorClass = '';
        if (numValue < 10) colorClass = 'bg-red-500/20 text-red-400';
        else if (numValue >= 10 && numValue <= 15) colorClass = 'bg-orange-500/20 text-orange-400';
        else if (numValue > 20) colorClass = 'bg-green-500/20 text-green-400';
        else return <span className="px-2 py-1 rounded bg-gray-500/20 text-gray-300">{numValue.toFixed(2)}%</span>;
        return <span className={`px-2 py-1 rounded ${colorClass}`}>{numValue.toFixed(2)}%</span>;
      }
    }
    const matchingLibraryMetric = libraryMetrics.find((metric) => (metric.definition.alias || metric.name) === fieldName);
    if (matchingLibraryMetric && matchingLibraryMetric.definition.format) return applyFormat(value, matchingLibraryMetric.definition.format);
    const aggregations = config.query_config?.aggregations || [];
    const matchingAgg = aggregations.find((agg) => (agg.alias || `${agg.function}_${agg.field}`) === fieldName);
    if (matchingAgg && matchingAgg.format) return applyFormat(value, matchingAgg.format);
    const fieldFormats = config.display_config?.field_formats || {};
    const customFormat = fieldFormats[fieldName];
    if (customFormat) return applyFormat(value, customFormat);
    return autoFormat(value, fieldName);
  };

  const formatTotal = (value, column) => {
    if (value === null || value === undefined) return '-';
    const fieldName = getFieldName(column);
    const matchingLibraryMetric = libraryMetrics.find((metric) => (metric.definition.alias || metric.name) === fieldName);
    if (matchingLibraryMetric && matchingLibraryMetric.definition.format) {
      if (matchingLibraryMetric.definition.format === 'percentage') {
        const avgValue = sortedData.length > 0 ? value / sortedData.length : 0;
        return avgValue.toFixed(2) + '%';
      }
      return applyFormat(value, matchingLibraryMetric.definition.format);
    }
    const aggregations = config.query_config?.aggregations || [];
    const matchingAgg = aggregations.find((agg) => (agg.alias || `${agg.function}_${agg.field}`) === fieldName);
    if (matchingAgg && matchingAgg.format) {
      if (matchingAgg.format === 'percentage') {
        const avgValue = sortedData.length > 0 ? value / sortedData.length : 0;
        return avgValue.toFixed(2) + '%';
      }
      return applyFormat(value, matchingAgg.format);
    }
    const fieldFormats = config.display_config?.field_formats || {};
    const customFormat = fieldFormats[fieldName];
    if (customFormat === 'currency') return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (customFormat === 'percentage' || fieldName.toLowerCase().includes('rate') || fieldName.toLowerCase().includes('%') || fieldName.toLowerCase().includes('margin') || fieldName.toLowerCase().includes('conv')) {
      const avgValue = sortedData.length > 0 ? value / sortedData.length : 0;
      return avgValue.toFixed(2) + '%';
    }
    if (fieldName.toLowerCase().includes('revenue') || fieldName.toLowerCase().includes('cost') || fieldName.toLowerCase().includes('profit') || fieldName.toLowerCase().includes('payout')) {
      return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return value.toLocaleString();
  };

  const renderSortIcon = (column) => {
    const fieldName = getFieldName(column);
    if (sortColumn !== fieldName) return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-4 h-4 ml-1 text-[#00d4ff]" /> : <ArrowDown className="w-4 h-4 ml-1 text-[#00d4ff]" />;
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-[#1a1a3e]">
              {columns.map((col) => {
                const fieldName = getFieldName(col);
                const displayName = getColumnDisplayName(fieldName);
                return (
                  <TableHead key={fieldName} className="text-gray-300 font-bold cursor-pointer hover:text-white transition-colors select-none h-10" onClick={() => handleSort(col)}>
                    <div className="flex items-center">
                      {displayName}
                      {renderSortIcon(col)}
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.map((row, idx) => (
              <TableRow key={idx} className="border-white/10 hover:bg-white/5 h-12">
                {columns.map((col) => {
                  const fieldName = getFieldName(col);
                  const cellValue = formatCell(row[fieldName], col);
                  // Ensure stringValue is always a string, especially when cellValue might be a ReactNode
                  const stringValue = typeof cellValue === 'string' ? cellValue : String(row[fieldName] || '');
                  
                  return (
                    <TableCell 
                      key={fieldName} 
                      className="text-white h-12 max-w-[200px] overflow-hidden"
                      title={stringValue} // Show full content on hover
                    >
                      <div className="line-clamp-2 overflow-hidden text-ellipsis">
                        {cellValue}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {showTotals && Object.keys(totals).length > 0 && (
              <TableRow className="border-white/10 bg-[#1a1a3e] font-bold h-12">
                {columns.map((col, idx) => {
                  const fieldName = getFieldName(col);
                  return <TableCell key={fieldName} className="text-white font-bold h-12">{idx === 0 ? 'Grand Total' : totals[fieldName] ? formatTotal(totals[fieldName], col) : '-'}</TableCell>;
                })}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Show</span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="glass-card border-white/10 text-white w-20"><SelectValue /></SelectTrigger>
            <SelectContent className="glass-card border-white/10 text-white">
              <SelectItem value="10" className="text-white">10</SelectItem>
              <SelectItem value="25" className="text-white">25</SelectItem>
              <SelectItem value="50" className="text-white">50</SelectItem>
              <SelectItem value="100" className="text-white">100</SelectItem>
              <SelectItem value="250" className="text-white">250</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-gray-400">rows</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Showing {startIndex + 1}-{Math.min(endIndex, sortedData.length)} of {sortedData.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={currentPage === 1} className="glass-card border-white/10 text-white disabled:opacity-50"><ChevronLeft className="w-4 h-4" />Previous</Button>
          <span className="text-sm text-white px-3">Page {currentPage} of {totalPages === 0 ? 1 : totalPages}</span>
          <Button variant="outline" size="sm" onClick={handleNextPage} disabled={currentPage === totalPages || totalPages === 0} className="glass-card border-white/10 text-white disabled:opacity-50">Next<ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}

function KPIWidget({ data, config, libraryMetrics }) {
  if (!Array.isArray(data) || data.length === 0) return <div className="text-gray-400">No data</div>;
  const row = data[0];
  const visibleMetrics = libraryMetrics.filter(m => m.definition.visible !== false);
  const visibleAggs = (config.query_config?.aggregations || []).filter(a => a.visible !== false);
  const visibleCalcFields = (config.query_config?.calculated_fields || []).filter(cf => cf.visible !== false && cf.name);
  if (visibleMetrics.length === 0 && visibleAggs.length === 0 && visibleCalcFields.length === 0) {
    return <div className="text-gray-400">No metrics to display</div>;
  }
  const formatValue = (val, fmt) => {
    if (val === null || val === undefined) return '-';
    const numVal = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(numVal)) return String(val);
    switch (fmt) {
      case 'currency': return '$' + numVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'percentage': return numVal.toFixed(2) + '%';
      case 'number': return numVal.toLocaleString();
      default: return String(val);
    }
  };
  const items = [
    ...visibleMetrics.map(m => ({ label: m.name, value: formatValue(row[m.definition.alias || m.name], m.definition.format) })),
    ...visibleAggs.map(a => ({ label: a.alias || `${a.function}_${a.field}`, value: formatValue(row[a.alias || `${a.function}_${a.field}`], a.format) })),
    ...visibleCalcFields.map(cf => ({ label: cf.name, value: formatValue(row[cf.name], cf.format) }))
  ];
  return (
    <div className="grid grid-cols-1 gap-4">
      {items.map((item, idx) => (
        <div key={idx} className="text-center">
          <div className="text-3xl font-bold text-white mb-1">{item.value}</div>
          <div className="text-sm text-gray-400">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function LineChartWidget({ data, config, libraryMetrics }) {
  if (!data || data.length === 0) return <div className="text-gray-400">No data</div>;
  const groupBy = config.query_config?.group_by;
  if (!groupBy) return <div className="text-gray-400">Group By required</div>;
  const visibleMetrics = libraryMetrics.filter(m => m.definition.visible !== false);
  const visibleAggs = (config.query_config?.aggregations || []).filter(a => a.visible !== false);
  const visibleCalcFields = (config.query_config?.calculated_fields || []).filter(cf => cf.visible !== false && cf.name);
  const allFields = [
    ...visibleMetrics.map(m => ({ key: m.definition.alias || m.name, color: COLORS[0] })),
    ...visibleAggs.map((a, i) => ({ key: a.alias || `${a.function}_${a.field}`, color: COLORS[(i + 1) % COLORS.length] })),
    ...visibleCalcFields.map((cf, i) => ({ key: cf.name, color: COLORS[(visibleAggs.length + i + 1) % COLORS.length] }))
  ];
  if (allFields.length === 0) return <div className="text-gray-400">No metrics configured</div>;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
        <XAxis dataKey={groupBy} stroke="#888" />
        <YAxis stroke="#888" />
        <Tooltip contentStyle={{ backgroundColor: '#1a1a3e', border: '1px solid #ffffff20', borderRadius: '8px' }} />
        <Legend />
        {allFields.map(f => <Line key={f.key} type="monotone" dataKey={f.key} stroke={f.color} strokeWidth={2} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

function BarChartWidget({ data, config, libraryMetrics }) {
  if (!data || data.length === 0) return <div className="text-gray-400">No data</div>;
  const groupBy = config.query_config?.group_by;
  if (!groupBy) return <div className="text-gray-400">Group By required</div>;
  const visibleMetrics = libraryMetrics.filter(m => m.definition.visible !== false);
  const visibleAggs = (config.query_config?.aggregations || []).filter(a => a.visible !== false);
  const visibleCalcFields = (config.query_config?.calculated_fields || []).filter(cf => cf.visible !== false && cf.name);
  const allFields = [
    ...visibleMetrics.map(m => ({ key: m.definition.alias || m.name, color: COLORS[0] })),
    ...visibleAggs.map((a, i) => ({ key: a.alias || `${a.function}_${a.field}`, color: COLORS[(i + 1) % COLORS.length] })),
    ...visibleCalcFields.map((cf, i) => ({ key: cf.name, color: COLORS[(visibleAggs.length + i + 1) % COLORS.length] }))
  ];
  if (allFields.length === 0) return <div className="text-gray-400">No metrics configured</div>;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
        <XAxis dataKey={groupBy} stroke="#888" />
        <YAxis stroke="#888" />
        <Tooltip contentStyle={{ backgroundColor: '#1a1a3e', border: '1px solid #ffffff20', borderRadius: '8px' }} />
        <Legend />
        {allFields.map(f => <Bar key={f.key} dataKey={f.key} fill={f.color} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

function PieChartWidget({ data, config, libraryMetrics }) {
  if (!data || data.length === 0) return <div className="text-gray-400">No data</div>;
  const groupBy = config.query_config?.group_by;
  if (!groupBy) return <div className="text-gray-400">Group By required</div>;
  const visibleMetrics = libraryMetrics.filter(m => m.definition.visible !== false);
  const visibleAggs = (config.query_config?.aggregations || []).filter(a => a.visible !== false);
  const visibleCalcFields = (config.query_config?.calculated_fields || []).filter(cf => cf.visible !== false && cf.name);
  const firstField = visibleMetrics[0]?.definition.alias || visibleMetrics[0]?.name || visibleAggs[0]?.alias || `${visibleAggs[0]?.function}_${visibleAggs[0]?.field}` || visibleCalcFields[0]?.name;
  if (!firstField) return <div className="text-gray-400">No metric selected</div>;
  const chartData = data.map(row => ({ name: row[groupBy], value: row[firstField] }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
          {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ backgroundColor: '#1a1a3e', border: '1px solid #ffffff20', borderRadius: '8px' }} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function AreaChartWidget({ data, config, libraryMetrics }) {
  if (!data || data.length === 0) return <div className="text-gray-400">No data</div>;
  const groupBy = config.query_config?.group_by;
  if (!groupBy) return <div className="text-gray-400">Group By required</div>;
  const visibleMetrics = libraryMetrics.filter(m => m.definition.visible !== false);
  const visibleAggs = (config.query_config?.aggregations || []).filter(a => a.visible !== false);
  const visibleCalcFields = (config.query_config?.calculated_fields || []).filter(cf => cf.visible !== false && cf.name);
  const allFields = [
    ...visibleMetrics.map(m => ({ key: m.definition.alias || m.name, color: COLORS[0] })),
    ...visibleAggs.map((a, i) => ({ key: a.alias || `${a.function}_${a.field}`, color: COLORS[(i + 1) % COLORS.length] })),
    ...visibleCalcFields.map((cf, i) => ({ key: cf.name, color: COLORS[(visibleAggs.length + i + 1) % COLORS.length] }))
  ];
  if (allFields.length === 0) return <div className="text-gray-400">No metrics configured</div>;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
        <XAxis dataKey={groupBy} stroke="#888" />
        <YAxis stroke="#888" />
        <Tooltip contentStyle={{ backgroundColor: '#1a1a3e', border: '1px solid #ffffff20', borderRadius: '8px' }} />
        <Legend />
        {allFields.map(f => <Area key={f.key} type="monotone" dataKey={f.key} stroke={f.color} fill={f.color} fillOpacity={0.3} />)}
      </AreaChart>
    </ResponsiveContainer>
  );
}
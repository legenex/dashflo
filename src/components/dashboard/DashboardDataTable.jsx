import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, ArrowUpDown, Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { buildAggregations, formatMetricValue, processTableRows } from "../../utils/metricUtils";

export default function DashboardDataTable({ tableConfig, dataSource, dateRange, customFilters, allMetrics, editMode, onEdit }) {
  const [collapsed, setCollapsed] = useState(false);
  const [sortField, setSortField] = useState(tableConfig.default_sort_field || null);
  const [sortDir, setSortDir] = useState(tableConfig.default_sort_direction || 'desc');

  const metricDefs = useMemo(
    () => allMetrics.filter(m => tableConfig.metric_field_ids?.includes(m.field_id)),
    [allMetrics, tableConfig.metric_field_ids]
  );

  const aggregations = useMemo(() => buildAggregations(metricDefs), [metricDefs]);

  const { data: rawData = [], isLoading } = useQuery({
    queryKey: ['table-data', tableConfig.id, dateRange, customFilters, dataSource, tableConfig.dimension_field],
    queryFn: async () => {
      if (!dataSource || !tableConfig.dimension_field) return [];
      const res = await base44.functions.invoke('fetchWidgetData', {
        data_source: dataSource,
        query_config: {
          group_by: tableConfig.dimension_field,
          aggregations,
          columns: [],
          filters: customFilters || [],
          limit: 200,
        },
        date_range: dateRange,
        custom_filters: customFilters || [],
      });
      return res.data || [];
    },
    enabled: !!dataSource && !!tableConfig.dimension_field,
  });

  // Process rows: compute formula metrics per row
  const processedData = useMemo(() => processTableRows(rawData, metricDefs), [rawData, metricDefs]);

  // Client-side sort
  const sortedData = useMemo(() => {
    if (!sortField) return processedData;
    return [...processedData].sort((a, b) => {
      const av = a[sortField] ?? a[metricDefs.find(m => m.field_id === sortField)?.source_field];
      const bv = b[sortField] ?? b[metricDefs.find(m => m.field_id === sortField)?.source_field];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [processedData, sortField, sortDir, metricDefs]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 ml-1 text-[#00d4ff]" />
      : <ChevronDown className="w-3 h-3 ml-1 text-[#00d4ff]" />;
  };

  return (
    <Card className="glass-card border-white/10">
      <CardHeader className="px-4 py-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-white text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {collapsed
              ? <ChevronDown className="w-4 h-4" />
              : <ChevronUp className="w-4 h-4" />}
          </button>
          {tableConfig.name}
          <span className="text-xs text-gray-500 font-normal normal-case ml-1">
            ({sortedData.length} rows)
          </span>
        </CardTitle>
        {editMode && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="text-[#00d4ff] hover:bg-[#00d4ff]/10 h-7 px-2"
          >
            <Pencil className="w-3 h-3 mr-1" />Edit
          </Button>
        )}
      </CardHeader>

      {!collapsed && (
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><Skeleton className="h-40 w-full bg-white/5" /></div>
          ) : sortedData.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No data available</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 bg-[#1a1a3e]">
                    <TableHead
                      className="text-gray-300 font-bold cursor-pointer hover:text-white select-none"
                      onClick={() => handleSort(tableConfig.dimension_field)}
                    >
                      <div className="flex items-center">
                        {tableConfig.dimension_field}
                        <SortIcon field={tableConfig.dimension_field} />
                      </div>
                    </TableHead>
                    {metricDefs.map(m => (
                      <TableHead
                        key={m.field_id}
                        className="text-gray-300 font-bold cursor-pointer hover:text-white select-none text-right"
                        onClick={() => handleSort(m.field_id)}
                      >
                        <div className="flex items-center justify-end">
                          {m.name}
                          <SortIcon field={m.field_id} />
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedData.map((row, idx) => (
                    <TableRow key={idx} className="border-white/10 hover:bg-white/5">
                      <TableCell className="text-white font-medium">
                        {String(row[tableConfig.dimension_field] ?? '-')}
                      </TableCell>
                      {metricDefs.map(m => {
                        const val = row[m.field_id];
                        const isNeg = typeof val === 'number' && val < 0;
                        return (
                          <TableCell
                            key={m.field_id}
                            className={`text-right ${isNeg ? 'text-red-400' : 'text-white'}`}
                          >
                            {formatMetricValue(val, m.format)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
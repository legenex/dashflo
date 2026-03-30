import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";
import { buildAggregationsFromMetrics, computeRowValues, formatValue } from "../../../utils/metricUtils";

const CF_OPERATORS = { '>': (a, b) => a > b, '<': (a, b) => a < b, '=': (a, b) => a === b, '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '!=': (a, b) => a !== b };
const CF_COLORS = { green: 'bg-emerald-500/20 text-emerald-300', red: 'bg-red-500/20 text-red-300', amber: 'bg-amber-500/20 text-amber-300', blue: 'bg-blue-500/20 text-blue-300', gray: 'bg-gray-500/20 text-gray-300' };

function applyCF(value, fieldId, rules = []) {
  for (const rule of rules) {
    if (rule.field_id !== fieldId) continue;
    const fn = CF_OPERATORS[rule.operator];
    if (fn && fn(Number(value), Number(rule.value))) return CF_COLORS[rule.color] || '';
  }
  return '';
}

export default function TableWidget({ widget, metrics, dataSource, syncType, dateRange, customFilters }) {
  const [sortField, setSortField] = useState(widget.sort_field || null);
  const [sortDir, setSortDir] = useState(widget.sort_direction || 'desc');

  const colMetrics = useMemo(
    () => (widget.column_ids || []).map(fid => metrics.find(m => m.field_id === fid)).filter(Boolean),
    [widget.column_ids, metrics]
  );

  const aggregations = useMemo(() => buildAggregationsFromMetrics(colMetrics), [colMetrics]);

  const { data: rawRows = [], isLoading } = useQuery({
    queryKey: ['tbl', widget.id, dataSource, dateRange, customFilters, widget.dimension, widget.column_ids?.join(',')],
    queryFn: async () => {
      if (!dataSource || !widget.dimension) return [];
      const res = await base44.functions.invoke('fetchWidgetData', {
        data_source: dataSource,
        sync_type: syncType,
        query_config: { group_by: widget.dimension, aggregations, columns: [], filters: customFilters || [] },
        date_range: dateRange,
        custom_filters: customFilters || [],
      });
      return res.data || [];
    },
    enabled: !!dataSource && !!widget.dimension,
    initialData: [],
  });

  const rows = useMemo(() => rawRows.map(r => ({ ...r, ...computeRowValues(r, colMetrics) })), [rawRows, colMetrics]);

  const sorted = useMemo(() => {
    if (!sortField) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortField]; const bv = b[sortField];
      if (av == null) return 1; if (bv == null) return -1;
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortField, sortDir]);

  const limited = widget.row_limit ? sorted.slice(0, widget.row_limit) : sorted;

  const handleSort = (f) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('desc'); }
  };

  const SortIcon = ({ f }) => sortField !== f
    ? <ArrowUpDown className="w-3 h-3 ml-1 opacity-30 inline" />
    : sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 ml-1 text-[#00d4ff] inline" />
      : <ChevronDown className="w-3 h-3 ml-1 text-[#00d4ff] inline" />;

  if (isLoading) return <Skeleton className="h-40 w-full bg-white/5 rounded-lg" />;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-white/10 bg-[#1a1a3e]">
            <TableHead
              className="text-gray-300 font-bold cursor-pointer hover:text-white select-none"
              onClick={() => handleSort(widget.dimension)}
            >
              {widget.dimension || 'Dimension'}<SortIcon f={widget.dimension} />
            </TableHead>
            {colMetrics.map(m => (
              <TableHead
                key={m.field_id}
                className="text-gray-300 font-bold cursor-pointer hover:text-white select-none text-right"
                onClick={() => handleSort(m.field_id)}
              >
                {m.name}<SortIcon f={m.field_id} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {limited.length === 0 ? (
            <TableRow><TableCell colSpan={colMetrics.length + 1} className="text-center text-gray-500 py-8">No data</TableCell></TableRow>
          ) : limited.map((row, i) => (
            <TableRow key={i} className="border-white/10 hover:bg-white/5">
              <TableCell className="text-white font-medium">{String(row[widget.dimension] != null && typeof row[widget.dimension] !== 'object' ? row[widget.dimension] : '—')}</TableCell>
              {colMetrics.map(m => {
                const rawVal = row[m.field_id];
                const val = rawVal != null && typeof rawVal === 'object' && !Array.isArray(rawVal) ? (rawVal.value ?? '-') : rawVal;
                const cfClass = applyCF(val, m.field_id, widget.conditional_formatting);
                return (
                  <TableCell key={m.field_id} className={`text-right ${cfClass || (typeof val === 'number' && val < 0 ? 'text-red-400' : 'text-white')}`}>
                    {val == null ? '-' : formatValue(val, m.format)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {widget.row_limit && sorted.length > widget.row_limit && (
        <div className="text-center text-xs text-gray-500 py-2">{sorted.length - widget.row_limit} more rows not shown</div>
      )}
    </div>
  );
}
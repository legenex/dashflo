import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, LineChart, BarChart, AreaChart, ComposedChart,
  Line, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { buildAggregationsFromMetrics, formatValue, priorRange } from "../../../utils/metricUtils";

const COLORS = ['#00d4ff', '#a855f7', '#10b981', '#f59e0b', '#ef4444'];

async function fetchChart(dataSource, syncType, dimension, aggregations, dateRange, customFilters) {
  if (!dataSource || !dimension) return [];
  const res = await base44.functions.invoke('fetchWidgetData', {
    data_source: dataSource,
    sync_type: syncType,
    query_config: { group_by: dimension, aggregations, columns: [], filters: customFilters || [] },
    date_range: dateRange,
    custom_filters: customFilters || [],
  });
  return res.data || [];
}

export default function ChartWidget({ widget, metrics, dataSource, syncType, dateRange, customFilters }) {
  const seriesMetrics = useMemo(
    () => (widget.metric_ids || []).map(fid => metrics.find(m => m.field_id === fid)).filter(Boolean),
    [widget.metric_ids, metrics]
  );
  const aggregations = useMemo(() => buildAggregationsFromMetrics(seriesMetrics), [seriesMetrics]);
  const prior = useMemo(() => priorRange(dateRange), [dateRange]);

  const { data: currentData = [], isLoading: loadCurr } = useQuery({
    queryKey: ['chart', widget.id, 'curr', dataSource, dateRange, customFilters, widget.dimension],
    queryFn: () => fetchChart(dataSource, syncType, widget.dimension, aggregations, dateRange, customFilters),
    enabled: !!dataSource && !!widget.dimension,
    initialData: [],
  });

  const { data: priorData = [] } = useQuery({
    queryKey: ['chart', widget.id, 'prior', dataSource, prior, customFilters, widget.dimension],
    queryFn: () => fetchChart(dataSource, syncType, widget.dimension, aggregations, prior, customFilters),
    enabled: !!dataSource && !!widget.dimension && widget.show_comparison !== false,
    initialData: [],
  });

  const chartData = useMemo(() => {
    const curr = currentData.slice().sort((a, b) => String(a[widget.dimension] || '').localeCompare(String(b[widget.dimension] || '')));
    return curr.map((row, i) => {
      const entry = { x: row[widget.dimension] };
      seriesMetrics.forEach(m => {
        const sf = m.source_field || m.field_id;
        entry[m.field_id] = Number(row[sf]) || 0;
        if (widget.show_comparison !== false && priorData[i]) {
          entry[`${m.field_id}_prior`] = Number(priorData[i][sf]) || 0;
        }
      });
      return entry;
    });
  }, [currentData, priorData, seriesMetrics, widget]);

  if (loadCurr) return <Skeleton className="h-60 w-full bg-white/5 rounded-lg" />;
  if (!widget.dimension) return <div className="p-4 text-gray-500 text-sm">No dimension configured</div>;

  const tooltipStyle = { backgroundColor: '#1a1a3e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, color: '#fff' };
  const type = widget.type;

  const renderSeries = (ChartLine, ChartBar, ChartArea) =>
    seriesMetrics.flatMap((m, idx) => {
      const color = COLORS[idx % COLORS.length];
      const label = m.name;
      const series = [];
      if (type === 'bar_chart') {
        series.push(<Bar key={m.field_id} dataKey={m.field_id} name={label} fill={color} />);
        if (widget.show_comparison !== false)
          series.push(<Bar key={`${m.field_id}_p`} dataKey={`${m.field_id}_prior`} name={`${label} (prior)`} fill={color} opacity={0.3} />);
      } else if (type === 'area_chart') {
        series.push(<Area key={m.field_id} type="monotone" dataKey={m.field_id} name={label} stroke={color} fill={color} fillOpacity={0.2} strokeWidth={2} dot={false} />);
        if (widget.show_comparison !== false)
          series.push(<Area key={`${m.field_id}_p`} type="monotone" dataKey={`${m.field_id}_prior`} name={`${label} (prior)`} stroke={color} fill={color} fillOpacity={0.05} strokeWidth={1} strokeDasharray="4 4" dot={false} />);
      } else {
        series.push(<Line key={m.field_id} type="monotone" dataKey={m.field_id} name={label} stroke={color} strokeWidth={2} dot={false} />);
        if (widget.show_comparison !== false)
          series.push(<Line key={`${m.field_id}_p`} type="monotone" dataKey={`${m.field_id}_prior`} name={`${label} (prior)`} stroke={color} strokeWidth={1} strokeDasharray="4 4" dot={false} opacity={0.4} />);
      }
      return series;
    });

  const commonProps = { data: chartData, margin: { top: 5, right: 5, left: 0, bottom: 5 } };
  const commonChildren = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
      <XAxis dataKey="x" stroke="#888" tick={{ fontSize: 10 }} />
      <YAxis stroke="#888" tick={{ fontSize: 10 }} />
      <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [formatValue(v, seriesMetrics.find(m => m.field_id === n || `${m.field_id}_prior` === n)?.format || 'number'), n]} />
      <Legend wrapperStyle={{ fontSize: 11, color: '#888' }} />
    </>
  );

  return (
    <ResponsiveContainer width="100%" height={type === 'bar_chart' ? 260 : 240}>
      {type === 'bar_chart' ? (
        <BarChart {...commonProps}>{commonChildren}{renderSeries()}</BarChart>
      ) : type === 'area_chart' ? (
        <AreaChart {...commonProps}>{commonChildren}{renderSeries()}</AreaChart>
      ) : (
        <LineChart {...commonProps}>{commonChildren}{renderSeries()}</LineChart>
      )}
    </ResponsiveContainer>
  );
}
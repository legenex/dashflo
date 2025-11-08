
import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

export default function KPIWithTrendWidget({ data, config }) {
  console.log('KPIWithTrendWidget received data:', data);
  console.log('KPIWithTrendWidget config:', config);

  // Fetch library metrics if widget uses them
  const { data: libraryMetrics } = useQuery({
    queryKey: ['library-metrics', config.query_config?.metric_ids],
    queryFn: async () => {
      if (!config.query_config?.metric_ids || config.query_config.metric_ids.length === 0) {
        return [];
      }
      const allMetrics = await base44.entities.MetricDefinition.list();
      return config.query_config.metric_ids.
      map((id) => allMetrics.find((m) => m.id === id)).
      filter(Boolean);
    },
    enabled: !!(config.query_config?.metric_ids && config.query_config.metric_ids.length > 0),
    initialData: []
  });

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 text-sm">No data available</div>
        <div className="text-gray-500 text-xs mt-1">Adjust date range</div>
      </div>);

  }

  // Get the metric to display
  let metricAlias = 'value';
  let metricName = 'Value';
  let format = 'number';

  if (libraryMetrics && libraryMetrics.length > 0) {
    const metric = libraryMetrics[0];
    metricAlias = metric.definition.alias || metric.name;
    metricName = metric.name;
    format = metric.definition.format || 'number';
  } else {
    const aggregations = config.query_config?.aggregations || [];
    if (aggregations.length > 0) {
      metricAlias = aggregations[0].alias || 'value';
      metricName = aggregations[0].alias || aggregations[0].field;
      format = aggregations[0].format || 'number';
    }
  }

  // Get display mode from config
  const displayMode = config.display_config?.kpi_display_mode || 'latest';

  // Calculate values based on display mode
  let currentValue, previousValue;

  if (displayMode === 'total') {
    currentValue = data.reduce((sum, row) => sum + (row[metricAlias] || 0), 0);
    const halfPoint = Math.floor(data.length / 2);
    previousValue = data.slice(0, halfPoint).reduce((sum, row) => sum + (row[metricAlias] || 0), 0);
  } else {
    currentValue = data[data.length - 1]?.[metricAlias] || 0;
    previousValue = data.length > 1 ? data[data.length - 2]?.[metricAlias] || 0 : 0;
  }

  // Calculate change percentage
  const change = previousValue !== 0 ? (currentValue - previousValue) / previousValue * 100 : 0;
  const isPositive = change >= 0;

  // Format value based on format setting
  const formatValue = (val) => {
    if (val === null || val === undefined) return '0';
    const numVal = typeof val === 'string' ? parseFloat(val) : val;

    switch (format) {
      case 'currency':
        return '$' + numVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'percentage':
        return numVal.toFixed(1) + '%';
      case 'number':
        return numVal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      default:
        return String(val);
    }
  };

  // Prepare chart data with both current and previous period lines
  const halfPoint = Math.floor(data.length / 2);
  const chartData = data.map((row, index) => {
    const result = {
      date: row[config.query_config?.group_by || 'date'],
      current: row[metricAlias] || 0
    };

    // Add previous period value (offset by half the data range)
    if (index >= halfPoint && data[index - halfPoint]) {
      result.previous = data[index - halfPoint][metricAlias] || 0;
    }

    return result;
  });

  return (
    <div className="h-full flex flex-col bg-white/5 backdrop-blur-sm rounded-lg overflow-hidden">
      {/* Value Display */}
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <div className="text-3xl font-bold text-white mb-1">
          {formatValue(currentValue)}
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 py-6 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              stroke="rgba(255,255,255,0.3)"
              tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.5)' }}
              tickFormatter={(tick) => {
                try {
                  const date = new Date(tick);
                  if (!isNaN(date.getTime())) {
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  }
                } catch (e) {}
                return tick;
              }} />

            <YAxis
              stroke="rgba(255,255,255,0.3)"
              tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.5)' }}
              tickFormatter={(value) => {
                if (format === 'currency') {
                  return '$' + (value / 1000).toFixed(0) + 'k';
                }
                return value.toLocaleString();
              }} />

            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(0,0,0,0.9)',
                border: '1px solid rgba(0,212,255,0.3)',
                borderRadius: '6px',
                fontSize: '11px',
                padding: '6px 10px'
              }}
              formatter={(value) => formatValue(value)}
              labelStyle={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', marginBottom: '4px' }} />

            <Line
              type="monotone"
              dataKey="current"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              name={metricName}
              activeDot={{ r: 3, fill: '#ef4444', strokeWidth: 0 }} />

            <Line
              type="monotone"
              dataKey="previous"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name={`${metricName} (previous period)`}
              activeDot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }} />

          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>);

}
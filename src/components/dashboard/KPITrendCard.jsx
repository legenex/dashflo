import React, { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, Tooltip } from "recharts";
import { formatMetricValue, computeDelta } from "../../utils/metricUtils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function KPITrendCard({ metric, currentValue, priorValue, currentDailyData, priorDailyData, isLoading }) {
  const delta = computeDelta(currentValue, priorValue);

  const chartData = useMemo(() => {
    if (!currentDailyData || currentDailyData.length === 0) return [];
    const sourceField = metric.source_field || metric.field_id;
    const sorted = [...currentDailyData].sort((a, b) => {
      const da = a.date || a.Date || '';
      const db = b.date || b.Date || '';
      return da > db ? 1 : -1;
    });
    return sorted.map((row, idx) => ({
      idx,
      current: Number(row[sourceField]) || 0,
      prior: Number(priorDailyData?.[idx]?.[sourceField]) || 0,
    }));
  }, [currentDailyData, priorDailyData, metric]);

  if (isLoading) {
    return <Skeleton className="h-[180px] rounded-lg bg-white/5" />;
  }

  const isPositiveDelta = delta !== null && delta >= 0;
  const deltaColor = delta === null ? 'text-gray-500' : isPositiveDelta ? 'text-emerald-400' : 'text-red-400';
  const DeltaIcon = delta === null ? Minus : isPositiveDelta ? TrendingUp : TrendingDown;

  return (
    <div className="glass-card border-white/10 rounded-lg p-4 flex flex-col gap-2 min-h-[180px]">
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{metric.name}</div>
      <div className="text-2xl font-bold text-white leading-none">
        {formatMetricValue(currentValue, metric.format)}
      </div>
      <div className={`flex items-center gap-1 text-xs ${deltaColor}`}>
        <DeltaIcon className="w-3 h-3 flex-shrink-0" />
        {delta === null ? 'N/A' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
        <span className="text-gray-600 ml-0.5 text-[10px]">vs prior</span>
      </div>
      {chartData.length > 1 && (
        <div className="flex-1 min-h-[60px] mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <Line
                type="monotone"
                dataKey="prior"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="current"
                stroke="#00d4ff"
                strokeWidth={2}
                dot={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a3e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#fff',
                }}
                formatter={(val) => [formatMetricValue(val, metric.format)]}
                labelFormatter={() => ''}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
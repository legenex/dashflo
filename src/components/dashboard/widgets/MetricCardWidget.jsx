import React, { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatValue, computeDelta } from "../../../utils/metricUtils";

const ROW_HEIGHTS = { compact: 'min-h-[120px]', default: 'min-h-[200px]', tall: 'min-h-[320px]' };

export default function MetricCardWidget({ widget, metric, currentValue, priorValue, dailyData }) {
  const label = widget.title || metric?.name || 'Unknown metric';
  const fmt = metric?.format || 'number';
  const delta = computeDelta(currentValue, priorValue);
  const isPos = delta !== null && delta >= 0;
  const deltaColor = delta === null ? 'text-gray-500' : isPos ? 'text-emerald-400' : 'text-red-400';
  const DeltaIcon = delta === null ? Minus : isPos ? TrendingUp : TrendingDown;

  const chartData = React.useMemo(() => {
    if (!metric || !dailyData?.length) return [];
    const sf = metric.source_field || metric.field_id;
    return dailyData
      .slice()
      .sort((a, b) => String(a.date || a.Date || '').localeCompare(String(b.date || b.Date || '')))
      .map((row, i) => ({ i, v: Number(row[sf]) || 0 }));
  }, [metric, dailyData]);

  if (!metric) {
    return (
      <div className={`glass-card border-white/10 rounded-lg p-4 flex flex-col justify-between ${ROW_HEIGHTS[widget.row_height || 'default']}`}>
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{widget.title || 'Unknown metric'}</div>
        <div className="text-2xl font-bold text-gray-600">—</div>
        <div className="text-xs text-gray-600">Metric not found</div>
      </div>
    );
  }

  return (
    <div className={`glass-card border-white/10 rounded-lg p-4 flex flex-col gap-2 ${ROW_HEIGHTS[widget.row_height || 'default']}`}>
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold text-white leading-none">
        {currentValue !== undefined ? formatValue(currentValue, fmt) : '—'}
      </div>
      {widget.show_comparison !== false && (
        <div className={`flex items-center gap-1 text-xs ${deltaColor}`}>
          <DeltaIcon className="w-3 h-3 flex-shrink-0" />
          {delta === null ? 'N/A' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
          <span className="text-gray-600 text-[10px]">vs prior</span>
        </div>
      )}
      {widget.show_sparkline !== false && chartData.length > 1 && (
        <div className="flex-1 min-h-[50px] mt-auto">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <Line type="monotone" dataKey="v" stroke="#00d4ff" strokeWidth={2} dot={false} />
              <Tooltip
                contentStyle={{ background: '#1a1a3e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 11, color: '#fff' }}
                formatter={(v) => [formatValue(v, fmt)]}
                labelFormatter={() => ''}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
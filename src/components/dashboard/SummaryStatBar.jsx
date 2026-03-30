import React from "react";
import { formatMetricValue } from "../../utils/metricUtils";
import { Skeleton } from "@/components/ui/skeleton";

export default function SummaryStatBar({ metrics, currentTotals, isLoading }) {
  if (isLoading) {
    return <Skeleton className="h-16 w-full rounded-lg bg-white/5" />;
  }

  return (
    <div className="glass-card border-white/10 rounded-lg px-2 py-3">
      <div className="flex flex-wrap items-center justify-center divide-x divide-white/10">
        {metrics.map(metric => (
          <div key={metric.field_id} className="flex flex-col items-center px-4 py-1 min-w-[90px]">
            <span className="text-lg font-bold text-white leading-none">
              {formatMetricValue(currentTotals[metric.field_id], metric.format)}
            </span>
            <span className="text-[10px] text-gray-400 uppercase tracking-wider mt-1 whitespace-nowrap">
              {metric.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
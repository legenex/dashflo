import React from "react";
import { formatValue } from "../../../utils/metricUtils";

export default function StatBarWidget({ widget, metrics, totals }) {
  const items = widget.metric_ids?.map(fid => {
    const m = metrics.find(x => x.field_id === fid);
    return { id: fid, label: m?.name || fid, value: totals?.[fid], fmt: m?.format || 'number', found: !!m };
  }) || [];

  return (
    <div className="glass-card border-white/10 rounded-lg px-2 py-3">
      {widget.title && (
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-4 mb-2">{widget.title}</div>
      )}
      <div className="flex flex-wrap items-center justify-center divide-x divide-white/10">
        {items.map(item => (
          <div key={item.id} className="flex flex-col items-center px-4 py-1 min-w-[90px]">
            <span className={`text-lg font-bold leading-none ${item.found ? 'text-white' : 'text-gray-600'}`}>
              {item.value !== undefined ? formatValue(item.value, item.fmt) : '—'}
            </span>
            <span className="text-[10px] text-gray-400 uppercase tracking-wider mt-1 whitespace-nowrap">
              {item.label}
            </span>
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-gray-500 text-sm py-2">No metrics configured</div>
        )}
      </div>
    </div>
  );
}
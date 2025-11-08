import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

export default function StatsBarWidget({ data, config }) {
  if (!data || data.length === 0) {
    return <div className="text-gray-400">No data available</div>;
  }

  const record = Array.isArray(data) ? data[0] : data;
  const metadataOrder = record._metadataOrder || {};
  const metadataVisible = record._metadataVisible || {};
  
  // Get all stat keys except metadata
  const statKeys = Object.keys(record).filter(key => !key.startsWith('_'));
  
  // Filter to only show visible metrics, then sort by order
  const visibleKeys = statKeys.filter(key => metadataVisible[key] !== false);
  
  const sortedKeys = visibleKeys.sort((a, b) => {
    const orderA = metadataOrder[a] !== undefined ? metadataOrder[a] : 10000;
    const orderB = metadataOrder[b] !== undefined ? metadataOrder[b] : 10000;
    return orderA - orderB;
  });

  if (sortedKeys.length === 0) {
    return <div className="text-gray-400">No visible metrics</div>;
  }

  const formatValue = (value, key) => {
    if (value === null || value === undefined) return '0';
    
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    const keyLower = key.toLowerCase();
    
    if (keyLower.includes('rate') || keyLower.includes('%') || keyLower.includes('margin') || keyLower.includes('conversion')) {
      if (!isNaN(numValue)) {
        return numValue.toFixed(2) + '%';
      }
    }
    
    if (keyLower.includes('revenue') || keyLower.includes('cost') || keyLower.includes('profit') || keyLower.includes('cpl')) {
      if (!isNaN(numValue)) {
        return '$' + numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    }
    
    if (typeof numValue === 'number') {
      return numValue.toLocaleString();
    }
    
    return String(value);
  };

  return (
    <div className="glass-card border-white/10 p-4 rounded-lg">
      <div className="flex divide-x divide-white/10">
        {sortedKeys.map((key, index) => {
          const value = record[key];

          return (
            <div key={key} className="flex-1 text-center px-6">
              <div className="text-xs text-gray-400 uppercase mb-2 font-medium truncate" title={key}>
                {key}
              </div>
              <div className="text-2xl font-bold text-white">
                {formatValue(value, key)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
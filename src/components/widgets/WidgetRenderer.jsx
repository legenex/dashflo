const formatCell = (value, column) => {
    if (value === null || value === undefined) return '-';
    const fieldName = getFieldName(column);
    
    // FIRST: Check library metrics for explicit format
    const matchingLibraryMetric = libraryMetrics.find((metric) => (metric.definition.alias || metric.name) === fieldName);
    if (matchingLibraryMetric && matchingLibraryMetric.definition.format) {
      return applyFormat(value, matchingLibraryMetric.definition.format);
    }
    
    // SECOND: Check local aggregations for explicit format
    const aggregations = config.query_config?.aggregations || [];
    const matchingAgg = aggregations.find((agg) => (agg.alias || `${agg.function}_${agg.field}`) === fieldName);
    if (matchingAgg && matchingAgg.format) {
      return applyFormat(value, matchingAgg.format);
    }
    
    // THIRD: Check display config for custom field formats
    const fieldFormats = config.display_config?.field_formats || {};
    const customFormat = fieldFormats[fieldName];
    if (customFormat) {
      return applyFormat(value, customFormat);
    }
    
    // FOURTH: Special case formatting (only if no explicit format is set)
    const columnLower = fieldName.toLowerCase();
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    
    if (columnLower.includes('return') && (columnLower.includes('rate') || columnLower.includes('%')) || columnLower === 'return rate' || columnLower === 'return %') {
      if (!isNaN(numValue)) {
        const colorClass = numValue > 5 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400';
        return <span className={`px-2 py-1 rounded ${colorClass}`}>{numValue.toFixed(2)}%</span>;
      }
    }
    
    if ((columnLower.includes('conversion') && columnLower.includes('rate')) || columnLower === 'conversion rate') {
      if (!isNaN(numValue)) {
        let colorClass = '';
        if (numValue < 10) colorClass = 'bg-red-500/20 text-red-400';
        else if (numValue >= 10 && numValue <= 15) colorClass = 'bg-orange-500/20 text-orange-400';
        else if (numValue > 20) colorClass = 'bg-green-500/20 text-green-400';
        else return <span className="px-2 py-1 rounded bg-gray-500/20 text-gray-300">{numValue.toFixed(2)}%</span>;
        return <span className={`px-2 py-1 rounded ${colorClass}`}>{numValue.toFixed(2)}%</span>;
      }
    }
    
    // LAST: Auto-format based on field name (fallback)
    return autoFormat(value, fieldName);
  };
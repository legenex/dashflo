export function evalFormula(formula, values) {
  if (!formula) return 0;
  let expr = formula;
  for (const [key, val] of Object.entries(values)) {
    expr = expr.replace(new RegExp(`\\{${key}\\}`, 'g'), String(Number(val) || 0));
  }
  try {
    // eslint-disable-next-line no-new-func
    return Function('"use strict"; return (' + expr + ')')();
  } catch {
    return null;
  }
}

export function computeAggregates(dailyData, metrics) {
  if (!dailyData || dailyData.length === 0) return {};
  const result = {};

  // First pass: base metrics
  metrics.filter(m => m.aggregation !== 'FORMULA' && m.aggregation !== 'RATIO').forEach(m => {
    const field = m.source_field || m.field_id;
    if (m.aggregation === 'SUM' || m.aggregation === 'COUNT' || m.aggregation === 'COUNT_DISTINCT') {
      result[m.field_id] = dailyData.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
    } else if (m.aggregation === 'AVG') {
      const vals = dailyData.map(r => Number(r[field])).filter(v => !isNaN(v) && v !== 0);
      result[m.field_id] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    }
  });

  // Second pass: formula/ratio metrics
  metrics.filter(m => m.aggregation === 'FORMULA' || m.aggregation === 'RATIO').forEach(m => {
    result[m.field_id] = evalFormula(m.formula, result);
  });

  return result;
}

export function processTableRows(rawData, metricDefs) {
  return rawData.map(row => {
    const values = {};
    // Base metrics
    metricDefs.filter(m => m.source_field && m.aggregation !== 'FORMULA' && m.aggregation !== 'RATIO').forEach(m => {
      values[m.field_id] = Number(row[m.source_field]) || 0;
    });
    // Formula metrics per row
    metricDefs.filter(m => m.aggregation === 'FORMULA' || m.aggregation === 'RATIO').forEach(m => {
      values[m.field_id] = evalFormula(m.formula, values);
    });
    return { ...row, ...values };
  });
}

export function formatMetricValue(value, fmt) {
  if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) return '-';
  const num = Number(value);
  switch (fmt) {
    case 'currency':
      return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'percent':
      return num.toFixed(1) + '%';
    case 'integer':
      return Math.round(num).toLocaleString();
    case 'number':
      return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
    default:
      if (typeof value === 'number') return num.toLocaleString();
      return String(value);
  }
}

export function buildAggregations(metrics) {
  return metrics
    .filter(m => m.source_field && m.aggregation !== 'FORMULA' && m.aggregation !== 'RATIO')
    .map(m => ({
      field: m.source_field,
      function: m.aggregation === 'COUNT_DISTINCT' ? 'count_distinct' : m.aggregation.toLowerCase(),
      alias: m.source_field,
      visible: true,
      format: m.format,
    }));
}

export function computeDelta(current, prior) {
  if (!prior || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}
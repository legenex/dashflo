export function evalFormula(formula, values) {
  if (!formula) return 0;
  let expr = formula;
  for (const [key, val] of Object.entries(values)) {
    expr = expr.replace(new RegExp(`\\{${key}\\}`, 'g'), String(isFinite(Number(val)) ? Number(val) : 0));
  }
  // Check for unresolved tokens
  if (/\{[^}]+\}/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + expr + ')')();
    return isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export function computeRowValues(row, metricDefs) {
  const values = {};
  // Pass 1: base metrics
  metricDefs.filter(m => m.aggregation !== 'FORMULA' && m.aggregation !== 'RATIO').forEach(m => {
    const field = m.source_field || m.field_id;
    const v = row[field];
    values[m.field_id] = isFinite(Number(v)) ? Number(v) : 0;
  });
  // Pass 2: formula/ratio metrics
  metricDefs.filter(m => m.aggregation === 'FORMULA' || m.aggregation === 'RATIO').forEach(m => {
    values[m.field_id] = evalFormula(m.formula, values) ?? 0;
  });
  return values;
}

export function aggregateRows(rows, metricDefs) {
  if (!rows || rows.length === 0) return {};
  const sums = {};
  const counts = {};
  metricDefs.filter(m => m.aggregation !== 'FORMULA' && m.aggregation !== 'RATIO').forEach(m => {
    const field = m.source_field || m.field_id;
    if (m.aggregation === 'AVG') {
      const vals = rows.map(r => Number(r[field])).filter(v => isFinite(v) && v !== 0);
      sums[m.field_id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    } else {
      sums[m.field_id] = rows.reduce((s, r) => s + (isFinite(Number(r[field])) ? Number(r[field]) : 0), 0);
    }
  });
  metricDefs.filter(m => m.aggregation === 'FORMULA' || m.aggregation === 'RATIO').forEach(m => {
    sums[m.field_id] = evalFormula(m.formula, sums) ?? 0;
  });
  return sums;
}

export function formatValue(value, fmt) {
  if (value === null || value === undefined) return '—';
  if (!isFinite(Number(value))) return String(value);
  const n = Number(value);
  switch (fmt) {
    case 'currency': return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'percent': return n.toFixed(1) + '%';
    case 'integer': return Math.round(n).toLocaleString();
    case 'number': default: return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
}

export function computeDelta(current, prior) {
  if (!prior || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

export function buildAggregationsFromMetrics(metrics) {
  return metrics
    .filter(m => m.source_field && m.aggregation !== 'FORMULA' && m.aggregation !== 'RATIO')
    .map(m => ({
      field: m.source_field,
      function: m.aggregation === 'COUNT_DISTINCT' ? 'count_distinct' : m.aggregation.toLowerCase(),
      alias: m.source_field,
      visible: true,
    }));
}

export function priorRange(dateRange) {
  const s = new Date(dateRange.start);
  const e = new Date(dateRange.end);
  const days = Math.max(1, Math.round((e - s) / 86400000) + 1);
  const pe = new Date(s); pe.setDate(pe.getDate() - 1);
  const ps = new Date(pe); ps.setDate(ps.getDate() - days + 1);
  return {
    start: ps.toISOString().slice(0, 10),
    end: pe.toISOString().slice(0, 10),
  };
}
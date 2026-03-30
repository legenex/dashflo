import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function detectType(value) {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    // Date detection: ISO date strings or date-time
    if (/^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?$/.test(value)) return 'date';
    // Numeric strings
    if (!isNaN(Number(value)) && value.trim() !== '') return 'number';
    return 'string';
  }
  return 'string';
}

function getNestedValue(obj, path) {
  if (!path || path.trim() === '') return obj;
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : null), obj);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { api_url, api_method = 'GET', api_key, api_headers, api_payload, response_path } = body;

    if (!api_url) return Response.json({ success: false, error: 'api_url is required' });

    // Build URL with default date range for schema sampling
    const url = new URL(api_url);
    if (!url.searchParams.has('start_date')) url.searchParams.set('start_date', '2024-01-01');
    if (!url.searchParams.has('end_date'))   url.searchParams.set('end_date',   '2024-01-07');
    if (!url.searchParams.has('offset'))     url.searchParams.set('offset',     '0');

    // Build headers
    const headers = { 'Content-Type': 'application/json' };
    if (api_key) headers['Authorization'] = `Bearer ${api_key}`;
    if (api_headers) {
      try {
        const extra = JSON.parse(api_headers);
        Object.assign(headers, extra);
      } catch (_) { /* ignore */ }
    }

    const fetchOptions = { method: api_method.toUpperCase(), headers };
    if (api_method.toUpperCase() !== 'GET' && api_payload) {
      fetchOptions.body = api_payload;
    }

    const res = await fetch(url.toString(), fetchOptions);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return Response.json({ success: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` });
    }

    const json = await res.json();

    // Extract data array using response_path (default: "data")
    const effectivePath = response_path && response_path.trim() !== '' ? response_path : 'data';
    let records = getNestedValue(json, effectivePath);

    // Fallback: if resolved value isn't array, try root
    if (!Array.isArray(records)) {
      if (Array.isArray(json)) records = json;
      else records = json ? [json] : [];
    }

    if (records.length === 0) {
      return Response.json({ success: false, error: 'No records found to analyze. Try a wider date range.' });
    }

    // Detect fields from first record (flatten top-level only)
    const sample = records[0];
    const fields = Object.keys(sample).map(name => ({
      name,
      type: detectType(sample[name]),
    }));

    return Response.json({
      success: true,
      fields,
      total_fields: fields.length,
      records_analyzed: records.length,
      sample_record: sample,
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message });
  }
});
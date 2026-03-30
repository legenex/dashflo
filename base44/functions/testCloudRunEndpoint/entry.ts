import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { api_url, api_method = 'GET', api_key, api_headers, api_payload } = body;

    if (!api_url) return Response.json({ success: false, error: 'api_url is required' }, { status: 400 });

    // Build URL — append default test params for our Cloud Run API
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
      } catch (_) { /* ignore bad JSON */ }
    }

    // Build request options
    const fetchOptions = { method: api_method.toUpperCase(), headers };
    if (api_method.toUpperCase() !== 'GET' && api_payload) {
      fetchOptions.body = api_payload;
    }

    const res = await fetch(url.toString(), fetchOptions);
    const status = res.status;

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return Response.json({ success: false, error: `HTTP ${status}: ${text.slice(0, 300)}`, status });
    }

    const json = await res.json();

    // Detect array — support both raw array and { data: [] } envelope
    let records = [];
    if (Array.isArray(json)) {
      records = json;
    } else if (json && Array.isArray(json.data)) {
      records = json.data;
    } else if (json && typeof json === 'object') {
      records = [json];
    }

    return Response.json({
      success: true,
      status,
      is_array: Array.isArray(json) || (json && Array.isArray(json.data)),
      record_count: records.length,
      sample_data: records.slice(0, 2),
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message, status: 0 });
  }
});
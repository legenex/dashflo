Deno.serve(async (req) => {
  try {
    const { api_url, api_method = 'GET', api_key, api_headers, api_payload } = await req.json();

    if (!api_url) return Response.json({ success: false, error: 'api_url is required' });

    const url = new URL(api_url);
    if (!url.searchParams.has('start_date')) url.searchParams.set('start_date', '2024-01-01');
    if (!url.searchParams.has('end_date'))   url.searchParams.set('end_date',   '2024-01-31');
    if (!url.searchParams.has('offset'))     url.searchParams.set('offset',     '0');

    const headers = { 'Content-Type': 'application/json' };
    if (api_key) headers['Authorization'] = `Bearer ${api_key}`;
    if (api_headers) {
      try { Object.assign(headers, JSON.parse(api_headers)); } catch (_) {}
    }

    const fetchOptions = { method: api_method.toUpperCase(), headers };
    if (api_method.toUpperCase() !== 'GET' && api_payload) fetchOptions.body = api_payload;

    const res = await fetch(url.toString(), fetchOptions);
    const status = res.status;

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return Response.json({ success: false, error: `HTTP ${status}: ${text.slice(0, 300)}`, status });
    }

    const json = await res.json();
    const records = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : [json]);

    return Response.json({
      success: true,
      status,
      is_array: Array.isArray(json) || Array.isArray(json?.data),
      record_count: records.length,
      sample_data: records.slice(0, 2),
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message, status: 0 });
  }
});
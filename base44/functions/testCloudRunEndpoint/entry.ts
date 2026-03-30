Deno.serve(async (req) => {
  try {
    const { api_url, api_method = 'GET', api_key, api_headers, api_payload } = await req.json();

    if (!api_url) return Response.json({ success: false, error: 'api_url is required' });

    const now = new Date();
    const end_date = now.toISOString().slice(0, 10);
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    const start_date = start.toISOString().slice(0, 10);

    const url = new URL(api_url);
    url.searchParams.set('start_date', start_date);
    url.searchParams.set('end_date', end_date);
    url.searchParams.set('offset', '0');

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

    let data;
    if (Array.isArray(json?.data)) {
      data = json.data;
    } else if (Array.isArray(json)) {
      data = json;
    } else {
      return Response.json({ success: false, error: 'Could not find data array in response' });
    }

    return Response.json({
      success: true,
      status,
      is_array: true,
      record_count: data.length,
      sample_data: data.slice(0, 2),
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message, status: 0 });
  }
});
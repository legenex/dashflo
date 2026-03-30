function detectType(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
  return 'string';
}

function getNestedValue(obj, path) {
  if (!path || path.trim() === '') return obj;
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : null), obj);
}

Deno.serve(async (req) => {
  try {
    const { api_url, api_method = 'GET', api_key, api_headers, api_payload, response_path } = await req.json();

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
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return Response.json({ success: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` });
    }

    const json = await res.json();

    let data;
    if (response_path && response_path.trim() !== '') {
      const nested = getNestedValue(json, response_path);
      data = Array.isArray(nested) ? nested : null;
    }
    if (!data) {
      if (Array.isArray(json?.data)) data = json.data;
      else if (Array.isArray(json)) data = json;
      else return Response.json({ success: false, error: 'Could not find data array in response' });
    }

    if (data.length === 0) {
      return Response.json({ success: false, error: 'No records found to analyze.' });
    }

    const sample = data[0];
    const fields = Object.keys(sample).map(name => ({
      name,
      type: detectType(sample[name]),
    }));

    return Response.json({
      success: true,
      fields,
      total_fields: fields.length,
      records_analyzed: data.length,
      sample_record: sample,
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message });
  }
});
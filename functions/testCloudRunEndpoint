import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      api_url, 
      api_method, 
      api_key, 
      api_headers,
      api_payload 
    } = await req.json();

    if (!api_url) {
      return Response.json({ 
        error: 'API URL is required' 
      }, { status: 400 });
    }

    // Build headers
    const headers = {
      'Content-Type': 'application/json'
    };

    if (api_key) {
      headers['Authorization'] = `Bearer ${api_key}`;
    }

    if (api_headers) {
      try {
        const customHeaders = JSON.parse(api_headers);
        Object.assign(headers, customHeaders);
      } catch (e) {
        // Invalid JSON in headers, ignore
      }
    }

    // Make the API call
    const fetchOptions = {
      method: api_method || 'GET',
      headers: headers
    };

    if (api_method === 'POST' && api_payload) {
      fetchOptions.body = api_payload;
    }

    const response = await fetch(api_url, fetchOptions);
    const data = await response.json();

    // Get sample of first few records
    let sampleData = data;
    if (Array.isArray(data)) {
      sampleData = data.slice(0, 3);
    }

    return Response.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      is_array: Array.isArray(data),
      record_count: Array.isArray(data) ? data.length : 1,
      sample_data: sampleData
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      details: error.toString()
    }, { status: 500 });
  }
});
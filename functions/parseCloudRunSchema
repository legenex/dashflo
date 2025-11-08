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
      api_payload,
      response_path
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
    
    if (!response.ok) {
      return Response.json({
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`
      }, { status: 400 });
    }

    let data = await response.json();
    const originalData = JSON.parse(JSON.stringify(data)); // Keep a copy for debugging

    // Navigate to response path if specified
    if (response_path && response_path.trim() !== '') {
      const paths = response_path.split('.');
      for (const path of paths) {
        if (data && typeof data === 'object' && path in data) {
          data = data[path];
        } else {
          return Response.json({
            success: false,
            error: `Path "${response_path}" not found in response. Available keys: ${Object.keys(data).join(', ')}`
          }, { status: 400 });
        }
      }
    }

    // Ensure we have an array to work with
    let recordsToAnalyze = [];
    
    if (Array.isArray(data)) {
      recordsToAnalyze = data.slice(0, 5); // Analyze first 5 records
    } else if (data && typeof data === 'object') {
      // Check if data has a 'data' property that is an array
      if (Array.isArray(data.data)) {
        recordsToAnalyze = data.data.slice(0, 5);
      } else {
        recordsToAnalyze = [data];
      }
    } else {
      return Response.json({
        success: false,
        error: 'Response is not an object or array. Response type: ' + typeof data
      }, { status: 400 });
    }

    if (recordsToAnalyze.length === 0) {
      return Response.json({
        success: false,
        error: 'No data returned from API or data array is empty'
      }, { status: 400 });
    }

    // Flatten nested objects for better field detection
    const flattenObject = (obj, prefix = '') => {
      const flattened = {};
      for (const key in obj) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (value && typeof value === 'object' && !Array.isArray(value) && value.value !== undefined) {
          // Handle objects with 'value' property (like date_updated: {value: "..."})
          flattened[newKey] = value.value;
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          // Recursively flatten nested objects
          Object.assign(flattened, flattenObject(value, newKey));
        } else {
          flattened[newKey] = value;
        }
      }
      return flattened;
    };

    // Flatten all records
    const flattenedRecords = recordsToAnalyze.map(record => flattenObject(record));

    // Collect all unique field names across all records
    const allFields = new Set();
    flattenedRecords.forEach(record => {
      Object.keys(record).forEach(key => allFields.add(key));
    });

    // Analyze each field across all sample records
    const fields = Array.from(allFields).map(fieldName => {
      const values = flattenedRecords.map(r => r[fieldName]).filter(v => v !== null && v !== undefined && v !== '');
      
      if (values.length === 0) {
        return { name: fieldName, type: 'STRING' };
      }

      // Check all values to determine most appropriate type
      const types = new Set();
      values.forEach(value => {
        if (typeof value === 'number') {
          types.add(Number.isInteger(value) ? 'INTEGER' : 'FLOAT');
        } else if (typeof value === 'boolean') {
          types.add('BOOLEAN');
        } else if (typeof value === 'string') {
          // Check for date/timestamp patterns
          if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
            types.add('TIMESTAMP');
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            types.add('DATE');
          } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
            types.add('DATE');
          } else {
            types.add('STRING');
          }
        } else if (typeof value === 'object' && value !== null) {
          types.add(Array.isArray(value) ? 'ARRAY' : 'JSON');
        }
      });

      // Priority: TIMESTAMP > DATE > FLOAT > INTEGER > BOOLEAN > JSON > ARRAY > STRING
      let finalType = 'STRING';
      if (types.has('TIMESTAMP')) finalType = 'TIMESTAMP';
      else if (types.has('DATE')) finalType = 'DATE';
      else if (types.has('FLOAT')) finalType = 'FLOAT';
      else if (types.has('INTEGER')) finalType = 'INTEGER';
      else if (types.has('BOOLEAN')) finalType = 'BOOLEAN';
      else if (types.has('JSON')) finalType = 'JSON';
      else if (types.has('ARRAY')) finalType = 'ARRAY';

      return {
        name: fieldName,
        type: finalType
      };
    });

    return Response.json({
      success: true,
      fields: fields.sort((a, b) => a.name.localeCompare(b.name)),
      total_fields: fields.length,
      records_analyzed: flattenedRecords.length,
      sample_record: flattenedRecords[0]
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      details: error.toString()
    }, { status: 500 });
  }
});
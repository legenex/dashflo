import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data_source, field } = await req.json();

    if (!data_source || !field) {
      return Response.json({ error: 'Data source and field are required' }, { status: 400 });
    }

    const allSyncConfigs = await base44.asServiceRole.entities.SyncConfiguration.list();
    
    const syncConfig = allSyncConfigs.find(s => 
      s.id === data_source || 
      s.name === data_source || 
      s.local_table_name === data_source
    );

    if (!syncConfig) {
      return Response.json({ 
        error: `Data source "${data_source}" not found` 
      }, { status: 404 });
    }

    let data = [];

    if (syncConfig.sync_type === 'cloud_run') {
      const headers = {
        'Content-Type': 'application/json'
      };

      if (syncConfig.api_key) {
        headers['Authorization'] = `Bearer ${syncConfig.api_key}`;
      }

      if (syncConfig.api_headers) {
        try {
          const customHeaders = JSON.parse(syncConfig.api_headers);
          Object.assign(headers, customHeaders);
        } catch (e) {
          console.error('Invalid JSON in api_headers');
        }
      }

      const fetchOptions = {
        method: syncConfig.api_method || 'GET',
        headers
      };

      if (syncConfig.api_method === 'POST' && syncConfig.api_payload) {
        fetchOptions.body = syncConfig.api_payload;
      }

      const response = await fetch(syncConfig.api_url, fetchOptions);
      
      if (!response.ok) {
        return Response.json({ 
          error: `Failed to fetch from API: ${response.status} ${response.statusText}` 
        }, { status: 500 });
      }

      let apiData = await response.json();

      if (syncConfig.response_path && syncConfig.response_path.trim() !== '') {
        const paths = syncConfig.response_path.split('.');
        for (const path of paths) {
          if (apiData && typeof apiData === 'object' && path in apiData) {
            apiData = apiData[path];
          }
        }
      }

      if (apiData && typeof apiData === 'object' && Array.isArray(apiData.data)) {
        data = apiData.data;
      } else if (Array.isArray(apiData)) {
        data = apiData;
      } else if (apiData) {
        data = [apiData];
      }

      data = data.map(record => {
        const flattened = {};
        for (const key in record) {
          const value = record[key];
          if (value && typeof value === 'object' && !Array.isArray(value) && value.value !== undefined) {
            flattened[key] = value.value;
          } else {
            flattened[key] = value;
          }
        }
        return flattened;
      });
    }

    // Extract unique values for the specified field
    const uniqueValues = new Set();
    data.forEach(row => {
      const value = row[field];
      if (value !== null && value !== undefined && value !== '') {
        uniqueValues.add(String(value));
      }
    });

    // Convert to sorted array
    const options = Array.from(uniqueValues).sort();

    return Response.json({
      success: true,
      field: field,
      options: options,
      total_count: options.length
    });

  } catch (error) {
    console.error('Error fetching field options:', error);
    return Response.json({ 
      error: error.message,
      details: error.toString()
    }, { status: 500 });
  }
});
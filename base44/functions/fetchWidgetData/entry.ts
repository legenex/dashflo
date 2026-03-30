import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  let data_source = '(unknown)';
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    ({ data_source } = body);
    const { query_config = {}, date_range, custom_filters = [] } = body;

    if (!data_source) {
      return Response.json({ error: 'data_source is required' }, { status: 400 });
    }

    // ── Step 1: Resolve SyncConfiguration ──────────────────────────────────
    const allSyncConfigs = await base44.asServiceRole.entities.SyncConfiguration.list();
    const isUuid = /^[0-9a-f-]{36}$/i.test(data_source);
    const syncConfig = isUuid
      ? allSyncConfigs.find(s => s.id === data_source)
      : allSyncConfigs.find(s => s.name === data_source || s.local_table_name === data_source);

    if (!syncConfig) {
      throw new Error(`No SyncConfiguration found for data_source: "${data_source}"`);
    }

    // ── Step 2: Fetch raw data ──────────────────────────────────────────────
    let data = [];

    if (syncConfig.sync_type === 'cloud_run') {
      // Cloud Run: paginated offset fetch
      const headers = { 'Content-Type': 'application/json' };
      if (syncConfig.api_key) headers['Authorization'] = `Bearer ${syncConfig.api_key}`;

      const pageSize = Number(syncConfig.page_size) || 1000;
      let offset = 0;
      let hasMore = true;
      let pageCount = 0;
      const maxPages = 200;

      while (hasMore && pageCount < maxPages) {
        pageCount++;
        const url = new URL(syncConfig.api_url);
        url.searchParams.set('offset', String(offset));
        if (date_range?.start) url.searchParams.set('start_date', date_range.start);
        if (date_range?.end) url.searchParams.set('end_date', date_range.end);

        const res = await fetch(url.toString(), { method: 'GET', headers });
        if (!res.ok) throw new Error(`Cloud Run fetch failed: HTTP ${res.status}`);

        const json = await res.json();
        let pageRecords = [];

        if (Array.isArray(json)) {
          pageRecords = json;
        } else if (Array.isArray(json.data)) {
          pageRecords = json.data;
        } else if (json && typeof json === 'object') {
          pageRecords = [json];
        }

        // Flatten any {value: ...} wrapper objects
        pageRecords = pageRecords.map(record => {
          const flat = {};
          for (const key in record) {
            const v = record[key];
            flat[key] = (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) ? v.value : v;
          }
          return flat;
        });

        data = data.concat(pageRecords);

        const actualPageSize = pageRecords.length;
        offset += actualPageSize;
        hasMore = actualPageSize >= pageSize;

        if (actualPageSize === 0) break;
      }

      // Normalise Cloud Run field names to lowercase
      data = data.map(row =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]))
      );

    } else if (syncConfig.sync_type === 'bigquery') {
      // BigQuery: JWT → OAuth2 → REST API
      let sa;
      try {
        sa = typeof syncConfig.service_account_json === 'string'
          ? JSON.parse(syncConfig.service_account_json)
          : syncConfig.service_account_json;
      } catch (e) {
        throw new Error('BigQuery service_account_json is missing or invalid JSON');
      }
      if (!sa?.private_key || !sa?.client_email) {
        throw new Error('BigQuery service_account_json is missing private_key or client_email');
      }

      // Build JWT
      const now = Math.floor(Date.now() / 1000);
      const b64u = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const header = { alg: 'RS256', typ: 'JWT' };
      const claims = {
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/bigquery.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      };
      const toSign = b64u(header) + '.' + b64u(claims);
      const pemBody = sa.private_key.replace(/-----[^\n]+\n?/g, '').replace(/\n/g, '');
      const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
      const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', der.buffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
      );
      const sigBytes = await crypto.subtle.sign(
        { name: 'RSASSA-PKCS1-v1_5' }, cryptoKey, new TextEncoder().encode(toSign)
      );
      const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const jwt = toSign + '.' + sig;

      // Exchange JWT for access token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        throw new Error('Failed to get BigQuery access token: ' + (tokenData.error_description || JSON.stringify(tokenData)));
      }
      const accessToken = tokenData.access_token;

      // Build SQL
      const projectId = syncConfig.project_id;
      const dataset = syncConfig.dataset_id || syncConfig.dataset;
      const table = syncConfig.table_name;
      if (!projectId || !dataset || !table) {
        throw new Error('BigQuery config missing project_id, dataset_id, or table_name');
      }

      let sql = `SELECT * FROM \`${projectId}.${dataset}.${table}\` WHERE 1=1`;
      if (date_range?.start && date_range?.end && syncConfig.date_field) {
        sql += ` AND \`${syncConfig.date_field}\` >= '${date_range.start}' AND \`${syncConfig.date_field}\` <= '${date_range.end}'`;
      }

      const bqHeaders = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
      const queryUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`;

      const bqRes = await fetch(queryUrl, {
        method: 'POST',
        headers: bqHeaders,
        body: JSON.stringify({ query: sql, useLegacySql: false, maxResults: 10000 }),
      });
      let bqBody = await bqRes.json();
      if (!bqRes.ok || bqBody.error) {
        throw new Error('BigQuery query failed: ' + (bqBody.error?.message || JSON.stringify(bqBody.error)));
      }

      // Poll if not complete
      const jobId = bqBody.jobReference?.jobId;
      const location = bqBody.jobReference?.location;
      if (jobId && bqBody.jobComplete === false) {
        let attempts = 0;
        while (!bqBody.jobComplete && attempts < 30) {
          await new Promise(r => setTimeout(r, 1000));
          const pollUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries/${jobId}?maxResults=10000` + (location ? `&location=${location}` : '');
          const pollRes = await fetch(pollUrl, { headers: bqHeaders });
          bqBody = await pollRes.json();
          attempts++;
        }
      }

      // Schema normalisation helper
      const schemaFields = bqBody.schema?.fields || [];
      const normaliseRows = (rows) => {
        if (!rows) return [];
        return rows.map(row =>
          Object.fromEntries(schemaFields.map((f, i) => {
            const raw = row.f?.[i]?.v ?? null;
            let val = raw;
            if (raw !== null) {
              if (f.type === 'INTEGER' || f.type === 'FLOAT' || f.type === 'NUMERIC' || f.type === 'BIGNUMERIC') {
                val = Number(raw);
              } else if (f.type === 'BOOLEAN') {
                val = raw === 'true' || raw === true;
              } else {
                val = String(raw);
              }
            }
            return [f.name, val];
          }))
        );
      };

      data = normaliseRows(bqBody.rows);

      // Paginate via pageToken
      let pageToken = bqBody.pageToken;
      let pageCount = 1;
      while (pageToken && pageCount < 100) {
        pageCount++;
        const pageUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries/${jobId}?pageToken=${encodeURIComponent(pageToken)}&maxResults=10000` + (location ? `&location=${location}` : '');
        const pageRes = await fetch(pageUrl, { headers: bqHeaders });
        const pageBody = await pageRes.json();
        if (!pageRes.ok || pageBody.error) break;
        data = data.concat(normaliseRows(pageBody.rows));
        pageToken = pageBody.pageToken;
      }

    } else {
      throw new Error(`Unsupported sync_type: "${syncConfig.sync_type}"`);
    }

    // ── Step 3: Apply custom_filters ────────────────────────────────────────
    const applyFilter = (row, filter) => {
      const { field, operator, value } = filter;
      const rowVal = row[field];

      if (operator === 'is_null') return rowVal === null || rowVal === undefined || rowVal === '';
      if (operator === 'is_not_null') return rowVal !== null && rowVal !== undefined && rowVal !== '';
      if (rowVal === null || rowVal === undefined) return false;

      const strVal = String(rowVal).toLowerCase();
      const strFilter = String(value).toLowerCase();

      switch (operator) {
        case 'equals': case '=': return strVal === strFilter;
        case 'not_equals': case '!=': return strVal !== strFilter;
        case 'greater_than': case '>': return Number(rowVal) > Number(value);
        case 'less_than': case '<': return Number(rowVal) < Number(value);
        case 'greater_or_equal': case '>=': return Number(rowVal) >= Number(value);
        case 'less_or_equal': case '<=': return Number(rowVal) <= Number(value);
        case 'contains': return strVal.includes(strFilter);
        case 'not_contains': return !strVal.includes(strFilter);
        default: return true;
      }
    };

    if (custom_filters.length > 0) {
      data = data.filter(row => custom_filters.every(f => applyFilter(row, f)));
    }

    // ── Step 4: Apply date filter (client-side fallback) ────────────────────
    if (date_range?.start && date_range?.end && syncConfig.date_field) {
      const startDate = new Date(date_range.start + 'T00:00:00');
      const endDate = new Date(date_range.end + 'T23:59:59');

      data = data.filter(row => {
        const dateValue = row[syncConfig.date_field];
        if (!dateValue) return false;
        const rowDate = new Date(dateValue);
        if (isNaN(rowDate.getTime())) return false;
        return rowDate >= startDate && rowDate <= endDate;
      });
    }

    // Apply query_config filters
    if (query_config.filters?.length > 0) {
      data = data.filter(row => query_config.filters.every(f => applyFilter(row, f)));
    }

    // ── Step 5: Aggregation and grouping ─────────────────────────────────────
    const aggregations = query_config.aggregations || [];
    const groupByFields = Array.isArray(query_config.group_by)
      ? query_config.group_by
      : (query_config.group_by ? [query_config.group_by] : []);

    if (groupByFields.length > 0 || aggregations.length > 0) {
      const regularAggs = aggregations.filter(a => a.function !== 'formula');
      const formulaAggs = aggregations.filter(a => a.function === 'formula');

      if (groupByFields.length > 0) {
        // Group rows
        const groups = new Map();
        for (const row of data) {
          const key = groupByFields.map(f => String(row[f] ?? '')).join('|||');
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(row);
        }

        data = Array.from(groups.entries()).map(([key, rows]) => {
          const result = {};
          // Set dimension values
          groupByFields.forEach((f, i) => { result[f] = rows[0][f] ?? null; });

          // Compute aggregations
          for (const agg of regularAggs) {
            const { field, function: fn, alias } = agg;
            const col = alias || field;
            const nums = rows.map(r => Number(r[field])).filter(v => !isNaN(v));
            if (fn === 'SUM' || fn === 'sum') result[col] = nums.reduce((s, v) => s + v, 0);
            else if (fn === 'AVG' || fn === 'avg') result[col] = nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : 0;
            else if (fn === 'COUNT' || fn === 'count') result[col] = rows.length;
            else if (fn === 'COUNT_DISTINCT' || fn === 'count_distinct') result[col] = new Set(rows.map(r => r[field])).size;
            else if (fn === 'MIN' || fn === 'min') result[col] = nums.length ? Math.min(...nums) : null;
            else if (fn === 'MAX' || fn === 'max') result[col] = nums.length ? Math.max(...nums) : null;
            else result[col] = nums.reduce((s, v) => s + v, 0);
          }

          // Compute formula fields
          for (const agg of formulaAggs) {
            const { alias } = agg;
            const formula = alias;
            const clean = formula.replace(/[^0-9a-zA-Z+\-*/(). _]/g, '');
            if (!clean.trim()) { result[alias] = null; continue; }
            try {
              const args = Object.keys(result);
              const vals = Object.values(result);
              result[alias] = new Function(...args, `return ${clean}`)(...vals);
            } catch { result[alias] = null; }
          }

          return result;
        });

      } else {
        // No grouping — aggregate entire dataset into one row
        const result = {};

        for (const agg of regularAggs) {
          const { field, function: fn, alias } = agg;
          const col = alias || field;
          const nums = data.map(r => Number(r[field])).filter(v => !isNaN(v));
          if (fn === 'SUM' || fn === 'sum') result[col] = nums.reduce((s, v) => s + v, 0);
          else if (fn === 'AVG' || fn === 'avg') result[col] = nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : 0;
          else if (fn === 'COUNT' || fn === 'count') result[col] = data.length;
          else if (fn === 'COUNT_DISTINCT' || fn === 'count_distinct') result[col] = new Set(data.map(r => r[field])).size;
          else if (fn === 'MIN' || fn === 'min') result[col] = nums.length ? Math.min(...nums) : null;
          else if (fn === 'MAX' || fn === 'max') result[col] = nums.length ? Math.max(...nums) : null;
          else result[col] = nums.reduce((s, v) => s + v, 0);
        }

        for (const agg of formulaAggs) {
          const formula = agg.alias;
          const clean = formula.replace(/[^0-9a-zA-Z+\-*/(). _]/g, '');
          if (!clean.trim()) { result[agg.alias] = null; continue; }
          try {
            const args = Object.keys(result);
            const vals = Object.values(result);
            result[agg.alias] = new Function(...args, `return ${clean}`)(...vals);
          } catch { result[agg.alias] = null; }
        }

        data = [result];
      }
    }

    // ── Step 7: Column selection ─────────────────────────────────────────────
    const columns = query_config.columns;
    if (Array.isArray(columns) && columns.length > 0) {
      data = data.map(row => {
        const out = {};
        columns.forEach(col => { if (col in row) out[col] = row[col]; });
        return out;
      });
    }

    // ── Step 8: Sorting and limit ────────────────────────────────────────────
    if (query_config.sort_by) {
      const sortField = query_config.sort_by;
      const desc = query_config.sort_order === 'desc';
      data.sort((a, b) => {
        const av = a[sortField], bv = b[sortField];
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
        return desc ? -cmp : cmp;
      });
    }

    const limit = query_config.limit || 10000;
    data = data.slice(0, limit);

    // ── Step 9: Return ───────────────────────────────────────────────────────
    return Response.json(data);

  } catch (error) {
    console.error(`fetchWidgetData error [${data_source}]:`, error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
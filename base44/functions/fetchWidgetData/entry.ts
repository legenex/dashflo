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
      : allSyncConfigs.find(s =>
          s.name === data_source ||
          s.local_table_name === data_source ||
          s.table_name === data_source
        );

    if (!syncConfig) {
      throw new Error(`No SyncConfiguration found for data_source: "${data_source}". Available: ${allSyncConfigs.map(s => s.name).join(', ')}`);
    }

    console.log(`[fetchWidgetData] Resolved sync: "${syncConfig.name}" (type: ${syncConfig.sync_type})`);

    // ── Step 2: Fetch raw data ──────────────────────────────────────────────
    let data = [];

    if (syncConfig.sync_type === 'cloud_run') {
      const headers = { 'Content-Type': 'application/json' };
      if (syncConfig.api_key) headers['Authorization'] = `Bearer ${syncConfig.api_key}`;
      if (syncConfig.api_headers) {
        try { Object.assign(headers, JSON.parse(syncConfig.api_headers)); } catch (e) {}
      }

      const pageSize = Number(syncConfig.page_size) || 1000;
      let offset = 0;
      let pageCount = 0;
      const maxPages = 200;
      let hasMore = true;

      while (hasMore && pageCount < maxPages) {
        pageCount++;
        const url = new URL(syncConfig.api_url);
        url.searchParams.set('offset', String(offset));
        if (date_range?.start) url.searchParams.set('start_date', date_range.start);
        if (date_range?.end) url.searchParams.set('end_date', date_range.end);

        const fetchOptions = { method: syncConfig.api_method || 'GET', headers };
        if ((syncConfig.api_method || 'GET') === 'POST' && syncConfig.api_payload) {
          fetchOptions.body = syncConfig.api_payload;
        }

        const res = await fetch(url.toString(), fetchOptions);
        if (!res.ok) throw new Error(`Cloud Run fetch failed: HTTP ${res.status} — ${url.toString()}`);

        let json = await res.json();

        // Extract array from response
        let pageRecords = [];
        if (syncConfig.response_path) {
          let extracted = json;
          for (const part of syncConfig.response_path.split('.')) {
            extracted = extracted?.[part];
          }
          if (Array.isArray(extracted)) pageRecords = extracted;
        }
        if (pageRecords.length === 0) {
          if (Array.isArray(json)) pageRecords = json;
          else if (Array.isArray(json?.data)) pageRecords = json.data;
          else if (json && typeof json === 'object') pageRecords = [json];
        }

        // Flatten {value: ...} wrappers and normalise keys to lowercase
        pageRecords = pageRecords.map(record => {
          const flat = {};
          for (const key in record) {
            const v = record[key];
            flat[key.toLowerCase()] = (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) ? v.value : v;
          }
          return flat;
        });

        data = data.concat(pageRecords);
        offset += pageRecords.length;
        hasMore = pageRecords.length >= pageSize;
        if (pageRecords.length === 0) break;
      }

      console.log(`[fetchWidgetData] Cloud Run: fetched ${data.length} records in ${pageCount} pages`);

    } else if (syncConfig.sync_type === 'bigquery') {
      // Parse service account
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

      // Build JWT for OAuth2
      const now = Math.floor(Date.now() / 1000);
      const b64u = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const toSign = b64u({ alg: 'RS256', typ: 'JWT' }) + '.' + b64u({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/bigquery.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now, exp: now + 3600,
      });
      const pemBody = sa.private_key.replace(/-----[^\n]+\n?/g, '').replace(/\n/g, '');
      const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
      const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', der.buffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
      );
      const sigBytes = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, cryptoKey, new TextEncoder().encode(toSign));
      const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
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

      // Build SQL
      const projectId = syncConfig.project_id;
      const dataset = syncConfig.dataset_id || syncConfig.dataset;
      const table = syncConfig.table_name;
      if (!projectId || !dataset || !table) {
        throw new Error(`BigQuery config incomplete — project_id: "${projectId}", dataset: "${dataset}", table: "${table}"`);
      }

      let sql = `SELECT * FROM \`${projectId}.${dataset}.${table}\` WHERE 1=1`;
      const dateField = syncConfig.date_field || syncConfig.incremental_field;
      if (date_range?.start && date_range?.end && dateField) {
        sql += ` AND \`${dateField}\` >= '${date_range.start}' AND \`${dateField}\` <= '${date_range.end}'`;
      }
      console.log(`[fetchWidgetData] BigQuery SQL: ${sql}`);

      const bqHeaders = { 'Authorization': `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' };
      const queryUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`;

      let bqBody = await (await fetch(queryUrl, {
        method: 'POST',
        headers: bqHeaders,
        body: JSON.stringify({ query: sql, useLegacySql: false, maxResults: 10000 }),
      })).json();

      if (bqBody.error) throw new Error('BigQuery query failed: ' + (bqBody.error?.message || JSON.stringify(bqBody)));

      // Poll for completion
      const jobId = bqBody.jobReference?.jobId;
      const location = bqBody.jobReference?.location;
      let attempts = 0;
      while (!bqBody.jobComplete && attempts < 30) {
        await new Promise(r => setTimeout(r, 1000));
        const pollUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries/${jobId}?maxResults=10000${location ? '&location=' + location : ''}`;
        bqBody = await (await fetch(pollUrl, { headers: bqHeaders })).json();
        attempts++;
      }

      // Normalise rows
      const schemaFields = bqBody.schema?.fields || [];
      const normaliseRows = (rows) => (rows || []).map(row =>
        Object.fromEntries(schemaFields.map((f, i) => {
          const raw = row.f?.[i]?.v ?? null;
          let val = raw;
          if (raw !== null) {
            if (['INTEGER','FLOAT','NUMERIC','BIGNUMERIC'].includes(f.type)) val = Number(raw);
            else if (f.type === 'BOOLEAN') val = raw === 'true' || raw === true;
            else val = String(raw);
          }
          return [f.name.toLowerCase(), val];
        }))
      );

      data = normaliseRows(bqBody.rows);

      // Paginate
      let pageToken = bqBody.pageToken;
      let pageCount = 1;
      while (pageToken && pageCount < 100) {
        pageCount++;
        const pageUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries/${jobId}?pageToken=${encodeURIComponent(pageToken)}&maxResults=10000${location ? '&location=' + location : ''}`;
        const pageBody = await (await fetch(pageUrl, { headers: bqHeaders })).json();
        if (pageBody.error) break;
        data = data.concat(normaliseRows(pageBody.rows));
        pageToken = pageBody.pageToken;
      }

      console.log(`[fetchWidgetData] BigQuery: fetched ${data.length} rows`);

    } else {
      throw new Error(`Unsupported sync_type: "${syncConfig.sync_type}"`);
    }

    // ── Step 3: Date filter (client-side fallback) ──────────────────────────
    const dateField = syncConfig.date_field || syncConfig.incremental_field;
    if (date_range?.start && date_range?.end) {
      const start = new Date(date_range.start + 'T00:00:00');
      const end = new Date(date_range.end + 'T23:59:59');
      const before = data.length;

      data = data.filter(row => {
        const candidate = dateField
          ? row[dateField.toLowerCase()] ?? row[dateField]
          : row.date ?? row.created_date ?? row.timestamp ?? row.created_at;
        if (!candidate) return true;
        const d = new Date(candidate);
        if (isNaN(d.getTime())) return true;
        return d >= start && d <= end;
      });

      console.log(`[fetchWidgetData] Date filter: ${before} → ${data.length} records`);
    }

    // ── Step 4: Custom filters ──────────────────────────────────────────────
    const applyFilter = (row, { field, operator, value }) => {
      const rowVal = row[field] ?? row[field?.toLowerCase()];
      if (operator === 'is_null') return rowVal == null || rowVal === '';
      if (operator === 'is_not_null') return rowVal != null && rowVal !== '';
      if (rowVal == null) return false;
      const sv = String(rowVal).toLowerCase();
      const sf = String(value).toLowerCase();
      switch (operator) {
        case 'equals': case '=': return sv === sf;
        case 'not_equals': case '!=': return sv !== sf;
        case '>': case 'greater_than': return Number(rowVal) > Number(value);
        case '<': case 'less_than': return Number(rowVal) < Number(value);
        case '>=': case 'greater_or_equal': return Number(rowVal) >= Number(value);
        case '<=': case 'less_or_equal': return Number(rowVal) <= Number(value);
        case 'contains': return sv.includes(sf);
        case 'not_contains': return !sv.includes(sf);
        case 'in': return String(value).split(',').map(v => v.trim().toLowerCase()).includes(sv);
        case 'not_in': return !String(value).split(',').map(v => v.trim().toLowerCase()).includes(sv);
        default: return true;
      }
    };

    if (custom_filters.length > 0) {
      data = data.filter(row => custom_filters.every(f => applyFilter(row, f)));
    }
    if (query_config.filters?.length > 0) {
      data = data.filter(row => query_config.filters.every(f => applyFilter(row, f)));
    }

    // ── Step 5: Aggregation ─────────────────────────────────────────────────
    const aggregations = query_config.aggregations || [];
    const groupByRaw = query_config.group_by;
    const groupByFields = Array.isArray(groupByRaw)
      ? groupByRaw
      : (groupByRaw ? [groupByRaw] : []);

    const computeAgg = (rows, agg) => {
      const { field, function: fn, alias } = agg;
      const fieldLower = field?.toLowerCase();
      const col = alias || field;
      const fnUp = (fn || '').toUpperCase();
      const vals = rows.map(r => r[field] ?? r[fieldLower]).filter(v => v != null);
      const nums = vals.map(Number).filter(v => !isNaN(v));
      if (fnUp === 'COUNT_IF') {
        const filterVal = String(agg.value || '').toLowerCase();
        const count = rows.filter(r => {
          const v = r[field] ?? r[fieldLower];
          return String(v ?? '').toLowerCase() === filterVal;
        }).length;
        return [col, count];
      }
      if (fnUp === 'COUNT') return [col, rows.length];
      if (fnUp === 'COUNT_DISTINCT') return [col, new Set(vals.map(String)).size];
      if (fnUp === 'SUM') return [col, nums.reduce((s, v) => s + v, 0)];
      if (fnUp === 'AVG') return [col, nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : 0];
      if (fnUp === 'MIN') return [col, nums.length ? Math.min(...nums) : null];
      if (fnUp === 'MAX') return [col, nums.length ? Math.max(...nums) : null];
      return [col, nums.reduce((s, v) => s + v, 0)]; // default SUM
    };

    if (groupByFields.length > 0 || aggregations.length > 0) {
      if (groupByFields.length > 0) {
        const groups = new Map();
        for (const row of data) {
          const key = groupByFields.map(f => String(row[f] ?? row[f?.toLowerCase()] ?? '')).join('|||');
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(row);
        }
        data = Array.from(groups.entries()).map(([, rows]) => {
          const result = {};
          groupByFields.forEach(f => { result[f] = rows[0][f] ?? rows[0][f?.toLowerCase()] ?? null; });
          for (const agg of aggregations) {
            const [col, val] = computeAgg(rows, agg);
            result[col] = val;
          }
          return result;
        });
      } else {
        const result = {};
        for (const agg of aggregations) {
          const [col, val] = computeAgg(data, agg);
          result[col] = val;
        }
        data = [result];
      }
    }

    // ── Step 6: Sort, limit, column select ──────────────────────────────────
    if (query_config.sort_by) {
      const desc = query_config.sort_order === 'desc';
      const sf = query_config.sort_by;
      data.sort((a, b) => {
        const av = a[sf], bv = b[sf];
        if (av == null) return 1; if (bv == null) return -1;
        const cmp = (typeof av === 'number' && typeof bv === 'number') ? av - bv : String(av).localeCompare(String(bv));
        return desc ? -cmp : cmp;
      });
    }

    data = data.slice(0, query_config.limit || 10000);

    const cols = query_config.columns;
    if (Array.isArray(cols) && cols.length > 0) {
      data = data.map(row => {
        const out = {};
        cols.forEach(c => { if (c in row) out[c] = row[c]; });
        return out;
      });
    }

    console.log(`[fetchWidgetData] Returning ${data.length} records`);
    return Response.json(data);

  } catch (error) {
    console.error(`[fetchWidgetData] ERROR [${data_source}]:`, error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
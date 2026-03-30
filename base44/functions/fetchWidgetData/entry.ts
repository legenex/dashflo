import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let data_source, query_config, date_range, custom_filters;
    try {
      const body = await req.json();
      ({ data_source, query_config, date_range, custom_filters } = body);
    } catch (jsonError) {
      console.error('Failed to parse request body:', jsonError.message);
      return Response.json({ 
        error: 'Invalid request body', 
        details: 'Request must include valid JSON with data_source and query_config' 
      }, { status: 400 });
    }

    console.log('\n========================================');
    console.log('FETCH WIDGET DATA REQUEST');
    console.log('========================================');
    console.log('Data Source:', data_source);
    console.log('Date Range:', date_range);
    console.log('Metric IDs (in order):', query_config?.metric_ids);

    if (!data_source) {
      return Response.json({ error: 'Data source is required' }, { status: 400 });
    }

    // Helper function to evaluate conditions for CASE WHEN
    const evaluateCondition = (row, condition, aggregations = {}, calculatedFields = {}) => {
      const { field, operator, value, value_type } = condition;
      
      let fieldValue = row[field];
      if (fieldValue === undefined && aggregations[field] !== undefined) {
        fieldValue = aggregations[field];
      }
      if (fieldValue === undefined && calculatedFields[field] !== undefined) {
        fieldValue = calculatedFields[field];
      }
      
      if (fieldValue === undefined || fieldValue === null) {
        return false;
      }
      
      let compareValue;
      if (value_type === 'field') {
        compareValue = row[value];
        if (compareValue === undefined && aggregations[value] !== undefined) {
          compareValue = aggregations[value];
        }
        if (compareValue === undefined && calculatedFields[value] !== undefined) {
          compareValue = calculatedFields[value];
        }
        if (compareValue === undefined || compareValue === null) {
          return false;
        }
      } else {
        compareValue = value;
      }
      
      switch (operator) {
        case 'equals':
          return String(fieldValue).toLowerCase() === String(compareValue).toLowerCase();
        case 'not_equals':
          return String(fieldValue).toLowerCase() !== String(compareValue).toLowerCase();
        case 'greater_than':
          return Number(fieldValue) > Number(compareValue);
        case 'less_than':
          return Number(fieldValue) < Number(compareValue);
        case 'greater_or_equal':
          return Number(fieldValue) >= Number(compareValue);
        case 'less_or_equal':
          return Number(fieldValue) <= Number(compareValue);
        case 'contains':
          return String(fieldValue).toLowerCase().includes(String(compareValue).toLowerCase());
        default:
          return false;
      }
    };
    
    // Helper function to evaluate simple formula expressions
    const evaluateSimpleFormula = (formulaString, rowData, existingMetrics = {}) => {
      if (!formulaString || formulaString.trim() === '') {
        return 0;
      }
      
      const singleFieldMatch = formulaString.match(/^\{([^}]+)\}$/);
      if (singleFieldMatch) {
        const fieldName = singleFieldMatch[1];
        
        let value = rowData[fieldName];
        if (value === undefined && existingMetrics[fieldName] !== undefined) {
          value = existingMetrics[fieldName];
        }
        
        if (value === undefined) {
          const allKeys = Object.keys(rowData).concat(Object.keys(existingMetrics));
          const matchedKey = allKeys.find(k => k.toLowerCase() === fieldName.toLowerCase());
          if (matchedKey) {
            value = (rowData[matchedKey] !== undefined) ? rowData[matchedKey] : existingMetrics[matchedKey];
          }
        }
        
        if (value !== undefined && value !== null) {
          return value;
        }
        
        console.log(`  WARNING: Field "${fieldName}" not found in data or metrics`);
        return 0;
      }
      
      let evalFormula = formulaString;
      const fieldMatches = formulaString.match(/\{([^}]+)\}/g);
      
      if (fieldMatches) {
        fieldMatches.forEach((match) => {
          const referencedField = match.slice(1, -1);
          
          let value = rowData[referencedField];
          if (value === undefined && existingMetrics[referencedField] !== undefined) {
            value = existingMetrics[referencedField];
          }
          
          if (value === undefined) {
            const allKeys = Object.keys(rowData).concat(Object.keys(existingMetrics));
            const matchedKey = allKeys.find(k => k.toLowerCase() === referencedField.toLowerCase());
            if (matchedKey) {
              value = (rowData[matchedKey] !== undefined) ? rowData[matchedKey] : existingMetrics[matchedKey];
            }
          }
          
          const numValue = value !== undefined && value !== null ? Number(value) : 0;
          evalFormula = evalFormula.replace(match, numValue.toString());
        });
      }
      
      const cleanFormula = evalFormula.replace(/[^0-9+\-*/(). ]/g, '');
      
      if (cleanFormula.trim() === '') {
        return 0;
      }
      
      try {
        const result = new Function(`return ${cleanFormula}`)();
        return Number.isFinite(result) ? result : 0;
      } catch (error) {
        console.error('Error evaluating formula:', error);
        return 0;
      }
    };

    // Fetch all metric definitions
    const allMetricDefinitions = await base44.asServiceRole.entities.MetricDefinition.list();
    
    let libraryMetrics = [];
    let requiredMetricIds = new Set();
    let orderedMetricIds = [];

    if (query_config?.metric_ids && query_config.metric_ids.length > 0) {
      query_config.metric_ids.forEach(id => {
        const metric = allMetricDefinitions.find(m => m.id === id);
        if (metric) {
          if (!requiredMetricIds.has(metric.id)) {
            libraryMetrics.push(metric);
            requiredMetricIds.add(metric.id);
            orderedMetricIds.push(metric.id);
          }
        } else {
          console.log(`  WARNING: Requested metric ID "${id}" not found in definitions.`);
        }
      });
      
      console.log('\n=== EXPLICITLY REQUESTED METRICS (IN ORDER) ===');
      libraryMetrics.filter(m => orderedMetricIds.includes(m.id)).forEach((m, idx) => {
        console.log(`${idx + 1}. ${m.name} (${m.type})`);
      });
    }

    const explicitlyRequestedCalculatedFields = libraryMetrics.filter(m => 
      m.type === 'calculated_field' && orderedMetricIds.includes(m.id)
    );
    
    if (explicitlyRequestedCalculatedFields.length > 0) {
      console.log('\n=== ANALYZING CALCULATED FIELD DEPENDENCIES ===');
      
      explicitlyRequestedCalculatedFields.forEach(cf => {
        console.log(`\nCalculated Field: ${cf.name}`);
        
        if (cf.definition.formula_type === 'case_when') {
          console.log(`Formula Type: CASE WHEN`);
          const caseStatements = cf.definition.case_statements || [];
          const elseExpression = cf.definition.else_expression || '';

          caseStatements.forEach(stmt => {
            if (stmt.when_condition?.field) {
              const referencedName = stmt.when_condition.field;
              console.log(`  Condition dependency: "${referencedName}"`);
              const dependencyMetric = allMetricDefinitions.find(m => m.type === 'aggregation' && (m.definition?.alias === referencedName || m.name === referencedName));
              if (dependencyMetric && !requiredMetricIds.has(dependencyMetric.id)) {
                console.log(`  ✓ Auto-adding condition dependency: ${dependencyMetric.name} (${dependencyMetric.id})`);
                requiredMetricIds.add(dependencyMetric.id);
                libraryMetrics.push(dependencyMetric);
              }
            }
            if (stmt.when_condition?.value_type === 'field' && stmt.when_condition?.value) {
              const referencedName = stmt.when_condition.value;
              console.log(`  Condition 'value' dependency: "${referencedName}"`);
              const dependencyMetric = allMetricDefinitions.find(m => m.type === 'aggregation' && (m.definition?.alias === referencedName || m.name === referencedName));
              if (dependencyMetric && !requiredMetricIds.has(dependencyMetric.id)) {
                console.log(`  ✓ Auto-adding condition 'value' dependency: ${dependencyMetric.name} (${dependencyMetric.id})`);
                requiredMetricIds.add(dependencyMetric.id);
                libraryMetrics.push(dependencyMetric);
              }
            }
            if (stmt.then_expression) {
              const fieldMatches = stmt.then_expression.match(/\{([^}]+)\}/g);
              if (fieldMatches) {
                fieldMatches.forEach(match => {
                  const referencedName = match.slice(1, -1);
                  console.log(`  THEN dependency: "${referencedName}"`);
                  const dependencyMetric = allMetricDefinitions.find(m => m.type === 'aggregation' && (m.definition?.alias === referencedName || m.name === referencedName));
                  if (dependencyMetric && !requiredMetricIds.has(dependencyMetric.id)) {
                    console.log(`  ✓ Auto-adding THEN dependency: ${dependencyMetric.name} (${dependencyMetric.id})`);
                    requiredMetricIds.add(dependencyMetric.id);
                    libraryMetrics.push(dependencyMetric);
                  }
                });
              }
            }
          });
          if (elseExpression) {
            const fieldMatches = elseExpression.match(/\{([^}]+)\}/g);
            if (fieldMatches) {
              fieldMatches.forEach(match => {
                const referencedName = match.slice(1, -1);
                console.log(`  ELSE dependency: "${referencedName}"`);
                const dependencyMetric = allMetricDefinitions.find(m => m.type === 'aggregation' && (m.definition?.alias === referencedName || m.name === referencedName));
                if (dependencyMetric && !requiredMetricIds.has(dependencyMetric.id)) {
                  console.log(`  ✓ Auto-adding ELSE dependency: ${dependencyMetric.name} (${dependencyMetric.id})`);
                  requiredMetricIds.add(dependencyMetric.id);
                  libraryMetrics.push(dependencyMetric);
                }
              });
            }
          }

        } else {
          console.log(`Formula: ${cf.definition.formula}`);
          const fieldMatches = cf.definition.formula.match(/\{([^}]+)\}/g);
          
          if (fieldMatches) {
            console.log(`Found ${fieldMatches.length} field references:`, fieldMatches);
            
            fieldMatches.forEach(match => {
              const referencedName = match.slice(1, -1);
              console.log(`  Looking for dependency: "${referencedName}"`);
              
              const dependencyMetric = allMetricDefinitions.find(m => {
                if (m.type === 'aggregation') {
                  const alias = m.definition?.alias || m.name;
                  return alias === referencedName || m.name === referencedName;
                }
                return false;
              });
              
              if (dependencyMetric) {
                if (!requiredMetricIds.has(dependencyMetric.id)) {
                  console.log(`  ✓ Auto-adding dependency: ${dependencyMetric.name} (${dependencyMetric.id})`);
                  requiredMetricIds.add(dependencyMetric.id);
                  libraryMetrics.push(dependencyMetric);
                } else {
                  console.log(`  ✓ Dependency already included: ${dependencyMetric.name}`);
                }
              } else {
                console.log(`  ✗ WARNING: Dependency "${referencedName}" not found in metrics library!`);
              }
            });
          }
        }
      });
    }

    libraryMetrics.sort((a, b) => {
      const orderA = orderedMetricIds.indexOf(a.id);
      const orderB = orderedMetricIds.indexOf(b.id);

      if (orderA !== -1 && orderB !== -1) return orderA - orderB;
      if (orderA !== -1) return -1;
      if (orderB !== -1) return 1;
      return a.id.localeCompare(b.id);
    });

    console.log('\n=== FINAL METRICS TO PROCESS (INCLUDING DEPENDENCIES) ===');
    libraryMetrics.forEach(m => {
      console.log(`- ${m.name} (${m.type})${orderedMetricIds.includes(m.id) ? ' (requested)' : ' (dependency - not directly ordered)'}`);
      if (m.type === 'aggregation' && m.definition) {
        console.log(`  Alias: "${m.definition.alias || m.name}"`);
      }
    });

    const libraryAggregations = libraryMetrics
      .filter(m => m.type === 'aggregation' && orderedMetricIds.includes(m.id))
      .map(m => ({
        ...m.definition,
        _metricId: m.id,
        _order: orderedMetricIds.indexOf(m.id)
      }));

    const libraryCalculatedFields = libraryMetrics
      .filter(m => m.type === 'calculated_field' && orderedMetricIds.includes(m.id))
      .map(m => ({
        ...m.definition,
        name: m.definition.name || m.name,
        _metricId: m.id,
        _order: orderedMetricIds.indexOf(m.id)
      }));

    const dependencyAggregations = libraryMetrics
      .filter(m => m.type === 'aggregation' && !orderedMetricIds.includes(m.id))
      .map(m => ({
          ...m.definition,
          _metricId: m.id,
          _order: 9999
      }));

    const allAggregations = [
      ...libraryAggregations,
      ...dependencyAggregations,
      ...(query_config?.aggregations || []).map((agg, idx) => ({
        ...agg,
        _metricId: `local-agg-${idx}`,
        _order: 10000 + idx
      }))
    ];

    const allCalculatedFields = [
      ...libraryCalculatedFields,
      ...(query_config?.calculated_fields || []).map((cf, idx) => ({
        ...cf,
        _metricId: `local-cf-${idx}`,
        _order: 10000 + idx
      }))
    ];

    allAggregations.sort((a, b) => a._order - b._order);
    allCalculatedFields.sort((a, b) => a._order - b._order);

    const effectiveQueryConfig = {
      ...query_config,
      aggregations: allAggregations,
      calculated_fields: allCalculatedFields
    };

    console.log('\n=== EFFECTIVE QUERY CONFIG ===');
    console.log(`Total aggregations: ${allAggregations.length}`);
    allAggregations.forEach((agg, i) => {
      console.log(`  ${i+1}. "${agg.alias}" = ${agg.function}(${agg.field}) (Order: ${agg._order}, MetricId: ${agg._metricId})`);
    });
    console.log(`Total calculated fields: ${allCalculatedFields.length}`);
    allCalculatedFields.forEach((cf, i) => {
      console.log(`  ${i+1}. "${cf.name}" (Type: ${cf.formula_type || 'simple'})`);
    });

    // ── BigQuery JWT helper ────────────────────────────────────────────────────
    const getBigQueryAccessToken = async (serviceAccountJson) => {
      let sa;
      try {
        sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
      } catch (e) {
        throw new Error('BigQuery sync config is missing service account credentials or JSON is malformed');
      }
      if (!sa || !sa.private_key || !sa.client_email) {
        throw new Error('BigQuery sync config is missing service account credentials');
      }

      const now = Math.floor(Date.now() / 1000);
      const header = { alg: 'RS256', typ: 'JWT' };
      const claim = {
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/bigquery.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      };

      const b64u = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const toSign = b64u(header) + '.' + b64u(claim);

      const pemBody = sa.private_key.replace(/-----[^\n]+\n?/g, '').replace(/\n/g, '');
      const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
      const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', der.buffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
      );

      const sigBytes = await crypto.subtle.sign(
        { name: 'RSASSA-PKCS1-v1_5' },
        cryptoKey,
        new TextEncoder().encode(toSign)
      );
      const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const jwt = toSign + '.' + sig;

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error('Failed to obtain BigQuery access token: ' + (tokenData.error_description || tokenData.error || JSON.stringify(tokenData)));
      }
      return tokenData.access_token;
    };
    // ──────────────────────────────────────────────────────────────────────────

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

    // Fetch data from source
    if (syncConfig.sync_type === 'bigquery') {
      // ── BigQuery REST API (JWT → OAuth2 → Jobs.query + pageToken) ────────────
      const accessToken = await getBigQueryAccessToken(syncConfig.service_account_json);

      const projectId = syncConfig.project_id;
      const dataset   = syncConfig.dataset || syncConfig.dataset_id;
      const table     = syncConfig.table_name;
      const dateField = syncConfig.date_field || syncConfig.incremental_field || 'date';

      if (!projectId || !dataset || !table) {
        throw new Error('BigQuery sync config is incomplete: missing project_id, dataset, or table_name');
      }

      // Build WHERE clauses
      const bqWhere = [];
      if (date_range && date_range.start && date_range.end) {
        bqWhere.push(dateField + " >= '" + date_range.start + "' AND " + dateField + " <= '" + date_range.end + "'");
      }
      if (custom_filters && custom_filters.length > 0) {
        custom_filters.forEach(f => {
          if (!f.field || f.value === '' || f.value === undefined) return;
          const col = f.field;
          const val = String(f.value).replace(/'/g, "''");
          switch (f.operator) {
            case 'equals':       bqWhere.push(col + " = '" + val + "'"); break;
            case 'not_equals':   bqWhere.push(col + " != '" + val + "'"); break;
            case 'contains':     bqWhere.push("LOWER(CAST(" + col + " AS STRING)) LIKE '%" + val.toLowerCase() + "%'"); break;
            case 'greater_than': bqWhere.push(col + ' > ' + Number(f.value)); break;
            case 'less_than':    bqWhere.push(col + ' < ' + Number(f.value)); break;
            case 'in': {
              const inVals = String(f.value).split(',').map(v => "'" + v.trim().replace(/'/g, "''") + "'").join(',');
              bqWhere.push(col + ' IN (' + inVals + ')'); break;
            }
            case 'not_in': {
              const niVals = String(f.value).split(',').map(v => "'" + v.trim().replace(/'/g, "''") + "'").join(',');
              bqWhere.push(col + ' NOT IN (' + niVals + ')'); break;
            }
          }
        });
      }
      const whereSQL = bqWhere.length > 0 ? 'WHERE ' + bqWhere.join(' AND ') : '';

      // Build SELECT — push down group_by + aggregations to BQ when possible
      const bqGroupField = effectiveQueryConfig && effectiveQueryConfig.group_by;
      const bqAggs       = (effectiveQueryConfig && effectiveQueryConfig.aggregations) || [];
      const bqLimit      = (effectiveQueryConfig && effectiveQueryConfig.limit) || 10000;
      let bqSelect, bqGroupBy, bqOrderBy;

      if (bqGroupField && bqAggs.length > 0) {
        const aggExprs = bqAggs.map(agg => {
          const fn    = (agg.function || 'sum').toUpperCase();
          const field = agg.field;
          const alias = (agg.alias || (fn + '_' + field)).replace(/`/g, '');
          const safeAlias = '`' + alias + '`';
          switch (fn) {
            case 'COUNT_DISTINCT': return 'COUNT(DISTINCT ' + field + ') AS ' + safeAlias;
            case 'COUNT': return 'COUNT(' + field + ') AS ' + safeAlias;
            case 'SUM':   return 'SUM(' + field + ') AS ' + safeAlias;
            case 'AVG':   return 'AVG(' + field + ') AS ' + safeAlias;
            case 'MIN':   return 'MIN(' + field + ') AS ' + safeAlias;
            case 'MAX':   return 'MAX(' + field + ') AS ' + safeAlias;
            default:      return 'SUM(' + field + ') AS ' + safeAlias;
          }
        });
        bqSelect  = bqGroupField + ', ' + aggExprs.join(', ');
        bqGroupBy = 'GROUP BY ' + bqGroupField;
        if (effectiveQueryConfig && effectiveQueryConfig.sort_by) {
          const sf = effectiveQueryConfig.sort_by.replace(/^-/, '');
          const sd = effectiveQueryConfig.sort_by.startsWith('-') ? 'DESC' : 'ASC';
          bqOrderBy = 'ORDER BY `' + sf + '` ' + sd;
        } else {
          bqOrderBy = 'ORDER BY ' + bqGroupField + ' ASC';
        }
      } else {
        let cols = '*';
        if (effectiveQueryConfig && effectiveQueryConfig.columns && effectiveQueryConfig.columns.length > 0) {
          cols = effectiveQueryConfig.columns.map(c => (typeof c === 'string' ? c : c.field)).join(', ');
        }
        bqSelect  = cols;
        bqGroupBy = '';
        if (effectiveQueryConfig && effectiveQueryConfig.sort_by) {
          const sf = effectiveQueryConfig.sort_by.replace(/^-/, '');
          const sd = effectiveQueryConfig.sort_by.startsWith('-') ? 'DESC' : 'ASC';
          bqOrderBy = 'ORDER BY `' + sf + '` ' + sd;
        } else {
          bqOrderBy = '';
        }
      }

      const bqSQL = 'SELECT ' + bqSelect + ' FROM `' + projectId + '.' + dataset + '.' + table + '` ' + whereSQL + ' ' + bqGroupBy + ' ' + bqOrderBy + ' LIMIT ' + bqLimit;
      console.log('\n=== BIGQUERY SQL ===');
      console.log(bqSQL);

      const bqEndpoint = 'https://bigquery.googleapis.com/bigquery/v2/projects/' + projectId + '/queries';
      const bqHeaders  = { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' };

      const bqRes  = await fetch(bqEndpoint, {
        method: 'POST',
        headers: bqHeaders,
        body: JSON.stringify({ query: bqSQL, useLegacySql: false, timeoutMs: 30000, maxResults: 10000 }),
      });
      const bqBody = await bqRes.json();

      if (!bqRes.ok || bqBody.error) {
        const bqMsg = (bqBody.error && bqBody.error.message) ? bqBody.error.message : JSON.stringify(bqBody.error || bqBody);
        throw new Error('BigQuery query failed: ' + bqMsg);
      }

      // Schema → ordered field-name array
      const bqSchemaFields = (bqBody.schema && bqBody.schema.fields) ? bqBody.schema.fields.map(f => f.name) : [];
      console.log('BQ schema fields:', bqSchemaFields);

      const normaliseBqRows = (rows) => {
        if (!rows) return [];
        return rows.map(row =>
          Object.fromEntries(
            (row.f || []).map((cell, i) => [bqSchemaFields[i], (cell.v === 'null' || cell.v === null) ? null : cell.v])
          )
        );
      };

      let allBqRows   = normaliseBqRows(bqBody.rows);
      let bqPageToken = bqBody.pageToken;
      const bqJobId   = bqBody.jobReference && bqBody.jobReference.jobId;
      const bqLoc     = bqBody.jobReference && bqBody.jobReference.location;
      let bqPageCount = 1;
      const maxBqPages = 100;

      while (bqPageToken && bqJobId && bqPageCount < maxBqPages) {
        bqPageCount++;
        const pageUrl  = 'https://bigquery.googleapis.com/bigquery/v2/projects/' + projectId + '/queries/' + bqJobId + '?pageToken=' + encodeURIComponent(bqPageToken) + '&maxResults=10000' + (bqLoc ? ('&location=' + bqLoc) : '');
        const pageRes  = await fetch(pageUrl, { headers: bqHeaders });
        const pageBody = await pageRes.json();
        if (!pageRes.ok || pageBody.error) {
          console.error('BQ page error:', pageBody.error && pageBody.error.message);
          break;
        }
        allBqRows = allBqRows.concat(normaliseBqRows(pageBody.rows));
        console.log('BQ page ' + bqPageCount + ': total ' + allBqRows.length + ' rows');
        bqPageToken = pageBody.pageToken;
      }

      console.log('BigQuery total rows fetched: ' + allBqRows.length);

      // Coerce numeric strings → JS numbers so downstream aggregations work correctly
      data = allBqRows.map(row => {
        const out = {};
        for (const key in row) {
          const v = row[key];
          if (v !== null && v !== '' && typeof v === 'string' && !isNaN(Number(v))) {
            out[key] = Number(v);
          } else {
            out[key] = v;
          }
        }
        return out;
      });
      // ── end BigQuery block — post-processing pipeline continues below ─────────

    } else if (syncConfig.sync_type === 'cloud_run') {
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

      // Check if this is a paginated API
      const isPaginated = syncConfig.response_format === 'paginated' || syncConfig.pagination_type === 'offset';
      
      if (isPaginated) {
        console.log('\n=== PAGINATED API DETECTED ===');
        console.log('Fetching all pages with date range filtering at source...');
        
        let allData = [];
        let offset = 0;
        let hasMore = true;
        let pageCount = 0;
        const maxPages = 100;
        
        while (hasMore && pageCount < maxPages) {
          pageCount++;
          
          const url = new URL(syncConfig.api_url);
          url.searchParams.set('offset', offset.toString());
          
          if (date_range?.start) {
            url.searchParams.set('start_date', date_range.start);
            console.log(`  Adding start_date parameter: ${date_range.start}`);
          }
          if (date_range?.end) {
            url.searchParams.set('end_date', date_range.end);
            console.log(`  Adding end_date parameter: ${date_range.end}`);
          }
          
          console.log(`  Fetching page ${pageCount} (offset: ${offset})...`);
          console.log(`  URL: ${url.toString()}`);
          
          const fetchOptions = {
            method: syncConfig.api_method || 'GET',
            headers
          };

          if (syncConfig.api_method === 'POST' && syncConfig.api_payload) {
            fetchOptions.body = syncConfig.api_payload;
          }

          const response = await fetch(url.toString(), fetchOptions);
          
          if (!response.ok) {
            console.error(`Failed to fetch page ${pageCount}: ${response.status}`);
            hasMore = false;
            break;
          }

          let apiData = await response.json();
          console.log(`    Raw API response keys:`, Object.keys(apiData));
          
          if (typeof apiData.hasMore !== 'undefined') {
            hasMore = apiData.hasMore;
            console.log(`    API hasMore flag: ${hasMore}`);
          }

          let pageRecords = [];
          
          if (syncConfig.response_path && syncConfig.response_path.trim() !== '') {
            console.log(`    Using response_path: "${syncConfig.response_path}"`);
            let extractedData = apiData;
            const paths = syncConfig.response_path.split('.');
            for (const path of paths) {
              if (extractedData && typeof extractedData === 'object' && path in extractedData) {
                extractedData = extractedData[path];
              }
            }
            
            if (Array.isArray(extractedData)) {
              pageRecords = extractedData;
            }
          } 
          
          if (pageRecords.length === 0) {
            if (apiData.data && Array.isArray(apiData.data)) {
              console.log(`    Found data array at apiData.data`);
              pageRecords = apiData.data;
            } else if (Array.isArray(apiData)) {
              console.log(`    apiData itself is an array`);
              pageRecords = apiData;
            } else if (apiData) {
              console.log(`    Wrapping single object in array`);
              pageRecords = [apiData];
            }
          }

          console.log(`    Extracted ${pageRecords.length} records from response`);
          
          if (typeof apiData.hasMore === 'undefined') {
            hasMore = pageRecords.length >= 1000;
            console.log(`    Inferred hasMore: ${hasMore}`);
          }
          
          pageRecords = pageRecords.map(record => {
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

          allData = allData.concat(pageRecords);
          console.log(`    Total records so far: ${allData.length}`);
          
          if (pageRecords.length === 0) {
            console.log(`    No records returned, stopping pagination`);
            hasMore = false;
            break;
          }
          
          offset += 1000;
        }
        
        console.log(`\n=== PAGINATION COMPLETE ===`);
        console.log(`Total pages fetched: ${pageCount}`);
        console.log(`Total records: ${allData.length}`);
        
        if (pageCount >= maxPages) {
          console.log(`⚠️  WARNING: Reached maximum page limit (${maxPages})`);
        }
        
        data = allData;
        
      } else {
        const url = new URL(syncConfig.api_url);
        
        if (date_range?.start) {
          url.searchParams.set('start_date', date_range.start);
          console.log(`  Adding start_date parameter: ${date_range.start}`);
        }
        if (date_range?.end) {
          url.searchParams.set('end_date', date_range.end);
          console.log(`  Adding end_date parameter: ${date_range.end}`);
        }
        console.log(`  Fetching non-paginated data...`);
        console.log(`  URL: ${url.toString()}`);

        const fetchOptions = {
          method: syncConfig.api_method || 'GET',
          headers
        };

        if (syncConfig.api_method === 'POST' && syncConfig.api_payload) {
          fetchOptions.body = syncConfig.api_payload;
        }

        const response = await fetch(url.toString(), fetchOptions);
        
        if (!response.ok) {
          return Response.json({ 
            error: `Failed to fetch from API: ${response.status}` 
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
    }

    console.log(`\nFetched ${data.length} records from source`);

    // CRITICAL: Apply client-side date filtering as fallback
    // Even though we pass dates to Cloud Run, we still filter client-side to ensure accuracy
    if (date_range && date_range.start && date_range.end) {
      console.log(`\n=== APPLYING CLIENT-SIDE DATE FILTERING ===`);
      console.log(`Date range: ${date_range.start} to ${date_range.end}`);
      
      const startDate = new Date(date_range.start);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date_range.end);
      endDate.setHours(23, 59, 59, 999);
      
      console.log(`Start date (with time): ${startDate.toISOString()}`);
      console.log(`End date (with time): ${endDate.toISOString()}`);
      
      const beforeFilter = data.length;
      
      data = data.filter(row => {
        const dateValue = row.date || row.created_date || row.timestamp || row.created_at || row.updated_date;
        
        if (!dateValue) {
          console.log(`⚠️  Row has no date field, keeping it`);
          return true;
        }
        
        const rowDate = new Date(dateValue);
        
        if (isNaN(rowDate.getTime())) {
          console.log(`⚠️  Invalid date: ${dateValue}, keeping it`);
          return true;
        }
        
        const isInRange = rowDate >= startDate && rowDate <= endDate;
        return isInRange;
      });
      
      console.log(`After date filtering: ${data.length} records (filtered out ${beforeFilter - data.length})`);
    }

    // Apply custom filters
    if (custom_filters && custom_filters.length > 0) {
      data = data.filter(row => {
        return custom_filters.every(filter => {
          if (!filter.field || filter.value === '') return true;
          
          const value = row[filter.field];
          const filterValue = filter.value;

          switch (filter.operator) {
            case 'equals':
              return String(value) === String(filterValue);
            case 'not_equals':
              return String(value) !== String(filterValue);
            case 'contains':
              return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
            case 'greater_than':
              return Number(value) > Number(filterValue);
            case 'less_than':
              return Number(value) < Number(filterValue);
            case 'in': {
              const allowedValues = String(filterValue).split(',').map(v => v.trim()).filter(v => v);
              return allowedValues.length > 0 ? allowedValues.includes(String(value)) : true;
            }
            case 'not_in': {
              const excludedValues = String(filterValue).split(',').map(v => v.trim()).filter(v => v);
              return excludedValues.length > 0 ? !excludedValues.includes(String(value)) : true;
            }
            default:
              return true;
          }
        });
      });
    }

    // Apply query config filters
    if (effectiveQueryConfig?.filters && effectiveQueryConfig.filters.length > 0) {
      data = data.filter(row => {
        return effectiveQueryConfig.filters.every(filter => {
          if (!filter.field || filter.value === '') return true;
          
          const value = row[filter.field];
          const filterValue = filter.value;

          switch (filter.operator) {
            case 'equals':
              return String(value) === String(filterValue);
            case 'not_equals':
              return String(value) !== String(filterValue);
            case 'contains':
              return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
            case 'greater_than':
              return Number(value) > Number(filterValue);
            case 'less_than':
              return Number(value) < Number(filterValue);
            default:
              return true;
          }
        });
      });
    }

    console.log(`After additional filters: ${data.length} records remain`);

    const applyAggregationFilters = (records, aggFilters, aggName, filterLogic = 'all') => {
      if (!aggFilters || aggFilters.length === 0) {
        return records;
      }
      
      const filtered = records.filter(row => {
        const checkSingleFilter = (filter) => {
          if (!filter.field || filter.value === '') return true;
          
          const value = row[filter.field];
          const filterValue = filter.value;

          switch (filter.operator) {
            case 'equals':
              return String(value).toLowerCase() === String(filterValue).toLowerCase();
            case 'not_equals':
              return String(value).toLowerCase() !== String(filterValue).toLowerCase();
            case 'contains':
              return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
            case 'greater_than':
              return Number(value) > Number(filterValue);
            case 'less_than':
              return Number(value) < Number(filterValue);
            case 'in': {
              const inValues = String(filterValue).split(',').map(v => v.trim().toLowerCase()).filter(v => v);
              return inValues.includes(String(value).toLowerCase());
            }
            case 'not_in': {
              const notInValues = String(filterValue).split(',').map(v => v.trim().toLowerCase()).filter(v => v);
              return !notInValues.includes(String(value).toLowerCase());
            }
            default:
              return true;
          }
        };

        if (filterLogic === 'any') {
          return aggFilters.some(filter => checkSingleFilter(filter));
        } else {
          return aggFilters.every(filter => checkSingleFilter(filter));
        }
      });
      
      return filtered;
    };

    // Handle aggregations without grouping (for KPI widgets)
    if (!effectiveQueryConfig?.group_by && effectiveQueryConfig?.aggregations && effectiveQueryConfig.aggregations.length > 0) {
      const result = {};
      const resultOrder = {};
      const resultVisible = {};
      
      console.log(`\n=== PROCESSING ${effectiveQueryConfig.aggregations.length} AGGREGATIONS (NO GROUPING) ===`);
      
      effectiveQueryConfig.aggregations.forEach((agg, index) => {
        const { field, function: aggFunc, alias, filters: aggFilters, filter_logic, _order, _metricId } = agg;
        const displayName = alias || `${aggFunc}_${field}`;

        console.log(`\n--- Aggregation ${index + 1}: "${displayName}" ---`);

        const filteredData = applyAggregationFilters(data, aggFilters, displayName, filter_logic);

        if (aggFunc === 'count') {
          result[displayName] = filteredData.length;
        } else if (aggFunc === 'sum') {
          result[displayName] = filteredData.reduce((sum, r) => sum + (Number(r[field]) || 0), 0);
        } else if (aggFunc === 'avg') {
          const sum = filteredData.reduce((s, r) => s + (Number(r[field]) || 0), 0);
          result[displayName] = filteredData.length > 0 ? sum / filteredData.length : 0;
        } else if (aggFunc === 'min') {
          const values = filteredData.map(r => Number(r[field])).filter(v => !isNaN(v));
          result[displayName] = values.length > 0 ? Math.min(...values) : 0;
        } else if (aggFunc === 'max') {
          const values = filteredData.map(r => Number(r[field])).filter(v => !isNaN(v));
          result[displayName] = values.length > 0 ? Math.max(...values) : 0;
        } else if (aggFunc === 'first') {
          result[displayName] = filteredData.length > 0 ? filteredData[0][field] : '';
        } else if (aggFunc === 'last') {
          result[displayName] = filteredData.length > 0 ? filteredData[filteredData.length - 1][field] : '';
        }
        
        console.log(`  ✓ result["${displayName}"] = ${result[displayName]}`);
        resultOrder[displayName] = _order !== undefined ? _order : 10000 + index;
        resultVisible[displayName] = orderedMetricIds.includes(_metricId);
      });

      console.log('\n=== AGGREGATION RESULTS ===');
      console.log(JSON.stringify(result, null, 2));

      if (effectiveQueryConfig.calculated_fields && effectiveQueryConfig.calculated_fields.length > 0) {
        console.log(`\n=== PROCESSING ${effectiveQueryConfig.calculated_fields.length} CALCULATED FIELDS ===`);
        
        effectiveQueryConfig.calculated_fields.forEach((calcField, cfIndex) => {
          const fieldName = calcField.name;
          const formulaType = calcField.formula_type || 'simple';
          const _order = calcField._order;
          const _metricId = calcField._metricId;
          
          console.log(`\n--- Calculated Field ${cfIndex + 1}: "${fieldName}" (Type: ${formulaType}) ---`);
          
          if (!fieldName) {
            console.log(`✗ Missing name, skipping`);
            return;
          }

          try {
            let calcResult = 0;
            
            if (formulaType === 'case_when') {
              const caseStatements = calcField.case_statements || [];
              const elseExpression = calcField.else_expression || '';
              
              console.log(`CASE WHEN with ${caseStatements.length} conditions`);
              
              let matched = false;
              
              for (const caseStmt of caseStatements) {
                const { when_condition, then_expression } = caseStmt;
                
                if (!when_condition || !then_expression) {
                  console.log(`  WARNING: Malformed CASE statement, skipping.`);
                  continue;
                }

                console.log(`  Checking condition: ${when_condition.field} ${when_condition.operator} ${when_condition.value} (type: ${when_condition.value_type})`);
                
                const isConditionMet = evaluateCondition({}, when_condition, result, result);
                
                console.log(`  Condition met: ${isConditionMet}`);
                
                if (isConditionMet) {
                  console.log(`  ✓ Evaluating THEN: ${then_expression}`);
                  calcResult = evaluateSimpleFormula(then_expression, {}, result);
                  matched = true;
                  break;
                }
              }
              
              if (!matched && elseExpression) {
                console.log(`  No condition matched, evaluating ELSE: ${elseExpression}`);
                calcResult = evaluateSimpleFormula(elseExpression, {}, result);
              } else if (!matched) {
                console.log(`  No condition matched and no ELSE expression`);
                calcResult = 0;
              }
              
              console.log(`  ✓ CASE WHEN Result: ${calcResult}`);
              
            } else {
              const formula = calcField.formula;
              
              if (!formula) {
                console.log(`✗ Missing formula, skipping`);
                return;
              }
              
              console.log(`Formula: ${formula}`);
              console.log(`Available result keys:`, Object.keys(result));
              
              calcResult = evaluateSimpleFormula(formula, {}, result);
            }
            
            result[fieldName] = calcResult;
            console.log(`✓ Stored as result["${fieldName}"] = ${calcResult}`);
            resultOrder[fieldName] = _order !== undefined ? _order : 10000 + cfIndex;
            resultVisible[fieldName] = orderedMetricIds.includes(_metricId);
          } catch (error) {
            console.error(`✗ Error processing calculated field "${fieldName}":`, error);
            result[fieldName] = 0;
            resultOrder[fieldName] = _order !== undefined ? _order : 10000 + cfIndex;
            resultVisible[fieldName] = orderedMetricIds.includes(_metricId);
          }
        });
      }

      console.log('\n=== FINAL RESULT ===');
      console.log(JSON.stringify(result, null, 2));

      result._metadataOrder = resultOrder;
      result._metadataVisible = resultVisible;

      data = [result];
    }

    // Handle grouping with aggregations
    if (effectiveQueryConfig?.group_by) {
      const groupField = effectiveQueryConfig.group_by;
      const aggregations = effectiveQueryConfig.aggregations || [];

      const grouped = {};
      data.forEach(row => {
        const groupValue = row[groupField];
        const key = groupValue === undefined || groupValue === null ? '__null_or_undefined_group__' : String(groupValue);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(row);
      });

      data = Object.entries(grouped).map(([groupValue, records]) => {
        const result = {
          [groupField]: groupValue === '__null_or_undefined_group__' ? null : groupValue 
        };
        const resultOrder = {};
        const resultVisible = {};

        aggregations.forEach((agg) => {
          const { field, function: aggFunc, alias, filters: aggFilters, filter_logic, _order, _metricId } = agg;
          const displayName = alias || `${aggFunc}_${field}`;

          const filteredRecords = applyAggregationFilters(records, aggFilters, displayName, filter_logic);

          if (aggFunc === 'count') {
            result[displayName] = filteredRecords.length;
          } else if (aggFunc === 'sum') {
            result[displayName] = filteredRecords.reduce((sum, r) => sum + (Number(r[field]) || 0), 0);
          } else if (aggFunc === 'avg') {
            const sum = filteredRecords.reduce((s, r) => s + (Number(r[field]) || 0), 0);
            result[displayName] = filteredRecords.length > 0 ? sum / filteredRecords.length : 0;
          } else if (aggFunc === 'min') {
            const values = filteredRecords.map(r => Number(r[field])).filter(v => !isNaN(v));
            result[displayName] = values.length > 0 ? Math.min(...values) : 0;
          } else if (aggFunc === 'max') {
            const values = filteredRecords.map(r => Number(r[field])).filter(v => !isNaN(v));
            result[displayName] = values.length > 0 ? Math.max(...values) : 0;
          } else if (aggFunc === 'first') {
            result[displayName] = filteredRecords.length > 0 ? filteredRecords[0][field] : '';
          } else if (aggFunc === 'last') {
            result[displayName] = filteredRecords.length > 0 ? filteredRecords[filteredRecords.length - 1][field] : '';
          }
          
          resultOrder[displayName] = _order !== undefined ? _order : 10000;
          resultVisible[displayName] = orderedMetricIds.includes(_metricId);
        });

        if (effectiveQueryConfig.calculated_fields && effectiveQueryConfig.calculated_fields.length > 0) {
          effectiveQueryConfig.calculated_fields.forEach(calcField => {
            const fieldName = calcField.name;
            const formulaType = calcField.formula_type || 'simple';
            const _order = calcField._order;
            const _metricId = calcField._metricId;
            
            if (!fieldName) return;

            try {
              let calcResult = 0;
              
              if (formulaType === 'case_when') {
                const caseStatements = calcField.case_statements || [];
                const elseExpression = calcField.else_expression || '';
                
                let matched = false;
                
                for (const caseStmt of caseStatements) {
                  const { when_condition, then_expression } = caseStmt;

                  if (!when_condition || !then_expression) {
                    continue;
                  }
                  
                  const isConditionMet = evaluateCondition({}, when_condition, result, result);
                  
                  if (isConditionMet) {
                    calcResult = evaluateSimpleFormula(then_expression, {}, result);
                    matched = true;
                    break;
                  }
                }
                
                if (!matched && elseExpression) {
                  calcResult = evaluateSimpleFormula(elseExpression, {}, result);
                } else if (!matched) {
                  calcResult = 0;
                }
                
              } else {
                const formula = calcField.formula;
                
                if (!formula) return;
                
                calcResult = evaluateSimpleFormula(formula, {}, result);
              }
              
              result[fieldName] = calcResult;
              resultOrder[fieldName] = _order !== undefined ? _order : 10000;
              resultVisible[fieldName] = orderedMetricIds.includes(_metricId);
            } catch (error) {
              console.error(`Error calculating field ${fieldName} for group ${groupValue}:`, error);
              result[fieldName] = 0;
              resultOrder[fieldName] = _order !== undefined ? _order : 10000;
              resultVisible[fieldName] = orderedMetricIds.includes(_metricId);
            }
          });
        }

        result._metadataOrder = resultOrder;
        result._metadataVisible = resultVisible;
        return result;
      });
    }

    // Apply sorting
    if (effectiveQueryConfig?.sort_by) {
      const sortField = effectiveQueryConfig.sort_by.startsWith('-') 
        ? effectiveQueryConfig.sort_by.substring(1) 
        : effectiveQueryConfig.sort_by;
      const sortOrder = effectiveQueryConfig.sort_by.startsWith('-') ? -1 : 1;

      data.sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        
        if (aVal === undefined || aVal === null) return 1 * sortOrder;
        if (bVal === undefined || bVal === null) return -1 * sortOrder;
        
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          const aDate = new Date(aVal);
          const bDate = new Date(bVal);
          if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
            return (aDate.getTime() - bDate.getTime()) * sortOrder;
          }
          return aVal.localeCompare(bVal) * sortOrder;
        }
        
        if (aVal < bVal) return -1 * sortOrder;
        if (aVal > bVal) return 1 * sortOrder;
        return 0;
      });
    }

    // Apply limit
    if (effectiveQueryConfig?.limit && effectiveQueryConfig.limit > 0) {
      data = data.slice(0, effectiveQueryConfig.limit);
    }

    // Apply column selection
    if (effectiveQueryConfig?.columns && effectiveQueryConfig.columns.length > 0) {
      data = data.map(row => {
        const filtered = {};
        effectiveQueryConfig.columns.forEach(col => {
          const fieldName = typeof col === 'string' ? col : (col?.field || col);
          
          if (fieldName in row) {
            filtered[fieldName] = row[fieldName];
          }
        });
        if (effectiveQueryConfig?.group_by && !(effectiveQueryConfig.group_by in filtered)) {
          filtered[effectiveQueryConfig.group_by] = row[effectiveQueryConfig.group_by];
        }
        if ('_metadataOrder' in row && !('_metadataOrder' in filtered)) {
          filtered._metadataOrder = row._metadataOrder;
        }
        if ('_metadataVisible' in row && !('_metadataVisible' in filtered)) {
          filtered._metadataVisible = row._metadataVisible;
        }
        return filtered;
      });
    }

    console.log('\n========================================');
    console.log('FINAL DATA RESPONSE');
    console.log('========================================');
    console.log(`Returning ${data.length} records`);

    return Response.json(data);

  } catch (error) {
    console.error('Error fetching widget data:', error);
    return Response.json({ 
      error: error.message,
      details: error.toString()
    }, { status: 500 });
  }
});
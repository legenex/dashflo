import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function getBigQueryToken(sa) {
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
  const sigBytes = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, cryptoKey, new TextEncoder().encode(toSign));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = toSign + '.' + sig;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Failed to get access token: ' + (tokenData.error_description || JSON.stringify(tokenData)));
  return tokenData.access_token;
}

function mapBigQueryType(bqType) {
  const t = (bqType || '').toUpperCase();
  if (['STRING', 'BYTES', 'JSON'].includes(t)) return 'string';
  if (['INT64', 'INTEGER', 'FLOAT64', 'FLOAT', 'NUMERIC', 'BIGNUMERIC'].includes(t)) return 'number';
  if (['BOOL', 'BOOLEAN'].includes(t)) return 'boolean';
  if (['DATE', 'DATETIME', 'TIMESTAMP', 'TIME'].includes(t)) return 'date';
  return 'string';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, dataset, table_name, service_account_json } = await req.json();
    if (!project_id || !dataset || !table_name || !service_account_json) {
      return Response.json({ success: false, error: 'project_id, dataset, table_name, and service_account_json are required' });
    }

    const sa = typeof service_account_json === 'string' ? JSON.parse(service_account_json) : service_account_json;
    const accessToken = await getBigQueryToken(sa);

    const sql = `SELECT column_name, data_type, is_nullable FROM \`${project_id}.${dataset}\`.INFORMATION_SCHEMA.COLUMNS WHERE table_name = '${table_name}' ORDER BY ordinal_position`;
    const bqRes = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${project_id}/queries`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, useLegacySql: false, maxResults: 1000 }),
    });
    const bqBody = await bqRes.json();
    if (!bqRes.ok || bqBody.error) throw new Error(bqBody.error?.message || JSON.stringify(bqBody.error));

    const rows = bqBody.rows || [];
    const fields = rows.map(row => ({
      name: row.f[0].v,
      type: mapBigQueryType(row.f[1].v),
      bq_type: row.f[1].v,
      mode: row.f[2].v === 'YES' ? 'NULLABLE' : 'REQUIRED',
    }));

    return Response.json({ success: true, fields, total_fields: fields.length });

  } catch (error) {
    return Response.json({ success: false, error: error.message });
  }
});
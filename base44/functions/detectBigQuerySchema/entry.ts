import { BigQuery } from 'npm:@google-cloud/bigquery@7';

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
    const { project_id, dataset, table_name, service_account_json } = await req.json();

    if (!project_id || !dataset || !table_name || !service_account_json) {
      return Response.json({ success: false, error: 'project_id, dataset, table_name, and service_account_json are required' });
    }

    const credentials = typeof service_account_json === 'string'
      ? JSON.parse(service_account_json)
      : service_account_json;

    const bigquery = new BigQuery({ projectId: project_id, credentials });

    const query = `SELECT column_name, data_type, is_nullable FROM \`${project_id}.${dataset}\`.INFORMATION_SCHEMA.COLUMNS WHERE table_name = '${table_name}' ORDER BY ordinal_position`;
    const [rows] = await bigquery.query({ query, useLegacySql: false });

    const fields = rows.map(row => ({
      name: row.column_name,
      type: mapBigQueryType(row.data_type),
      bq_type: row.data_type,
      mode: row.is_nullable === 'YES' ? 'NULLABLE' : 'REQUIRED',
    }));

    return Response.json({ success: true, fields, total_fields: fields.length });

  } catch (error) {
    return Response.json({ success: false, error: error.message });
  }
});
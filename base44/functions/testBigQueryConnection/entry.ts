import { BigQuery } from 'npm:@google-cloud/bigquery@7';

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

    const query = `SELECT COUNT(*) as row_count FROM \`${project_id}.${dataset}.${table_name}\` LIMIT 1`;
    const [rows] = await bigquery.query({ query, useLegacySql: false });

    const row_count = Number(rows[0]?.row_count ?? 0);
    return Response.json({ success: true, project: project_id, dataset, table: table_name, row_count });

  } catch (error) {
    return Response.json({ success: false, error: error.message });
  }
});
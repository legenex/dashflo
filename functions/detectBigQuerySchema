import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { BigQuery } from 'npm:@google-cloud/bigquery@7.3.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, dataset, table_name, service_account_json } = await req.json();

    if (!project_id || !dataset || !table_name || !service_account_json) {
      return Response.json({ 
        error: 'Missing required fields' 
      }, { status: 400 });
    }

    const credentials = JSON.parse(service_account_json);

    const bigquery = new BigQuery({
      projectId: project_id,
      credentials: credentials
    });

    // Query INFORMATION_SCHEMA to get table schema
    const query = `
      SELECT 
        column_name,
        data_type,
        is_nullable
      FROM \`${project_id}.${dataset}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = '${table_name}'
      ORDER BY ordinal_position
    `;

    const [job] = await bigquery.createQueryJob({ query });
    const [rows] = await job.getQueryResults();

    const fields = rows.map(row => ({
      name: row.column_name,
      type: row.data_type,
      mode: row.is_nullable === 'YES' ? 'NULLABLE' : 'REQUIRED'
    }));

    return Response.json({
      success: true,
      fields: fields,
      total_fields: fields.length
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      details: error.toString()
    }, { status: 500 });
  }
});
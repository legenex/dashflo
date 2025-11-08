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

    // Parse service account credentials
    const credentials = JSON.parse(service_account_json);

    // Initialize BigQuery client
    const bigquery = new BigQuery({
      projectId: project_id,
      credentials: credentials
    });

    // Test connection by checking if table exists and getting row count
    const query = `
      SELECT COUNT(*) as row_count
      FROM \`${project_id}.${dataset}.${table_name}\`
      LIMIT 1
    `;

    const [job] = await bigquery.createQueryJob({ query });
    const [rows] = await job.getQueryResults();

    return Response.json({
      success: true,
      message: 'Connection successful',
      row_count: rows[0].row_count,
      project: project_id,
      dataset: dataset,
      table: table_name
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      details: error.toString()
    }, { status: 500 });
  }
});
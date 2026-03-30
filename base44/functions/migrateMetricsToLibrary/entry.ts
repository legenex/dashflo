import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all widgets
    const widgets = await base44.asServiceRole.entities.Widget.list();
    
    console.log(`Found ${widgets.length} widgets to process`);
    
    const metricsToCreate = [];
    const metricSignatures = new Set(); // To avoid duplicates
    
    // Process each widget
    for (const widget of widgets) {
      const queryConfig = widget.query_config || {};
      
      // Process aggregations
      if (queryConfig.aggregations && Array.isArray(queryConfig.aggregations)) {
        for (const agg of queryConfig.aggregations) {
          // Create a signature to identify unique metrics
          const signature = JSON.stringify({
            type: 'aggregation',
            function: agg.function,
            field: agg.field,
            filters: agg.filters || [],
            filter_logic: agg.filter_logic || 'all'
          });
          
          if (!metricSignatures.has(signature)) {
            metricSignatures.add(signature);
            
            const metricName = agg.alias || `${agg.function}_${agg.field}`;
            
            metricsToCreate.push({
              name: metricName,
              description: `Migrated from widget: ${widget.name}`,
              type: 'aggregation',
              data_source: widget.data_source,
              category: 'Migrated',
              definition: {
                field: agg.field,
                function: agg.function,
                alias: agg.alias || metricName,
                format: agg.format || 'number',
                visible: agg.visible !== false,
                filters: agg.filters || [],
                filter_logic: agg.filter_logic || 'all',
                position: agg.position || 0
              },
              enabled: true
            });
          }
        }
      }
      
      // Process calculated fields
      if (queryConfig.calculated_fields && Array.isArray(queryConfig.calculated_fields)) {
        for (const cf of queryConfig.calculated_fields) {
          const signature = JSON.stringify({
            type: 'calculated_field',
            formula: cf.formula
          });
          
          if (!metricSignatures.has(signature)) {
            metricSignatures.add(signature);
            
            metricsToCreate.push({
              name: cf.name || 'Unnamed Calculated Field',
              description: `Migrated from widget: ${widget.name}`,
              type: 'calculated_field',
              data_source: widget.data_source,
              category: 'Migrated',
              definition: {
                name: cf.name,
                formula: cf.formula,
                formula_parts: cf.formula_parts || [],
                format: cf.format || 'number',
                visible: cf.visible !== false,
                position: cf.position || 0
              },
              enabled: true
            });
          }
        }
      }
    }
    
    console.log(`Found ${metricsToCreate.length} unique metrics to migrate`);
    
    // Create all metrics
    const createdMetrics = [];
    for (const metric of metricsToCreate) {
      try {
        const created = await base44.asServiceRole.entities.MetricDefinition.create(metric);
        createdMetrics.push(created);
        console.log(`Created metric: ${metric.name}`);
      } catch (error) {
        console.error(`Failed to create metric ${metric.name}:`, error);
      }
    }
    
    return Response.json({
      success: true,
      message: `Successfully migrated ${createdMetrics.length} metrics`,
      total_widgets_processed: widgets.length,
      unique_metrics_found: metricsToCreate.length,
      metrics_created: createdMetrics.length,
      created_metrics: createdMetrics.map(m => ({ id: m.id, name: m.name, type: m.type }))
    });
    
  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({ 
      error: error.message,
      details: error.toString()
    }, { status: 500 });
  }
});
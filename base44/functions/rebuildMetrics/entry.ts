import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Rebuilds the CustomMetric library with all required metrics.
 * Maps field_ids to Cloud Run API source fields with proper aggregation & format config.
 * Only admin users can call this.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // ── Metrics library definition ──────────────────────────────────────────
    const METRICS_LIBRARY = [
      // Financial
      { field_id: 'Revenue',     name: 'Revenue',     source_field: 'Revenue',     aggregation: 'SUM',   format: 'currency', tier: 'system', is_active: true },
      { field_id: 'Net_Revenue', name: 'Net Revenue', source_field: 'Net_Revenue', aggregation: 'SUM',   format: 'currency', tier: 'system', is_active: true },
      { field_id: 'Cost',        name: 'Cost',        source_field: 'Payout',      aggregation: 'SUM',   format: 'currency', tier: 'system', is_active: true },
      { field_id: 'Profit',      name: 'Profit',      source_field: 'Profit',      aggregation: 'SUM',   format: 'currency', tier: 'system', is_active: true },
      { field_id: 'Net_Profit',  name: 'Net Profit',  source_field: 'Net_Profit',  aggregation: 'SUM',   format: 'currency', tier: 'system', is_active: true },

      // Metrics
      { field_id: 'CPL',         name: 'CPL',         source_field: 'CPL',         aggregation: 'AVG',   format: 'currency', tier: 'system', is_active: true },
      { field_id: 'ROAS',        name: 'ROAS',        source_field: 'ROAS',        aggregation: 'AVG',   format: 'number',   tier: 'system', is_active: true },
      { field_id: 'Margin',      name: 'Margin',      source_field: 'Margin',      aggregation: 'AVG',   format: 'percent',  tier: 'system', is_active: true },

      // Counts
      { field_id: 'Leads',       name: 'Total Leads', source_field: 'lead_id',     aggregation: 'COUNT_DISTINCT', format: 'integer', tier: 'system', is_active: true },
      { field_id: 'Conversions', name: 'Conversions', source_field: 'status',      aggregation: 'COUNT_IF',  format: 'integer', tier: 'system', is_active: true, filter_field: 'status', filter_value: 'sold' },
      { field_id: 'Rejections',  name: 'Rejections',  source_field: 'status',      aggregation: 'COUNT_IF',  format: 'integer', tier: 'system', is_active: true, filter_field: 'status', filter_value: 'rejected' },
      { field_id: 'Returns',     name: 'Returns',     source_field: 'return_status', aggregation: 'COUNT_IF', format: 'integer', tier: 'system', is_active: true, filter_field: 'return_status', filter_value: 'approved' },
    ];

    // ── Clear existing system metrics ───────────────────────────────────────
    const existing = await base44.asServiceRole.entities.CustomMetric.filter({ tier: 'system' });
    for (const m of existing) {
      await base44.asServiceRole.entities.CustomMetric.delete(m.id);
    }
    console.log(`[rebuildMetrics] Deleted ${existing.length} existing system metrics`);

    // ── Bulk create new metrics ────────────────────────────────────────────
    await base44.asServiceRole.entities.CustomMetric.bulkCreate(METRICS_LIBRARY);
    console.log(`[rebuildMetrics] Created ${METRICS_LIBRARY.length} metrics`);

    return Response.json({
      success: true,
      message: `Rebuilt metrics library with ${METRICS_LIBRARY.length} metrics`,
      metrics: METRICS_LIBRARY.map(m => ({ field_id: m.field_id, name: m.name }))
    });

  } catch (error) {
    console.error('[rebuildMetrics] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
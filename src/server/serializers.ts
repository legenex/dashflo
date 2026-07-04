import type { schema } from "@/db/client";

export function serializeLead(l: typeof schema.leads.$inferSelect): Record<string, unknown> {
  return {
    id: l.id,
    campaign_id: l.campaignId,
    supplier_id: l.supplierId,
    buyer_id: l.buyerId,
    status: l.status,
    state: l.state,
    sale_price_cents: l.salePriceCents,
    supplier_cost_cents: l.supplierCostCents,
    paid_allocated_cents: l.paidAllocatedCents,
    reconciliation_status: l.reconciliationStatus,
    payment_due_date: l.paymentDueDate?.toISOString() ?? null,
    is_test: l.isTest,
    received_at: l.receivedAt.toISOString(),
    sold_at: l.soldAt?.toISOString() ?? null,
    returned_at: l.returnedAt?.toISOString() ?? null,
    field_data: l.fieldData,
  };
}

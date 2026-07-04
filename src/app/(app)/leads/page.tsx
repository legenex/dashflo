import { and, desc, eq, gte, lte } from "drizzle-orm";
import { requireOrg, maskPhone } from "@/server/org";
import { schema } from "@/db/client";
import { resolveRange, csvList } from "@/lib/date-range";
import { LeadsClient } from "./LeadsClient";

export const dynamic = "force-dynamic";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requireOrg();
  const range = resolveRange(params);
  const statusFilter = params.status;

  const conditions = [
    eq(schema.leads.organizationId, ctx.organizationId),
    gte(schema.leads.receivedAt, new Date(`${range.from}T00:00:00Z`)),
    lte(schema.leads.receivedAt, new Date(`${range.to}T23:59:59Z`)),
  ];
  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "duplicates") conditions.push(eq(schema.leads.status, "duplicate"));
    else if (statusFilter === "errors") conditions.push(eq(schema.leads.status, "error"));
    else conditions.push(eq(schema.leads.status, statusFilter as "sold"));
  }

  const [leads, campaigns, buyers, suppliers] = await Promise.all([
    ctx.db.select().from(schema.leads).where(and(...conditions)).orderBy(desc(schema.leads.receivedAt)).limit(1000),
    ctx.db.query.campaigns.findMany({ where: eq(schema.campaigns.organizationId, ctx.organizationId) }),
    ctx.db.query.buyers.findMany({ where: eq(schema.buyers.organizationId, ctx.organizationId) }),
    ctx.db.query.suppliers.findMany({ where: eq(schema.suppliers.organizationId, ctx.organizationId) }),
  ]);

  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const buyerName = new Map(buyers.map((b) => [b.id, b.name]));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  const today = new Date();

  // Entity filters from FilterBar params.
  const campaignFilter = csvList(params.campaigns);
  const buyerFilter = csvList(params.buyers);
  const supplierFilter = csvList(params.suppliers);
  const stateFilter = csvList(params.states);

  const filtered = leads.filter((l) => {
    if (campaignFilter && !campaignFilter.includes(l.campaignId)) return false;
    if (buyerFilter && (!l.buyerId || !buyerFilter.includes(l.buyerId))) return false;
    if (supplierFilter && !supplierFilter.includes(l.supplierId)) return false;
    if (stateFilter && (!l.state || !stateFilter.includes(l.state))) return false;
    return true;
  });

  const rows = filtered.map((l) => {
    const unpaid = (l.salePriceCents ?? 0) - l.paidAllocatedCents;
    const overdue = l.status === "sold" && unpaid > 0 && l.paymentDueDate !== null && l.paymentDueDate < today;
    const paymentState =
      l.status !== "sold" && l.status !== "returned" ? "na"
      : l.status === "returned" ? "returned"
      : l.paidAllocatedCents >= (l.salePriceCents ?? 0) && (l.salePriceCents ?? 0) > 0 ? "paid"
      : overdue ? "overdue"
      : l.paidAllocatedCents > 0 ? "partial"
      : "pending";
    const cashProfit =
      l.status === "sold" ? l.paidAllocatedCents - l.supplierPaidCents : null;
    return {
      id: l.id,
      receivedAt: l.receivedAt.toISOString(),
      supplier: supplierName.get(l.supplierId) ?? l.supplierId,
      name: `${String(l.fieldData.first_name ?? "")} ${String(l.fieldData.last_name ?? "")}`.trim() || "(no name)",
      phone: maskPhone(l.normalizedPhone, ctx.role),
      campaign: campaignName.get(l.campaignId) ?? l.campaignId,
      state: l.state,
      buyer: l.buyerId ? buyerName.get(l.buyerId) ?? l.buyerId : null,
      status: l.status,
      isTest: l.isTest,
      salePriceCents: l.salePriceCents,
      paidAllocatedCents: l.paidAllocatedCents,
      cashProfit,
      paymentState,
    };
  });

  const statusCounts: Record<string, number> = {};
  for (const l of leads) statusCounts[l.status] = (statusCounts[l.status] ?? 0) + 1;

  return (
    <LeadsClient
      rows={rows}
      statusCounts={statusCounts}
      openId={params.open ?? null}
      filterOptions={{
        campaigns: campaigns.map((c) => ({ id: c.id, label: c.name })),
        buyers: buyers.map((b) => ({ id: b.id, label: b.name })),
        suppliers: suppliers.map((s) => ({ id: s.id, label: s.name })),
      }}
      buyers={buyers.map((b) => ({ id: b.id, name: b.name }))}
    />
  );
}

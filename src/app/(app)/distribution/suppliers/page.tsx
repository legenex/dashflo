import { eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { assembleTruthDataset } from "@/server/truth-data";
import { computeTruth } from "@/domain/truth/compute";
import { SuppliersClient } from "./SuppliersClient";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requireOrg();
  const dataset = await assembleTruthDataset(ctx.organizationId);
  const truth = computeTruth(dataset, { scope: "supplier" });

  const suppliers = await ctx.db.query.suppliers.findMany({
    where: eq(schema.suppliers.organizationId, ctx.organizationId),
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4780";

  const rows = suppliers.map((s) => {
    const t = truth.rows.find((r) => r.key === s.id);
    const supplierLeads = dataset.leads.filter((l) => l.supplierId === s.id && !l.isTest);
    const sold = supplierLeads.filter((l) => l.status === "sold" || l.status === "returned").length;
    const dupRate = supplierLeads.length > 0 ? supplierLeads.filter((l) => l.status === "duplicate").length / supplierLeads.length : 0;
    const qualityScore = Math.max(0, Math.round(100 - dupRate * 200 - (supplierLeads.length > 0 ? (supplierLeads.filter((l) => l.status === "error").length / supplierLeads.length) * 150 : 0)));
    // Profit after supplier cost across their sold leads.
    const revenue = supplierLeads.filter((l) => l.status === "sold").reduce((sum, l) => sum + (l.salePriceCents ?? 0), 0);
    const cost = t?.booked.supplier_cost_accrued ?? 0;
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      pricingModel: s.pricingModel,
      fixedPriceCents: s.fixedPriceCents,
      termsDays: s.paymentTermsDays,
      keyPrefix: s.apiKeyPrefix,
      leads: supplierLeads.length,
      sold,
      qualityScore,
      profitAfterCost: revenue - cost,
      appUrl,
      truth: t
        ? {
            accrued: t.booked.supplier_cost_accrued,
            paid: t.verified.supplier_cost_paid,
            gap: t.gap.supplier_cost_gap,
            missingStatement: t.gap.missing_sources.includes("supplier_statements"),
          }
        : null,
    };
  });

  return <SuppliersClient rows={rows} openId={params.open ?? null} />;
}

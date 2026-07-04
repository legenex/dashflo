// Dev probe: prints the DoD-critical truth states from the seeded data.
import { assembleTruthDataset } from "@/server/truth-data";
import { computeTruth } from "@/domain/truth/compute";
import { suggestForUnmatched } from "@/server/matching";

async function main(): Promise<void> {
  const orgId = "org_legenex";
  const ds = await assembleTruthDataset(orgId);

  const buyers = computeTruth(ds, { scope: "buyer" });
  for (const row of buyers.rows) {
    console.log(
      `[buyer] ${row.name}: booked=${row.booked.booked_revenue} verified=${row.verified.verified_income} overdue=${row.gap.overdue} short=${row.gap.short_paid} status=${row.gap.payment_status} truth=${row.profit_truth}`
    );
  }

  const campaigns = computeTruth(ds, { scope: "campaign" });
  for (const row of campaigns.rows) {
    console.log(
      `[campaign] ${row.name}: booked=${row.booked.booked_revenue} verified=${row.verified.verified_income} reported_profit=${row.booked.reported_profit} cash=${row.verified.cash_profit} truth=${row.profit_truth} decision=${row.decision}`
    );
  }

  const org = computeTruth(ds, { scope: "org" });
  const t = org.totals;
  console.log(
    `[org] booked=${t.booked.booked_revenue} verified=${t.verified.verified_income} gap=${t.gap.revenue_gap} spend=${t.booked.media_cost_tracked} spend_paid=${t.verified.media_spend_paid} supplier=${t.booked.supplier_cost_accrued}/${t.verified.supplier_cost_paid} unmatched_in=${t.gap.unmatched_in} dq=${t.gap.data_quality} missing=${t.gap.missing_sources.join(",")}`
  );

  const suggestions = await suggestForUnmatched(orgId);
  for (const s of suggestions) {
    console.log(`[suggestion] payment=${s.paymentId} confidence=${s.confidence} tier=${s.tier} -> ${JSON.stringify(s.target)}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { executeTool, type ChartSpec, type ToolExecutionContext } from "./tools";
import { fmtCents } from "@/lib/money";
import type { AnalystAnswer } from "./analyst";
import { toDateKey, addDays } from "@/lib/transforms";

// Deterministic local analyst. No API key required: an intent router over the
// same tool layer answers the common questions from computed aggregates.
// Every answer is labeled Local analysis mode.

interface TruthRowLite {
  key: string;
  name: string;
  performance: { leads: number; sold: number; sold_rate: number | null };
  booked: {
    booked_revenue: number;
    reported_profit: number | null;
    media_cost_tracked: number | null;
    supplier_cost_accrued: number;
    reported_cpl: number | null;
  };
  verified: {
    verified_income: number | null;
    cash_profit: number | null;
    cash_margin: number | null;
    true_cpl: number | null;
  };
  gap: {
    revenue_gap: number | null;
    outstanding: number | null;
    overdue: number | null;
    due_soon: number | null;
    short_paid: number | null;
    payment_status: string;
    verification_status: string;
    missing_sources: string[];
  };
  profit_truth: string;
  decision: string | null;
}

interface TruthResultLite {
  rows: TruthRowLite[];
  totals: TruthRowLite;
}

type Intent =
  | "owed_money"
  | "false_profit"
  | "kill_ads"
  | "campaign_compare"
  | "buyer_risk"
  | "daily_summary"
  | "cash_margin"
  | "cpl_by_state"
  | "general";

export function detectIntent(question: string): Intent {
  const q = question.toLowerCase();
  if (/(owed|owes|owe me|outstanding|unpaid|who.*pay|collect)/.test(q)) return "owed_money";
  if (/false profit|profit.*real|real.*profit|fake profit/.test(q)) return "false_profit";
  if (/kill|turn off|shut off|worst ads|zero.?sold|wasted spend/.test(q)) return "kill_ads";
  if (/compare|versus|vs\.?|best campaign|top campaign|which campaign/.test(q)) return "campaign_compare";
  if (/buyer.*(risk|late|overdue|short)|risk.*buyer|debtor/.test(q)) return "buyer_risk";
  if (/summary|brief|today|this morning|how are we|how did we do|overview/.test(q)) return "daily_summary";
  if (/margin.*(drop|fall|down)|why.*margin|cash margin/.test(q)) return "cash_margin";
  if (/cpl.*state|state.*cpl|by state/.test(q)) return "cpl_by_state";
  return "general";
}

const LABEL = "Local analysis mode (no API key set), computed from the same truth engine the pages use.\n\n";

export async function answerLocally(args: {
  organizationId: string;
  question: string;
}): Promise<AnalystAnswer> {
  const ctx: ToolExecutionContext = { organizationId: args.organizationId, charts: [] };
  const intent = detectIntent(args.question);

  switch (intent) {
    case "owed_money":
      return owedMoney(ctx);
    case "false_profit":
      return falseProfit(ctx);
    case "kill_ads":
      return killAds(ctx);
    case "campaign_compare":
      return campaignCompare(ctx);
    case "buyer_risk":
      return buyerRisk(ctx);
    case "cash_margin":
      return cashMargin(ctx);
    case "cpl_by_state":
      return cplByState(ctx);
    case "daily_summary":
    case "general":
      return dailySummary(ctx, intent === "general");
  }
}

async function truth(ctx: ToolExecutionContext, scope: string, extra: Record<string, unknown> = {}): Promise<TruthResultLite> {
  return (await executeTool(ctx, "query_truth", { scope, ...extra })) as TruthResultLite;
}

async function owedMoney(ctx: ToolExecutionContext): Promise<AnalystAnswer> {
  const byBuyer = await truth(ctx, "buyer");
  const debtors = byBuyer.rows
    .filter((r) => (r.gap.outstanding ?? 0) > 0)
    .sort((a, b) => (b.gap.outstanding ?? 0) - (a.gap.outstanding ?? 0));

  if (debtors.length === 0) {
    return {
      text: `${LABEL}Nothing is outstanding right now. Every booked sale has matching verified income.`,
      charts: [],
      mode: "local",
    };
  }

  const total = debtors.reduce((s, r) => s + (r.gap.outstanding ?? 0), 0);
  const overdueTotal = debtors.reduce((s, r) => s + (r.gap.overdue ?? 0), 0);
  const lines = debtors.map((r) => {
    const parts = [`${fmtCents(r.gap.outstanding)} outstanding`];
    if ((r.gap.overdue ?? 0) > 0) parts.push(`${fmtCents(r.gap.overdue)} overdue`);
    if ((r.gap.short_paid ?? 0) > 0) parts.push(`${fmtCents(r.gap.short_paid)} short-paid`);
    if ((r.gap.due_soon ?? 0) > 0) parts.push(`${fmtCents(r.gap.due_soon)} due within 7 days`);
    if (r.gap.payment_status === "no_payment_source") parts.push("no payment source connected");
    return `- ${r.name}: ${parts.join(", ")}`;
  });

  const chart: ChartSpec = {
    kind: "bar",
    title: "Outstanding by buyer ($)",
    data: debtors.slice(0, 8).map((r) => ({
      label: r.name,
      value: Math.round((r.gap.outstanding ?? 0) / 100),
      value2: Math.round((r.gap.overdue ?? 0) / 100),
    })),
    series: ["Outstanding", "Overdue"],
  };

  return {
    text: `${LABEL}You are owed ${fmtCents(total)} across ${debtors.length} buyer${debtors.length === 1 ? "" : "s"}, ${fmtCents(overdueTotal)} of it past terms.\n\n${lines.join("\n")}\n\nThe fastest wins: chase the overdue balance first, then apply any waiting suggestions in the Match Queue.`,
    charts: [chart],
    mode: "local",
  };
}

async function falseProfit(ctx: ToolExecutionContext): Promise<AnalystAnswer> {
  const byCampaign = await truth(ctx, "campaign");
  const flagged = byCampaign.rows.filter((r) => r.profit_truth === "false_profit");
  const atRisk = byCampaign.rows.filter((r) => r.profit_truth === "at_risk");

  if (flagged.length === 0 && atRisk.length === 0) {
    return {
      text: `${LABEL}No campaign currently shows false profit. Reported and cash profit agree within tolerance everywhere.`,
      charts: [],
      mode: "local",
    };
  }

  const parts: string[] = [];
  for (const r of flagged) {
    parts.push(
      `- ${r.name}: reports ${fmtCents(r.booked.reported_profit)} profit but only ${fmtCents(r.verified.verified_income)} of ${fmtCents(r.booked.booked_revenue)} booked revenue is verified${r.verified.cash_profit !== null ? `, cash profit is actually ${fmtCents(r.verified.cash_profit)}` : ""}. Decision: ${r.decision ?? "review"}.`
    );
  }
  for (const r of atRisk) {
    parts.push(
      `- ${r.name}: ${fmtCents(r.booked.booked_revenue)} booked with zero verified income (At-Risk, adjacent to false profit).`
    );
  }

  const chart: ChartSpec = {
    kind: "bar",
    title: "Reported vs cash profit ($)",
    data: [...flagged, ...atRisk].slice(0, 6).map((r) => ({
      label: r.name,
      value: Math.round((r.booked.reported_profit ?? 0) / 100),
      value2: Math.round((r.verified.cash_profit ?? 0) / 100),
    })),
    series: ["Reported", "Cash"],
  };

  return {
    text: `${LABEL}${flagged.length > 0 ? `${flagged.length} campaign${flagged.length === 1 ? " shows" : "s show"} false profit:` : "No hard false profit, but revenue is at risk:"}\n\n${parts.join("\n")}\n\nDo not scale these on reported numbers. Chase the cash first.`,
    charts: [chart],
    mode: "local",
  };
}

async function killAds(ctx: ToolExecutionContext): Promise<AnalystAnswer> {
  const from = toDateKey(addDays(new Date(), -14));
  const to = toDateKey(new Date());
  const ads = (await executeTool(ctx, "query_spend", { group_by: "ad", from, to })) as Array<{
    key: string;
    spend_cents: number;
    sold_leads: number;
    roas: number | null;
    cash_roas: number | null;
  }>;
  const zeroSold = ads.filter((a) => a.spend_cents > 5000 && a.sold_leads === 0);
  const weak = ads.filter((a) => a.sold_leads > 0 && a.roas !== null && a.roas < 0.8);

  if (zeroSold.length === 0 && weak.length === 0) {
    return {
      text: `${LABEL}Nothing screams kill in the last 14 days. No ad spent meaningfully with zero sold leads.`,
      charts: [],
      mode: "local",
    };
  }

  const lines = [
    ...zeroSold.map((a) => `- ${a.key}: ${fmtCents(a.spend_cents)} spent, zero sold leads. Kill it.`),
    ...weak.slice(0, 5).map((a) => `- ${a.key}: ${fmtCents(a.spend_cents)} spent, ROAS ${a.roas}. Watch or cut.`),
  ];

  const chart: ChartSpec = {
    kind: "bar",
    title: "Spend on kill candidates, last 14 days ($)",
    data: [...zeroSold, ...weak].slice(0, 8).map((a) => ({ label: a.key, value: Math.round(a.spend_cents / 100) })),
  };

  const wasted = zeroSold.reduce((s, a) => s + a.spend_cents, 0);
  return {
    text: `${LABEL}${zeroSold.length} ad${zeroSold.length === 1 ? "" : "s"} spent ${fmtCents(wasted)} in the last 14 days without selling a single lead.\n\n${lines.join("\n")}\n\nAd Performance has a one-click Kill on each red row.`,
    charts: [chart],
    mode: "local",
  };
}

async function campaignCompare(ctx: ToolExecutionContext): Promise<AnalystAnswer> {
  const byCampaign = await truth(ctx, "campaign");
  const rows = byCampaign.rows;
  const lines = rows.map(
    (r) =>
      `- ${r.name}: ${r.performance.leads} leads, ${((r.performance.sold_rate ?? 0) * 100).toFixed(0)}% sold, booked ${fmtCents(r.booked.booked_revenue)}, verified ${fmtCents(r.verified.verified_income)}, cash profit ${fmtCents(r.verified.cash_profit)}, truth: ${r.profit_truth.replace("_", " ")}, decision: ${r.decision ?? "watch"}`
  );
  const chart: ChartSpec = {
    kind: "bar",
    title: "Booked vs verified by campaign ($)",
    data: rows.slice(0, 8).map((r) => ({
      label: r.name,
      value: Math.round(r.booked.booked_revenue / 100),
      value2: Math.round((r.verified.verified_income ?? 0) / 100),
    })),
    series: ["Booked", "Verified"],
  };
  return {
    text: `${LABEL}Campaign comparison on cash truth:\n\n${lines.join("\n")}\n\nOnly trust the rows where verified tracks booked. Everything else is a claim, not cash.`,
    charts: [chart],
    mode: "local",
  };
}

async function buyerRisk(ctx: ToolExecutionContext): Promise<AnalystAnswer> {
  const byBuyer = await truth(ctx, "buyer");
  const risky = byBuyer.rows
    .filter((r) => (r.gap.overdue ?? 0) > 0 || (r.gap.short_paid ?? 0) > 0 || r.gap.payment_status === "no_payment_source")
    .sort((a, b) => ((b.gap.overdue ?? 0) + (b.gap.short_paid ?? 0)) - ((a.gap.overdue ?? 0) + (a.gap.short_paid ?? 0)));

  if (risky.length === 0) {
    return { text: `${LABEL}No buyer shows payment risk right now.`, charts: [], mode: "local" };
  }
  const lines = risky.map((r) => {
    const flags: string[] = [];
    if ((r.gap.overdue ?? 0) > 0) flags.push(`${fmtCents(r.gap.overdue)} overdue`);
    if ((r.gap.short_paid ?? 0) > 0) flags.push(`${fmtCents(r.gap.short_paid)} short-paid`);
    if (r.gap.payment_status === "no_payment_source") flags.push(`${fmtCents(r.booked.booked_revenue)} booked with no payment source`);
    return `- ${r.name}: ${flags.join(", ")}`;
  });
  return {
    text: `${LABEL}Buyer payment risk, worst first:\n\n${lines.join("\n")}\n\nConsider pausing deliveries to the worst offender until the balance clears.`,
    charts: [
      {
        kind: "bar",
        title: "At-risk dollars by buyer ($)",
        data: risky.slice(0, 8).map((r) => ({
          label: r.name,
          value: Math.round(((r.gap.overdue ?? 0) + (r.gap.short_paid ?? 0)) / 100 || r.booked.booked_revenue / 100),
        })),
      },
    ],
    mode: "local",
  };
}

async function cashMargin(ctx: ToolExecutionContext): Promise<AnalystAnswer> {
  const to = toDateKey(new Date());
  const lastWeekFrom = toDateKey(addDays(new Date(), -7));
  const priorFrom = toDateKey(addDays(new Date(), -14));
  const priorTo = toDateKey(addDays(new Date(), -8));
  const recent = await truth(ctx, "org", { from: lastWeekFrom, to });
  const prior = await truth(ctx, "org", { from: priorFrom, to: priorTo });
  const r = recent.totals;
  const p = prior.totals;
  const fmt = (v: number | null) => (v === null ? "unknown" : `${(v * 100).toFixed(0)}%`);
  return {
    text: `${LABEL}Cash margin last 7 days: ${fmt(r.verified.cash_margin)} (verified income ${fmtCents(r.verified.verified_income)}, cash profit ${fmtCents(r.verified.cash_profit)}). Prior week: ${fmt(p.verified.cash_margin)} (verified ${fmtCents(p.verified.verified_income)}).\n\nThe usual causes ranked: payments landing late (revenue gap ${fmtCents(r.gap.revenue_gap)}), spend verified faster than income, or short pays. Check the Match Queue before assuming performance dropped.`,
    charts: [
      {
        kind: "bar",
        title: "Week over week, verified vs booked ($)",
        data: [
          { label: "Prior wk", value: Math.round((p.verified.verified_income ?? 0) / 100), value2: Math.round(p.booked.booked_revenue / 100) },
          { label: "Last wk", value: Math.round((r.verified.verified_income ?? 0) / 100), value2: Math.round(r.booked.booked_revenue / 100) },
        ],
        series: ["Verified", "Booked"],
      },
    ],
    mode: "local",
  };
}

async function cplByState(ctx: ToolExecutionContext): Promise<AnalystAnswer> {
  const byState = (await executeTool(ctx, "query_leads", { group_by: "state" })) as {
    counts: Record<string, number>;
  };
  const entries = Object.entries(byState.counts).slice(0, 10);
  return {
    text: `${LABEL}Lead volume by state (spend is not attributed per state in the current data, so a true per-state CPL needs state-tagged ad campaigns):\n\n${entries.map(([s, c]) => `- ${s}: ${c} leads`).join("\n")}`,
    charts: [
      { kind: "bar", title: "Leads by state", data: entries.map(([label, value]) => ({ label, value })) },
    ],
    mode: "local",
  };
}

async function dailySummary(ctx: ToolExecutionContext, isGeneral: boolean): Promise<AnalystAnswer> {
  const org = await truth(ctx, "org");
  const t = org.totals;
  const actions = (await executeTool(ctx, "query_actions", { status: "open", limit: 5 })) as Array<{
    entity: string;
    amount_at_risk_cents: number | null;
    description: string;
  }>;
  const atRisk = actions.reduce((s, a) => s + (a.amount_at_risk_cents ?? 0), 0);
  const header = isGeneral
    ? "Here is the cash truth picture right now."
    : "Daily brief, cash truth first.";
  return {
    text: `${LABEL}${header}\n\n- Booked revenue ${fmtCents(t.booked.booked_revenue)}, verified income ${fmtCents(t.verified.verified_income)}, gap ${fmtCents(t.gap.revenue_gap)}\n- Reported profit ${fmtCents(t.booked.reported_profit)}, cash profit ${fmtCents(t.verified.cash_profit)}\n- Outstanding ${fmtCents(t.gap.outstanding)}, overdue ${fmtCents(t.gap.overdue)}, due within 7 days ${fmtCents(t.gap.due_soon)}\n- ${actions.length} open action items worth ${fmtCents(atRisk)} at risk${actions[0] ? `, biggest: ${actions[0].entity} (${fmtCents(actions[0].amount_at_risk_cents)})` : ""}\n\nAsk me "am I owed money", "which campaigns show false profit", or "which ads should I kill" to go deeper.`,
    charts: [
      {
        kind: "bar",
        title: "Booked vs verified vs gap ($)",
        data: [
          { label: "Booked", value: Math.round(t.booked.booked_revenue / 100) },
          { label: "Verified", value: Math.round((t.verified.verified_income ?? 0) / 100) },
          { label: "Gap", value: Math.round((t.gap.revenue_gap ?? 0) / 100) },
        ],
      },
    ],
    mode: "local",
  };
}

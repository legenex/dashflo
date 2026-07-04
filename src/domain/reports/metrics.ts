import type { TruthDataset, TruthLead } from "@/domain/truth/types";
import type { ReportCustomMetric, ReportFieldFilter } from "@/db/schema";
import { addDays, toDateKey } from "@/lib/transforms";

// Report metric engine. Computes the base aggregate set for any filtered
// slice of leads (plus attributable spend), exposes a metric registry the
// report pages pick cards and columns from, and evaluates custom metric
// formulas safely. Pure, unit-tested.

export interface MetricAggregates {
  leads: number;
  sold: number; // active sold (excludes returned)
  returned: number;
  duplicates: number;
  fake: number; // rejected by filters (bad/fake submissions)
  errors: number;
  unsold: number;
  unmatched: number;
  grossRevenueCents: number; // sold + returned sale prices
  revenueCents: number; // net of returns (active sold only)
  verifiedCents: number | null; // null = payment sources inactive
  supplierCostCents: number;
  supplierPaidCents: number | null;
  mediaCostCents: number | null; // null when not attributable or source gated
  otherCostCents: number;
}

export interface FilterContext {
  from?: string;
  to?: string;
  campaignIds?: string[];
  buyerIds?: string[];
  supplierIds?: string[];
  states?: string[];
  fieldFilters?: ReportFieldFilter[];
  today: string;
  includeMedia?: boolean; // media only attributes at org/campaign/day grain
}

export function leadMatchesFieldFilter(
  lead: TruthLead,
  fieldData: Record<string, unknown>,
  filter: ReportFieldFilter,
  today: string
): boolean {
  const raw = filter.field === "state" ? lead.state : fieldData[filter.field];
  switch (filter.operator) {
    case "exists":
      return raw !== null && raw !== undefined && String(raw) !== "";
    case "within_days": {
      const days = Number(filter.value ?? 0);
      const value = String(raw ?? "");
      if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return false;
      const cutoff = toDateKey(addDays(new Date(`${today}T00:00:00Z`), -days));
      return value.slice(0, 10) >= cutoff && value.slice(0, 10) <= today;
    }
    case "equals":
      return String(raw ?? "").toLowerCase() === String(filter.value ?? "").toLowerCase();
    case "not_equals":
      return String(raw ?? "").toLowerCase() !== String(filter.value ?? "").toLowerCase();
    case "in": {
      const list = Array.isArray(filter.value) ? filter.value : String(filter.value ?? "").split(",");
      return list.some((v) => String(v).trim().toLowerCase() === String(raw ?? "").toLowerCase());
    }
    case "contains":
      return String(raw ?? "").toLowerCase().includes(String(filter.value ?? "").toLowerCase());
    case "gt":
      return Number(raw) > Number(filter.value);
    case "lt":
      return Number(raw) < Number(filter.value);
    default:
      return true;
  }
}

export function filterLeads(
  dataset: TruthDataset,
  fieldDataById: Map<string, Record<string, unknown>>,
  ctx: FilterContext
): TruthLead[] {
  return dataset.leads.filter((l) => {
    if (l.isTest) return false;
    if (ctx.from && l.receivedAt < ctx.from) return false;
    if (ctx.to && l.receivedAt > ctx.to) return false;
    if (ctx.campaignIds?.length && !ctx.campaignIds.includes(l.campaignId)) return false;
    if (ctx.buyerIds?.length && (l.buyerId === null || !ctx.buyerIds.includes(l.buyerId))) return false;
    if (ctx.supplierIds?.length && !ctx.supplierIds.includes(l.supplierId)) return false;
    if (ctx.states?.length && (l.state === null || !ctx.states.includes(l.state))) return false;
    for (const f of ctx.fieldFilters ?? []) {
      if (!f.enabled) continue;
      const fd = fieldDataById.get(l.id) ?? {};
      if (!leadMatchesFieldFilter(l, fd, f, ctx.today)) return false;
    }
    return true;
  });
}

export function computeAggregates(
  leads: TruthLead[],
  dataset: TruthDataset,
  ctx: FilterContext
): MetricAggregates {
  const paymentsActive = dataset.connectors["stripe"] === "active" || dataset.connectors["mercury"] === "active";
  let sold = 0, returned = 0, duplicates = 0, fake = 0, errors = 0, unsold = 0, unmatched = 0;
  let grossRevenue = 0, revenue = 0, verified = 0, supplierCost = 0, supplierPaid = 0;

  for (const l of leads) {
    switch (l.status) {
      case "sold":
        sold++;
        grossRevenue += l.salePriceCents ?? 0;
        revenue += l.salePriceCents ?? 0;
        verified += l.paidAllocatedCents;
        break;
      case "returned":
        returned++;
        grossRevenue += l.salePriceCents ?? 0;
        break;
      case "duplicate": duplicates++; break;
      case "rejected": fake++; break;
      case "error": errors++; break;
      case "unsold": unsold++; break;
      case "unmatched": unmatched++; break;
    }
    if (l.supplierCostCents !== null && !["duplicate", "error"].includes(l.status)) {
      supplierCost += l.supplierCostCents;
      supplierPaid += l.supplierPaidCents;
    }
  }

  // Media attributes only when the slice maps cleanly (org/campaign/day grain).
  let mediaCost: number | null = null;
  if (ctx.includeMedia) {
    mediaCost = 0;
    const campaignSet = ctx.campaignIds?.length ? new Set(ctx.campaignIds) : null;
    for (const row of dataset.spend) {
      if (ctx.from && row.date < ctx.from) continue;
      if (ctx.to && row.date > ctx.to) continue;
      if (campaignSet && (row.mappedCampaignId === null || !campaignSet.has(row.mappedCampaignId))) continue;
      if (!campaignSet && row.mappedCampaignId === null) continue;
      mediaCost += row.spendCents;
    }
  }

  let otherCost = 0;
  if (ctx.includeMedia) {
    for (const cost of dataset.costs) {
      if (cost.category === "media") continue;
      if (ctx.from && cost.date < ctx.from) continue;
      if (ctx.to && cost.date > ctx.to) continue;
      if (ctx.campaignIds?.length && cost.campaignId !== null && !ctx.campaignIds.includes(cost.campaignId)) continue;
      if (ctx.campaignIds?.length && cost.campaignId === null) continue;
      otherCost += cost.amountCents;
    }
  }

  return {
    leads: leads.length,
    sold, returned, duplicates, fake, errors, unsold, unmatched,
    grossRevenueCents: grossRevenue,
    revenueCents: revenue,
    verifiedCents: paymentsActive ? verified : null,
    supplierCostCents: supplierCost,
    supplierPaidCents: paymentsActive ? supplierPaid : null,
    mediaCostCents: mediaCost,
    otherCostCents: otherCost,
  };
}

export type MetricFormat = "money" | "number" | "pct";

export interface MetricDef {
  id: string;
  label: string;
  format: MetricFormat;
  group: "money" | "volume" | "quality";
  compute: (a: MetricAggregates) => number | null;
}

// The base metric registry. Custom metrics compose these by id.
export const METRIC_REGISTRY: MetricDef[] = [
  { id: "revenue", label: "Revenue", format: "money", group: "money", compute: (a) => a.grossRevenueCents },
  { id: "net_revenue", label: "Net Revenue", format: "money", group: "money", compute: (a) => a.revenueCents },
  { id: "verified_income", label: "Verified Income", format: "money", group: "money", compute: (a) => a.verifiedCents },
  {
    id: "cost", label: "Cost", format: "money", group: "money",
    compute: (a) => a.supplierCostCents + (a.mediaCostCents ?? 0) + a.otherCostCents,
  },
  {
    id: "cpl", label: "CPL", format: "money", group: "money",
    compute: (a) => (a.leads > 0 ? Math.round((a.supplierCostCents + (a.mediaCostCents ?? 0) + a.otherCostCents) / a.leads) : null),
  },
  {
    id: "profit", label: "Profit", format: "money", group: "money",
    compute: (a) => a.revenueCents - a.supplierCostCents - (a.mediaCostCents ?? 0) - a.otherCostCents,
  },
  {
    id: "net_profit", label: "Net Profit (cash)", format: "money", group: "money",
    compute: (a) =>
      a.verifiedCents === null || a.supplierPaidCents === null
        ? null
        : a.verifiedCents - a.supplierPaidCents - (a.mediaCostCents ?? 0) - a.otherCostCents,
  },
  {
    id: "revenue_gap", label: "Revenue Gap", format: "money", group: "money",
    compute: (a) => (a.verifiedCents === null ? null : a.revenueCents - a.verifiedCents),
  },
  {
    id: "avg_price", label: "Avg Sale Price", format: "money", group: "money",
    compute: (a) => (a.sold > 0 ? Math.round(a.revenueCents / a.sold) : null),
  },
  { id: "total_leads", label: "Total Leads", format: "number", group: "volume", compute: (a) => a.leads },
  { id: "sold_leads", label: "Sold Leads", format: "number", group: "volume", compute: (a) => a.sold },
  { id: "conversions", label: "Conversions", format: "number", group: "volume", compute: (a) => a.sold },
  {
    id: "conv_rate", label: "Conv Rate", format: "pct", group: "volume",
    compute: (a) => (a.leads > 0 ? a.sold / a.leads : null),
  },
  { id: "fake_leads", label: "Fake Leads", format: "number", group: "quality", compute: (a) => a.fake },
  { id: "returns", label: "Returns", format: "number", group: "quality", compute: (a) => a.returned },
  { id: "duplicates", label: "Duplicates", format: "number", group: "quality", compute: (a) => a.duplicates },
  { id: "errors", label: "Errors", format: "number", group: "quality", compute: (a) => a.errors },
  {
    id: "dup_rate", label: "Dup Rate", format: "pct", group: "quality",
    compute: (a) => (a.leads > 0 ? a.duplicates / a.leads : null),
  },
  {
    id: "return_rate", label: "Return Rate", format: "pct", group: "quality",
    compute: (a) => (a.sold + a.returned > 0 ? a.returned / (a.sold + a.returned) : null),
  },
  {
    id: "gp_margin", label: "GP Margin", format: "pct", group: "money",
    compute: (a) => {
      if (a.revenueCents <= 0) return null;
      const profit = a.revenueCents - a.supplierCostCents - (a.mediaCostCents ?? 0) - a.otherCostCents;
      return profit / a.revenueCents;
    },
  },
];

const REGISTRY_BY_ID = new Map(METRIC_REGISTRY.map((m) => [m.id, m]));

export function metricDef(id: string, custom: ReportCustomMetric[] = []): { label: string; format: MetricFormat } | null {
  const base = REGISTRY_BY_ID.get(id);
  if (base) return { label: base.label, format: base.format };
  const c = custom.find((x) => x.id === id);
  if (c) return { label: c.label, format: c.format };
  return null;
}

// ---- Custom metric formula parser ----
// Grammar: expr = term (("+"|"-") term)*; term = factor (("*"|"/") factor)*;
// factor = number | identifier | "(" expr ")". Identifiers resolve to base
// metric values (money metrics resolve in cents). Division by zero and any
// null input yield null, never a fake zero.

type Token = { kind: "num"; value: number } | { kind: "id"; name: string } | { kind: "op"; op: string };

function tokenize(formula: string): Token[] | null {
  const tokens: Token[] = [];
  const re = /\s*(\d+(?:\.\d+)?|[a-zA-Z_][a-zA-Z0-9_]*|[+\-*/()])/y;
  let idx = 0;
  while (idx < formula.length) {
    re.lastIndex = idx;
    const m = re.exec(formula);
    if (!m) return null;
    const t = m[1];
    if (/^\d/.test(t)) tokens.push({ kind: "num", value: Number(t) });
    else if (/^[a-zA-Z_]/.test(t)) tokens.push({ kind: "id", name: t });
    else tokens.push({ kind: "op", op: t });
    idx = re.lastIndex;
  }
  return tokens;
}

export function evaluateFormula(
  formula: string,
  values: (id: string) => number | null
): { ok: true; value: number | null } | { ok: false; error: string } {
  const tokens = tokenize(formula);
  if (!tokens || tokens.length === 0) return { ok: false, error: "Empty or invalid formula" };
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  function parseExpr(): number | null | { error: string } {
    let left = parseTerm();
    if (left !== null && typeof left === "object") return left;
    while (peek()?.kind === "op" && ((peek() as { op: string }).op === "+" || (peek() as { op: string }).op === "-")) {
      const op = (eat() as { op: string }).op;
      const right = parseTerm();
      if (right !== null && typeof right === "object") return right;
      if (left === null || right === null) left = null;
      else left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null | { error: string } {
    let left = parseFactor();
    if (left !== null && typeof left === "object") return left;
    while (peek()?.kind === "op" && ((peek() as { op: string }).op === "*" || (peek() as { op: string }).op === "/")) {
      const op = (eat() as { op: string }).op;
      const right = parseFactor();
      if (right !== null && typeof right === "object") return right;
      if (left === null || right === null) left = null;
      else if (op === "*") left = left * right;
      else left = right === 0 ? null : left / right;
    }
    return left;
  }

  function parseFactor(): number | null | { error: string } {
    const t = peek();
    if (!t) return { error: "Unexpected end of formula" };
    if (t.kind === "num") {
      eat();
      return t.value;
    }
    if (t.kind === "id") {
      eat();
      if (!REGISTRY_BY_ID.has(t.name)) return { error: `Unknown metric "${t.name}"` };
      return values(t.name);
    }
    if (t.kind === "op" && t.op === "(") {
      eat();
      const inner = parseExpr();
      if (inner !== null && typeof inner === "object") return inner;
      const close = eat();
      if (!close || close.kind !== "op" || close.op !== ")") return { error: "Missing closing parenthesis" };
      return inner;
    }
    if (t.kind === "op" && t.op === "-") {
      eat();
      const inner = parseFactor();
      if (inner !== null && typeof inner === "object") return inner;
      return inner === null ? null : -inner;
    }
    return { error: `Unexpected token in formula` };
  }

  const result = parseExpr();
  if (result !== null && typeof result === "object") return { ok: false, error: result.error };
  if (pos < tokens.length) return { ok: false, error: "Unexpected trailing input" };
  return { ok: true, value: result };
}

export function computeMetricValue(
  id: string,
  aggregates: MetricAggregates,
  custom: ReportCustomMetric[] = []
): number | null {
  const base = REGISTRY_BY_ID.get(id);
  if (base) return base.compute(aggregates);
  const c = custom.find((x) => x.id === id);
  if (!c) return null;
  const result = evaluateFormula(c.formula, (ref) => {
    const def = REGISTRY_BY_ID.get(ref);
    return def ? def.compute(aggregates) : null;
  });
  return result.ok ? result.value : null;
}

export function validateFormula(formula: string): { ok: boolean; error?: string } {
  const result = evaluateFormula(formula, () => 1);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

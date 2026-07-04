import type { BuyerCaps, DeliveryConfig, InboundFilters } from "@/db/schema";
import { evaluateFilters, scheduleIsLive, type RuleContext } from "./rules";
import { CapLedger, type CapUsage } from "./caps";
import { orderByPriority, orderByWeight, orderRoundRobin, type OrderableBuyer } from "./ordering";
import { renderTemplate, evaluateMatcher, extractPriceCents } from "./template";

// Routing orchestration. All IO is injected so the pipeline is fully testable:
// httpDeliver performs the actual POST, everything else is pure sequencing.

export interface RoutableBuyer extends OrderableBuyer {
  name: string;
  deliveryConfig: DeliveryConfig;
  caps: BuyerCaps;
  filters: InboundFilters | null;
  schedule: { days: number[]; start_hour: number; end_hour: number } | null;
  priceCents: number; // resolved: campaign override or buyer default
  paymentTermsDays: number;
}

export interface DeliveryResult {
  ok: boolean;
  status: number;
  body: string;
  parsed: unknown;
  durationMs: number;
  timedOut: boolean;
  error?: string;
}

export type HttpDeliver = (args: {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}) => Promise<DeliveryResult>;

export interface AttemptLog {
  buyerId: string;
  buyerName: string;
  attemptType: "ping" | "post";
  request: { url: string; headers: Record<string, string>; body: string };
  response: { status: number; body: string };
  bidCents: number | null;
  outcome: "accepted" | "rejected" | "timeout" | "error";
  durationMs: number;
}

export interface RouteOutcome {
  status: "sold" | "unsold" | "unmatched";
  buyerId?: string;
  buyerName?: string;
  salePriceCents?: number;
  bidCents?: number;
  paymentTermsDays?: number;
  attempts: AttemptLog[];
  capBlocked: Array<{ buyerId: string; buyerName: string; blockedBy: string }>;
}

export function buildAuthHeaders(config: DeliveryConfig): Record<string, string> {
  const headers: Record<string, string> = { ...(config.headers ?? {}) };
  headers["Content-Type"] =
    config.content_type === "form" ? "application/x-www-form-urlencoded" : "application/json";
  const auth = config.auth;
  if (auth) {
    if (auth.type === "basic" && auth.username !== undefined) {
      headers["Authorization"] = `Basic ${Buffer.from(`${auth.username}:${auth.password ?? ""}`).toString("base64")}`;
    } else if (auth.type === "bearer" && auth.token) {
      headers["Authorization"] = `Bearer ${auth.token}`;
    } else if (auth.type === "header" && auth.header_name) {
      headers[auth.header_name] = auth.header_value ?? "";
    }
  }
  return headers;
}

export function buildBody(config: DeliveryConfig, template: string, tokens: Record<string, unknown>): string {
  const rendered = renderTemplate(template, tokens);
  if (config.content_type === "form") {
    // Template renders JSON, convert to form encoding; fall back to raw string.
    try {
      const obj = JSON.parse(rendered) as Record<string, unknown>;
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(obj)) params.set(k, String(v ?? ""));
      return params.toString();
    } catch {
      return rendered;
    }
  }
  return rendered;
}

export function orderBuyers<T extends OrderableBuyer>(
  buyers: T[],
  method: "priority" | "weighted" | "round_robin",
  opts: { rng: () => number; lastBuyerId: string | null }
): T[] {
  if (method === "weighted") return orderByWeight(buyers, opts.rng);
  if (method === "round_robin") return orderRoundRobin(buyers, opts.lastBuyerId);
  return orderByPriority(buyers);
}

export interface EligibilityInput {
  buyers: RoutableBuyer[];
  leadData: Record<string, unknown>;
  ctx: RuleContext;
  usage: Map<string, CapUsage>;
  ledger: CapLedger;
}

export interface EligibilityOutput {
  eligible: RoutableBuyer[];
  capBlocked: Array<{ buyerId: string; buyerName: string; blockedBy: string }>;
  filteredOut: Array<{ buyerId: string; buyerName: string; reason: string }>;
}

const EMPTY_USAGE: CapUsage = {
  leads: { daily: 0, weekly: 0, monthly: 0, total: 0 },
  budget_cents: { daily: 0, weekly: 0, monthly: 0, total: 0 },
};

// Filters + schedule + atomic cap reservation. Buyers returned here hold a
// reservation that MUST be released by the caller after the attempt settles.
export function selectEligibleBuyers(input: EligibilityInput): EligibilityOutput {
  const eligible: RoutableBuyer[] = [];
  const capBlocked: EligibilityOutput["capBlocked"] = [];
  const filteredOut: EligibilityOutput["filteredOut"] = [];

  for (const buyer of input.buyers) {
    if (buyer.schedule && !scheduleIsLive(buyer.schedule, input.ctx)) {
      filteredOut.push({ buyerId: buyer.buyerId, buyerName: buyer.name, reason: "outside schedule" });
      continue;
    }
    const filterResult = evaluateFilters(buyer.filters, input.leadData, input.ctx);
    if (!filterResult.pass) {
      filteredOut.push({
        buyerId: buyer.buyerId,
        buyerName: buyer.name,
        reason: `filter: ${filterResult.failing?.rule.field ?? "unknown"}`,
      });
      continue;
    }
    const persisted = input.usage.get(buyer.buyerId) ?? EMPTY_USAGE;
    const check = input.ledger.tryReserve(buyer.buyerId, buyer.caps, persisted, buyer.priceCents);
    if (!check.available) {
      capBlocked.push({ buyerId: buyer.buyerId, buyerName: buyer.name, blockedBy: check.blockedBy ?? "cap" });
      continue;
    }
    eligible.push(buyer);
  }

  return { eligible, capBlocked, filteredOut };
}

async function attemptDelivery(
  buyer: RoutableBuyer,
  template: string,
  attemptType: "ping" | "post",
  tokens: Record<string, unknown>,
  deliver: HttpDeliver
): Promise<AttemptLog> {
  const config = buyer.deliveryConfig;
  const headers = buildAuthHeaders(config);
  const body = buildBody(config, template, tokens);
  const timeoutMs = config.timeout_ms ?? 8000;
  const retries = Math.max(0, config.retries ?? 0);

  let last: DeliveryResult = { ok: false, status: 0, body: "", parsed: null, durationMs: 0, timedOut: false };
  for (let i = 0; i <= retries; i++) {
    last = await deliver({ url: config.url, method: "POST", headers, body, timeoutMs });
    if (!last.error && !last.timedOut) break;
    if (i < retries && config.backoff_ms) {
      await new Promise((r) => setTimeout(r, config.backoff_ms));
    }
  }

  let outcome: AttemptLog["outcome"];
  let bidCents: number | null = null;
  if (last.timedOut) outcome = "timeout";
  else if (last.error) outcome = "error";
  else {
    const accepted = evaluateMatcher(config.success_matcher, last.body, last.parsed);
    outcome = accepted ? "accepted" : "rejected";
    if (config.price_path) bidCents = extractPriceCents(last.parsed, config.price_path);
  }

  return {
    buyerId: buyer.buyerId,
    buyerName: buyer.name,
    attemptType,
    request: { url: config.url, headers, body },
    response: { status: last.status, body: last.body.slice(0, 4000) },
    bidCents,
    outcome,
    durationMs: last.durationMs,
  };
}

// Direct post: deliver sequentially in order, first accept wins.
export async function routeDirectPost(args: {
  ordered: RoutableBuyer[];
  tokens: Record<string, unknown>;
  deliver: HttpDeliver;
  ledger: CapLedger;
  capBlocked: RouteOutcome["capBlocked"];
}): Promise<RouteOutcome> {
  const attempts: AttemptLog[] = [];
  let winner: { buyer: RoutableBuyer; attempt: AttemptLog } | null = null;

  for (const buyer of args.ordered) {
    if (winner) {
      // Remaining reservations are released untouched.
      args.ledger.release(buyer.buyerId, buyer.priceCents);
      continue;
    }
    const template = buyer.deliveryConfig.body_template ?? buyer.deliveryConfig.post_template ?? "{}";
    const attempt = await attemptDelivery(buyer, template, "post", args.tokens, args.deliver);
    attempts.push(attempt);
    if (attempt.outcome === "accepted") {
      winner = { buyer, attempt };
      // keep the reservation, the sale persists it
    } else {
      args.ledger.release(buyer.buyerId, buyer.priceCents);
    }
  }

  if (!winner) {
    return {
      status: args.ordered.length === 0 ? "unmatched" : "unsold",
      attempts,
      capBlocked: args.capBlocked,
    };
  }

  const extracted = winner.attempt.bidCents;
  const salePriceCents = extracted && extracted > 0 ? extracted : winner.buyer.priceCents;
  args.ledger.release(winner.buyer.buyerId, winner.buyer.priceCents);
  return {
    status: "sold",
    buyerId: winner.buyer.buyerId,
    buyerName: winner.buyer.name,
    salePriceCents,
    paymentTermsDays: winner.buyer.paymentTermsDays,
    attempts,
    capBlocked: args.capBlocked,
  };
}

// Ping post: ping all in parallel, collect bids, post to winner, fall through on rejection.
// Pings render from pingTokens (contact data withheld), posts from postTokens (full payload).
export async function routePingPost(args: {
  eligible: RoutableBuyer[];
  pingTokens: Record<string, unknown>;
  postTokens: Record<string, unknown>;
  deliver: HttpDeliver;
  ledger: CapLedger;
  capBlocked: RouteOutcome["capBlocked"];
}): Promise<RouteOutcome> {
  const attempts: AttemptLog[] = [];

  const pings = await Promise.all(
    args.eligible.map(async (buyer) => {
      const template = buyer.deliveryConfig.ping_template ?? "{}";
      const attempt = await attemptDelivery(buyer, template, "ping", args.pingTokens, args.deliver);
      return { buyer, attempt };
    })
  );
  for (const p of pings) attempts.push(p.attempt);

  const bidders = pings
    .filter((p) => p.attempt.outcome === "accepted" && (p.attempt.bidCents ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.attempt.bidCents ?? 0) - (a.attempt.bidCents ?? 0) || a.buyer.priority - b.buyer.priority
    );

  // Release reservations for non-bidders now.
  const bidderIds = new Set(bidders.map((b) => b.buyer.buyerId));
  for (const p of pings) {
    if (!bidderIds.has(p.buyer.buyerId)) args.ledger.release(p.buyer.buyerId, p.buyer.priceCents);
  }

  for (const bidder of bidders) {
    const template =
      bidder.buyer.deliveryConfig.post_template ?? bidder.buyer.deliveryConfig.body_template ?? "{}";
    const postAttempt = await attemptDelivery(bidder.buyer, template, "post", args.postTokens, args.deliver);
    attempts.push(postAttempt);
    if (postAttempt.outcome === "accepted") {
      // Release remaining bidder reservations.
      for (const other of bidders) {
        if (other.buyer.buyerId !== bidder.buyer.buyerId) {
          args.ledger.release(other.buyer.buyerId, other.buyer.priceCents);
        }
      }
      args.ledger.release(bidder.buyer.buyerId, bidder.buyer.priceCents);
      return {
        status: "sold",
        buyerId: bidder.buyer.buyerId,
        buyerName: bidder.buyer.name,
        salePriceCents: bidder.attempt.bidCents ?? bidder.buyer.priceCents,
        bidCents: bidder.attempt.bidCents ?? undefined,
        paymentTermsDays: bidder.buyer.paymentTermsDays,
        attempts,
        capBlocked: args.capBlocked,
      };
    }
    args.ledger.release(bidder.buyer.buyerId, bidder.buyer.priceCents);
  }

  return {
    status: args.eligible.length === 0 ? "unmatched" : "unsold",
    attempts,
    capBlocked: args.capBlocked,
  };
}

import { describe, expect, it } from "vitest";
import { toE164, normalizeDate, toStateCode, normalizeEmail } from "@/lib/transforms";
import { validateAndTransform } from "@/domain/routing/validate";
import { evaluateFilters, scheduleIsLive } from "@/domain/routing/rules";
import { findDuplicate } from "@/domain/routing/dedupe";
import { CapLedger, checkCaps, type CapUsage } from "@/domain/routing/caps";
import { orderByPriority, orderByWeight, orderRoundRobin } from "@/domain/routing/ordering";
import { renderTemplate, evaluateMatcher, extractPriceCents, extractPath } from "@/domain/routing/template";
import {
  routeDirectPost,
  routePingPost,
  selectEligibleBuyers,
  type HttpDeliver,
  type RoutableBuyer,
} from "@/domain/routing/pipeline";
import type { FieldDef, InboundFilters } from "@/db/schema";

const ctx = { now: new Date("2026-06-15T18:00:00Z"), timezone: "America/New_York" };

describe("transforms", () => {
  it("normalizes US phones to E.164", () => {
    expect(toE164("(555) 123-4567")).toBe("+15551234567");
    expect(toE164("555-123-4567")).toBe("+15551234567");
    expect(toE164("15551234567")).toBe("+15551234567");
    expect(toE164("+15551234567")).toBe("+15551234567");
    expect(toE164("12345")).toBeNull();
  });

  it("normalizes dates from mm/dd/yyyy and ISO", () => {
    expect(normalizeDate("06/03/2026")).toBe("2026-06-03");
    expect(normalizeDate("6/3/2026")).toBe("2026-06-03");
    expect(normalizeDate("2026-06-03")).toBe("2026-06-03");
    expect(normalizeDate("2026-06-03T10:00:00Z")).toBe("2026-06-03");
    expect(normalizeDate("13/40/2026")).toBeNull();
  });

  it("maps state names and codes", () => {
    expect(toStateCode("texas")).toBe("TX");
    expect(toStateCode("TX")).toBe("TX");
    expect(toStateCode("tx")).toBe("TX");
    expect(toStateCode("Narnia")).toBeNull();
  });

  it("validates emails", () => {
    expect(normalizeEmail(" Jane@Example.COM ")).toBe("jane@example.com");
    expect(normalizeEmail("nope")).toBeNull();
  });
});

describe("field mapping validation", () => {
  const mapping: FieldDef[] = [
    { key: "first_name", label: "First Name", type: "text", required: true, transforms: ["trim"] },
    { key: "phone", label: "Phone", type: "phone", required: true },
    { key: "email", label: "Email", type: "email", required: false },
    { key: "incident_date", label: "Incident Date", type: "date", required: true },
    { key: "incident_state", label: "State", type: "state", required: true },
    { key: "at_fault", label: "At Fault", type: "boolean", required: false },
  ];

  it("accepts a valid payload and normalizes", () => {
    const result = validateAndTransform(mapping, {
      first_name: "  Maria ",
      phone: "(305) 555-0142",
      email: "MARIA@x.com",
      incident_date: "05/20/2026",
      incident_state: "florida",
      at_fault: "no",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values.first_name).toBe("Maria");
      expect(result.values.phone).toBe("+13055550142");
      expect(result.normalizedPhone).toBe("+13055550142");
      expect(result.normalizedEmail).toBe("maria@x.com");
      expect(result.values.incident_date).toBe("2026-05-20");
      expect(result.state).toBe("FL");
      expect(result.values.at_fault).toBe(false);
    }
  });

  it("collects field errors on invalid payloads", () => {
    const result = validateAndTransform(mapping, { phone: "abc", incident_date: "not-a-date" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain("first_name");
      expect(fields).toContain("phone");
      expect(fields).toContain("incident_date");
      expect(fields).toContain("incident_state");
    }
  });
});

describe("inbound filters", () => {
  const filters: InboundFilters = {
    logic: "and",
    groups: [
      {
        id: "g1",
        name: "CO Suppression - MVA",
        logic: "and",
        rules: [{ field: "incident_state", operator: "not_equals", value: "CO" }],
      },
      {
        id: "g2",
        logic: "or",
        rules: [
          { field: "attorney_status", operator: "equals", value: "none" },
          { field: "currently_represented", operator: "equals", value: "false" },
        ],
      },
    ],
  };

  it("passes when all groups pass", () => {
    const r = evaluateFilters(filters, { incident_state: "TX", attorney_status: "none" }, ctx);
    expect(r.pass).toBe(true);
  });

  it("rejects with the failing rule recorded", () => {
    const r = evaluateFilters(filters, { incident_state: "CO", attorney_status: "none" }, ctx);
    expect(r.pass).toBe(false);
    expect(r.failing?.group).toBe("CO Suppression - MVA");
    expect(r.failing?.rule.field).toBe("incident_state");
  });

  it("supports numeric and regex operators", () => {
    const f: InboundFilters = {
      logic: "and",
      groups: [
        {
          id: "g",
          logic: "and",
          rules: [
            { field: "age", operator: "gte", value: 18 },
            { field: "zip", operator: "regex", value: "^331" },
            { field: "injury_type", operator: "in", value: ["whiplash", "fracture"] },
            { field: "email", operator: "exists" },
          ],
        },
      ],
    };
    expect(evaluateFilters(f, { age: 44, zip: "33101", injury_type: "Fracture", email: "a@b.co" }, ctx).pass).toBe(true);
    expect(evaluateFilters(f, { age: 16, zip: "33101", injury_type: "fracture", email: "a@b.co" }, ctx).pass).toBe(false);
  });

  it("only applies scheduled groups while live", () => {
    // 18:00 UTC = 14:00 New York in June (EDT). Monday 2026-06-15.
    const scheduled: InboundFilters = {
      logic: "and",
      groups: [
        {
          id: "biz",
          logic: "and",
          rules: [{ field: "always_fail", operator: "exists" }],
          schedule: { days: [1, 2, 3, 4, 5], start_hour: 9, end_hour: 17 },
        },
      ],
    };
    // Live window: rule applies and fails.
    expect(evaluateFilters(scheduled, {}, ctx).pass).toBe(false);
    // Outside window (3am NY): group is dormant, lead passes.
    const nightCtx = { now: new Date("2026-06-15T07:00:00Z"), timezone: "America/New_York" };
    expect(evaluateFilters(scheduled, {}, nightCtx).pass).toBe(true);
  });

  it("handles overnight schedules", () => {
    expect(scheduleIsLive({ days: [1], start_hour: 22, end_hour: 6 }, { now: new Date("2026-06-16T03:00:00Z"), timezone: "America/New_York" })).toBe(true); // 23:00 Mon NY
  });
});

describe("dedupe", () => {
  const now = new Date("2026-06-15T00:00:00Z");
  const candidates = [
    { id: "a", normalizedPhone: "+15551234567", normalizedEmail: null, receivedAt: new Date("2026-06-10T00:00:00Z") },
    { id: "b", normalizedPhone: null, normalizedEmail: "x@y.com", receivedAt: new Date("2026-04-01T00:00:00Z") },
  ];

  it("matches phone within window", () => {
    expect(findDuplicate(candidates, { normalizedPhone: "+15551234567", normalizedEmail: null, now, windowDays: 30 })?.id).toBe("a");
  });

  it("ignores matches outside the window", () => {
    expect(findDuplicate(candidates, { normalizedPhone: null, normalizedEmail: "x@y.com", now, windowDays: 30 })).toBeNull();
    expect(findDuplicate(candidates, { normalizedPhone: null, normalizedEmail: "x@y.com", now, windowDays: 120 })?.id).toBe("b");
  });

  it("never matches null on null", () => {
    const cands = [{ id: "c", normalizedPhone: null, normalizedEmail: null, receivedAt: now }];
    expect(findDuplicate(cands, { normalizedPhone: null, normalizedEmail: null, now, windowDays: 30 })).toBeNull();
  });
});

describe("caps", () => {
  const usage: CapUsage = {
    leads: { daily: 9, weekly: 20, monthly: 50, total: 100 },
    budget_cents: { daily: 90000, weekly: 200000, monthly: 500000, total: 900000 },
  };

  it("blocks when a window is exhausted", () => {
    expect(checkCaps({ leads: { daily: 9 } }, usage, 9500)).toEqual({ available: false, blockedBy: "leads.daily" });
    expect(checkCaps({ leads: { daily: 10 } }, usage, 9500)).toEqual({ available: true });
    expect(checkCaps({ budget_cents: { daily: 95000 } }, usage, 9500)).toEqual({
      available: false,
      blockedBy: "budget_cents.daily",
    });
  });

  it("reserves atomically under concurrent requests", () => {
    const ledger = new CapLedger();
    const caps = { leads: { daily: 10 } };
    const persisted: CapUsage = {
      leads: { daily: 8, weekly: 8, monthly: 8, total: 8 },
      budget_cents: { daily: 0, weekly: 0, monthly: 0, total: 0 },
    };
    // 5 concurrent leads race for 2 remaining slots.
    const results = Array.from({ length: 5 }, () => ledger.tryReserve("b1", caps, persisted, 9500));
    expect(results.filter((r) => r.available).length).toBe(2);
    expect(results.filter((r) => !r.available).length).toBe(3);
    // Releasing frees a slot.
    ledger.release("b1", 9500);
    expect(ledger.tryReserve("b1", caps, persisted, 9500).available).toBe(true);
  });
});

describe("ordering", () => {
  const buyers = [
    { buyerId: "a", priority: 2, weight: 1 },
    { buyerId: "b", priority: 1, weight: 3 },
    { buyerId: "c", priority: 3, weight: 6 },
  ];

  it("orders by priority ascending", () => {
    expect(orderByPriority(buyers).map((b) => b.buyerId)).toEqual(["b", "a", "c"]);
  });

  it("orders weighted with an injected rng", () => {
    // rng=0 always picks the first cumulative bucket (buyer a with weight 1 first in array order).
    const first = orderByWeight(buyers, () => 0);
    expect(first.map((b) => b.buyerId)).toEqual(["a", "b", "c"]);
    // rng near 1 picks the last bucket each round.
    const last = orderByWeight(buyers, () => 0.999999);
    expect(last.map((b) => b.buyerId)).toEqual(["c", "b", "a"]);
  });

  it("round robin rotates from the cursor", () => {
    expect(orderRoundRobin(buyers, null).map((b) => b.buyerId)).toEqual(["b", "a", "c"]);
    expect(orderRoundRobin(buyers, "b").map((b) => b.buyerId)).toEqual(["a", "c", "b"]);
    expect(orderRoundRobin(buyers, "c").map((b) => b.buyerId)).toEqual(["b", "a", "c"]);
  });
});

describe("templates and matchers", () => {
  it("renders {{tokens}} including dotted paths", () => {
    const out = renderTemplate('{"name":"{{first_name}} {{last_name}}","id":"{{lead.id}}","missing":"{{nope}}"}', {
      first_name: "Ana",
      last_name: "Reyes",
      lead: { id: "ld_1" },
    });
    expect(JSON.parse(out)).toEqual({ name: "Ana Reyes", id: "ld_1", missing: "" });
  });

  it("extracts dotted and indexed paths", () => {
    expect(extractPath({ a: { b: [{ c: 5 }] } }, "$.a.b[0].c")).toBe(5);
    expect(extractPath({ a: 1 }, "missing.path")).toBeUndefined();
  });

  it("evaluates jsonpath and regex matchers", () => {
    expect(
      evaluateMatcher({ kind: "jsonpath", expr: "status", expected: "accepted" }, '{"status":"accepted"}', { status: "accepted" })
    ).toBe(true);
    expect(
      evaluateMatcher({ kind: "jsonpath", expr: "accepted" }, '{"accepted":true}', { accepted: true })
    ).toBe(true);
    expect(evaluateMatcher({ kind: "regex", expr: "SUCCESS" }, "status=SUCCESS;id=9", null)).toBe(true);
    expect(evaluateMatcher({ kind: "regex", expr: "SUCCESS" }, "status=FAIL", null)).toBe(false);
  });

  it("extracts prices as dollars to cents", () => {
    expect(extractPriceCents({ price: 95 }, "price")).toBe(9500);
    expect(extractPriceCents({ bid: { amount: 82.5 } }, "bid.amount")).toBe(8250);
    expect(extractPriceCents({}, "price")).toBeNull();
  });
});

function makeBuyer(id: string, overrides: Partial<RoutableBuyer> = {}): RoutableBuyer {
  return {
    buyerId: id,
    name: `Buyer ${id}`,
    priority: 1,
    weight: 1,
    deliveryConfig: {
      method: "http_post",
      url: `https://buyer-${id}.test/post`,
      content_type: "json",
      body_template: '{"lead":"{{lead_id}}"}',
      ping_template: '{"ping":"{{lead_id}}"}',
      post_template: '{"post":"{{lead_id}}"}',
      success_matcher: { kind: "jsonpath", expr: "status", expected: "accepted" },
      price_path: "price",
      timeout_ms: 500,
    },
    caps: {},
    filters: null,
    schedule: null,
    priceCents: 9500,
    paymentTermsDays: 30,
    ...overrides,
  };
}

function respondWith(map: Record<string, { status: string; price?: number }>): HttpDeliver {
  return async ({ url }) => {
    const id = url.match(/buyer-(\w+)\.test/)?.[1] ?? "";
    const body = JSON.stringify(map[id] ?? { status: "rejected" });
    return { ok: true, status: 200, body, parsed: JSON.parse(body), durationMs: 42, timedOut: false };
  };
}

describe("direct post routing", () => {
  it("first accept wins in priority order and extracts price", async () => {
    const ledger = new CapLedger();
    const buyers = [makeBuyer("a", { priority: 1 }), makeBuyer("b", { priority: 2 })];
    const { eligible } = selectEligibleBuyers({
      buyers, leadData: {}, ctx, usage: new Map(), ledger,
    });
    const outcome = await routeDirectPost({
      ordered: eligible,
      tokens: { lead_id: "ld_1" },
      deliver: respondWith({ a: { status: "rejected" }, b: { status: "accepted", price: 110 } }),
      ledger,
      capBlocked: [],
    });
    expect(outcome.status).toBe("sold");
    expect(outcome.buyerId).toBe("b");
    expect(outcome.salePriceCents).toBe(11000);
    expect(outcome.attempts.length).toBe(2);
    expect(outcome.attempts[0].outcome).toBe("rejected");
  });

  it("returns unsold when everyone rejects and unmatched with no eligible buyers", async () => {
    const ledger = new CapLedger();
    const buyers = [makeBuyer("a")];
    const { eligible } = selectEligibleBuyers({ buyers, leadData: {}, ctx, usage: new Map(), ledger });
    const unsold = await routeDirectPost({
      ordered: eligible,
      tokens: {},
      deliver: respondWith({ a: { status: "rejected" } }),
      ledger,
      capBlocked: [],
    });
    expect(unsold.status).toBe("unsold");

    const unmatched = await routeDirectPost({ ordered: [], tokens: {}, deliver: respondWith({}), ledger, capBlocked: [] });
    expect(unmatched.status).toBe("unmatched");
  });

  it("excludes buyers whose filters fail or caps are exhausted", () => {
    const ledger = new CapLedger();
    const buyers = [
      makeBuyer("filtered", {
        filters: { logic: "and", groups: [{ id: "g", logic: "and", rules: [{ field: "state", operator: "equals", value: "TX" }] }] },
      }),
      makeBuyer("capped", { caps: { leads: { daily: 0 } } }),
      makeBuyer("open"),
    ];
    const result = selectEligibleBuyers({ buyers, leadData: { state: "FL" }, ctx, usage: new Map(), ledger });
    expect(result.eligible.map((b) => b.buyerId)).toEqual(["open"]);
    expect(result.capBlocked[0]).toMatchObject({ buyerId: "capped", blockedBy: "leads.daily" });
    expect(result.filteredOut[0].buyerId).toBe("filtered");
  });
});

describe("ping post routing", () => {
  it("highest bid wins, tie broken by priority", async () => {
    const ledger = new CapLedger();
    const buyers = [
      makeBuyer("low", { priority: 1 }),
      makeBuyer("high", { priority: 2 }),
      makeBuyer("tie", { priority: 3 }),
    ];
    const { eligible } = selectEligibleBuyers({ buyers, leadData: {}, ctx, usage: new Map(), ledger });
    const outcome = await routePingPost({
      eligible,
      pingTokens: { lead_id: "ld_2" },
      postTokens: { lead_id: "ld_2" },
      deliver: respondWith({
        low: { status: "accepted", price: 60 },
        high: { status: "accepted", price: 120 },
        tie: { status: "accepted", price: 120 },
      }),
      ledger,
      capBlocked: [],
    });
    expect(outcome.status).toBe("sold");
    expect(outcome.buyerId).toBe("high"); // 120 tie, priority 2 beats 3
    expect(outcome.bidCents).toBe(12000);
  });

  it("falls through to the next bidder when the post is rejected", async () => {
    const ledger = new CapLedger();
    const buyers = [makeBuyer("flaky", { priority: 1 }), makeBuyer("solid", { priority: 2 })];
    const { eligible } = selectEligibleBuyers({ buyers, leadData: {}, ctx, usage: new Map(), ledger });
    let flakyPosts = 0;
    const deliver: HttpDeliver = async ({ url, body }) => {
      const isPing = body.includes("ping");
      const id = url.match(/buyer-(\w+)\.test/)?.[1] ?? "";
      if (isPing) {
        const price = id === "flaky" ? 150 : 90;
        const respBody = JSON.stringify({ status: "accepted", price });
        return { ok: true, status: 200, body: respBody, parsed: JSON.parse(respBody), durationMs: 30, timedOut: false };
      }
      if (id === "flaky") {
        flakyPosts++;
        const respBody = JSON.stringify({ status: "rejected", reason: "cap hit upstream" });
        return { ok: true, status: 200, body: respBody, parsed: JSON.parse(respBody), durationMs: 25, timedOut: false };
      }
      const respBody = JSON.stringify({ status: "accepted", price: 90 });
      return { ok: true, status: 200, body: respBody, parsed: JSON.parse(respBody), durationMs: 25, timedOut: false };
    };
    const outcome = await routePingPost({ eligible, pingTokens: { lead_id: "x" }, postTokens: { lead_id: "x" }, deliver, ledger, capBlocked: [] });
    expect(flakyPosts).toBe(1);
    expect(outcome.status).toBe("sold");
    expect(outcome.buyerId).toBe("solid");
    expect(outcome.salePriceCents).toBe(9000);
  });

  it("goes unsold when all bidders reject the post", async () => {
    const ledger = new CapLedger();
    const buyers = [makeBuyer("a")];
    const { eligible } = selectEligibleBuyers({ buyers, leadData: {}, ctx, usage: new Map(), ledger });
    const deliver: HttpDeliver = async ({ body }) => {
      const isPing = body.includes("ping");
      const respBody = isPing
        ? JSON.stringify({ status: "accepted", price: 70 })
        : JSON.stringify({ status: "rejected" });
      return { ok: true, status: 200, body: respBody, parsed: JSON.parse(respBody), durationMs: 20, timedOut: false };
    };
    const outcome = await routePingPost({ eligible, pingTokens: {}, postTokens: {}, deliver, ledger, capBlocked: [] });
    expect(outcome.status).toBe("unsold");
  });
});

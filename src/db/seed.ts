import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { sha256Hex } from "@/lib/hash";
import { addDays, toDateKey, startOfMonthKey, endOfMonthKey } from "@/lib/transforms";
import { buildCapiPayload } from "@/server/capi";
import { rebuildPeriods } from "@/server/matching";
import { runInsightGeneration } from "@/server/insights";
import { fireAutomations } from "@/server/automations";
import { seedDefaultReportPages, entityPageTemplate } from "@/server/report-pages";
import { connectDemoIntegration } from "@/server/integrations";
import { eq } from "drizzle-orm";
import type { LeadEventKind, LeadStatus } from "@/db/schema";

// Deterministic demo seed. This is a story, not noise: every profit-truth
// state exists on first boot, engineered to exact dollar amounts.
//   AG1 Walker: $4,200 overdue (unpaid month A), June short-paid $1,450
//   AG2 Quintessa: fully paid, the clean green reference
//   Overflow Network: booked revenue, zero payment source, At-Risk
//   Depo-Provera: paid spend + booked revenue + zero verified = False Profit
//   Mercury covers ~85% of Meta spend, LeadFlow accrued $6,300 / paid $4,900
//   One 82-confidence suggestion waits in the Match Queue ($4,200 wire)

const DEMO_SUPPLIER_KEY_LEADFLOW = "df_sup_leadflow_demo_4f8a2c91d7";
const DEMO_SUPPLIER_KEY_META = "df_sup_internalmeta_demo_1b7d9e3f52";
const DEMO_ORG_API_KEY = "df_live_legenex_demo_9c31b7e2a8";
const PASSWORD = "dashflo2026";

const MOCK = `http://localhost:${process.env.MOCKBUYER_PORT || 4010}`;

interface SeedClock {
  today: Date;
  todayKey: string;
  monthAStart: string; // month before last, clipped to the 60 day window
  monthAEnd: string;
  monthBStart: string; // last full month
  monthBEnd: string;
  windowStart: Date;
}

function makeClock(): SeedClock {
  const today = new Date();
  const todayKey = toDateKey(today);
  const monthBEndDate = new Date(`${todayKey.slice(0, 7)}-01T00:00:00Z`);
  const monthBStart = startOfMonthKey(toDateKey(addDays(monthBEndDate, -1)));
  const monthBEnd = endOfMonthKey(monthBStart);
  const monthAStart = startOfMonthKey(toDateKey(addDays(new Date(`${monthBStart}T00:00:00Z`), -1)));
  const monthAEnd = endOfMonthKey(monthAStart);
  return {
    today,
    todayKey,
    monthAStart,
    monthAEnd,
    monthBStart,
    monthBEnd,
    windowStart: addDays(today, -60),
  };
}

// Weekday-weighted date inside [from, to] (date keys).
function weekdayDate(fromKey: string, toKey: string): string {
  const from = new Date(`${fromKey}T00:00:00Z`);
  const to = new Date(`${toKey}T00:00:00Z`);
  const span = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
  for (let i = 0; i < 20; i++) {
    const d = addDays(from, faker.number.int({ min: 0, max: span }));
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) {
      if (faker.number.float() > 0.35) continue; // thin weekends
    }
    return toDateKey(d);
  }
  return toDateKey(from);
}

function atTime(dateKey: string, hour: number, minute: number): Date {
  return new Date(`${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
}

function bizTime(dateKey: string): Date {
  return atTime(dateKey, faker.number.int({ min: 13, max: 23 }), faker.number.int({ min: 0, max: 59 }));
}

const STATES = ["TX", "FL", "GA", "CA", "AZ", "NC", "OH", "PA", "MI", "TN", "IL", "MO", "AL", "SC"];
const INJURIES = ["whiplash", "back injury", "fracture", "concussion", "soft tissue", "spinal injury"];

interface GenLead {
  id: string;
  campaignId: string;
  supplierId: string;
  buyerId: string | null;
  status: LeadStatus;
  fieldData: Record<string, unknown>;
  normalizedPhone: string;
  normalizedEmail: string;
  state: string;
  adMeta: Record<string, string> | null;
  salePriceCents: number | null;
  supplierCostCents: number | null;
  paidAllocatedCents: number;
  supplierPaidCents: number;
  receivedAt: Date;
  soldAt: Date | null;
  returnedAt: Date | null;
  paymentDueDate: Date | null;
  reconciliationStatus: "unreconciled" | "matched" | "partial" | "disputed";
  matchedPaymentIds: string[];
  errorMessage: string | null;
  failingRule: { group: string; rule: { field: string; operator: "equals" | "not_equals"; value?: string | number | boolean } } | null;
}

export async function seed(): Promise<void> {
  faker.seed(42);
  const db = await getDb();
  const clock = makeClock();

  console.log("[seed] wiping existing data...");
  const tables = [
    schema.reportPages, schema.integrationAssets, schema.aiProviders,
    schema.auditLogs, schema.capiEvents, schema.notifications, schema.automationRuns, schema.automations,
    schema.webhookDeliveries, schema.webhookSubscriptions, schema.apiKeys, schema.aiChatThreads,
    schema.aiInsights, schema.actionItems, schema.matchRules, schema.reconciliationPeriods,
    schema.paymentRecords, schema.invoices, schema.costEntries, schema.spendMappingRules,
    schema.adSpendRecords, schema.adAccounts, schema.distributionAttempts, schema.leadEvents,
    schema.leads, schema.routingCursors, schema.campaignBuyers, schema.buyers, schema.suppliers,
    schema.campaigns, schema.connectorStatuses, schema.savedReports, schema.memberships,
    schema.users, schema.organizations,
  ];
  for (const table of tables) await db.delete(table);

  // ---- Organizations ----
  const legenexId = "org_legenex";
  const demoId = "org_demoagency";
  await db.insert(schema.organizations).values([
    {
      id: legenexId, name: "Legenex", slug: "legenex", timezone: "America/New_York", currency: "USD",
      planTier: "growth",
      planLimits: { leads_per_month: 15000, users: 10, ad_accounts: 6, ai_messages: 2000 },
      whiteLabel: { sender_name: "Legenex Ops" }, varianceThresholdPct: 2, varianceThresholdCents: 25000,
      status: "active", createdAt: addDays(clock.today, -220),
    },
    {
      id: demoId, name: "DemoAgency", slug: "demoagency", timezone: "America/Chicago", currency: "USD",
      planTier: "starter",
      planLimits: { leads_per_month: 2000, users: 3, ad_accounts: 2, ai_messages: 200 },
      whiteLabel: {}, varianceThresholdPct: 2, varianceThresholdCents: 25000,
      status: "active", createdAt: addDays(clock.today, -12),
    },
  ]);

  // ---- Users ----
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const users = [
    { id: "usr_nick", email: "nick@legenex.com", name: "Nick Allen", isPlatformAdmin: true },
    { id: "usr_analyst", email: "analyst@legenex.com", name: "Ava Chen", isPlatformAdmin: false },
    { id: "usr_finance", email: "finance@legenex.com", name: "Marcus Webb", isPlatformAdmin: false },
    { id: "usr_partner", email: "partner.ag1@legenex.com", name: "Dana Walker", isPlatformAdmin: false },
    { id: "usr_demo", email: "demo@demoagency.com", name: "Demo Owner", isPlatformAdmin: false },
  ];
  await db.insert(schema.users).values(
    users.map((u) => ({ ...u, passwordHash: hash, createdAt: addDays(clock.today, -200) }))
  );
  await db.insert(schema.memberships).values([
    { id: newId("mem"), userId: "usr_nick", organizationId: legenexId, role: "owner", createdAt: clock.today },
    { id: newId("mem"), userId: "usr_analyst", organizationId: legenexId, role: "analyst", createdAt: clock.today },
    { id: newId("mem"), userId: "usr_finance", organizationId: legenexId, role: "finance", createdAt: clock.today },
    { id: newId("mem"), userId: "usr_partner", organizationId: legenexId, role: "partner", partnerScope: { buyer_id: "buy_ag1" }, createdAt: clock.today },
    { id: newId("mem"), userId: "usr_demo", organizationId: demoId, role: "owner", createdAt: clock.today },
  ]);

  // ---- Connectors ----
  const connector = (provider: string, status: "active" | "inactive", coverage: number, notes: string, syncMinsAgo = 30) => ({
    id: newId("con"), organizationId: legenexId,
    provider: provider as "stripe", status,
    lastSyncAt: status === "active" ? new Date(clock.today.getTime() - syncMinsAgo * 60000) : null,
    coveragePct: coverage, notes, config: {},
  });
  await db.insert(schema.connectorStatuses).values([
    connector("lead_ingestion", "active", 100, "Supplier POST endpoints live", 2),
    connector("buyer_feedback", "active", 90, "Dispositions via delivery responses", 45),
    connector("stripe", "active", 92, "Buyer remittances via Stripe payouts", 18),
    connector("mercury", "active", 88, "Operating account transaction feed", 25),
    connector("xero", "active", 80, "Invoices and bills synced nightly", 400),
    connector("meta_ads", "active", 95, "2 ad accounts, ad-level spend", 55),
    connector("google_ads", "inactive", 0, "Not connected: Google spend shows Needs Source"),
    connector("tiktok_ads", "inactive", 0, "Not connected"),
    connector("supplier_statements", "inactive", 0, "Upload statements to verify supplier costs"),
    connector("slack", "active", 100, "Alerts post to #revenue-ops", 5),
  ]);
  // DemoAgency gets bare connectors.
  await db.insert(schema.connectorStatuses).values([
    { id: newId("con"), organizationId: demoId, provider: "lead_ingestion", status: "active", lastSyncAt: clock.today, coveragePct: 100, notes: "", config: {} },
    { id: newId("con"), organizationId: demoId, provider: "stripe", status: "inactive", lastSyncAt: null, coveragePct: 0, notes: "", config: {} },
    { id: newId("con"), organizationId: demoId, provider: "mercury", status: "inactive", lastSyncAt: null, coveragePct: 0, notes: "", config: {} },
  ]);

  // ---- Suppliers ----
  await db.insert(schema.suppliers).values([
    {
      id: "sup_leadflow", organizationId: legenexId, name: "LeadFlow", contactEmail: "partners@leadflow.example",
      status: "active", apiKeyPrefix: DEMO_SUPPLIER_KEY_LEADFLOW.slice(7, 15), apiKeyHash: sha256Hex(DEMO_SUPPLIER_KEY_LEADFLOW),
      pricingModel: "fixed_cpl", fixedPriceCents: 3500, revSharePct: null,
      allowedCampaignIds: ["cmp_mva_ping", "cmp_mva_direct"], portalAccess: true, testMode: false,
      paymentTermsDays: 15, notes: "Primary MVA vendor, net-15 payouts", createdAt: addDays(clock.today, -180),
    },
    {
      id: "sup_meta", organizationId: legenexId, name: "Internal Meta", contactEmail: "ops@legenex.com",
      status: "active", apiKeyPrefix: DEMO_SUPPLIER_KEY_META.slice(7, 15), apiKeyHash: sha256Hex(DEMO_SUPPLIER_KEY_META),
      pricingModel: "none", fixedPriceCents: null, revSharePct: null,
      allowedCampaignIds: [], portalAccess: false, testMode: false,
      paymentTermsDays: 30, notes: "Self-generated Meta traffic, no per-lead cost", createdAt: addDays(clock.today, -180),
    },
  ]);

  // ---- Buyers ----
  const successMatcher = { kind: "jsonpath" as const, expr: "status", expected: "accepted" };
  await db.insert(schema.buyers).values([
    {
      id: "buy_ag1", organizationId: legenexId, name: "AG1 Walker", contactEmail: "intake@walkerfirm.example",
      status: "active",
      deliveryConfig: {
        method: "http_post", url: `${MOCK}/accept?price=95`, content_type: "json",
        body_template: '{"first_name":"{{first_name}}","last_name":"{{last_name}}","phone":"{{phone}}","email":"{{email}}","state":"{{incident_state}}","incident_date":"{{incident_date}}","injury":"{{injury_type}}","lead_id":"{{lead_id}}"}',
        ping_template: '{"state":"{{incident_state}}","injury":"{{injury_type}}","incident_date":"{{incident_date}}","lead_id":"{{lead_id}}"}',
        post_template: '{"first_name":"{{first_name}}","last_name":"{{last_name}}","phone":"{{phone}}","email":"{{email}}","state":"{{incident_state}}","lead_id":"{{lead_id}}"}',
        success_matcher: successMatcher, price_path: "price", timeout_ms: 8000, retries: 1, backoff_ms: 400,
      },
      caps: { leads: { daily: 8, monthly: 160 } }, filters: null, schedule: null,
      priceDefaultCents: 9500, priority: 1, weight: 5, paymentTermsDays: 30, portalAccess: true,
      notes: "Highest priority MVA buyer. Watch the receivables.", createdAt: addDays(clock.today, -170),
    },
    {
      id: "buy_ag2", organizationId: legenexId, name: "AG2 Quintessa", contactEmail: "leads@quintessalegal.example",
      status: "active",
      deliveryConfig: {
        method: "http_post", url: `${MOCK}/accept?price=110`, content_type: "json",
        body_template: '{"contact":{"first":"{{first_name}}","last":"{{last_name}}","phone":"{{phone}}","email":"{{email}}"},"case":{"state":"{{incident_state}}","date":"{{incident_date}}","type":"{{injury_type}}"},"ref":"{{lead_id}}"}',
        ping_template: '{"case":{"state":"{{incident_state}}","date":"{{incident_date}}","type":"{{injury_type}}"},"ref":"{{lead_id}}"}',
        post_template: '{"contact":{"first":"{{first_name}}","last":"{{last_name}}","phone":"{{phone}}","email":"{{email}}"},"ref":"{{lead_id}}"}',
        success_matcher: successMatcher, price_path: "price", timeout_ms: 8000, retries: 1, backoff_ms: 400,
      },
      caps: { leads: { daily: 10 } }, filters: null, schedule: null,
      priceDefaultCents: 11000, priority: 2, weight: 3, paymentTermsDays: 15, portalAccess: false,
      notes: "Pays weekly, cleanest counterparty on the book.", createdAt: addDays(clock.today, -160),
    },
    {
      id: "buy_overflow", organizationId: legenexId, name: "Overflow Network", contactEmail: "buyers@overflownet.example",
      status: "active",
      deliveryConfig: {
        method: "http_post", url: `${MOCK}/accept?price=60`, content_type: "json",
        body_template: '{"name":"{{first_name}} {{last_name}}","phone":"{{phone}}","state":"{{incident_state}}","id":"{{lead_id}}"}',
        ping_template: '{"state":"{{incident_state}}","id":"{{lead_id}}"}',
        post_template: '{"name":"{{first_name}} {{last_name}}","phone":"{{phone}}","id":"{{lead_id}}"}',
        success_matcher: successMatcher, price_path: "price", timeout_ms: 8000, retries: 0, backoff_ms: 0,
      },
      caps: { leads: { daily: 3, monthly: 40 }, budget_cents: { monthly: 1200000 } }, filters: null, schedule: null,
      priceDefaultCents: 6000, priority: 3, weight: 1, paymentTermsDays: 30, portalAccess: false,
      notes: "Backstop demand. No payment feed covers them yet.", createdAt: addDays(clock.today, -120),
    },
  ]);

  // ---- Campaigns ----
  const mvaFields = [
    { key: "first_name", label: "First Name", type: "text" as const, required: true, transforms: ["trim" as const] },
    { key: "last_name", label: "Last Name", type: "text" as const, required: true, transforms: ["trim" as const] },
    { key: "phone", label: "Phone", type: "phone" as const, required: true },
    { key: "email", label: "Email", type: "email" as const, required: false },
    { key: "incident_date", label: "Incident Date", type: "date" as const, required: true },
    { key: "incident_state", label: "Incident State", type: "state" as const, required: true },
    { key: "at_fault", label: "At Fault", type: "boolean" as const, required: true },
    { key: "attorney_status", label: "Attorney Status", type: "select" as const, required: true, options: ["none", "consulted", "retained"] },
    { key: "injury_type", label: "Injury Type", type: "select" as const, required: true, options: INJURIES },
    { key: "currently_represented", label: "Currently Represented", type: "boolean" as const, required: true },
    { key: "description", label: "Description", type: "text" as const, required: false },
    { key: "zip", label: "Zip", type: "zip" as const, required: false },
    { key: "trusted_form_url", label: "TrustedForm URL", type: "text" as const, required: false },
    { key: "jornaya_id", label: "Jornaya ID", type: "text" as const, required: false },
  ];
  const coSuppression = {
    logic: "and" as const,
    groups: [
      {
        id: "co-suppression", name: "CO Suppression - MVA", logic: "and" as const,
        rules: [{ field: "incident_state", operator: "not_equals" as const, value: "CO" }],
      },
      {
        id: "not-represented", name: "Not already represented", logic: "and" as const,
        rules: [{ field: "currently_represented", operator: "not_equals" as const, value: "true" }],
      },
    ],
  };
  await db.insert(schema.campaigns).values([
    {
      id: "cmp_mva_ping", organizationId: legenexId, name: "MVA Ping Post", slug: "mva-ping-post",
      vertical: "mva", type: "ping_post", status: "active", distributionMethod: "priority",
      fieldMapping: mvaFields, inboundFilters: coSuppression, dedupeWindowDays: 30, testMode: false,
      paymentTermsDays: 30, description: "Motor vehicle accident leads sold to the highest bidder via ping post.",
      capiConfig: null, createdAt: addDays(clock.today, -150),
    },
    {
      id: "cmp_mva_direct", organizationId: legenexId, name: "MVA Direct", slug: "mva-direct",
      vertical: "mva", type: "direct_post", status: "active", distributionMethod: "priority",
      fieldMapping: mvaFields, inboundFilters: coSuppression, dedupeWindowDays: 30, testMode: false,
      paymentTermsDays: 30, description: "Direct-posted MVA leads in priority order.",
      capiConfig: { enabled: true, pixel_id: "884213550021734", events: { received: true, sold: true } },
      createdAt: addDays(clock.today, -150),
    },
    {
      id: "cmp_depo", organizationId: legenexId, name: "Mass Tort Depo-Provera", slug: "mass-tort-depo-provera",
      vertical: "mass_tort", type: "direct_post", status: "active", distributionMethod: "priority",
      fieldMapping: [
        ...mvaFields.filter((f) => !["incident_date", "at_fault"].includes(f.key)),
        { key: "usage_years", label: "Years of Use", type: "number" as const, required: true },
        { key: "diagnosis", label: "Diagnosis", type: "select" as const, required: true, options: ["meningioma", "other tumor", "none"] },
      ],
      inboundFilters: {
        logic: "and",
        groups: [{
          id: "qualified", name: "Qualified diagnosis", logic: "and",
          rules: [{ field: "diagnosis", operator: "not_equals", value: "none" }],
        }],
      },
      dedupeWindowDays: 60, testMode: false, paymentTermsDays: 30,
      description: "Depo-Provera meningioma claims. High value, watch verification closely.",
      capiConfig: { enabled: true, pixel_id: "884213550021735", events: { received: false, sold: true } },
      createdAt: addDays(clock.today, -90),
    },
  ]);
  await db.insert(schema.campaignBuyers).values([
    { id: newId("cb"), organizationId: legenexId, campaignId: "cmp_mva_ping", buyerId: "buy_ag1", priority: 1, weight: 5, priceOverrideCents: null, status: "active" },
    { id: newId("cb"), organizationId: legenexId, campaignId: "cmp_mva_ping", buyerId: "buy_ag2", priority: 2, weight: 3, priceOverrideCents: null, status: "active" },
    { id: newId("cb"), organizationId: legenexId, campaignId: "cmp_mva_ping", buyerId: "buy_overflow", priority: 3, weight: 1, priceOverrideCents: null, status: "active" },
    { id: newId("cb"), organizationId: legenexId, campaignId: "cmp_mva_direct", buyerId: "buy_ag1", priority: 1, weight: 5, priceOverrideCents: null, status: "active" },
    { id: newId("cb"), organizationId: legenexId, campaignId: "cmp_mva_direct", buyerId: "buy_ag2", priority: 2, weight: 3, priceOverrideCents: null, status: "active" },
    { id: newId("cb"), organizationId: legenexId, campaignId: "cmp_mva_direct", buyerId: "buy_overflow", priority: 3, weight: 1, priceOverrideCents: null, status: "active" },
    { id: newId("cb"), organizationId: legenexId, campaignId: "cmp_depo", buyerId: "buy_overflow", priority: 1, weight: 1, priceOverrideCents: 25000, status: "active" },
  ]);
  // DemoAgency: one draft campaign to prove isolation.
  await db.insert(schema.campaigns).values({
    id: "cmp_demo", organizationId: demoId, name: "Home Services Test", slug: "home-services-test",
    vertical: "home_services", type: "direct_post", status: "draft", distributionMethod: "priority",
    fieldMapping: mvaFields.slice(0, 4), inboundFilters: null, dedupeWindowDays: 30, testMode: true,
    paymentTermsDays: 30, description: "Draft campaign", capiConfig: null, createdAt: clock.today,
  });

  // ---- Ad accounts and spend ----
  console.log("[seed] generating ad spend...");
  await db.insert(schema.adAccounts).values([
    { id: "acc_meta1", organizationId: legenexId, platform: "meta", accountExtId: "act_1029384756", name: "Legenex Meta Main", status: "connected", config: {}, lastSyncAt: clock.today },
    { id: "acc_meta2", organizationId: legenexId, platform: "meta", accountExtId: "act_5647382910", name: "Legenex Meta Mass Tort", status: "connected", config: {}, lastSyncAt: clock.today },
    { id: "acc_google", organizationId: legenexId, platform: "google", accountExtId: "google-778-221-9034", name: "Legenex Google", status: "inactive", config: {}, lastSyncAt: null },
  ]);

  interface AdDef {
    account: string; campaignExt: string; campaignName: string; adsetExt: string; adsetName: string;
    adExt: string; adName: string; dailyCents: [number, number]; mapped: string | null;
    brand: "AAT" | "CMC" | "CAC" | "DontSettle" | null;
  }
  const ads: AdDef[] = [
    { account: "acc_meta1", campaignExt: "23851", campaignName: "AAT | MVA Auto Injury", adsetExt: "as-101", adsetName: "AAT Broad 25-65", adExt: "ad-aat-1", adName: "AAT-V1 Crash Video", dailyCents: [1800, 3600], mapped: "cmp_mva_direct", brand: "AAT" },
    { account: "acc_meta1", campaignExt: "23851", campaignName: "AAT | MVA Auto Injury", adsetExt: "as-101", adsetName: "AAT Broad 25-65", adExt: "ad-aat-2", adName: "AAT-V2 Testimonial", dailyCents: [1200, 2800], mapped: "cmp_mva_direct", brand: "AAT" },
    { account: "acc_meta1", campaignExt: "23851", campaignName: "AAT | MVA Auto Injury", adsetExt: "as-102", adsetName: "AAT Retargeting", adExt: "ad-aat-3", adName: "AAT-V3 Static Retarget", dailyCents: [400, 900], mapped: "cmp_mva_direct", brand: "AAT" },
    { account: "acc_meta1", campaignExt: "23907", campaignName: "CMC | MVA Broad", adsetExt: "as-201", adsetName: "CMC Lookalike 2%", adExt: "ad-cmc-1", adName: "CMC-V1 Were You Hit", dailyCents: [1500, 3200], mapped: "cmp_mva_ping", brand: "CMC" },
    { account: "acc_meta1", campaignExt: "23907", campaignName: "CMC | MVA Broad", adsetExt: "as-201", adsetName: "CMC Lookalike 2%", adExt: "ad-cmc-2", adName: "CMC-V2 Settlement Calc", dailyCents: [900, 2100], mapped: "cmp_mva_ping", brand: "CMC" },
    { account: "acc_meta2", campaignExt: "31240", campaignName: "CAC | Depo-Provera Claims", adsetExt: "as-301", adsetName: "CAC Women 35-60", adExt: "ad-cac-1", adName: "CAC-V1 Diagnosis Story", dailyCents: [2200, 4400], mapped: "cmp_depo", brand: "CAC" },
    { account: "acc_meta2", campaignExt: "31240", campaignName: "CAC | Depo-Provera Claims", adsetExt: "as-301", adsetName: "CAC Women 35-60", adExt: "ad-cac-2", adName: "CAC-V2 Legal Explainer", dailyCents: [1400, 3000], mapped: "cmp_depo", brand: "CAC" },
    { account: "acc_meta2", campaignExt: "31555", campaignName: "DS | DontSettle Prospecting", adsetExt: "as-401", adsetName: "DS Cold Test", adExt: "ad-ds-1", adName: "DS-V1 Brand Test", dailyCents: [200, 600], mapped: null, brand: null },
    { account: "acc_google", campaignExt: "g-8891", campaignName: "Google | MVA Search TX-FL", adsetExt: "ag-1", adsetName: "Exact Injury Terms", adExt: "gad-1", adName: "GS-V1 Search", dailyCents: [500, 1400], mapped: null, brand: null },
  ];

  // Mercury outflows to Meta (created first so spend rows can reference them).
  const metaOutflows: Array<typeof schema.paymentRecords.$inferInsert> = [];
  const metaOutflowIds: string[] = [];
  for (const monthStart of [clock.monthAStart, clock.monthBStart]) {
    for (const half of [0, 1]) {
      const id = newId("pay");
      metaOutflowIds.push(id);
      metaOutflows.push({
        id, organizationId: legenexId, source: "mercury", externalRef: `MRC-${monthStart.slice(0, 7)}-FB${half + 1}`,
        date: toDateKey(addDays(new Date(`${monthStart}T00:00:00Z`), half === 0 ? 14 : 27)),
        amountCents: 0, direction: "out", counterpartyName: "FACEBK *ADS",
        memo: `Meta Platforms Inc, campaign spend ${monthStart.slice(0, 7)}`,
        matchedEntity: { type: "ad_platform", id: "meta" },
        matchStatus: "auto_matched", confidence: 75, raw: {},
      });
    }
  }

  const spendRows: Array<typeof schema.adSpendRecords.$inferInsert> = [];
  let spendDay = clock.windowStart;
  let metaPaidTotal = 0;
  let metaTotal = 0;
  while (toDateKey(spendDay) < clock.todayKey) {
    const dateKey = toDateKey(spendDay);
    const dow = spendDay.getUTCDay();
    const weekendFactor = dow === 0 || dow === 6 ? 0.6 : 1;
    for (const ad of ads) {
      const spend = Math.round(faker.number.int({ min: ad.dailyCents[0], max: ad.dailyCents[1] }) * weekendFactor);
      const impressions = Math.round(spend * faker.number.float({ min: 0.8, max: 1.6 }));
      const clicks = Math.max(1, Math.round(impressions * faker.number.float({ min: 0.01, max: 0.04 })));
      const isMeta = ad.account !== "acc_google";
      // ~85% of Meta spend is covered by matched Mercury outflows.
      const paid = isMeta && faker.number.float() < 0.85;
      if (isMeta) {
        metaTotal += spend;
        if (paid) metaPaidTotal += spend;
      }
      spendRows.push({
        id: newId("sp"), organizationId: legenexId, adAccountId: ad.account, date: dateKey,
        campaignExtId: ad.campaignExt, campaignName: ad.campaignName,
        adsetExtId: ad.adsetExt, adsetName: ad.adsetName, adExtId: ad.adExt, adName: ad.adName,
        spendCents: spend, impressions, clicks,
        results: Math.round(clicks * faker.number.float({ min: 0.05, max: 0.25 })),
        mappedCampaignId: ad.mapped, mappedBrand: ad.brand,
        paidStatus: paid ? "paid_verified" : isMeta ? "tracked" : "tracked",
        matchedPaymentId: paid ? metaOutflowIds[faker.number.int({ min: 0, max: metaOutflowIds.length - 1 })] : null,
      });
    }
    spendDay = addDays(spendDay, 1);
  }
  // Set outflow amounts to the actual covered spend, split across the four transfers.
  const perOutflow = Math.floor(metaPaidTotal / metaOutflowIds.length);
  metaOutflows.forEach((o, i) => {
    o.amountCents = i === metaOutflows.length - 1 ? metaPaidTotal - perOutflow * (metaOutflows.length - 1) : perOutflow;
  });
  for (let i = 0; i < spendRows.length; i += 400) {
    await db.insert(schema.adSpendRecords).values(spendRows.slice(i, i + 400));
  }

  await db.insert(schema.spendMappingRules).values([
    { id: newId("smr"), organizationId: legenexId, pattern: "^AAT", matchField: "campaign_name", targetCampaignId: "cmp_mva_direct", brand: "AAT", active: true },
    { id: newId("smr"), organizationId: legenexId, pattern: "^CMC", matchField: "campaign_name", targetCampaignId: "cmp_mva_ping", brand: "CMC", active: true },
    { id: newId("smr"), organizationId: legenexId, pattern: "Depo-Provera|^CAC", matchField: "campaign_name", targetCampaignId: "cmp_depo", brand: "CAC", active: true },
  ]);

  // ---- Leads ----
  console.log("[seed] generating leads...");
  const leadsOut: GenLead[] = [];
  const soldAdPool: Record<string, string[]> = {
    cmp_mva_direct: ["ad-aat-1", "ad-aat-2"],
    cmp_mva_ping: ["ad-cmc-1", "ad-cmc-2"],
    cmp_depo: ["ad-cac-1", "ad-cac-2"],
  };

  let phoneCounter = 2025550100;
  const mkFieldData = (campaignId: string): { fieldData: Record<string, unknown>; phone: string; email: string; state: string } => {
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    const state = faker.helpers.arrayElement(STATES);
    const phone = `+1${phoneCounter++}`;
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${faker.number.int({ min: 1, max: 999 })}@example.com`;
    const base: Record<string, unknown> = {
      first_name: first, last_name: last, phone, email,
      incident_state: state,
      injury_type: faker.helpers.arrayElement(INJURIES),
      attorney_status: "none", currently_represented: false, at_fault: false,
      description: faker.helpers.arrayElement([
        "Rear-ended at a stoplight, neck pain since.",
        "T-boned at an intersection, airbags deployed.",
        "Sideswiped on the highway, shoulder injury.",
        "Hit while parked, back spasms started a week later.",
      ]),
      zip: faker.location.zipCode("#####"),
      trusted_form_url: `https://cert.trustedform.com/${faker.string.alphanumeric(24).toLowerCase()}`,
      jornaya_id: faker.string.uuid(),
    };
    if (campaignId === "cmp_depo") {
      base.usage_years = faker.number.int({ min: 2, max: 12 });
      base.diagnosis = "meningioma";
      delete base.incident_date;
    } else {
      base.incident_date = weekdayDate(toDateKey(addDays(clock.today, -120)), toDateKey(addDays(clock.today, -10)));
    }
    return { fieldData: base, phone, email, state };
  };

  const pushLead = (args: {
    campaignId: string; supplierId: string; buyerId: string | null; status: LeadStatus;
    dateKey: string; salePriceCents?: number | null; paidAllocatedCents?: number;
    supplierCost?: number | null; supplierPaid?: number; returned?: boolean;
    error?: string; failing?: GenLead["failingRule"]; forceState?: string;
  }): GenLead => {
    const { fieldData, phone, email, state } = mkFieldData(args.campaignId);
    if (args.forceState) {
      fieldData.incident_state = args.forceState;
    }
    const receivedAt = bizTime(args.dateKey);
    const sold = args.status === "sold" || args.status === "returned";
    const soldAt = sold ? new Date(receivedAt.getTime() + faker.number.int({ min: 2000, max: 60000 })) : null;
    const termsDays = args.buyerId === "buy_ag2" ? 15 : 30;
    const lead: GenLead = {
      id: newId("ld"),
      campaignId: args.campaignId,
      supplierId: args.supplierId,
      buyerId: args.buyerId,
      status: args.status,
      fieldData,
      normalizedPhone: phone,
      normalizedEmail: email,
      state: args.forceState ?? state,
      adMeta:
        args.supplierId === "sup_meta"
          ? {
              platform: "meta", utm_source: "facebook", utm_medium: "paid",
              ad_id: faker.helpers.arrayElement(soldAdPool[args.campaignId] ?? ["ad-aat-1"]),
              adset_id: args.campaignId === "cmp_depo" ? "as-301" : "as-101",
              campaign_ext_id: args.campaignId === "cmp_depo" ? "31240" : "23851",
              utm_campaign: args.campaignId === "cmp_depo" ? "CAC | Depo-Provera Claims" : "AAT | MVA Auto Injury",
            }
          : null,
      salePriceCents: sold ? args.salePriceCents ?? null : null,
      supplierCostCents: args.supplierCost ?? null,
      paidAllocatedCents: args.paidAllocatedCents ?? 0,
      supplierPaidCents: args.supplierPaid ?? 0,
      receivedAt,
      soldAt,
      returnedAt: args.status === "returned" ? addDays(receivedAt, faker.number.int({ min: 3, max: 10 })) : null,
      paymentDueDate: soldAt ? addDays(soldAt, termsDays) : null,
      reconciliationStatus:
        sold && (args.paidAllocatedCents ?? 0) >= (args.salePriceCents ?? 0) && (args.salePriceCents ?? 0) > 0
          ? "matched"
          : (args.paidAllocatedCents ?? 0) > 0
            ? "partial"
            : "unreconciled",
      matchedPaymentIds: [],
      errorMessage: args.error ?? null,
      failingRule: args.failing ?? null,
    };
    leadsOut.push(lead);
    return lead;
  };

  const winStartKey = toDateKey(addDays(clock.windowStart, 1));
  const monthAFrom = winStartKey > clock.monthAStart ? winStartKey : clock.monthAStart;

  // AG1 month A: exactly $4,200, all unpaid, all past terms now.
  for (let i = 0; i < 44; i++) {
    pushLead({
      campaignId: i % 2 === 0 ? "cmp_mva_direct" : "cmp_mva_ping",
      supplierId: i % 3 === 0 ? "sup_meta" : "sup_leadflow",
      buyerId: "buy_ag1", status: "sold",
      dateKey: weekdayDate(monthAFrom, toDateKey(addDays(new Date(`${clock.monthAEnd}T00:00:00Z`), -4))),
      salePriceCents: i < 42 ? 9500 : 10500, paidAllocatedCents: 0,
      supplierCost: i % 3 === 0 ? null : 3500,
    });
  }
  // AG1 month B: 41 leads, $3,920 booked, paid all but exactly $1,450.
  // 24 early leads paid in full (9500) + 1 lead at 12000 paid = 240000 paid,
  // 1 mid lead paid 7000 of 9500 (partial), 15 late leads unpaid.
  const ag1PaymentId = "pay_ag1_june";
  for (let i = 0; i < 41; i++) {
    const early = i < 24;
    const twelve = i === 24; // the 12000 lead, paid
    const partial = i === 25;
    const price = twelve ? 12000 : 9500;
    const dateKey = early || twelve
      ? weekdayDate(clock.monthBStart, toDateKey(addDays(new Date(`${clock.monthBStart}T00:00:00Z`), 10)))
      : weekdayDate(toDateKey(addDays(new Date(`${clock.monthBEnd}T00:00:00Z`), -12)), toDateKey(addDays(new Date(`${clock.monthBEnd}T00:00:00Z`), -1)));
    const lead = pushLead({
      campaignId: i % 2 === 0 ? "cmp_mva_direct" : "cmp_mva_ping",
      supplierId: i % 3 === 0 ? "sup_meta" : "sup_leadflow",
      buyerId: "buy_ag1", status: "sold", dateKey,
      salePriceCents: price,
      paidAllocatedCents: early || twelve ? price : partial ? 7000 : 0,
      supplierCost: i % 3 === 0 ? null : 3500,
    });
    if (early || twelve || partial) lead.matchedPaymentIds = [ag1PaymentId];
  }
  // AG1 current month: 7 recent sold, unpaid, not yet due.
  for (let i = 0; i < 7; i++) {
    pushLead({
      campaignId: "cmp_mva_direct", supplierId: "sup_leadflow", buyerId: "buy_ag1", status: "sold",
      dateKey: weekdayDate(startOfMonthKey(clock.todayKey), clock.todayKey),
      salePriceCents: 9500, supplierCost: 3500,
    });
  }

  // AG2: fully paid across the whole window, plus 8 returned in month A.
  const ag2Counts: Array<[string, string, number]> = [
    [monthAFrom, clock.monthAEnd, 45],
    [clock.monthBStart, clock.monthBEnd, 50],
    [startOfMonthKey(clock.todayKey), clock.todayKey, 10],
  ];
  const ag2PayIds = ["pay_ag2_a", "pay_ag2_b", "pay_ag2_c"];
  ag2Counts.forEach(([from, to, count], monthIdx) => {
    for (let i = 0; i < count; i++) {
      const lead = pushLead({
        campaignId: i % 2 === 0 ? "cmp_mva_ping" : "cmp_mva_direct",
        supplierId: i % 3 === 0 ? "sup_meta" : "sup_leadflow",
        buyerId: "buy_ag2", status: "sold",
        dateKey: weekdayDate(from, to),
        salePriceCents: 11000, paidAllocatedCents: 11000,
        supplierCost: i % 3 === 0 ? null : 3500,
      });
      lead.matchedPaymentIds = [ag2PayIds[monthIdx]];
    }
  });
  for (let i = 0; i < 8; i++) {
    pushLead({
      campaignId: "cmp_mva_ping", supplierId: "sup_leadflow", buyerId: "buy_ag2", status: "returned",
      dateKey: weekdayDate(monthAFrom, clock.monthAEnd),
      salePriceCents: 11000, supplierCost: 3500,
    });
  }

  // Overflow: 10 recent MVA sales, no payments ever.
  for (let i = 0; i < 10; i++) {
    pushLead({
      campaignId: i % 2 === 0 ? "cmp_mva_ping" : "cmp_mva_direct",
      supplierId: "sup_leadflow", buyerId: "buy_overflow", status: "sold",
      dateKey: weekdayDate(toDateKey(addDays(clock.today, -18)), clock.todayKey),
      salePriceCents: 6000, supplierCost: 3500,
    });
  }

  // Depo-Provera: 30 sold to Overflow at the 25000 override, spread across the
  // window so most are past terms: false profit at campaign scope.
  for (let i = 0; i < 30; i++) {
    pushLead({
      campaignId: "cmp_depo", supplierId: "sup_meta", buyerId: "buy_overflow", status: "sold",
      dateKey: weekdayDate(monthAFrom, toDateKey(addDays(clock.today, -8))),
      salePriceCents: 25000, supplierCost: null,
    });
  }
  // Depo non-sold spread.
  for (let i = 0; i < 20; i++) {
    pushLead({ campaignId: "cmp_depo", supplierId: "sup_meta", buyerId: null, status: "unsold", dateKey: weekdayDate(monthAFrom, clock.todayKey) });
  }
  for (let i = 0; i < 15; i++) {
    pushLead({
      campaignId: "cmp_depo", supplierId: "sup_meta", buyerId: null, status: "rejected",
      dateKey: weekdayDate(monthAFrom, clock.todayKey),
      failing: { group: "Qualified diagnosis", rule: { field: "diagnosis", operator: "not_equals", value: "none" } },
    });
  }
  for (let i = 0; i < 8; i++) {
    pushLead({ campaignId: "cmp_depo", supplierId: "sup_meta", buyerId: null, status: "duplicate", dateKey: weekdayDate(monthAFrom, clock.todayKey) });
  }
  for (let i = 0; i < 4; i++) {
    pushLead({
      campaignId: "cmp_depo", supplierId: "sup_meta", buyerId: null, status: "error",
      dateKey: weekdayDate(monthAFrom, clock.todayKey), error: "usage_years: expected a number",
    });
  }
  for (let i = 0; i < 3; i++) {
    pushLead({ campaignId: "cmp_depo", supplierId: "sup_meta", buyerId: null, status: "unmatched", dateKey: weekdayDate(toDateKey(addDays(clock.today, -20)), clock.todayKey) });
  }

  // MVA non-sold: rejections (CO suppression + representation), dups, errors,
  // unsold, and the unmatched cluster on cap-exhausted days.
  for (let i = 0; i < 15; i++) {
    pushLead({
      campaignId: i % 2 === 0 ? "cmp_mva_ping" : "cmp_mva_direct",
      supplierId: "sup_leadflow", buyerId: null, status: "rejected",
      dateKey: weekdayDate(monthAFrom, clock.todayKey), forceState: "CO",
      failing: { group: "CO Suppression - MVA", rule: { field: "incident_state", operator: "not_equals", value: "CO" } },
    });
  }
  for (let i = 0; i < 25; i++) {
    pushLead({
      campaignId: i % 2 === 0 ? "cmp_mva_ping" : "cmp_mva_direct",
      supplierId: i % 4 === 0 ? "sup_meta" : "sup_leadflow", buyerId: null, status: "rejected",
      dateKey: weekdayDate(monthAFrom, clock.todayKey),
      failing: { group: "Not already represented", rule: { field: "currently_represented", operator: "not_equals", value: "true" } },
    });
  }
  for (let i = 0; i < 25; i++) {
    pushLead({
      campaignId: i % 2 === 0 ? "cmp_mva_ping" : "cmp_mva_direct",
      supplierId: "sup_leadflow", buyerId: null, status: "duplicate",
      dateKey: weekdayDate(monthAFrom, clock.todayKey),
    });
  }
  for (let i = 0; i < 12; i++) {
    pushLead({
      campaignId: i % 2 === 0 ? "cmp_mva_ping" : "cmp_mva_direct",
      supplierId: i % 3 === 0 ? "sup_meta" : "sup_leadflow", buyerId: null, status: "error",
      dateKey: weekdayDate(monthAFrom, clock.todayKey),
      error: faker.helpers.arrayElement(["phone: invalid phone number", "incident_date: invalid date, expected mm/dd/yyyy or ISO", "incident_state: required field missing"]),
    });
  }
  // Unmatched cluster: 4 recent days when AG1's daily cap was exhausted.
  const clusterDays = [21, 16, 11, 8].map((d) => toDateKey(addDays(clock.today, -d)));
  for (let i = 0; i < 22; i++) {
    pushLead({
      campaignId: i % 2 === 0 ? "cmp_mva_ping" : "cmp_mva_direct",
      supplierId: "sup_leadflow", buyerId: null, status: "unmatched",
      dateKey: clusterDays[i % clusterDays.length],
    });
  }
  for (let i = 0; i < 26; i++) {
    pushLead({
      campaignId: i % 2 === 0 ? "cmp_mva_ping" : "cmp_mva_direct",
      supplierId: i % 4 === 0 ? "sup_meta" : "sup_leadflow", buyerId: null, status: "unsold",
      dateKey: weekdayDate(monthAFrom, clock.todayKey),
    });
  }

  // ---- Supplier cost truth: LeadFlow accrued exactly $6,300, paid $4,900 ----
  const leadflowCosted = leadsOut.filter(
    (l) => l.supplierId === "sup_leadflow" && !["duplicate", "error"].includes(l.status) && l.supplierCostCents !== null
  );
  // Force accrued to exactly 180 leads x $35: trim or extend cost stamps.
  leadflowCosted.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  const costTarget = 180;
  leadflowCosted.forEach((l, i) => {
    l.supplierCostCents = i < costTarget ? 3500 : null;
  });
  const costed = leadflowCosted.slice(0, costTarget);
  costed.slice(0, 140).forEach((l) => {
    l.supplierPaidCents = 3500;
  });

  console.log(`[seed] inserting ${leadsOut.length} leads...`);
  const leadValues = leadsOut.map((l) => ({
    id: l.id, organizationId: legenexId, campaignId: l.campaignId, supplierId: l.supplierId,
    buyerId: l.buyerId, externalId: null, status: l.status, fieldData: l.fieldData,
    normalizedPhone: l.normalizedPhone, normalizedEmail: l.normalizedEmail, state: l.state,
    ip: faker.internet.ipv4(), sourceUrl: "https://legenex-intake.example/form",
    trustedFormUrl: String(l.fieldData.trusted_form_url ?? ""), jornayaId: String(l.fieldData.jornaya_id ?? ""),
    adMeta: l.adMeta, salePriceCents: l.salePriceCents, supplierCostCents: l.supplierCostCents,
    isTest: false, receivedAt: l.receivedAt, soldAt: l.soldAt, returnedAt: l.returnedAt,
    errorMessage: l.errorMessage, failingRule: l.failingRule,
    reconciliationStatus: l.reconciliationStatus, matchedPaymentIds: l.matchedPaymentIds,
    paymentDueDate: l.paymentDueDate, paidAllocatedCents: l.paidAllocatedCents, supplierPaidCents: l.supplierPaidCents,
  }));
  for (let i = 0; i < leadValues.length; i += 300) {
    await db.insert(schema.leads).values(leadValues.slice(i, i + 300));
  }

  // ---- Events and attempts ----
  console.log("[seed] generating timelines and attempts...");
  const events: Array<typeof schema.leadEvents.$inferInsert> = [];
  const attempts: Array<typeof schema.distributionAttempts.$inferInsert> = [];
  const buyerName: Record<string, string> = { buy_ag1: "AG1 Walker", buy_ag2: "AG2 Quintessa", buy_overflow: "Overflow Network" };
  const buyerPrice: Record<string, number> = { buy_ag1: 95, buy_ag2: 110, buy_overflow: 60 };

  const ev = (l: GenLead, kind: LeadEventKind, detail: Record<string, unknown>, offsetMs: number) => {
    events.push({
      id: newId("lev"), organizationId: legenexId, leadId: l.id, kind, detail,
      at: new Date(l.receivedAt.getTime() + offsetMs),
    });
  };

  for (const l of leadsOut) {
    ev(l, "received", { supplier: l.supplierId === "sup_leadflow" ? "LeadFlow" : "Internal Meta" }, 0);
    if (l.status === "error") {
      ev(l, "validated", { ok: false, error: l.errorMessage }, 300);
      continue;
    }
    ev(l, "validated", { ok: true }, 300);
    ev(l, "dedupe_checked", { duplicate: l.status === "duplicate" }, 500);
    if (l.status === "duplicate") continue;
    if (l.status === "rejected") {
      ev(l, "filtered", { failing: l.failingRule }, 700);
      continue;
    }
    const eligible = l.status === "unmatched" ? [] : ["AG1 Walker", "AG2 Quintessa", "Overflow Network"];
    ev(l, "routed", {
      eligible,
      cap_blocked: l.status === "unmatched" ? [{ buyerId: "buy_ag1", buyerName: "AG1 Walker", blockedBy: "leads.daily" }] : [],
      method: l.campaignId === "cmp_mva_ping" ? "priority" : "priority",
    }, 900);
    if (l.status === "unmatched") continue;

    const isPing = l.campaignId === "cmp_mva_ping";
    const soldBuyer = l.buyerId;
    const mkAttempt = (buyerId: string, type: "ping" | "post", outcome: "accepted" | "rejected", bid: number | null, offset: number) => {
      const duration = faker.number.int({ min: 120, max: 900 });
      attempts.push({
        id: newId("att"), organizationId: legenexId, leadId: l.id, buyerId,
        attemptType: type,
        requestPayload: {
          url: `${MOCK}/${type === "ping" ? "bid" : "accept"}`,
          body: JSON.stringify({ state: l.state, lead_id: l.id, ...(type === "post" ? { phone: l.normalizedPhone } : {}) }),
        },
        responsePayload: {
          status: 200,
          body: JSON.stringify(outcome === "accepted" ? { status: "accepted", price: bid !== null ? bid / 100 : buyerPrice[buyerId] } : { status: "rejected", reason: "outside coverage" }),
        },
        responseCode: 200, bidCents: bid, outcome, durationMs: duration,
        at: new Date(l.receivedAt.getTime() + offset),
      });
      ev(l, type === "ping" ? "ping_sent" : "posted", { buyer: buyerName[buyerId], outcome, code: 200, duration_ms: duration, bid_cents: bid }, offset + 20);
      if (type === "ping" && bid) ev(l, "bid_received", { buyer: buyerName[buyerId], bid_cents: bid }, offset + 40);
    };

    if (l.status === "unsold") {
      if (isPing) {
        mkAttempt("buy_ag1", "ping", "rejected", null, 1200);
        mkAttempt("buy_ag2", "ping", "rejected", null, 1250);
      } else {
        mkAttempt("buy_ag1", "post", "rejected", null, 1200);
        mkAttempt("buy_ag2", "post", "rejected", null, 1900);
        mkAttempt("buy_overflow", "post", "rejected", null, 2600);
      }
      ev(l, "rejected", { final: "unsold", attempts: isPing ? 2 : 3 }, 3000);
      continue;
    }

    // sold or returned
    if (soldBuyer) {
      if (isPing) {
        const winningBid = l.salePriceCents ?? buyerPrice[soldBuyer] * 100;
        mkAttempt("buy_ag1", "ping", soldBuyer === "buy_ag1" ? "accepted" : "rejected", soldBuyer === "buy_ag1" ? winningBid : null, 1100);
        mkAttempt("buy_ag2", "ping", soldBuyer === "buy_ag2" ? "accepted" : "accepted", soldBuyer === "buy_ag2" ? winningBid : Math.round(winningBid * 0.8), 1150);
        mkAttempt(soldBuyer, "post", "accepted", winningBid, 2100);
      } else {
        if (soldBuyer !== "buy_ag1") mkAttempt("buy_ag1", "post", "rejected", null, 1100);
        if (soldBuyer === "buy_overflow") mkAttempt("buy_ag2", "post", "rejected", null, 1800);
        mkAttempt(soldBuyer, "post", "accepted", l.salePriceCents, 2400);
      }
      ev(l, "accepted", { buyer: buyerName[soldBuyer], price_cents: l.salePriceCents }, 2600);
      ev(l, "delivered", { buyer: buyerName[soldBuyer] }, 2700);
      ev(l, "revenue_booked", { amount_cents: l.salePriceCents, buyer: buyerName[soldBuyer] }, 2800);
      ev(l, "payment_due", { due: l.paymentDueDate ? toDateKey(l.paymentDueDate) : null }, 2900);
      if (l.supplierCostCents) {
        ev(l, "supplier_cost_accrued", { amount_cents: l.supplierCostCents, supplier: "LeadFlow" }, 3000);
      }
      if (l.paidAllocatedCents > 0) {
        events.push({
          id: newId("lev"), organizationId: legenexId, leadId: l.id, kind: "payment_matched",
          detail: { amount_cents: l.paidAllocatedCents, source: "stripe", payment_id: l.matchedPaymentIds[0] ?? null },
          at: l.paymentDueDate ?? addDays(l.receivedAt, 20),
        });
      }
      if (l.supplierPaidCents > 0) {
        events.push({
          id: newId("lev"), organizationId: legenexId, leadId: l.id, kind: "supplier_payment_matched",
          detail: { amount_cents: l.supplierPaidCents, source: "mercury" },
          at: addDays(l.receivedAt, 16),
        });
      }
      if (l.status === "returned") {
        events.push({
          id: newId("lev"), organizationId: legenexId, leadId: l.id, kind: "returned",
          detail: { by: "buyer portal", reason: "disconnected number", revenue_clawback_cents: l.salePriceCents },
          at: l.returnedAt ?? addDays(l.receivedAt, 6),
        });
      }
    }
  }

  for (let i = 0; i < events.length; i += 400) {
    await db.insert(schema.leadEvents).values(events.slice(i, i + 400));
  }
  for (let i = 0; i < attempts.length; i += 400) {
    await db.insert(schema.distributionAttempts).values(attempts.slice(i, i + 400));
  }

  // ---- Invoices ----
  console.log("[seed] money records...");
  const sumFor = (buyerId: string, from: string, to: string) =>
    leadsOut
      .filter((l) => l.buyerId === buyerId && l.status === "sold" && l.soldAt)
      .filter((l) => {
        const k = toDateKey(l.soldAt as Date);
        return k >= from && k <= to;
      })
      .reduce((s, l) => s + (l.salePriceCents ?? 0), 0);

  const ag1MonthA = sumFor("buy_ag1", clock.monthAStart, clock.monthAEnd); // 420000
  const ag1MonthB = sumFor("buy_ag1", clock.monthBStart, clock.monthBEnd); // 392000
  const ag2MonthA = sumFor("buy_ag2", clock.monthAStart, clock.monthAEnd);
  const ag2MonthB = sumFor("buy_ag2", clock.monthBStart, clock.monthBEnd);
  const ag2MonthC = sumFor("buy_ag2", startOfMonthKey(clock.todayKey), clock.todayKey);
  const ofMonthB = sumFor("buy_overflow", clock.monthBStart, clock.monthBEnd);
  const ofMonthC = sumFor("buy_overflow", startOfMonthKey(clock.todayKey), clock.todayKey);

  const dueA = toDateKey(addDays(new Date(`${clock.monthAEnd}T00:00:00Z`), 30));
  const dueB = toDateKey(addDays(new Date(`${clock.monthBEnd}T00:00:00Z`), 30));
  const dueBShort = toDateKey(addDays(new Date(`${clock.monthBEnd}T00:00:00Z`), 15));

  await db.insert(schema.invoices).values([
    {
      id: "inv_ag1_a", organizationId: legenexId, direction: "receivable", counterpartyType: "buyer",
      counterpartyId: "buy_ag1", externalRef: "INV-LGX-1001", source: "xero",
      issueDate: toDateKey(addDays(new Date(`${clock.monthAEnd}T00:00:00Z`), 1)), dueDate: dueA,
      amountCents: ag1MonthA, amountPaidCents: 0, status: "overdue", lineItems: [],
      periodStart: clock.monthAStart, periodEnd: clock.monthAEnd, createdAt: clock.today,
    },
    {
      id: "inv_ag1_b", organizationId: legenexId, direction: "receivable", counterpartyType: "buyer",
      counterpartyId: "buy_ag1", externalRef: "INV-LGX-1002", source: "xero",
      issueDate: toDateKey(addDays(new Date(`${clock.monthBEnd}T00:00:00Z`), 1)), dueDate: dueB,
      amountCents: ag1MonthB, amountPaidCents: ag1MonthB - 145000, status: "partial", lineItems: [],
      periodStart: clock.monthBStart, periodEnd: clock.monthBEnd, createdAt: clock.today,
    },
    {
      id: "inv_ag2_a", organizationId: legenexId, direction: "receivable", counterpartyType: "buyer",
      counterpartyId: "buy_ag2", externalRef: "INV-LGX-2001", source: "xero",
      issueDate: toDateKey(addDays(new Date(`${clock.monthAEnd}T00:00:00Z`), 1)),
      dueDate: toDateKey(addDays(new Date(`${clock.monthAEnd}T00:00:00Z`), 15)),
      amountCents: ag2MonthA, amountPaidCents: ag2MonthA, status: "paid", lineItems: [],
      periodStart: clock.monthAStart, periodEnd: clock.monthAEnd, createdAt: clock.today,
    },
    {
      id: "inv_ag2_b", organizationId: legenexId, direction: "receivable", counterpartyType: "buyer",
      counterpartyId: "buy_ag2", externalRef: "INV-LGX-2002", source: "xero",
      issueDate: toDateKey(addDays(new Date(`${clock.monthBEnd}T00:00:00Z`), 1)), dueDate: dueBShort,
      amountCents: ag2MonthB, amountPaidCents: ag2MonthB, status: "paid", lineItems: [],
      periodStart: clock.monthBStart, periodEnd: clock.monthBEnd, createdAt: clock.today,
    },
    {
      id: "inv_of_b", organizationId: legenexId, direction: "receivable", counterpartyType: "buyer",
      counterpartyId: "buy_overflow", externalRef: "INV-LGX-3001", source: "manual",
      issueDate: toDateKey(addDays(new Date(`${clock.monthBEnd}T00:00:00Z`), 1)), dueDate: dueB,
      amountCents: ofMonthB + ofMonthC, amountPaidCents: 0, status: "sent", lineItems: [],
      periodStart: clock.monthBStart, periodEnd: clock.todayKey, createdAt: clock.today,
    },
    {
      id: "inv_leadflow", organizationId: legenexId, direction: "payable", counterpartyType: "supplier",
      counterpartyId: "sup_leadflow", externalRef: "LF-STMT-0442", source: "manual",
      issueDate: clock.monthBEnd, dueDate: toDateKey(addDays(new Date(`${clock.monthBEnd}T00:00:00Z`), 15)),
      amountCents: 630000, amountPaidCents: 490000, status: "partial", lineItems: [],
      periodStart: clock.monthAStart, periodEnd: clock.monthBEnd, createdAt: clock.today,
    },
  ]);

  // ---- Payments ----
  const payments: Array<typeof schema.paymentRecords.$inferInsert> = [
    // AG2, fully matched via external refs (tier 1 equivalents).
    {
      id: "pay_ag2_a", organizationId: legenexId, source: "stripe", externalRef: "INV-LGX-2001",
      date: toDateKey(addDays(new Date(`${clock.monthAEnd}T00:00:00Z`), 12)), amountCents: ag2MonthA,
      direction: "in", counterpartyName: "QUINTESSA LEGAL GROUP", memo: "Remittance INV-LGX-2001",
      matchedInvoiceId: "inv_ag2_a", matchedEntity: { type: "invoice", id: "inv_ag2_a", period_start: clock.monthAStart, period_end: clock.monthAEnd },
      matchStatus: "auto_matched", confidence: 100, raw: {},
    },
    {
      id: "pay_ag2_b", organizationId: legenexId, source: "stripe", externalRef: "INV-LGX-2002",
      date: toDateKey(addDays(new Date(`${clock.monthBEnd}T00:00:00Z`), 10)), amountCents: ag2MonthB,
      direction: "in", counterpartyName: "QUINTESSA LEGAL GROUP", memo: "Remittance INV-LGX-2002",
      matchedInvoiceId: "inv_ag2_b", matchedEntity: { type: "invoice", id: "inv_ag2_b", period_start: clock.monthBStart, period_end: clock.monthBEnd },
      matchStatus: "auto_matched", confidence: 100, raw: {},
    },
    {
      id: "pay_ag2_c", organizationId: legenexId, source: "stripe", externalRef: "QNT-WIRE-0071",
      date: clock.todayKey, amountCents: ag2MonthC,
      direction: "in", counterpartyName: "QUINTESSA LEGAL GROUP", memo: "Weekly settle, current month to date",
      matchedInvoiceId: null, matchedEntity: { type: "buyer", id: "buy_ag2", period_start: startOfMonthKey(clock.todayKey), period_end: clock.todayKey },
      matchStatus: "auto_matched", confidence: 85, raw: {},
    },
    // AG1 June remittance, short by exactly $1,450.
    {
      id: ag1PaymentId, organizationId: legenexId, source: "stripe", externalRef: "INV-LGX-1002",
      date: toDateKey(addDays(new Date(`${clock.monthBEnd}T00:00:00Z`), 2)), amountCents: ag1MonthB - 145000,
      direction: "in", counterpartyName: "AG1 WALKER LLC", memo: "Partial remittance INV-LGX-1002",
      matchedInvoiceId: "inv_ag1_b", matchedEntity: { type: "invoice", id: "inv_ag1_b", period_start: clock.monthBStart, period_end: clock.monthBEnd },
      matchStatus: "auto_matched", confidence: 100, raw: {},
    },
    // The 82-confidence wire waiting in the Match Queue: $4,200 from AG1,
    // 5 days before INV-LGX-1001's due date, amount an exact match.
    {
      id: "pay_ag1_wire", organizationId: legenexId, source: "mercury", externalRef: null,
      date: toDateKey(addDays(new Date(`${dueA}T00:00:00Z`), -5)), amountCents: ag1MonthA,
      direction: "in", counterpartyName: "AG1 WALKER LLC", memo: "Incoming wire, no reference",
      matchedInvoiceId: null, matchedEntity: null, matchStatus: "unmatched", confidence: 0, raw: {},
    },
    // LeadFlow payouts, matched to the supplier.
    {
      id: "pay_lf_1", organizationId: legenexId, source: "mercury", externalRef: "MRC-LF-2201",
      date: toDateKey(addDays(new Date(`${clock.monthAEnd}T00:00:00Z`), 8)), amountCents: 245000,
      direction: "out", counterpartyName: "LEADFLOW MEDIA LLC", memo: "CPL payout",
      matchedInvoiceId: null, matchedEntity: { type: "supplier", id: "sup_leadflow", period_start: clock.monthAStart, period_end: clock.monthAEnd },
      matchStatus: "auto_matched", confidence: 75, raw: {},
    },
    {
      id: "pay_lf_2", organizationId: legenexId, source: "mercury", externalRef: "MRC-LF-2202",
      date: toDateKey(addDays(new Date(`${clock.monthBEnd}T00:00:00Z`), 6)), amountCents: 245000,
      direction: "out", counterpartyName: "LEADFLOW MEDIA LLC", memo: "CPL payout",
      matchedInvoiceId: null, matchedEntity: { type: "supplier", id: "sup_leadflow", period_start: clock.monthBStart, period_end: clock.monthBEnd },
      matchStatus: "auto_matched", confidence: 75, raw: {},
    },
    // Unmatched noise for the queue.
    {
      id: newId("pay"), organizationId: legenexId, source: "mercury", externalRef: null,
      date: toDateKey(addDays(clock.today, -3)), amountCents: 9900,
      direction: "out", counterpartyName: "NOTION LABS INC", memo: "Software subscription",
      matchedInvoiceId: null, matchedEntity: null, matchStatus: "unmatched", confidence: 0, raw: {},
    },
    {
      id: newId("pay"), organizationId: legenexId, source: "mercury", externalRef: null,
      date: toDateKey(addDays(clock.today, -6)), amountCents: 85000,
      direction: "in", counterpartyName: "UNKNOWN ORIGINATOR 8842", memo: "ACH credit",
      matchedInvoiceId: null, matchedEntity: null, matchStatus: "unmatched", confidence: 0, raw: {},
    },
    {
      id: newId("pay"), organizationId: legenexId, source: "mercury", externalRef: null,
      date: toDateKey(addDays(clock.today, -9)), amountCents: 42500,
      direction: "out", counterpartyName: "TWILIO INC", memo: "Telecom usage",
      matchedInvoiceId: null, matchedEntity: null, matchStatus: "unmatched", confidence: 0, raw: {},
    },
    ...metaOutflows,
  ];
  await db.insert(schema.paymentRecords).values(payments);

  // ---- Costs ----
  await db.insert(schema.costEntries).values([
    { id: newId("cost"), organizationId: legenexId, date: toDateKey(addDays(clock.today, -20)), category: "software", description: "CRM + dialer stack", amountCents: 29900, campaignId: null, supplierId: null, recurring: true, paidStatus: "paid", matchedPaymentId: null },
    { id: newId("cost"), organizationId: legenexId, date: toDateKey(addDays(clock.today, -14)), category: "data", description: "Phone validation credits", amountCents: 15000, campaignId: null, supplierId: null, recurring: false, paidStatus: "accrued", matchedPaymentId: null },
    { id: newId("cost"), organizationId: legenexId, date: toDateKey(addDays(clock.today, -8)), category: "telecom", description: "Twilio usage", amountCents: 42500, campaignId: null, supplierId: null, recurring: true, paidStatus: "paid", matchedPaymentId: null },
  ]);

  // ---- Match rules ----
  await db.insert(schema.matchRules).values([
    { id: newId("mr"), organizationId: legenexId, name: "Meta ad spend", counterpartyPattern: "facebk|meta platforms", amountTolerancePct: 15, dateWindowDays: 35, target: "ad_platform", targetId: "meta", active: true },
    { id: newId("mr"), organizationId: legenexId, name: "Google ad spend", counterpartyPattern: "google\\s*ads|google llc", amountTolerancePct: 15, dateWindowDays: 35, target: "ad_platform", targetId: "google", active: true },
    { id: newId("mr"), organizationId: legenexId, name: "LeadFlow payouts", counterpartyPattern: "leadflow", amountTolerancePct: 10, dateWindowDays: 30, target: "supplier", targetId: "sup_leadflow", active: true },
  ]);

  // ---- Automations (four enabled defaults) ----
  await db.insert(schema.automations).values([
    {
      id: "aut_variance", organizationId: legenexId, name: "Slack on variance or short pay",
      trigger: "variance_flagged", conditions: null,
      actions: [{ kind: "slack", config: { message: "Variance flagged: {{counterparty}} {{period}} is short {{amount}}. Open the match queue." } }],
      status: "enabled",
    },
    {
      id: "aut_cap", organizationId: legenexId, name: "Slack when a buyer nears daily cap",
      trigger: "buyer_cap_hit", conditions: null,
      actions: [{ kind: "slack", config: { message: "{{buyer}} hit {{blocked_by}} on {{campaign}}. Leads are overflowing to lower payers." } }],
      status: "enabled",
    },
    {
      id: "aut_overdue", organizationId: legenexId, name: "Email at 7 days invoice overdue",
      trigger: "invoice_overdue", conditions: null,
      actions: [{ kind: "email", config: { to: "finance@legenex.com", subject: "Overdue: {{buyer}} owes {{overdue}}", body: "{{buyer}} is past terms by {{overdue}}. Chase or pause deliveries.", link: "/distribution/buyers" } }],
      status: "enabled",
    },
    {
      id: "aut_daily", organizationId: legenexId, name: "7am daily summary",
      trigger: "daily_summary", conditions: null,
      actions: [{ kind: "email", config: { to: "nick@legenex.com", subject: "DashFlo daily: booked {{booked}} vs verified {{verified}}", body: "Booked {{booked}}, verified {{verified}}, gap {{gap}}. Open items: {{open_actions}}.", link: "/" } }],
      status: "enabled",
    },
  ]);

  // ---- API keys ----
  await db.insert(schema.apiKeys).values({
    id: newId("key"), organizationId: legenexId, name: "Legenex integration key",
    keyPrefix: DEMO_ORG_API_KEY.slice(8, 16), hashedKey: sha256Hex(DEMO_ORG_API_KEY),
    scopes: ["*"], status: "active", lastUsedAt: null, createdAt: clock.today,
  });

  // ---- Saved reports and briefs ----
  await db.insert(schema.savedReports).values([
    { id: "rpt_daily", organizationId: legenexId, name: "Daily ops brief", kind: "brief", config: { brief_kind: "daily" }, schedule: "Every day, 7:00am", createdAt: clock.today },
    { id: "rpt_weekly", organizationId: legenexId, name: "Weekly review", kind: "brief", config: { brief_kind: "weekly" }, schedule: "Mondays, 8:00am", createdAt: clock.today },
    { id: "rpt_monthly", organizationId: legenexId, name: "Monthly P&L narrative", kind: "brief", config: { brief_kind: "monthly" }, schedule: "1st of month, 9:00am", createdAt: clock.today },
    { id: "rpt_custom1", organizationId: legenexId, name: "Cash truth by campaign", kind: "custom", config: { dimension: "campaign", metrics: ["booked_revenue", "verified_income", "revenue_gap", "cash_profit"], view: "table" }, schedule: null, createdAt: clock.today },
  ]);

  // ---- CAPI event log (sold, capi-enabled campaigns, hashed payloads) ----
  console.log("[seed] CAPI mock events...");
  const capiRows: Array<typeof schema.capiEvents.$inferInsert> = [];
  const capiLeads = leadsOut.filter(
    (l) => (l.campaignId === "cmp_mva_direct" || l.campaignId === "cmp_depo") && (l.status === "sold" || l.status === "returned")
  ).slice(0, 60);
  for (const l of capiLeads) {
    const pixel = l.campaignId === "cmp_depo" ? "884213550021735" : "884213550021734";
    const payload = buildCapiPayload(
      {
        id: l.id, campaignId: l.campaignId, fieldData: l.fieldData,
        normalizedEmail: l.normalizedEmail, normalizedPhone: l.normalizedPhone,
        state: l.state, salePriceCents: l.salePriceCents,
      },
      "Purchase", pixel
    );
    capiRows.push({
      id: newId("cev"), organizationId: legenexId, campaignId: l.campaignId, leadId: l.id,
      eventName: "Purchase", payload,
      response: { mode: "mock", note: "no access token set, payload logged locally" },
      status: "mock_logged", at: l.soldAt ?? l.receivedAt,
    });
  }
  for (let i = 0; i < capiRows.length; i += 300) {
    await db.insert(schema.capiEvents).values(capiRows.slice(i, i + 300));
  }

  // ---- Welcome notification ----
  await db.insert(schema.notifications).values({
    id: newId("ntf"), organizationId: legenexId, userId: "usr_nick", kind: "welcome",
    title: "Welcome to DashFlo",
    body: "The seed data carries a story: AG1 owes you money, Depo-Provera profit is not real yet, and one wire is waiting in the Match Queue.",
    link: "/reconciliation?tab=queue", at: clock.today,
  });

  // ---- Report pages: the six defaults plus published partner portal pages ----
  console.log("[seed] report pages and partner portals...");
  await seedDefaultReportPages(legenexId);
  const ag1Portal = entityPageTemplate("buyer", "buy_ag1", "AG1 Walker");
  const leadflowPortal = entityPageTemplate("supplier", "sup_leadflow", "LeadFlow");
  await db.insert(schema.reportPages).values([
    {
      id: newId("rpg"), organizationId: legenexId,
      name: ag1Portal.name, slug: ag1Portal.slug, kind: ag1Portal.kind, description: ag1Portal.description,
      entityType: "buyer", entityId: "buy_ag1", config: ag1Portal.config,
      portalVisible: true, isDefault: false, sortOrder: 20, createdAt: clock.today,
    },
    {
      id: newId("rpg"), organizationId: legenexId,
      name: leadflowPortal.name, slug: leadflowPortal.slug, kind: leadflowPortal.kind, description: leadflowPortal.description,
      entityType: "supplier", entityId: "sup_leadflow", config: leadflowPortal.config,
      portalVisible: true, isDefault: false, sortOrder: 21, createdAt: clock.today,
    },
  ]);

  // ---- Demo Meta integration: business manager, pages, and lead forms ----
  console.log("[seed] demo Meta integration assets...");
  await connectDemoIntegration(legenexId, "meta");
  const demoForms = await db.query.integrationAssets.findMany({
    where: eq(schema.integrationAssets.organizationId, legenexId),
  });
  const mvaForm = demoForms.find((f) => f.extId === "lf_1004");
  if (mvaForm) {
    await db.update(schema.integrationAssets)
      .set({ mappedCampaignId: "cmp_mva_direct", enabled: true })
      .where(eq(schema.integrationAssets.id, mvaForm.id));
  }
  const depoForm = demoForms.find((f) => f.extId === "lf_1011");
  if (depoForm) {
    await db.update(schema.integrationAssets)
      .set({ mappedCampaignId: "cmp_depo", enabled: true })
      .where(eq(schema.integrationAssets.id, depoForm.id));
  }

  // ---- Derived state: periods, variance flags, insights, action items ----
  console.log("[seed] building reconciliation periods (fires variance automations)...");
  await rebuildPeriods(legenexId);
  console.log("[seed] generating insights and action items...");
  await runInsightGeneration(legenexId);
  console.log("[seed] firing daily summary automation once...");
  await fireAutomations(legenexId, "daily_summary", {
    booked: "$28,000+", verified: "see overview", gap: "see overview", open_actions: "check the action queue",
  });

  const soldCount = leadsOut.filter((l) => l.status === "sold").length;
  console.log(`
================= DashFlo seed complete =================
Leads: ${leadsOut.length} (${soldCount} sold, 8 returned)
AG1 Walker: $${(ag1MonthA / 100).toFixed(0)} overdue (unpaid ${clock.monthAStart.slice(0, 7)}), short-paid $1,450 for ${clock.monthBStart.slice(0, 7)}
AG2 Quintessa: fully paid. Overflow Network: no payment source.
Depo-Provera: booked revenue, paid spend, zero verified income (false profit).
Match Queue: $${(ag1MonthA / 100).toFixed(0)} wire from AG1 waiting at 82 confidence.

Logins (password for all: ${PASSWORD})
  owner     nick@legenex.com        (platform admin)
  analyst   analyst@legenex.com
  finance   finance@legenex.com
  partner   partner.ag1@legenex.com (scoped to AG1 Walker)
  demo org  demo@demoagency.com

API keys
  Org API key (Bearer):     ${DEMO_ORG_API_KEY}
  LeadFlow supplier key:    ${DEMO_SUPPLIER_KEY_LEADFLOW}
  Internal Meta key:        ${DEMO_SUPPLIER_KEY_META}
==========================================================
`);
}

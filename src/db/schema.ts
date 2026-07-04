import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// DashFlo schema. Every tenant table carries organizationId. Money is integer cents.
// Timestamps are stored UTC and rendered in the org timezone at the edge.

export type PlanTier = "starter" | "growth" | "scale";
export type Role = "owner" | "admin" | "analyst" | "finance" | "partner";

export interface PlanLimits {
  leads_per_month: number;
  users: number;
  ad_accounts: number;
  ai_messages: number;
}

export interface WhiteLabel {
  logo_url?: string;
  accent?: string;
  sender_name?: string;
}

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  timezone: text("timezone").notNull().default("America/New_York"),
  currency: text("currency").notNull().default("USD"),
  planTier: text("plan_tier").$type<PlanTier>().notNull().default("starter"),
  planLimits: jsonb("plan_limits").$type<PlanLimits>().notNull(),
  whiteLabel: jsonb("white_label").$type<WhiteLabel>().notNull().default({}),
  varianceThresholdPct: integer("variance_threshold_pct").notNull().default(2),
  varianceThresholdCents: integer("variance_threshold_cents").notNull().default(25000),
  status: text("status").$type<"active" | "suspended">().notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export interface PartnerScope {
  buyer_id?: string;
  supplier_id?: string;
}

export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    role: text("role").$type<Role>().notNull(),
    partnerScope: jsonb("partner_scope").$type<PartnerScope>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("memberships_user_org").on(t.userId, t.organizationId)]
);

// ---- Campaigns ----

export type CampaignVertical =
  | "mva"
  | "mass_tort"
  | "workers_comp"
  | "home_services"
  | "insurance"
  | "solar"
  | "other";
export type CampaignType = "direct_post" | "ping_post";
export type CampaignStatus = "draft" | "active" | "paused" | "archived";
export type DistributionMethod = "priority" | "weighted" | "round_robin";
export type FieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "boolean"
  | "state"
  | "zip"
  | "phone"
  | "email";
export type FieldTransform = "trim" | "lowercase" | "phone_e164" | "date_normalize" | "state_2letter";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  transforms?: FieldTransform[];
}

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "contains"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "exists"
  | "regex";

export interface FilterRule {
  field: string;
  operator: FilterOperator;
  value?: string | number | boolean | Array<string | number>;
}

export interface FilterSchedule {
  days: number[]; // 0=Sunday..6, org timezone
  start_hour: number; // inclusive
  end_hour: number; // exclusive
}

export interface FilterGroup {
  id: string;
  name?: string;
  logic: "and" | "or";
  rules: FilterRule[];
  schedule?: FilterSchedule; // group only applies while live
}

export interface InboundFilters {
  logic: "and" | "or"; // across groups
  groups: FilterGroup[];
}

export const campaigns = pgTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    vertical: text("vertical").$type<CampaignVertical>().notNull().default("other"),
    type: text("type").$type<CampaignType>().notNull().default("direct_post"),
    status: text("status").$type<CampaignStatus>().notNull().default("draft"),
    distributionMethod: text("distribution_method").$type<DistributionMethod>().notNull().default("priority"),
    fieldMapping: jsonb("field_mapping").$type<FieldDef[]>().notNull().default([]),
    inboundFilters: jsonb("inbound_filters").$type<InboundFilters>(),
    dedupeWindowDays: integer("dedupe_window_days").notNull().default(30),
    testMode: boolean("test_mode").notNull().default(false),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    capiConfig: jsonb("capi_config").$type<CapiConfig>(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("campaigns_org_slug").on(t.organizationId, t.slug)]
);

export interface CapiConfig {
  enabled: boolean;
  pixel_id?: string;
  access_token?: string;
  events: { received: boolean; sold: boolean };
}

// ---- Suppliers ----

export type SupplierPricingModel = "fixed_cpl" | "rev_share" | "none";

export const suppliers = pgTable("suppliers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  status: text("status").$type<"active" | "paused" | "archived">().notNull().default("active"),
  apiKeyPrefix: text("api_key_prefix").notNull(),
  apiKeyHash: text("api_key_hash").notNull(),
  pricingModel: text("pricing_model").$type<SupplierPricingModel>().notNull().default("none"),
  fixedPriceCents: integer("fixed_price_cents"),
  revSharePct: integer("rev_share_pct"),
  allowedCampaignIds: jsonb("allowed_campaign_ids").$type<string[]>().notNull().default([]),
  portalAccess: boolean("portal_access").notNull().default(false),
  testMode: boolean("test_mode").notNull().default(false),
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// ---- Buyers ----

export type DeliveryMethod = "http_post" | "webhook" | "email" | "ping_post";
export type AuthKind = "none" | "basic" | "bearer" | "header";

export interface DeliveryAuth {
  type: AuthKind;
  username?: string;
  password?: string;
  token?: string;
  header_name?: string;
  header_value?: string;
}

export interface SuccessMatcher {
  kind: "jsonpath" | "regex";
  expr: string;
  expected?: string;
}

export interface DeliveryConfig {
  method: DeliveryMethod;
  url: string;
  headers?: Record<string, string>;
  auth?: DeliveryAuth;
  content_type: "json" | "form";
  body_template?: string;
  ping_template?: string;
  post_template?: string;
  success_matcher: SuccessMatcher;
  price_path?: string;
  timeout_ms?: number;
  retries?: number;
  backoff_ms?: number;
}

export interface CapWindows {
  daily?: number;
  weekly?: number;
  monthly?: number;
  total?: number;
}

export interface BuyerCaps {
  leads?: CapWindows;
  budget_cents?: CapWindows;
}

export interface BuyerSchedule {
  days: number[];
  start_hour: number;
  end_hour: number;
}

export const buyers = pgTable("buyers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  status: text("status").$type<"active" | "paused" | "archived">().notNull().default("active"),
  deliveryConfig: jsonb("delivery_config").$type<DeliveryConfig>().notNull(),
  caps: jsonb("caps").$type<BuyerCaps>().notNull().default({}),
  filters: jsonb("filters").$type<InboundFilters>(),
  schedule: jsonb("schedule").$type<BuyerSchedule>(),
  priceDefaultCents: integer("price_default_cents").notNull().default(0),
  priority: integer("priority").notNull().default(100),
  weight: integer("weight").notNull().default(1),
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  portalAccess: boolean("portal_access").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const campaignBuyers = pgTable(
  "campaign_buyers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    buyerId: text("buyer_id").notNull(),
    priority: integer("priority").notNull().default(100),
    weight: integer("weight").notNull().default(1),
    priceOverrideCents: integer("price_override_cents"),
    capsOverride: jsonb("caps_override").$type<BuyerCaps>(),
    status: text("status").$type<"active" | "paused">().notNull().default("active"),
  },
  (t) => [uniqueIndex("campaign_buyers_pair").on(t.campaignId, t.buyerId)]
);

// ---- Leads ----

export type LeadStatus =
  | "received"
  | "queued"
  | "pinged"
  | "sold"
  | "unsold"
  | "unmatched"
  | "rejected"
  | "duplicate"
  | "error"
  | "test"
  | "returned";

export type ReconciliationStatus = "unreconciled" | "matched" | "partial" | "disputed";

export interface AdMeta {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  ad_id?: string;
  adset_id?: string;
  campaign_ext_id?: string;
  platform?: string;
}

export const leads = pgTable(
  "leads",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    supplierId: text("supplier_id").notNull(),
    buyerId: text("buyer_id"),
    externalId: text("external_id"),
    status: text("status").$type<LeadStatus>().notNull().default("received"),
    fieldData: jsonb("field_data").$type<Record<string, unknown>>().notNull().default({}),
    normalizedPhone: text("normalized_phone"),
    normalizedEmail: text("normalized_email"),
    state: text("state"),
    ip: text("ip"),
    sourceUrl: text("source_url"),
    trustedFormUrl: text("trusted_form_url"),
    jornayaId: text("jornaya_id"),
    adMeta: jsonb("ad_meta").$type<AdMeta>(),
    salePriceCents: integer("sale_price_cents"),
    supplierCostCents: integer("supplier_cost_cents"),
    isTest: boolean("is_test").notNull().default(false),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    soldAt: timestamp("sold_at", { withTimezone: true, mode: "date" }),
    returnedAt: timestamp("returned_at", { withTimezone: true, mode: "date" }),
    errorMessage: text("error_message"),
    failingRule: jsonb("failing_rule").$type<{ group: string; rule: FilterRule } | null>(),
    reconciliationStatus: text("reconciliation_status")
      .$type<ReconciliationStatus>()
      .notNull()
      .default("unreconciled"),
    matchedPaymentIds: jsonb("matched_payment_ids").$type<string[]>().notNull().default([]),
    paymentDueDate: timestamp("payment_due_date", { withTimezone: true, mode: "date" }),
    paidAllocatedCents: integer("paid_allocated_cents").notNull().default(0),
    supplierPaidCents: integer("supplier_paid_cents").notNull().default(0),
  },
  (t) => [
    index("leads_org_received").on(t.organizationId, t.receivedAt),
    index("leads_org_status").on(t.organizationId, t.status),
    index("leads_campaign").on(t.campaignId),
    index("leads_phone").on(t.organizationId, t.normalizedPhone),
    index("leads_email").on(t.organizationId, t.normalizedEmail),
  ]
);

export type LeadEventKind =
  | "received"
  | "validated"
  | "dedupe_checked"
  | "filtered"
  | "routed"
  | "ping_sent"
  | "bid_received"
  | "posted"
  | "accepted"
  | "rejected"
  | "delivered"
  | "revenue_booked"
  | "payment_due"
  | "payment_matched"
  | "supplier_cost_accrued"
  | "supplier_payment_matched"
  | "spend_matched"
  | "returned"
  | "reconciled"
  | "note";

export const leadEvents = pgTable(
  "lead_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    leadId: text("lead_id").notNull(),
    kind: text("kind").$type<LeadEventKind>().notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("lead_events_lead").on(t.leadId)]
);

export type AttemptOutcome = "accepted" | "rejected" | "timeout" | "error";

export const distributionAttempts = pgTable(
  "distribution_attempts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    leadId: text("lead_id").notNull(),
    buyerId: text("buyer_id").notNull(),
    attemptType: text("attempt_type").$type<"ping" | "post" | "delivery">().notNull(),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>().notNull().default({}),
    responsePayload: jsonb("response_payload").$type<Record<string, unknown>>().notNull().default({}),
    responseCode: integer("response_code"),
    bidCents: integer("bid_cents"),
    outcome: text("outcome").$type<AttemptOutcome>().notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    at: timestamp("at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("attempts_lead").on(t.leadId), index("attempts_org_at").on(t.organizationId, t.at)]
);

// ---- Ads and costs ----

export type AdPlatform = "meta" | "google" | "tiktok";
export type Brand = "AAT" | "CMC" | "CAC" | "DontSettle" | "other";
export type SpendPaidStatus = "tracked" | "paid_verified" | "unverified";

export const adAccounts = pgTable("ad_accounts", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  platform: text("platform").$type<AdPlatform>().notNull(),
  accountExtId: text("account_ext_id").notNull(),
  name: text("name").notNull(),
  status: text("status").$type<"connected" | "inactive" | "error">().notNull().default("connected"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true, mode: "date" }),
});

export const adSpendRecords = pgTable(
  "ad_spend_records",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    adAccountId: text("ad_account_id").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD in org timezone
    campaignExtId: text("campaign_ext_id").notNull(),
    campaignName: text("campaign_name").notNull(),
    adsetExtId: text("adset_ext_id").notNull(),
    adsetName: text("adset_name").notNull(),
    adExtId: text("ad_ext_id").notNull(),
    adName: text("ad_name").notNull(),
    spendCents: integer("spend_cents").notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    results: integer("results").notNull().default(0),
    mappedCampaignId: text("mapped_campaign_id"),
    mappedBrand: text("mapped_brand").$type<Brand>(),
    paidStatus: text("paid_status").$type<SpendPaidStatus>().notNull().default("tracked"),
    matchedPaymentId: text("matched_payment_id"),
  },
  (t) => [index("spend_org_date").on(t.organizationId, t.date)]
);

export const spendMappingRules = pgTable("spend_mapping_rules", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  pattern: text("pattern").notNull(),
  matchField: text("match_field").$type<"campaign_name" | "adset_name">().notNull(),
  targetCampaignId: text("target_campaign_id"),
  brand: text("brand").$type<Brand>(),
  active: boolean("active").notNull().default(true),
});

export type CostCategory = "media" | "data" | "software" | "telecom" | "rev_share" | "other";

export const costEntries = pgTable("cost_entries", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  date: text("date").notNull(),
  category: text("category").$type<CostCategory>().notNull(),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  campaignId: text("campaign_id"),
  supplierId: text("supplier_id"),
  recurring: boolean("recurring").notNull().default(false),
  paidStatus: text("paid_status").$type<"accrued" | "paid">().notNull().default("accrued"),
  matchedPaymentId: text("matched_payment_id"),
});

// ---- Invoices and payments ----

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "void";
export type CounterpartyType = "buyer" | "supplier" | "vendor";
export type MoneySource = "stripe" | "mercury" | "xero" | "manual";

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_cents: number;
  amount_cents: number;
}

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    direction: text("direction").$type<"receivable" | "payable">().notNull(),
    counterpartyType: text("counterparty_type").$type<CounterpartyType>().notNull(),
    counterpartyId: text("counterparty_id").notNull(),
    externalRef: text("external_ref"),
    source: text("source").$type<MoneySource>().notNull().default("manual"),
    issueDate: text("issue_date").notNull(),
    dueDate: text("due_date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),
    status: text("status").$type<InvoiceStatus>().notNull().default("sent"),
    lineItems: jsonb("line_items").$type<InvoiceLineItem[]>().notNull().default([]),
    periodStart: text("period_start"),
    periodEnd: text("period_end"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("invoices_org").on(t.organizationId, t.direction)]
);

export type MatchStatus = "unmatched" | "auto_matched" | "manually_matched" | "disputed";

export interface MatchedEntity {
  type: "buyer" | "supplier" | "ad_platform" | "invoice" | "cost";
  id: string;
  period_start?: string;
  period_end?: string;
}

export const paymentRecords = pgTable(
  "payment_records",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    source: text("source").$type<MoneySource>().notNull(),
    externalRef: text("external_ref"),
    date: text("date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    direction: text("direction").$type<"in" | "out">().notNull(),
    counterpartyName: text("counterparty_name").notNull(),
    memo: text("memo"),
    matchedInvoiceId: text("matched_invoice_id"),
    matchedEntity: jsonb("matched_entity").$type<MatchedEntity | null>(),
    matchStatus: text("match_status").$type<MatchStatus>().notNull().default("unmatched"),
    confidence: integer("confidence").notNull().default(0),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("payments_org_date").on(t.organizationId, t.date)]
);

export type PeriodStatus = "open" | "matched" | "variance_flagged" | "resolved";

export const reconciliationPeriods = pgTable(
  "reconciliation_periods",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    counterpartyType: text("counterparty_type").$type<"buyer" | "supplier">().notNull(),
    counterpartyId: text("counterparty_id").notNull(),
    granularity: text("granularity").$type<"week" | "month">().notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    expectedCents: integer("expected_cents").notNull().default(0),
    invoicedCents: integer("invoiced_cents").notNull().default(0),
    paidCents: integer("paid_cents").notNull().default(0),
    varianceCents: integer("variance_cents").notNull().default(0),
    status: text("status").$type<PeriodStatus>().notNull().default("open"),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("recon_period_key").on(
      t.organizationId,
      t.counterpartyType,
      t.counterpartyId,
      t.granularity,
      t.periodStart
    ),
  ]
);

export const matchRules = pgTable("match_rules", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  counterpartyPattern: text("counterparty_pattern").notNull(),
  amountTolerancePct: integer("amount_tolerance_pct").notNull().default(5),
  dateWindowDays: integer("date_window_days").notNull().default(14),
  target: text("target").$type<"buyer" | "supplier" | "ad_platform">().notNull(),
  targetId: text("target_id"),
  active: boolean("active").notNull().default(true),
});

// ---- Action items and insights ----

export type IssueType =
  | "revenue_gap"
  | "payment_overdue"
  | "short_paid"
  | "unmatched_income"
  | "unmatched_cost"
  | "spend_gap"
  | "supplier_cost_gap"
  | "missing_source"
  | "unknown_margin"
  | "zero_sold_spend"
  | "data_quality"
  | "review";

export type ActionPriority = "critical" | "high" | "medium" | "low";
export type ActionStatus = "open" | "in_progress" | "resolved" | "dismissed";

export const actionItems = pgTable(
  "action_items",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    issueType: text("issue_type").$type<IssueType>().notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    entityName: text("entity_name").notNull(),
    priority: text("priority").$type<ActionPriority>().notNull().default("medium"),
    amountAtRiskCents: integer("amount_at_risk_cents"),
    description: text("description").notNull(),
    source: text("source").$type<"truth_engine" | "matching" | "insights" | "manual">().notNull(),
    status: text("status").$type<ActionStatus>().notNull().default("open"),
    ownerUserId: text("owner_user_id"),
    dueDate: text("due_date"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    resolutionNote: text("resolution_note"),
    dedupeKey: text("dedupe_key"),
  },
  (t) => [index("actions_org_status").on(t.organizationId, t.status)]
);

export type InsightType = "anomaly" | "opportunity" | "risk" | "false_profit" | "summary";
export type InsightSeverity = "info" | "warn" | "critical";

export const aiInsights = pgTable("ai_insights", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  type: text("type").$type<InsightType>().notNull(),
  severity: text("severity").$type<InsightSeverity>().notNull().default("info"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  related: jsonb("related").$type<Record<string, unknown>>().notNull().default({}),
  metricSnapshot: jsonb("metric_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").$type<"new" | "acknowledged" | "dismissed">().notNull().default("new"),
  dedupeKey: text("dedupe_key"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  mode?: "claude" | "local";
  charts?: Array<{
    kind: "bar" | "line";
    title: string;
    data: Array<{ label: string; value: number; value2?: number }>;
    series?: [string, string];
  }>;
  at: string;
}

export const aiChatThreads = pgTable("ai_chat_threads", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  messages: jsonb("messages").$type<ChatMessage[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// ---- Platform plumbing ----

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  hashedKey: text("hashed_key").notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  status: text("status").$type<"active" | "revoked">().notNull().default("active"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const webhookSubscriptions = pgTable("webhook_subscriptions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  url: text("url").notNull(),
  events: jsonb("events").$type<string[]>().notNull().default([]),
  signingSecret: text("signing_secret").notNull(),
  status: text("status").$type<"active" | "paused">().notNull().default("active"),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  event: text("event").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  responseCode: integer("response_code"),
  attempts: integer("attempts").notNull().default(0),
  status: text("status").$type<"pending" | "delivered" | "failed">().notNull().default("pending"),
  at: timestamp("at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export type AutomationTrigger =
  | "lead_sold"
  | "lead_rejected"
  | "lead_error"
  | "lead_unmatched"
  | "buyer_cap_hit"
  | "supplier_error_spike"
  | "payment_received"
  | "invoice_overdue"
  | "variance_flagged"
  | "short_paid"
  | "action_item_created"
  | "insight_created"
  | "daily_summary";

export interface AutomationAction {
  kind:
    | "webhook"
    | "email"
    | "slack"
    | "update_lead_field"
    | "pause_buyer"
    | "pause_campaign"
    | "create_action_item";
  config: Record<string, unknown>;
}

export const automations = pgTable("automations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  trigger: text("trigger").$type<AutomationTrigger>().notNull(),
  conditions: jsonb("conditions").$type<InboundFilters | null>(),
  actions: jsonb("actions").$type<AutomationAction[]>().notNull().default([]),
  status: text("status").$type<"enabled" | "disabled">().notNull().default("enabled"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: "date" }),
});

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    automationId: text("automation_id").notNull(),
    triggerPayload: jsonb("trigger_payload").$type<Record<string, unknown>>().notNull().default({}),
    results: jsonb("results").$type<Array<Record<string, unknown>>>().notNull().default([]),
    status: text("status").$type<"success" | "partial" | "failed" | "skipped">().notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    at: timestamp("at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("automation_runs_org").on(t.organizationId, t.at)]
);

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),
  readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
  at: timestamp("at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export type ConnectorProvider =
  | "lead_ingestion"
  | "buyer_feedback"
  | "meta_ads"
  | "google_ads"
  | "tiktok_ads"
  | "stripe"
  | "mercury"
  | "xero"
  | "supplier_statements"
  | "slack";

export const connectorStatuses = pgTable(
  "connector_statuses",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    provider: text("provider").$type<ConnectorProvider>().notNull(),
    status: text("status").$type<"active" | "inactive" | "error">().notNull().default("inactive"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true, mode: "date" }),
    coveragePct: integer("coverage_pct").notNull().default(0),
    notes: text("notes"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [uniqueIndex("connector_org_provider").on(t.organizationId, t.provider)]
);

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id"),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  diff: jsonb("diff").$type<Record<string, unknown>>().notNull().default({}),
  at: timestamp("at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// CAPI event log
export const capiEvents = pgTable(
  "capi_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    leadId: text("lead_id").notNull(),
    eventName: text("event_name").$type<"Lead" | "Purchase">().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    response: jsonb("response").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").$type<"sent" | "mock_logged" | "failed">().notNull(),
    at: timestamp("at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("capi_org_at").on(t.organizationId, t.at)]
);

// Saved custom reports and scheduled briefs
export const savedReports = pgTable("saved_reports", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  kind: text("kind").$type<"custom" | "brief">().notNull().default("custom"),
  schedule: text("schedule"),
  lastRenderedAt: timestamp("last_rendered_at", { withTimezone: true, mode: "date" }),
  lastRenderedBody: text("last_rendered_body"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// Round robin cursor per campaign
export const routingCursors = pgTable("routing_cursors", {
  campaignId: text("campaign_id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  lastBuyerId: text("last_buyer_id"),
});

// ---- AI model providers (Settings > AI Models) ----

export type AiProviderKind = "anthropic" | "openai" | "grok" | "gemini";

export const aiProviders = pgTable(
  "ai_providers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    provider: text("provider").$type<AiProviderKind>().notNull(),
    apiKey: text("api_key").notNull().default(""),
    model: text("model").notNull(),
    baseUrl: text("base_url"),
    status: text("status").$type<"connected" | "error" | "disconnected">().notNull().default("disconnected"),
    active: boolean("active").notNull().default(false),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true, mode: "date" }),
    note: text("note"),
  },
  (t) => [uniqueIndex("ai_providers_org_provider").on(t.organizationId, t.provider)]
);

// ---- Ad platform integration assets (businesses, ad accounts, pages, lead forms) ----

export type IntegrationAssetKind = "business" | "ad_account" | "page" | "lead_form";

export const integrationAssets = pgTable(
  "integration_assets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    platform: text("platform").$type<AdPlatform>().notNull(),
    kind: text("kind").$type<IntegrationAssetKind>().notNull(),
    extId: text("ext_id").notNull(),
    name: text("name").notNull(),
    parentExtId: text("parent_ext_id"),
    mappedCampaignId: text("mapped_campaign_id"),
    enabled: boolean("enabled").notNull().default(false),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("integration_assets_key").on(t.organizationId, t.platform, t.kind, t.extId),
    index("integration_assets_org").on(t.organizationId, t.platform),
  ]
);

// ---- Custom report pages (Reports rebuild + partner portals) ----

export type ReportPageKind =
  | "overview"
  | "daily"
  | "buyer"
  | "supplier"
  | "campaign"
  | "quality"
  | "custom";

export type ReportFieldOperator =
  | "within_days"
  | "equals"
  | "not_equals"
  | "in"
  | "contains"
  | "gt"
  | "lt"
  | "exists";

export interface ReportFieldFilter {
  id: string;
  label: string;
  field: string; // lead field_data key, or "state"
  operator: ReportFieldOperator;
  value?: string | number | string[];
  enabled: boolean;
}

export interface ReportCustomMetric {
  id: string; // custom_ prefix
  label: string;
  formula: string; // expression over base metric ids, e.g. "revenue / sold_leads"
  format: "money" | "number" | "pct";
}

export interface ReportWidget {
  id: string;
  type: "state_table" | "daily_table" | "buyer_table" | "supplier_table" | "campaign_table" | "truth_chart" | "funnel";
  title?: string;
  metrics?: string[]; // metric columns for tables
  limit?: number;
}

export interface ReportPageConfig {
  cards: string[]; // metric ids (base or custom)
  widgets: ReportWidget[];
  filters: ReportFieldFilter[];
  customMetrics: ReportCustomMetric[];
}

export const reportPages = pgTable(
  "report_pages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    kind: text("kind").$type<ReportPageKind>().notNull().default("custom"),
    description: text("description"),
    entityType: text("entity_type").$type<"buyer" | "supplier" | "campaign" | null>(),
    entityId: text("entity_id"),
    config: jsonb("config").$type<ReportPageConfig>().notNull(),
    portalVisible: boolean("portal_visible").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("report_pages_org_slug").on(t.organizationId, t.slug)]
);

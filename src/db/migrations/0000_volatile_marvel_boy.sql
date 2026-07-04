CREATE TABLE "action_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"issue_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_name" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"amount_at_risk_cents" integer,
	"description" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"owner_user_id" text,
	"due_date" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"dedupe_key" text
);
--> statement-breakpoint
CREATE TABLE "ad_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" text NOT NULL,
	"account_ext_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_sync_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ad_spend_records" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"ad_account_id" text NOT NULL,
	"date" text NOT NULL,
	"campaign_ext_id" text NOT NULL,
	"campaign_name" text NOT NULL,
	"adset_ext_id" text NOT NULL,
	"adset_name" text NOT NULL,
	"ad_ext_id" text NOT NULL,
	"ad_name" text NOT NULL,
	"spend_cents" integer NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"results" integer DEFAULT 0 NOT NULL,
	"mapped_campaign_id" text,
	"mapped_brand" text,
	"paid_status" text DEFAULT 'tracked' NOT NULL,
	"matched_payment_id" text
);
--> statement-breakpoint
CREATE TABLE "ai_chat_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"related" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metric_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"hashed_key" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"diff" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"automation_id" text NOT NULL,
	"trigger_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"conditions" jsonb,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'enabled' NOT NULL,
	"last_run_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "buyers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"delivery_config" jsonb NOT NULL,
	"caps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"filters" jsonb,
	"schedule" jsonb,
	"price_default_cents" integer DEFAULT 0 NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"portal_access" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_buyers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"buyer_id" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"price_override_cents" integer,
	"caps_override" jsonb,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"vertical" text DEFAULT 'other' NOT NULL,
	"type" text DEFAULT 'direct_post' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"distribution_method" text DEFAULT 'priority' NOT NULL,
	"field_mapping" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inbound_filters" jsonb,
	"dedupe_window_days" integer DEFAULT 30 NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"capi_config" jsonb,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capi_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_statuses" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'inactive' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"coverage_pct" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"date" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"campaign_id" text,
	"supplier_id" text,
	"recurring" boolean DEFAULT false NOT NULL,
	"paid_status" text DEFAULT 'accrued' NOT NULL,
	"matched_payment_id" text
);
--> statement-breakpoint
CREATE TABLE "distribution_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"buyer_id" text NOT NULL,
	"attempt_type" text NOT NULL,
	"request_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_code" integer,
	"bid_cents" integer,
	"outcome" text NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"direction" text NOT NULL,
	"counterparty_type" text NOT NULL,
	"counterparty_id" text NOT NULL,
	"external_ref" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"issue_date" text NOT NULL,
	"due_date" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"period_start" text,
	"period_end" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"kind" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"buyer_id" text,
	"external_id" text,
	"status" text DEFAULT 'received' NOT NULL,
	"field_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"normalized_phone" text,
	"normalized_email" text,
	"state" text,
	"ip" text,
	"source_url" text,
	"trusted_form_url" text,
	"jornaya_id" text,
	"ad_meta" jsonb,
	"sale_price_cents" integer,
	"supplier_cost_cents" integer,
	"is_test" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sold_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"error_message" text,
	"failing_rule" jsonb,
	"reconciliation_status" text DEFAULT 'unreconciled' NOT NULL,
	"matched_payment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_due_date" timestamp with time zone,
	"paid_allocated_cents" integer DEFAULT 0 NOT NULL,
	"supplier_paid_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"counterparty_pattern" text NOT NULL,
	"amount_tolerance_pct" integer DEFAULT 5 NOT NULL,
	"date_window_days" integer DEFAULT 14 NOT NULL,
	"target" text NOT NULL,
	"target_id" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"partner_scope" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"plan_tier" text DEFAULT 'starter' NOT NULL,
	"plan_limits" jsonb NOT NULL,
	"white_label" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"variance_threshold_pct" integer DEFAULT 2 NOT NULL,
	"variance_threshold_cents" integer DEFAULT 25000 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payment_records" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"source" text NOT NULL,
	"external_ref" text,
	"date" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"direction" text NOT NULL,
	"counterparty_name" text NOT NULL,
	"memo" text,
	"matched_invoice_id" text,
	"matched_entity" jsonb,
	"match_status" text DEFAULT 'unmatched' NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"counterparty_type" text NOT NULL,
	"counterparty_id" text NOT NULL,
	"granularity" text NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"expected_cents" integer DEFAULT 0 NOT NULL,
	"invoiced_cents" integer DEFAULT 0 NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"variance_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "routing_cursors" (
	"campaign_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"last_buyer_id" text
);
--> statement-breakpoint
CREATE TABLE "saved_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"kind" text DEFAULT 'custom' NOT NULL,
	"schedule" text,
	"last_rendered_at" timestamp with time zone,
	"last_rendered_body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spend_mapping_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"pattern" text NOT NULL,
	"match_field" text NOT NULL,
	"target_campaign_id" text,
	"brand" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"api_key_prefix" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"pricing_model" text DEFAULT 'none' NOT NULL,
	"fixed_price_cents" integer,
	"rev_share_pct" integer,
	"allowed_campaign_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"portal_access" boolean DEFAULT false NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_code" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"url" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signing_secret" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "actions_org_status" ON "action_items" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "spend_org_date" ON "ad_spend_records" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "automation_runs_org" ON "automation_runs" USING btree ("organization_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_buyers_pair" ON "campaign_buyers" USING btree ("campaign_id","buyer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_org_slug" ON "campaigns" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "capi_org_at" ON "capi_events" USING btree ("organization_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_org_provider" ON "connector_statuses" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE INDEX "attempts_lead" ON "distribution_attempts" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "attempts_org_at" ON "distribution_attempts" USING btree ("organization_id","at");--> statement-breakpoint
CREATE INDEX "invoices_org" ON "invoices" USING btree ("organization_id","direction");--> statement-breakpoint
CREATE INDEX "lead_events_lead" ON "lead_events" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "leads_org_received" ON "leads" USING btree ("organization_id","received_at");--> statement-breakpoint
CREATE INDEX "leads_org_status" ON "leads" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "leads_campaign" ON "leads" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "leads_phone" ON "leads" USING btree ("organization_id","normalized_phone");--> statement-breakpoint
CREATE INDEX "leads_email" ON "leads" USING btree ("organization_id","normalized_email");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_org" ON "memberships" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "payments_org_date" ON "payment_records" USING btree ("organization_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "recon_period_key" ON "reconciliation_periods" USING btree ("organization_id","counterparty_type","counterparty_id","granularity","period_start");
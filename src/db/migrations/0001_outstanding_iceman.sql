CREATE TABLE "ai_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"api_key" text DEFAULT '' NOT NULL,
	"model" text NOT NULL,
	"base_url" text,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"last_tested_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "integration_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" text NOT NULL,
	"kind" text NOT NULL,
	"ext_id" text NOT NULL,
	"name" text NOT NULL,
	"parent_ext_id" text,
	"mapped_campaign_id" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" text DEFAULT 'custom' NOT NULL,
	"description" text,
	"entity_type" text,
	"entity_id" text,
	"config" jsonb NOT NULL,
	"portal_visible" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_providers_org_provider" ON "ai_providers" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_assets_key" ON "integration_assets" USING btree ("organization_id","platform","kind","ext_id");--> statement-breakpoint
CREATE INDEX "integration_assets_org" ON "integration_assets" USING btree ("organization_id","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "report_pages_org_slug" ON "report_pages" USING btree ("organization_id","slug");
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { addDays } from "@/lib/transforms";
import { ingestLead } from "./ingest";
import type { AdPlatform, IntegrationAssetKind } from "@/db/schema";

// Ad platform integrations. Two modes:
//  - Real: OAuth browser login against Meta/Google using app credentials the
//    org supplies (client id + secret on the connector config). The callback
//    stores the token and syncs businesses, ad accounts, pages, and lead forms.
//  - Demo: no app credentials needed; one click provisions a realistic asset
//    tree so mapping, toggles, and lead flow are testable end to end offline.

interface AssetSeed {
  kind: IntegrationAssetKind;
  extId: string;
  name: string;
  parentExtId?: string;
  createdAt?: Date;
}

const DEMO_META_ASSETS: AssetSeed[] = [
  { kind: "business", extId: "bm_884215", name: "Legenex Media LLC" },
  { kind: "ad_account", extId: "act_1029384756", name: "Legenex Meta Main", parentExtId: "bm_884215" },
  { kind: "ad_account", extId: "act_5647382910", name: "Legenex Meta Mass Tort", parentExtId: "bm_884215" },
  { kind: "page", extId: "pg_checkacase", name: "Check A Case", parentExtId: "bm_884215" },
  { kind: "page", extId: "pg_accadv", name: "Accident Advocates", parentExtId: "bm_884215" },
  { kind: "page", extId: "pg_cmc", name: "Claim My Compensation", parentExtId: "bm_884215" },
  // Lead forms mirroring a real account's history.
  { kind: "lead_form", extId: "lf_1001", name: "Form Link to DT", parentExtId: "pg_checkacase" },
  { kind: "lead_form", extId: "lf_1002", name: "form v3-copy", parentExtId: "pg_checkacase" },
  { kind: "lead_form", extId: "lf_1003", name: "GHL Logic Form v2", parentExtId: "pg_checkacase" },
  { kind: "lead_form", extId: "lf_1004", name: "Logic Form to GHL (MVA Broad)", parentExtId: "pg_checkacase" },
  { kind: "lead_form", extId: "lf_1005", name: "Logic Form to GHL (Retarget)", parentExtId: "pg_checkacase" },
  { kind: "lead_form", extId: "lf_1006", name: "Logic Form to GHL (Spanish)", parentExtId: "pg_checkacase" },
  { kind: "lead_form", extId: "lf_1007", name: "form v3-TESTING", parentExtId: "pg_checkacase" },
  { kind: "lead_form", extId: "lf_1008", name: "MVA Intake Q3", parentExtId: "pg_accadv" },
  { kind: "lead_form", extId: "lf_1009", name: "MVA Intake Q3 (video)", parentExtId: "pg_accadv" },
  { kind: "lead_form", extId: "lf_1010", name: "Injury Checklist Long Form", parentExtId: "pg_accadv" },
  { kind: "lead_form", extId: "lf_1011", name: "Depo-Provera Screener", parentExtId: "pg_cmc" },
  { kind: "lead_form", extId: "lf_1012", name: "Depo-Provera Screener v2", parentExtId: "pg_cmc" },
  { kind: "lead_form", extId: "lf_1013", name: "Mass Tort General Intake", parentExtId: "pg_cmc" },
  { kind: "lead_form", extId: "lf_1014", name: "CMC Quick Claim", parentExtId: "pg_cmc" },
  { kind: "lead_form", extId: "lf_1015", name: "CMC Quick Claim (dark)", parentExtId: "pg_cmc" },
  { kind: "lead_form", extId: "lf_1016", name: "Legacy Contact Form", parentExtId: "pg_cmc" },
];

export async function connectDemoIntegration(
  organizationId: string,
  platform: AdPlatform
): Promise<{ created: number }> {
  const db = await getDb();
  const seeds = platform === "meta" ? DEMO_META_ASSETS : [
    { kind: "business" as const, extId: `${platform}_mcc_1`, name: `Legenex ${platform === "google" ? "Google MCC" : "TikTok Business"}` },
    { kind: "ad_account" as const, extId: `${platform}-778-221-9034`, name: `Legenex ${platform === "google" ? "Google Ads" : "TikTok Ads"}`, parentExtId: `${platform}_mcc_1` },
  ];

  let created = 0;
  const base = new Date();
  for (const [i, seed] of seeds.entries()) {
    const existing = await db.query.integrationAssets.findFirst({
      where: and(
        eq(schema.integrationAssets.organizationId, organizationId),
        eq(schema.integrationAssets.platform, platform),
        eq(schema.integrationAssets.kind, seed.kind),
        eq(schema.integrationAssets.extId, seed.extId)
      ),
    });
    if (existing) continue;
    await db.insert(schema.integrationAssets).values({
      id: newId("ast"), organizationId, platform,
      kind: seed.kind, extId: seed.extId, name: seed.name,
      parentExtId: seed.parentExtId ?? null, mappedCampaignId: null, enabled: false,
      meta: { demo: true },
      createdAt: addDays(base, -(1000 - i * 7)),
    });
    created++;
  }

  await db
    .update(schema.connectorStatuses)
    .set({ status: "active", lastSyncAt: new Date(), notes: "Demo connection (no app credentials set)" })
    .where(and(
      eq(schema.connectorStatuses.organizationId, organizationId),
      eq(schema.connectorStatuses.provider, `${platform}_ads` as "meta_ads")
    ));

  return { created };
}

export async function disconnectIntegration(organizationId: string, platform: AdPlatform): Promise<void> {
  const db = await getDb();
  await db.delete(schema.integrationAssets).where(and(
    eq(schema.integrationAssets.organizationId, organizationId),
    eq(schema.integrationAssets.platform, platform)
  ));
  const connector = await db.query.connectorStatuses.findFirst({
    where: and(
      eq(schema.connectorStatuses.organizationId, organizationId),
      eq(schema.connectorStatuses.provider, `${platform}_ads` as "meta_ads")
    ),
  });
  if (connector) {
    const config = { ...connector.config };
    delete config.access_token;
    delete config.token_type;
    await db
      .update(schema.connectorStatuses)
      .set({ status: "inactive", notes: "Disconnected", config })
      .where(eq(schema.connectorStatuses.id, connector.id));
  }
}

// Real OAuth: exchange the callback code and sync assets from the Graph API.
export async function completeMetaOAuth(args: {
  organizationId: string;
  code: string;
  redirectUri: string;
  appId: string;
  appSecret: string;
}): Promise<{ ok: boolean; message: string }> {
  const db = await getDb();
  try {
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${args.appId}&client_secret=${args.appSecret}&redirect_uri=${encodeURIComponent(args.redirectUri)}&code=${encodeURIComponent(args.code)}`,
      { signal: AbortSignal.timeout(15000) }
    );
    const tokenBody = (await tokenRes.json()) as { access_token?: string; error?: { message?: string } };
    if (!tokenBody.access_token) {
      return { ok: false, message: tokenBody.error?.message ?? "Token exchange failed" };
    }
    const token = tokenBody.access_token;

    const graph = async (path: string): Promise<Array<Record<string, string>>> => {
      const res = await fetch(`https://graph.facebook.com/v21.0/${path}${path.includes("?") ? "&" : "?"}access_token=${token}&limit=100`, {
        signal: AbortSignal.timeout(20000),
      });
      const body = (await res.json()) as { data?: Array<Record<string, string>> };
      return body.data ?? [];
    };

    const upsert = async (kind: IntegrationAssetKind, extId: string, name: string, parentExtId?: string) => {
      const existing = await db.query.integrationAssets.findFirst({
        where: and(
          eq(schema.integrationAssets.organizationId, args.organizationId),
          eq(schema.integrationAssets.platform, "meta"),
          eq(schema.integrationAssets.kind, kind),
          eq(schema.integrationAssets.extId, extId)
        ),
      });
      if (existing) return;
      await db.insert(schema.integrationAssets).values({
        id: newId("ast"), organizationId: args.organizationId, platform: "meta",
        kind, extId, name, parentExtId: parentExtId ?? null,
        mappedCampaignId: null, enabled: false, meta: {}, createdAt: new Date(),
      });
    };

    for (const b of await graph("me/businesses?fields=id,name")) await upsert("business", b.id, b.name);
    for (const a of await graph("me/adaccounts?fields=id,name")) await upsert("ad_account", a.id, a.name || a.id);
    const pages = await graph("me/accounts?fields=id,name");
    for (const p of pages) {
      await upsert("page", p.id, p.name);
      for (const f of await graph(`${p.id}/leadgen_forms?fields=id,name,created_time`)) {
        await upsert("lead_form", f.id, f.name || f.id, p.id);
      }
    }

    const connector = await db.query.connectorStatuses.findFirst({
      where: and(
        eq(schema.connectorStatuses.organizationId, args.organizationId),
        eq(schema.connectorStatuses.provider, "meta_ads")
      ),
    });
    if (connector) {
      await db
        .update(schema.connectorStatuses)
        .set({
          status: "active", lastSyncAt: new Date(),
          notes: "Connected via Facebook login",
          config: { ...connector.config, access_token: token },
        })
        .where(eq(schema.connectorStatuses.id, connector.id));
    }
    return { ok: true, message: "Meta connected, assets synced" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "OAuth failed" };
  }
}

// Ingest a lead that arrived through a mapped lead form (webhook or simulate).
export async function ingestLeadFormSubmission(args: {
  organizationId: string;
  formExtId: string;
  fields: Record<string, unknown>;
  isTest?: boolean;
}): Promise<{ ok: boolean; message: string; leadId?: string }> {
  const db = await getDb();
  const form = await db.query.integrationAssets.findFirst({
    where: and(
      eq(schema.integrationAssets.organizationId, args.organizationId),
      eq(schema.integrationAssets.kind, "lead_form"),
      eq(schema.integrationAssets.extId, args.formExtId)
    ),
  });
  if (!form) return { ok: false, message: "Unknown lead form" };
  if (!form.enabled || !form.mappedCampaignId) {
    return { ok: false, message: "Form is not enabled or not mapped to a campaign" };
  }
  const campaign = await db.query.campaigns.findFirst({
    where: eq(schema.campaigns.id, form.mappedCampaignId),
  });
  if (!campaign) return { ok: false, message: "Mapped campaign no longer exists" };

  // Lead form traffic attributes to the internal Meta supplier when present.
  const suppliers = await db.query.suppliers.findMany({
    where: eq(schema.suppliers.organizationId, args.organizationId),
  });
  const supplier = suppliers.find((s) => /meta|internal/i.test(s.name)) ?? suppliers[0];
  if (!supplier) return { ok: false, message: "No supplier available for lead form ingest" };

  const result = await ingestLead({
    campaignSlug: campaign.slug,
    apiKey: `__internal__:${supplier.id}`,
    body: {
      ...args.fields,
      utm_source: "facebook",
      utm_medium: "lead_form",
      utm_campaign: form.name,
      platform: "meta",
      ...(args.isTest ? { test: true } : {}),
    },
    ip: null,
  });
  const leadId = typeof result.body.lead_id === "string" ? result.body.lead_id : undefined;
  return {
    ok: result.code < 400,
    message: `Form "${form.name}" ingested into ${campaign.name}: ${String(result.body.status ?? result.code)}`,
    leadId,
  };
}

export function sampleLeadFormFields(): Record<string, unknown> {
  const n = Math.floor(Math.random() * 900) + 100;
  return {
    first_name: "Riley", last_name: `FormLead${n}`,
    phone: `(646) 555-0${n}`, email: `riley.form${n}@example.com`,
    incident_date: "06/22/2026", incident_state: "NY",
    at_fault: "no", attorney_status: "none", injury_type: "whiplash",
    currently_represented: "no", zip: "10001",
    usage_years: 6, diagnosis: "meningioma",
    description: "Submitted through a Facebook lead form",
  };
}

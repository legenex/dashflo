"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FlaskConical, Link2, Search, Settings2, Unplug } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel, Skeleton } from "@/components/ui/primitives";
import { timeAgo, fmtDate } from "@/components/ui/format";
import { act, query } from "@/lib/client-api";

// Ad platform integrations: browser-login OAuth when app credentials are set,
// a one-click demo connection otherwise, and the lead form mapping table that
// pipes Facebook lead forms straight into campaign ingest.

interface PlatformState {
  status: string;
  lastSyncAt: string | null;
  notes: string | null;
  hasAppCredentials: boolean;
  hasToken: boolean;
  appId: string;
  verifyToken: string;
}

interface Asset {
  id: string; kind: string; extId: string; name: string; parentExtId: string | null;
  mappedCampaignId: string | null; enabled: boolean; createdAt: string;
}

interface AssetsData {
  businesses: Asset[];
  adAccounts: Asset[];
  pages: Asset[];
  leadForms: Asset[];
  campaigns: Array<{ id: string; name: string }>;
}

export function IntegrationsClient({
  meta, google, tiktok, appUrl, notice,
}: {
  meta: PlatformState;
  google: PlatformState;
  tiktok: PlatformState;
  appUrl: string;
  notice: string | null;
}) {
  const router = useRouter();
  const [assets, setAssets] = useState<AssetsData | null>(null);
  const [message, setMessage] = useState<string | null>(notice);
  const [showConfig, setShowConfig] = useState<string | null>(null);
  const [config, setConfig] = useState({ app_id: meta.appId, app_secret: "", verify_token: meta.verifyToken });
  const [pageFilter, setPageFilter] = useState("");
  const [search, setSearch] = useState("");
  const [formPage, setFormPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    void query<AssetsData>("integrations.assets", { platform: "meta" }).then(setAssets);
  }, []);
  useEffect(load, [load]);

  const connected = meta.status === "active";
  const pageSize = 8;
  const filteredForms = (assets?.leadForms ?? []).filter((f) => {
    if (pageFilter && f.parentExtId !== pageFilter) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(filteredForms.length / pageSize));
  const visibleForms = filteredForms.slice(formPage * pageSize, (formPage + 1) * pageSize);
  const pageName = (extId: string | null) => assets?.pages.find((p) => p.extId === extId)?.name ?? "";

  const platformCard = (
    key: "meta" | "google" | "tiktok",
    label: string,
    state: PlatformState,
    blurb: string
  ) => (
    <GlassPanel key={key} className="space-y-2 p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${state.status === "active" ? "df-live-dot" : ""}`} style={{ background: state.status === "active" ? "var(--verified)" : "var(--label)" }} />
        <span className="text-sm font-bold text-title">{label}</span>
        <Chip tone={state.status === "active" ? "verified" : "dim"}>{state.status}</Chip>
        {state.hasToken && <Chip tone="accent">OAuth token stored</Chip>}
        <span className="ml-auto text-[10px] text-label">{state.lastSyncAt ? `synced ${timeAgo(state.lastSyncAt)}` : ""}</span>
      </div>
      <p className="text-[11px] leading-relaxed text-label">{blurb}</p>
      {state.notes && <p className="text-[10px] text-label">{state.notes}</p>}
      <div className="flex flex-wrap gap-1.5">
        {key === "meta" && (
          <>
            {state.hasAppCredentials ? (
              <a href="/api/oauth/meta/start">
                <GradientButton className="!px-2.5 !py-1 !text-[10px]"><Link2 size={10} /> Connect with Facebook</GradientButton>
              </a>
            ) : (
              <GradientButton className="!px-2.5 !py-1 !text-[10px]" disabled={busy === key} onClick={async () => {
                setBusy(key);
                const res = await act<{ created?: number }>("integration.connectDemo", { platform: "meta" });
                setBusy(null);
                setMessage(`Demo connection provisioned: ${res.data.created ?? 0} assets (business manager, ad accounts, pages, lead forms). Add app credentials for real Facebook login.`);
                load();
                router.refresh();
              }}>
                <Link2 size={10} /> {busy === key ? "Connecting..." : "Connect (demo mode)"}
              </GradientButton>
            )}
            <GradientButton variant="ghost" className="!px-2.5 !py-1 !text-[10px]" onClick={() => setShowConfig(showConfig === key ? null : key)}>
              <Settings2 size={10} /> App credentials
            </GradientButton>
          </>
        )}
        {key !== "meta" && (
          <GradientButton className="!px-2.5 !py-1 !text-[10px]" disabled={busy === key} onClick={async () => {
            setBusy(key);
            await act("integration.connectDemo", { platform: key });
            setBusy(null);
            setMessage(`${label} demo connection provisioned. Real OAuth wiring mirrors the Meta flow once app credentials exist.`);
            router.refresh();
          }}>
            <Link2 size={10} /> Connect (demo mode)
          </GradientButton>
        )}
        {state.status === "active" && (
          <GradientButton variant="danger" className="!px-2.5 !py-1 !text-[10px]" onClick={async () => {
            await act("integration.disconnect", { platform: key });
            setMessage(`${label} disconnected, assets removed.`);
            load();
            router.refresh();
          }}>
            <Unplug size={10} /> Disconnect
          </GradientButton>
        )}
      </div>
      {showConfig === key && key === "meta" && (
        <div className="space-y-1.5 border-t border-panelborder pt-2">
          <p className="text-[10px] text-label">
            From developers.facebook.com create an app with Marketing API access, add
            <code className="mx-1 text-accent">{appUrl}/api/oauth/meta/callback</code> as a redirect URI, then paste:
          </p>
          <div className="grid gap-1.5 md:grid-cols-3">
            <input placeholder="App ID" className="rounded border border-panelborder bg-elevated px-2 py-1 font-mono-money text-[11px]" value={config.app_id} onChange={(e) => setConfig({ ...config, app_id: e.target.value })} />
            <input placeholder="App Secret" type="password" className="rounded border border-panelborder bg-elevated px-2 py-1 font-mono-money text-[11px]" value={config.app_secret} onChange={(e) => setConfig({ ...config, app_secret: e.target.value })} />
            <input placeholder="Webhook verify token" className="rounded border border-panelborder bg-elevated px-2 py-1 font-mono-money text-[11px]" value={config.verify_token} onChange={(e) => setConfig({ ...config, verify_token: e.target.value })} />
          </div>
          <p className="text-[10px] text-label">
            Leadgen webhook URL: <code className="text-accent">{appUrl}/api/webhooks/meta/leadgen</code>
          </p>
          <GradientButton variant="cyan" className="!px-2 !py-1 !text-[10px]" onClick={async () => {
            await act("integration.config", { platform: "meta", config });
            setMessage("Meta app credentials saved. Connect with Facebook is now live OAuth.");
            router.refresh();
          }}>
            Save credentials
          </GradientButton>
        </div>
      )}
    </GlassPanel>
  );

  return (
    <div className="max-w-5xl space-y-4">
      {message && <GlassPanel className="px-4 py-2.5 text-xs text-accent" glow="accent">{message}</GlassPanel>}

      <div className="grid gap-3 lg:grid-cols-3">
        {platformCard("meta", "Meta (Facebook) Ads", meta, "Business managers, ad accounts, pages, and lead forms via Facebook login. Demo mode provisions a realistic asset tree so everything below is testable without credentials.")}
        {platformCard("google", "Google Ads", google, "Google login plus a developer token unlock account and spend sync. Demo mode provisions an MCC and account.")}
        {platformCard("tiktok", "TikTok Ads", tiktok, "TikTok Business login for ad accounts and spend. Demo mode provisions a business and account.")}
      </div>

      {/* Connected assets */}
      {connected && assets && (
        <div className="grid gap-3 md:grid-cols-3">
          <GlassPanel className="p-3">
            <SectionLabel className="mb-1.5">Business managers</SectionLabel>
            {assets.businesses.map((b) => (
              <div key={b.id} className="flex items-center gap-2 py-1 text-xs text-body">
                <Chip tone="info">BM</Chip>{b.name}
                <span className="ml-auto font-mono-money text-[10px] text-label">{b.extId}</span>
              </div>
            ))}
          </GlassPanel>
          <GlassPanel className="p-3">
            <SectionLabel className="mb-1.5">Ad accounts</SectionLabel>
            {assets.adAccounts.map((a) => (
              <div key={a.id} className="flex items-center gap-2 py-1 text-xs text-body">
                <Chip tone="queued">ad</Chip>{a.name}
                <span className="ml-auto font-mono-money text-[10px] text-label">{a.extId}</span>
              </div>
            ))}
          </GlassPanel>
          <GlassPanel className="p-3">
            <SectionLabel className="mb-1.5">Pages</SectionLabel>
            {assets.pages.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-1 text-xs text-body">
                <Chip tone="verified">pg</Chip>{p.name}
                <span className="ml-auto font-mono-money text-[10px] text-label">{p.extId}</span>
              </div>
            ))}
          </GlassPanel>
        </div>
      )}

      {/* Lead forms */}
      <GlassPanel className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <FileText size={15} className="text-info" />
          <span className="text-sm font-bold text-title">Facebook Lead Forms</span>
        </div>
        <p className="mb-3 text-[11px] text-label">
          Connect your Facebook lead forms to automatically ingest leads into campaigns. Map a form, flip it on, and
          submissions run the full pipeline: validation, dedupe, filters, caps, delivery, and truth.
        </p>

        {!connected ? (
          <p className="py-6 text-center text-xs text-label">Connect Meta above to load lead forms.</p>
        ) : !assets ? (
          <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-2">
              <select className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs text-body" value={pageFilter} onChange={(e) => { setPageFilter(e.target.value); setFormPage(0); }}>
                <option value="">All pages</option>
                {assets.pages.map((p) => <option key={p.extId} value={p.extId}>{p.name}</option>)}
              </select>
              <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-panelborder bg-elevated px-2">
                <Search size={12} className="text-label" />
                <input placeholder="Search forms..." className="w-full bg-transparent py-1.5 text-xs text-body outline-none" value={search} onChange={(e) => { setSearch(e.target.value); setFormPage(0); }} />
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-panelborder">
              <div className="flex border-b border-panelborder bg-[rgba(11,14,35,0.5)] px-3 py-2">
                <span className="df-label flex-1">Form</span>
                <span className="df-label w-44">Campaign</span>
                <span className="df-label hidden w-20 sm:block">Created</span>
                <span className="df-label w-14 text-center">Status</span>
                <span className="df-label w-20 text-right">Actions</span>
              </div>
              {visibleForms.map((f) => (
                <div key={f.id} className="flex items-center border-b border-[rgba(38,43,77,0.4)] px-3 py-2 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-title">{f.name}</div>
                    <div className="text-[10px] text-label">{pageName(f.parentExtId)}</div>
                  </div>
                  <div className="w-44 pr-2">
                    <select
                      className="w-full rounded border border-panelborder bg-elevated px-1.5 py-1 text-[11px] text-body"
                      value={f.mappedCampaignId ?? ""}
                      onChange={async (e) => {
                        await act("leadform.update", { id: f.id, mappedCampaignId: e.target.value || null, ...(e.target.value ? {} : { enabled: false }) });
                        load();
                      }}
                    >
                      <option value="">Not mapped</option>
                      {assets.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <span className="hidden w-20 text-[10px] text-label sm:block">{fmtDate(f.createdAt)}</span>
                  <div className="flex w-14 justify-center">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={f.enabled}
                      title={f.mappedCampaignId ? "Toggle ingestion" : "Map a campaign first"}
                      onClick={async () => {
                        const res = await act("leadform.update", { id: f.id, enabled: !f.enabled });
                        if (!res.ok) setMessage(res.error ?? "Map the form to a campaign first");
                        load();
                      }}
                      className={`h-5 w-9 cursor-pointer rounded-full p-0.5 transition-colors ${f.enabled ? "df-grad-bg" : "bg-[rgba(199,204,230,0.15)]"}`}
                    >
                      <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${f.enabled ? "translate-x-4" : ""}`} />
                    </button>
                  </div>
                  <div className="flex w-20 justify-end">
                    <GradientButton
                      variant="ghost"
                      className="!px-1.5 !py-0.5 !text-[9px]"
                      title="Send a simulated submission through the full pipeline"
                      disabled={!f.enabled}
                      onClick={async () => {
                        const res = await act<{ message?: string; leadId?: string }>("leadform.simulate", { id: f.id });
                        setMessage(res.data.message ?? res.error ?? "");
                        router.refresh();
                      }}
                    >
                      <FlaskConical size={9} /> Test
                    </GradientButton>
                  </div>
                </div>
              ))}
              {visibleForms.length === 0 && <div className="py-6 text-center text-xs text-label">No forms match</div>}
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px] text-label">
              <span>{filteredForms.length} forms</span>
              <span className="flex items-center gap-2">
                <button type="button" className="cursor-pointer px-1 disabled:opacity-30" disabled={formPage === 0} onClick={() => setFormPage(formPage - 1)}>‹</button>
                {formPage + 1} / {pageCount}
                <button type="button" className="cursor-pointer px-1 disabled:opacity-30" disabled={formPage >= pageCount - 1} onClick={() => setFormPage(formPage + 1)}>›</button>
              </span>
            </div>
          </>
        )}
      </GlassPanel>

      <p className="text-[11px] text-label">
        Money feeds (Stripe, Mercury, Xero) and CSV imports stay in Data Sources. This page is demand-side plumbing:
        where leads and spend come from.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Upload, Plus, Trash2 } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel } from "@/components/ui/primitives";
import { fmtCents } from "@/lib/money";
import { timeAgo } from "@/components/ui/format";
import { act } from "@/lib/client-api";

// The connector hub. Toggling a source inactive flips downstream metrics to
// Needs Source everywhere, which is the whole point of the truth gating.

interface Connector {
  provider: string; status: string; lastSyncAt: string | null;
  coveragePct: number; notes: string | null; impact: string;
}

const CARDS: Array<{ provider: string; title: string; group: "ads" | "money" | "ops"; blurb: string; csv?: "spend" | "payments" }> = [
  { provider: "meta_ads", title: "Meta Ads", group: "ads", blurb: "Ad-level spend across accounts, feeds media cost tracked.", csv: "spend" },
  { provider: "google_ads", title: "Google Ads", group: "ads", blurb: "Search spend. Inactive means Google-attributed media shows Needs Source.", csv: "spend" },
  { provider: "tiktok_ads", title: "TikTok Ads", group: "ads", blurb: "Short-form spend, same gating rules.", csv: "spend" },
  { provider: "stripe", title: "Stripe", group: "money", blurb: "Buyer remittances. Powers verified income and payment chips.", csv: "payments" },
  { provider: "mercury", title: "Mercury", group: "money", blurb: "Operating bank feed. Verifies ad spend outflows and supplier payouts.", csv: "payments" },
  { provider: "xero", title: "Xero", group: "money", blurb: "Invoices and bills, receivables aging.", csv: "payments" },
  { provider: "slack", title: "Slack", group: "ops", blurb: "Automation alerts to your channel." },
  { provider: "supplier_statements", title: "Supplier Statements", group: "ops", blurb: "Upload statements to verify supplier cost accruals." },
  { provider: "lead_ingestion", title: "Lead Ingestion", group: "ops", blurb: "Supplier POST endpoints." },
  { provider: "buyer_feedback", title: "Buyer Feedback", group: "ops", blurb: "Dispositions from delivery responses." },
];

export function DataSourcesClient({
  connectors,
  rules,
  unmapped,
  campaigns,
}: {
  connectors: Connector[];
  rules: Array<{ id: string; pattern: string; matchField: string; targetCampaignId: string | null; brand: string | null; active: boolean }>;
  unmapped: Array<{ name: string; spendCents: number; rows: number }>;
  campaigns: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<Array<Record<string, string>> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newRule, setNewRule] = useState({ pattern: "", matchField: "campaign_name", targetCampaignId: "", brand: "other" });
  const [slackUrl, setSlackUrl] = useState("");

  const byProvider = new Map(connectors.map((c) => [c.provider, c]));

  const toggle = async (provider: string, current: string) => {
    setBusy(provider);
    await act("connector.toggle", { provider, status: current === "active" ? "inactive" : "active" });
    setBusy(null);
    setMessage(
      current === "active"
        ? `${provider} deactivated. Downstream metrics now show Needs Source, check the Overview.`
        : `${provider} activated. Verification restored.`
    );
    router.refresh();
  };

  const parseCsv = (text: string): Array<Record<string, string>> => {
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const cells = line.split(",");
      return Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()]));
    });
  };

  const importCsv = async (provider: string, kind: "spend" | "payments") => {
    const rows = parseCsv(csvText);
    if (kind === "spend") {
      const platform = provider.replace("_ads", "") as "meta" | "google" | "tiktok";
      const res = await act<{ imported?: number }>("spend.importCsv", {
        platform,
        rows: rows.map((r) => ({
          date: r.date, campaign_name: r.campaign_name ?? r.campaign ?? "",
          adset_name: r.adset_name ?? r.adset ?? "", ad_name: r.ad_name ?? r.ad ?? "",
          spend: Number(r.spend ?? r.amount ?? 0),
          impressions: Number(r.impressions ?? 0), clicks: Number(r.clicks ?? 0),
        })),
      });
      setMessage(res.ok ? `Imported ${res.data.imported} spend rows. Apply mapping rules to attribute them.` : res.error ?? "Failed");
    } else {
      const source = provider as "stripe" | "mercury" | "xero";
      const res = await act<{ imported?: number; auto_matched?: number }>("payments.importCsv", {
        source,
        rows: rows.map((r) => ({
          date: r.date, amount: Number(r.amount ?? 0),
          direction: (r.direction === "out" ? "out" : "in") as "in" | "out",
          counterparty: r.counterparty ?? r.name ?? "", memo: r.memo ?? "", external_ref: r.external_ref ?? r.ref ?? "",
        })),
      });
      setMessage(res.ok ? `Imported ${res.data.imported} payments, auto-matched ${res.data.auto_matched}.` : res.error ?? "Failed");
    }
    setCsvOpen(null);
    setCsvText("");
    setCsvPreview(null);
    router.refresh();
  };

  const group = (g: string) => CARDS.filter((c) => c.group === g);

  return (
    <div className="space-y-4">
      {message && (
        <GlassPanel className="px-4 py-2.5 text-xs text-accent" glow="accent">{message}</GlassPanel>
      )}

      {(["money", "ads", "ops"] as const).map((g) => (
        <div key={g}>
          <SectionLabel className="mb-2">{g === "money" ? "Money sources" : g === "ads" ? "Ad platforms" : "Operations"}</SectionLabel>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group(g).map((card) => {
              const c = byProvider.get(card.provider);
              const active = c?.status === "active";
              return (
                <GlassPanel key={card.provider} className="flex flex-col gap-2 p-4" glow={active ? undefined : "warning"}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${active ? "df-live-dot" : ""}`} style={{ background: active ? "var(--verified)" : "var(--label)" }} />
                    <span className="text-sm font-bold text-title">{card.title}</span>
                    <Chip tone={active ? "verified" : "dim"}>{c?.status ?? "inactive"}</Chip>
                    <span className="ml-auto text-[10px] text-label">{c?.lastSyncAt ? `synced ${timeAgo(c.lastSyncAt)}` : "never synced"}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-label">{card.blurb}</p>
                  {!active && <p className="text-[11px] font-semibold text-warning">{c?.impact}</p>}
                  {active && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(199,204,230,0.1)]">
                      <div className="h-full rounded-full bg-[var(--cyan)]" style={{ width: `${c?.coveragePct ?? 0}%` }} />
                    </div>
                  )}
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    <GradientButton
                      variant={active ? "danger" : "primary"}
                      className="!px-2.5 !py-1 !text-[10px]"
                      disabled={busy === card.provider}
                      onClick={() => void toggle(card.provider, c?.status ?? "inactive")}
                    >
                      {active ? "Deactivate" : "Connect"}
                    </GradientButton>
                    {active && (
                      <GradientButton variant="ghost" className="!px-2.5 !py-1 !text-[10px]" disabled={busy === card.provider} onClick={async () => {
                        setBusy(card.provider);
                        const res = await act<{ auto_matched?: number }>("connector.sync", { provider: card.provider });
                        setBusy(null);
                        setMessage(`Synced ${card.provider}. Auto-matched ${res.data.auto_matched ?? 0} payments.`);
                        router.refresh();
                      }}>
                        <RefreshCw size={10} /> Sync now
                      </GradientButton>
                    )}
                    {card.csv && (
                      <GradientButton variant="ghost" className="!px-2.5 !py-1 !text-[10px]" onClick={() => setCsvOpen(csvOpen === card.provider ? null : card.provider)}>
                        <Upload size={10} /> CSV import
                      </GradientButton>
                    )}
                    {card.provider === "slack" && (
                      <span className="flex w-full items-center gap-1.5">
                        <input placeholder="https://hooks.slack.com/..." className="min-w-0 flex-1 rounded border border-panelborder bg-elevated px-2 py-1 text-[10px] text-body" value={slackUrl} onChange={(e) => setSlackUrl(e.target.value)} />
                        <GradientButton variant="ghost" className="!px-2 !py-1 !text-[10px]" onClick={async () => {
                          const res = await act<{ delivered?: boolean; note?: string }>("slack.test", slackUrl ? { webhookUrl: slackUrl } : {});
                          setMessage(res.data.delivered ? "Slack test delivered." : res.data.note ?? "Test logged to console.");
                        }}>
                          Test
                        </GradientButton>
                      </span>
                    )}
                  </div>
                  {csvOpen === card.provider && card.csv && (
                    <div className="space-y-2 border-t border-panelborder pt-2">
                      <p className="text-[10px] text-label">
                        {card.csv === "spend"
                          ? "Columns: date, campaign_name, adset_name, ad_name, spend, impressions, clicks"
                          : "Columns: date, amount, direction (in/out), counterparty, memo, external_ref"}
                      </p>
                      <textarea
                        className="h-24 w-full rounded border border-panelborder bg-[#070a1c] p-2 font-mono-money text-[10px] text-body"
                        placeholder="Paste CSV here..."
                        value={csvText}
                        onChange={(e) => {
                          setCsvText(e.target.value);
                          try {
                            setCsvPreview(e.target.value.trim() ? parseCsv(e.target.value).slice(0, 3) : null);
                          } catch {
                            setCsvPreview(null);
                          }
                        }}
                      />
                      {csvPreview && csvPreview.length > 0 && (
                        <div className="rounded border border-panelborder bg-[rgba(11,14,35,0.5)] p-2 text-[10px] text-label">
                          Preview: {csvPreview.length} of first rows parsed, columns {Object.keys(csvPreview[0]).join(", ")}
                        </div>
                      )}
                      <GradientButton className="!px-2.5 !py-1 !text-[10px]" disabled={!csvText.trim()} onClick={() => void importCsv(card.provider, card.csv as "spend" | "payments")}>
                        Import
                      </GradientButton>
                    </div>
                  )}
                </GlassPanel>
              );
            })}
          </div>
        </div>
      ))}

      {/* Spend mapping rules + unmapped queue */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel className="space-y-2 p-4">
          <SectionLabel>Spend name-pattern mapping rules</SectionLabel>
          {rules.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded border border-panelborder px-2.5 py-1.5 text-xs">
              <code className="text-accent">{r.pattern}</code>
              <span className="text-label">on {r.matchField.replace("_", " ")}</span>
              <Chip tone="neutral">{campaigns.find((c) => c.id === r.targetCampaignId)?.name ?? "no campaign"}</Chip>
              {r.brand && <Chip tone="queued">{r.brand}</Chip>}
              <button type="button" className="ml-auto cursor-pointer p-1 text-label hover:text-danger" onClick={async () => {
                await act("spend.ruleDelete", { id: r.id });
                router.refresh();
              }} aria-label="Delete rule">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5">
            <input placeholder="pattern (regex)" className="w-32 rounded border border-panelborder bg-elevated px-2 py-1 font-mono-money text-[11px]" value={newRule.pattern} onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })} />
            <select className="rounded border border-panelborder bg-elevated px-2 py-1 text-[11px]" value={newRule.targetCampaignId} onChange={(e) => setNewRule({ ...newRule, targetCampaignId: e.target.value })}>
              <option value="">campaign...</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="rounded border border-panelborder bg-elevated px-2 py-1 text-[11px]" value={newRule.brand} onChange={(e) => setNewRule({ ...newRule, brand: e.target.value })}>
              {["AAT", "CMC", "CAC", "DontSettle", "other"].map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <GradientButton variant="ghost" className="!px-2 !py-1 !text-[10px]" disabled={!newRule.pattern || !newRule.targetCampaignId} onClick={async () => {
              await act("spend.ruleSave", { ...newRule, matchField: "campaign_name", active: true });
              setNewRule({ pattern: "", matchField: "campaign_name", targetCampaignId: "", brand: "other" });
              router.refresh();
            }}>
              <Plus size={10} /> Add
            </GradientButton>
            <GradientButton variant="cyan" className="!px-2 !py-1 !text-[10px]" onClick={async () => {
              const res = await act<{ mapped?: number }>("spend.applyRules");
              setMessage(`Mapping rules applied to ${res.data.mapped ?? 0} spend rows.`);
              router.refresh();
            }}>
              Apply rules now
            </GradientButton>
          </div>
        </GlassPanel>

        <GlassPanel className="space-y-2 p-4">
          <SectionLabel>Unmapped spend queue</SectionLabel>
          {unmapped.length === 0 ? (
            <p className="text-xs text-label">Every spend row is mapped to a campaign. True CPL is trustworthy.</p>
          ) : (
            unmapped.map((u) => (
              <div key={u.name} className="flex items-center gap-2 rounded border border-panelborder px-2.5 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate font-semibold text-title">{u.name}</span>
                <span className="font-mono-money text-unmatched">{fmtCents(u.spendCents)}</span>
                <span className="text-[10px] text-label">{u.rows} rows</span>
                <Chip tone="unmatched">unmapped</Chip>
              </div>
            ))
          )}
          {unmapped.length > 0 && (
            <p className="text-[10px] text-label">Add a pattern rule on the left, then Apply rules now. Unmapped spend never silently counts as zero.</p>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Play, Trash2, ChevronDown } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel, EmptyState } from "@/components/ui/primitives";
import { timeAgo, fmtDateTime } from "@/components/ui/format";
import { act } from "@/lib/client-api";
import type { AutomationAction, InboundFilters } from "@/db/schema";

const TRIGGERS = [
  "lead_sold", "lead_rejected", "lead_error", "lead_unmatched", "buyer_cap_hit",
  "supplier_error_spike", "payment_received", "invoice_overdue", "variance_flagged",
  "short_paid", "action_item_created", "insight_created", "daily_summary",
];

const ACTION_KINDS = [
  { id: "slack", label: "Slack message" },
  { id: "email", label: "Email (stub + notification)" },
  { id: "webhook", label: "Webhook POST" },
  { id: "update_lead_field", label: "Update lead field" },
  { id: "pause_buyer", label: "Pause buyer" },
  { id: "pause_campaign", label: "Pause campaign" },
  { id: "create_action_item", label: "Create action item" },
];

interface Automation {
  id: string; name: string; trigger: string; conditions: InboundFilters | null;
  actions: AutomationAction[]; status: string; lastRunAt: string | null;
}

interface Run {
  id: string; automation: string; triggerPayload: Record<string, unknown>;
  results: Array<Record<string, unknown>>; status: string; durationMs: number; at: string;
}

export function AutomationsClient({
  automations, runs, buyers, campaigns,
}: {
  automations: Automation[];
  runs: Run[];
  buyers: Array<{ id: string; name: string }>;
  campaigns: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [showBuilder, setShowBuilder] = useState(false);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", trigger: "lead_sold",
    actionKind: "slack", actionConfig: { message: "", url: "", body: "", to: "", subject: "", field: "", value: "", buyer_id: "", campaign_id: "", description: "" },
    conditionField: "", conditionOperator: "gt", conditionValue: "",
  });

  const saveAutomation = async () => {
    const config: Record<string, unknown> = {};
    const c = form.actionConfig;
    if (form.actionKind === "slack") config.message = c.message;
    if (form.actionKind === "email") Object.assign(config, { to: c.to, subject: c.subject, body: c.body });
    if (form.actionKind === "webhook") Object.assign(config, { url: c.url, body: c.body || "{}" });
    if (form.actionKind === "update_lead_field") Object.assign(config, { field: c.field, value: c.value });
    if (form.actionKind === "pause_buyer") config.buyer_id = c.buyer_id;
    if (form.actionKind === "pause_campaign") config.campaign_id = c.campaign_id;
    if (form.actionKind === "create_action_item") config.description = c.description;

    const conditions = form.conditionField
      ? {
          logic: "and" as const,
          groups: [{
            id: "g1", logic: "and" as const,
            rules: [{ field: form.conditionField, operator: form.conditionOperator as "gt", value: isNaN(Number(form.conditionValue)) ? form.conditionValue : Number(form.conditionValue) }],
          }],
        }
      : null;

    await act("automation.save", {
      name: form.name, trigger: form.trigger, conditions,
      actions: [{ kind: form.actionKind, config }], status: "enabled",
    });
    setShowBuilder(false);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-title">Automations</h1>
          <p className="text-xs text-label">When something happens, do something. Conditions use the same rule engine as campaign filters.</p>
        </div>
        <GradientButton onClick={() => setShowBuilder((s) => !s)}><Plus size={14} /> New Automation</GradientButton>
      </div>

      {showBuilder && (
        <GlassPanel className="df-gradient-border space-y-3 p-4">
          <div className="grid gap-2 md:grid-cols-3">
            <input placeholder="Name" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs text-title" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs text-body" value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })}>
              {TRIGGERS.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
            <select className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs text-body" value={form.actionKind} onChange={(e) => setForm({ ...form, actionKind: e.target.value })}>
              {ACTION_KINDS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <SectionLabel className="md:col-span-3">Condition on the trigger payload (optional)</SectionLabel>
            <input placeholder="field (e.g. price_cents)" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 font-mono-money text-xs" value={form.conditionField} onChange={(e) => setForm({ ...form, conditionField: e.target.value })} />
            <select className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.conditionOperator} onChange={(e) => setForm({ ...form, conditionOperator: e.target.value })}>
              {["equals", "not_equals", "contains", "gt", "lt", "gte", "lte", "exists"].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <input placeholder="value" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.conditionValue} onChange={(e) => setForm({ ...form, conditionValue: e.target.value })} />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <SectionLabel className="md:col-span-2">Action config (tokens like {"{{buyer}}"} render from the payload)</SectionLabel>
            {form.actionKind === "slack" && (
              <input placeholder="Message, e.g. {{buyer}} sold at {{price_cents}}" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs md:col-span-2" value={form.actionConfig.message} onChange={(e) => setForm({ ...form, actionConfig: { ...form.actionConfig, message: e.target.value } })} />
            )}
            {form.actionKind === "email" && (
              <>
                <input placeholder="To" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.actionConfig.to} onChange={(e) => setForm({ ...form, actionConfig: { ...form.actionConfig, to: e.target.value } })} />
                <input placeholder="Subject" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.actionConfig.subject} onChange={(e) => setForm({ ...form, actionConfig: { ...form.actionConfig, subject: e.target.value } })} />
                <input placeholder="Body" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs md:col-span-2" value={form.actionConfig.body} onChange={(e) => setForm({ ...form, actionConfig: { ...form.actionConfig, body: e.target.value } })} />
              </>
            )}
            {form.actionKind === "webhook" && (
              <>
                <input placeholder="URL" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.actionConfig.url} onChange={(e) => setForm({ ...form, actionConfig: { ...form.actionConfig, url: e.target.value } })} />
                <input placeholder='Body template, e.g. {"lead":"{{lead_id}}"}' className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 font-mono-money text-xs" value={form.actionConfig.body} onChange={(e) => setForm({ ...form, actionConfig: { ...form.actionConfig, body: e.target.value } })} />
              </>
            )}
            {form.actionKind === "update_lead_field" && (
              <>
                <input placeholder="Field" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.actionConfig.field} onChange={(e) => setForm({ ...form, actionConfig: { ...form.actionConfig, field: e.target.value } })} />
                <input placeholder="Value" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.actionConfig.value} onChange={(e) => setForm({ ...form, actionConfig: { ...form.actionConfig, value: e.target.value } })} />
              </>
            )}
            {form.actionKind === "pause_buyer" && (
              <select className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.actionConfig.buyer_id} onChange={(e) => setForm({ ...form, actionConfig: { ...form.actionConfig, buyer_id: e.target.value } })}>
                <option value="">Buyer from payload</option>
                {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            {form.actionKind === "pause_campaign" && (
              <select className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.actionConfig.campaign_id} onChange={(e) => setForm({ ...form, actionConfig: { ...form.actionConfig, campaign_id: e.target.value } })}>
                <option value="">Campaign from payload</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {form.actionKind === "create_action_item" && (
              <input placeholder="Description template" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs md:col-span-2" value={form.actionConfig.description} onChange={(e) => setForm({ ...form, actionConfig: { ...form.actionConfig, description: e.target.value } })} />
            )}
          </div>
          <GradientButton disabled={!form.name} onClick={() => void saveAutomation()}>Save automation</GradientButton>
        </GlassPanel>
      )}

      <div className="space-y-2">
        {automations.map((a) => (
          <GlassPanel key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="text-sm font-semibold text-title">{a.name}</span>
            <Chip tone="info">on {a.trigger.replace(/_/g, " ")}</Chip>
            {a.actions.map((action, i) => <Chip key={i} tone="queued">{action.kind.replace(/_/g, " ")}</Chip>)}
            {a.conditions && <Chip tone="neutral">conditional</Chip>}
            <span className="text-[10px] text-label">{a.lastRunAt ? `last run ${timeAgo(a.lastRunAt)}` : "never run"}</span>
            <span className="ml-auto flex items-center gap-1.5">
              <GradientButton variant="ghost" className="!px-2 !py-1 !text-[10px]" onClick={async () => {
                await act("automation.test", { id: a.id });
                router.refresh();
              }}>
                <Play size={10} /> Test
              </GradientButton>
              <button
                type="button"
                role="switch"
                aria-checked={a.status === "enabled"}
                onClick={async () => {
                  await act("automation.status", { id: a.id, status: a.status === "enabled" ? "disabled" : "enabled" });
                  router.refresh();
                }}
                className={`h-5 w-9 cursor-pointer rounded-full p-0.5 transition-colors ${a.status === "enabled" ? "df-grad-bg" : "bg-[rgba(199,204,230,0.15)]"}`}
              >
                <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${a.status === "enabled" ? "translate-x-4" : ""}`} />
              </button>
              <button type="button" className="cursor-pointer p-1 text-label hover:text-danger" onClick={async () => {
                await act("automation.delete", { id: a.id });
                router.refresh();
              }} aria-label="Delete automation">
                <Trash2 size={13} />
              </button>
            </span>
          </GlassPanel>
        ))}
      </div>

      <div>
        <SectionLabel className="mb-2">Run log ({runs.length})</SectionLabel>
        {runs.length === 0 ? (
          <GlassPanel><EmptyState title="No runs yet" hint="Automations log every execution with payload, results, and duration." /></GlassPanel>
        ) : (
          <GlassPanel className="divide-y divide-[rgba(38,43,77,0.5)]">
            {runs.map((r) => (
              <div key={r.id}>
                <button type="button" className="flex w-full cursor-pointer flex-wrap items-center gap-3 px-3 py-2 text-left hover:bg-[rgba(26,31,66,0.4)]" onClick={() => setOpenRun(openRun === r.id ? null : r.id)}>
                  <span className="text-xs font-semibold text-title">{r.automation}</span>
                  <Chip tone={r.status === "success" ? "verified" : r.status === "skipped" ? "dim" : r.status === "partial" ? "warning" : "danger"}>{r.status}</Chip>
                  <span className="font-mono-money text-[10px] text-label">{r.durationMs}ms</span>
                  <span className="ml-auto text-[10px] text-label">{fmtDateTime(r.at)}</span>
                  <ChevronDown size={12} className={`text-label ${openRun === r.id ? "rotate-180" : ""}`} />
                </button>
                {openRun === r.id && (
                  <div className="grid gap-2 border-t border-panelborder bg-[rgba(11,14,35,0.5)] p-3 md:grid-cols-2">
                    <div>
                      <SectionLabel className="mb-1">Trigger payload</SectionLabel>
                      <pre className="max-h-40 overflow-auto rounded bg-[#070a1c] p-2 text-[10px] text-body">{JSON.stringify(r.triggerPayload, null, 2)}</pre>
                    </div>
                    <div>
                      <SectionLabel className="mb-1">Results</SectionLabel>
                      <pre className="max-h-40 overflow-auto rounded bg-[#070a1c] p-2 text-[10px] text-body">{JSON.stringify(r.results, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </GlassPanel>
        )}
      </div>
    </div>
  );
}

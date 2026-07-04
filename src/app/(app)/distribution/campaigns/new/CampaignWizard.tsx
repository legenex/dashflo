"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FlaskConical, Check } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel } from "@/components/ui/primitives";
import { act } from "@/lib/client-api";
import type { FieldDef, FilterGroup, InboundFilters } from "@/db/schema";

// New Campaign wizard: Basics, Field Mapping (library + MVA legal set),
// Inbound Filters (visual AND/OR builder, CO suppression template, state
// allowlist shortcut, schedules), Attach Buyers, Attach Suppliers, Test,
// Activate.

const STEPS = ["Basics", "Field Mapping", "Inbound Filters", "Attach Buyers", "Attach Suppliers", "Test & Activate"];

const MVA_LEGAL_SET: FieldDef[] = [
  { key: "first_name", label: "First Name", type: "text", required: true, transforms: ["trim"] },
  { key: "last_name", label: "Last Name", type: "text", required: true, transforms: ["trim"] },
  { key: "phone", label: "Phone", type: "phone", required: true },
  { key: "email", label: "Email", type: "email", required: false },
  { key: "incident_date", label: "Incident Date", type: "date", required: true },
  { key: "incident_state", label: "Incident State", type: "state", required: true },
  { key: "at_fault", label: "At Fault", type: "boolean", required: true },
  { key: "attorney_status", label: "Attorney Status", type: "select", required: true, options: ["none", "consulted", "retained"] },
  { key: "injury_type", label: "Injury Type", type: "select", required: true, options: ["whiplash", "back injury", "fracture", "concussion", "soft tissue", "spinal injury"] },
  { key: "currently_represented", label: "Currently Represented", type: "boolean", required: true },
  { key: "description", label: "Description", type: "text", required: false },
  { key: "trusted_form_url", label: "TrustedForm URL", type: "text", required: false },
  { key: "jornaya_id", label: "Jornaya ID", type: "text", required: false },
];

const BASIC_SET: FieldDef[] = MVA_LEGAL_SET.slice(0, 4);

const CO_SUPPRESSION: FilterGroup = {
  id: "co-suppression",
  name: "CO Suppression - MVA",
  logic: "and",
  rules: [{ field: "incident_state", operator: "not_equals", value: "CO" }],
};

const FIELD_TYPES = ["text", "number", "date", "select", "boolean", "state", "zip", "phone", "email"] as const;
const OPERATORS = ["equals", "not_equals", "in", "not_in", "contains", "gt", "lt", "gte", "lte", "exists", "regex"] as const;

interface ExistingCampaign {
  id: string; name: string; slug: string; vertical: string; type: string; status: string;
  distributionMethod: string; fieldMapping: FieldDef[]; inboundFilters: InboundFilters | null;
  dedupeWindowDays: number; paymentTermsDays: number; description: string;
  buyers: Array<{ buyerId: string; priority: number; weight: number; priceOverrideCents: number | null }>;
}

export function CampaignWizard({
  buyers,
  suppliers,
  existing,
}: {
  buyers: Array<{ id: string; name: string; priceDefaultCents: number }>;
  suppliers: Array<{ id: string; name: string; allowedCampaignIds: string[] }>;
  existing: ExistingCampaign | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(existing?.id ?? null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(existing?.name ?? "");
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [vertical, setVertical] = useState(existing?.vertical ?? "mva");
  const [type, setType] = useState(existing?.type ?? "direct_post");
  const [method, setMethod] = useState(existing?.distributionMethod ?? "priority");
  const [dedupe, setDedupe] = useState(existing?.dedupeWindowDays ?? 30);
  const [terms, setTerms] = useState(existing?.paymentTermsDays ?? 30);
  const [description, setDescription] = useState(existing?.description ?? "");
  const [fields, setFields] = useState<FieldDef[]>(existing?.fieldMapping ?? BASIC_SET);
  const [groups, setGroups] = useState<FilterGroup[]>(existing?.inboundFilters?.groups ?? []);
  const [attached, setAttached] = useState<Array<{ buyerId: string; priority: number; weight: number; priceOverrideCents: number | null }>>(
    existing?.buyers ?? []
  );
  const [attachedSuppliers, setAttachedSuppliers] = useState<string[]>(
    existing ? suppliers.filter((s) => s.allowedCampaignIds.length === 0 || s.allowedCampaignIds.includes(existing.id)).map((s) => s.id) : []
  );

  const save = async (status: string): Promise<string | null> => {
    setSaving(true);
    setError(null);
    const res = await act<{ campaignId?: string }>("campaign.save", {
      ...(savedId ? { id: savedId } : {}),
      name, slug, vertical, type, status,
      distributionMethod: method,
      fieldMapping: fields,
      inboundFilters: groups.length > 0 ? { logic: "and", groups } : null,
      dedupeWindowDays: dedupe, paymentTermsDays: terms, description,
      buyers: attached,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Save failed");
      return null;
    }
    const id = res.data.campaignId ?? savedId;
    if (id) {
      setSavedId(id);
      for (const s of suppliers) {
        const shouldAttach = attachedSuppliers.includes(s.id);
        await act("supplier.attachCampaign", { supplierId: s.id, campaignId: id, attach: shouldAttach });
      }
    }
    return id ?? null;
  };

  const input = "rounded-lg border border-panelborder bg-elevated px-3 py-2 text-sm text-title outline-none focus:border-[var(--grad-to)]";
  const label = "flex flex-col gap-1";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold text-title">{existing ? `Edit ${existing.name}` : "New Campaign"}</h1>
      <div className="flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(i)}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold ${
              step === i ? "df-grad-bg text-white" : i < step ? "border border-[rgba(34,197,94,0.4)] text-verified" : "border border-panelborder text-label"
            }`}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <GlassPanel className="p-5">
        {step === 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            <label className={label}><span className="df-label">Name</span>
              <input className={input} value={name} onChange={(e) => {
                setName(e.target.value);
                if (!existing) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
              }} placeholder="MVA Direct - Q3" />
            </label>
            <label className={label}><span className="df-label">Slug (ingest URL)</span>
              <input className={`${input} font-mono-money`} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="mva-direct-q3" />
            </label>
            <label className={label}><span className="df-label">Vertical</span>
              <select className={input} value={vertical} onChange={(e) => setVertical(e.target.value)}>
                {["mva", "mass_tort", "workers_comp", "home_services", "insurance", "solar", "other"].map((v) => (
                  <option key={v} value={v}>{v.replace("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className={label}><span className="df-label">Type</span>
              <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="direct_post">Direct post (first accept wins)</option>
                <option value="ping_post">Ping post (highest bid wins)</option>
              </select>
            </label>
            <label className={label}><span className="df-label">Distribution method</span>
              <select className={input} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="priority">Priority order</option>
                <option value="weighted">Weighted random</option>
                <option value="round_robin">Round robin</option>
              </select>
            </label>
            <label className={label}><span className="df-label">Dedupe window (days)</span>
              <input type="number" className={input} value={dedupe} onChange={(e) => setDedupe(Number(e.target.value))} />
            </label>
            <label className={label}><span className="df-label">Payment terms (days)</span>
              <input type="number" className={input} value={terms} onChange={(e) => setTerms(Number(e.target.value))} />
            </label>
            <label className={`${label} md:col-span-2`}><span className="df-label">Description</span>
              <textarea className={input} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <SectionLabel className="w-full">Field Mapping Library</SectionLabel>
              <GradientButton variant="cyan" onClick={() => setFields(MVA_LEGAL_SET)}>Apply MVA legal set</GradientButton>
              <GradientButton variant="ghost" onClick={() => setFields(BASIC_SET)}>Basic contact set</GradientButton>
              <GradientButton variant="ghost" onClick={() => setFields([...fields, { key: `custom_${fields.length}`, label: "Custom Field", type: "text", required: false }])}>
                <Plus size={12} /> Add field
              </GradientButton>
            </div>
            <div className="space-y-1.5">
              {fields.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-panelborder bg-[rgba(11,14,35,0.4)] p-2">
                  <input className={`${input} !py-1 w-36 font-mono-money !text-xs`} value={f.key} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
                  <input className={`${input} !py-1 w-36 !text-xs`} value={f.label} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <select className={`${input} !py-1 !text-xs`} value={f.type} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, type: e.target.value as FieldDef["type"] } : x)))}>
                    {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-label">
                    <input type="checkbox" checked={f.required} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} className="accent-[var(--grad-to)]" />
                    required
                  </label>
                  {f.type === "select" && (
                    <input className={`${input} !py-1 flex-1 !text-xs`} placeholder="options, comma separated" value={(f.options ?? []).join(", ")} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) } : x)))} />
                  )}
                  <button type="button" className="ml-auto cursor-pointer p-1 text-label hover:text-danger" onClick={() => setFields(fields.filter((_, j) => j !== i))} aria-label="Remove field"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <SectionLabel className="w-full">Templates and shortcuts</SectionLabel>
              <GradientButton variant="cyan" onClick={() => setGroups([...groups.filter((g) => g.id !== "co-suppression"), CO_SUPPRESSION])}>
                Apply "CO Suppression - MVA" (Colorado SB26-174)
              </GradientButton>
              <GradientButton variant="ghost" onClick={() => {
                const states = prompt("Allowed states, comma separated (e.g. TX, FL, GA)");
                if (states) {
                  setGroups([...groups, {
                    id: `states-${groups.length}`, name: "State allowlist", logic: "and",
                    rules: [{ field: "incident_state", operator: "in", value: states.split(",").map((s) => s.trim().toUpperCase()) }],
                  }]);
                }
              }}>
                State allowlist shortcut
              </GradientButton>
              <GradientButton variant="ghost" onClick={() => setGroups([...groups, { id: `group-${groups.length}`, name: `Group ${groups.length + 1}`, logic: "and", rules: [{ field: "", operator: "equals", value: "" }] }])}>
                <Plus size={12} /> Add group
              </GradientButton>
            </div>
            {groups.length === 0 && <p className="text-xs text-label">No filters: every valid lead routes. Groups combine with AND across groups.</p>}
            {groups.map((g, gi) => (
              <div key={g.id} className="rounded-lg border border-panelborder bg-[rgba(11,14,35,0.4)] p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <input className={`${input} !py-1 w-48 !text-xs`} value={g.name ?? ""} onChange={(e) => setGroups(groups.map((x, j) => (j === gi ? { ...x, name: e.target.value } : x)))} />
                  <select className={`${input} !py-1 !text-xs`} value={g.logic} onChange={(e) => setGroups(groups.map((x, j) => (j === gi ? { ...x, logic: e.target.value as "and" | "or" } : x)))}>
                    <option value="and">ALL rules must pass (AND)</option>
                    <option value="or">ANY rule passes (OR)</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs text-label">
                    <input type="checkbox" checked={Boolean(g.schedule)} onChange={(e) => setGroups(groups.map((x, j) => (j === gi ? { ...x, schedule: e.target.checked ? { days: [1, 2, 3, 4, 5], start_hour: 9, end_hour: 17 } : undefined } : x)))} className="accent-[var(--grad-to)]" />
                    scheduled
                  </label>
                  {g.schedule && (
                    <span className="flex items-center gap-1 text-xs text-label">
                      <input type="number" min={0} max={23} className={`${input} !w-14 !py-0.5 !text-xs`} value={g.schedule.start_hour} onChange={(e) => setGroups(groups.map((x, j) => (j === gi && x.schedule ? { ...x, schedule: { ...x.schedule, start_hour: Number(e.target.value) } } : x)))} />
                      to
                      <input type="number" min={0} max={24} className={`${input} !w-14 !py-0.5 !text-xs`} value={g.schedule.end_hour} onChange={(e) => setGroups(groups.map((x, j) => (j === gi && x.schedule ? { ...x, schedule: { ...x.schedule, end_hour: Number(e.target.value) } } : x)))} />
                      org time, weekdays
                    </span>
                  )}
                  <button type="button" className="ml-auto cursor-pointer p-1 text-label hover:text-danger" onClick={() => setGroups(groups.filter((_, j) => j !== gi))} aria-label="Remove group"><Trash2 size={13} /></button>
                </div>
                {g.rules.map((r, ri) => (
                  <div key={ri} className="mb-1 flex flex-wrap items-center gap-2">
                    <select className={`${input} !py-1 w-44 font-mono-money !text-xs`} value={r.field} onChange={(e) => setGroups(groups.map((x, j) => (j === gi ? { ...x, rules: x.rules.map((y, k) => (k === ri ? { ...y, field: e.target.value } : y)) } : x)))}>
                      <option value="">field...</option>
                      {fields.map((f) => <option key={f.key} value={f.key}>{f.key}</option>)}
                    </select>
                    <select className={`${input} !py-1 !text-xs`} value={r.operator} onChange={(e) => setGroups(groups.map((x, j) => (j === gi ? { ...x, rules: x.rules.map((y, k) => (k === ri ? { ...y, operator: e.target.value as typeof r.operator } : y)) } : x)))}>
                      {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    {r.operator !== "exists" && (
                      <input className={`${input} !py-1 flex-1 !text-xs`} placeholder={r.operator === "in" || r.operator === "not_in" ? "comma separated values" : "value"} value={Array.isArray(r.value) ? r.value.join(", ") : String(r.value ?? "")} onChange={(e) => {
                        const raw = e.target.value;
                        const value = r.operator === "in" || r.operator === "not_in" ? raw.split(",").map((s) => s.trim()).filter(Boolean) : raw;
                        setGroups(groups.map((x, j) => (j === gi ? { ...x, rules: x.rules.map((y, k) => (k === ri ? { ...y, value } : y)) } : x)));
                      }} />
                    )}
                    <button type="button" className="cursor-pointer p-1 text-label hover:text-danger" onClick={() => setGroups(groups.map((x, j) => (j === gi ? { ...x, rules: x.rules.filter((_, k) => k !== ri) } : x)))} aria-label="Remove rule"><Trash2 size={12} /></button>
                  </div>
                ))}
                <GradientButton variant="ghost" className="!px-2 !py-0.5 !text-[10px]" onClick={() => setGroups(groups.map((x, j) => (j === gi ? { ...x, rules: [...x.rules, { field: "", operator: "equals" as const, value: "" }] } : x)))}>
                  <Plus size={10} /> rule
                </GradientButton>
              </div>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            <SectionLabel>Attach buyers with priority, weight, and price overrides</SectionLabel>
            {buyers.map((b) => {
              const a = attached.find((x) => x.buyerId === b.id);
              return (
                <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-panelborder bg-[rgba(11,14,35,0.4)] p-2.5">
                  <label className="flex items-center gap-2 text-sm font-semibold text-title">
                    <input type="checkbox" checked={Boolean(a)} className="accent-[var(--grad-to)]" onChange={(e) => {
                      if (e.target.checked) setAttached([...attached, { buyerId: b.id, priority: attached.length + 1, weight: 1, priceOverrideCents: null }]);
                      else setAttached(attached.filter((x) => x.buyerId !== b.id));
                    }} />
                    {b.name}
                  </label>
                  {a && (
                    <span className="ml-auto flex items-center gap-2 text-xs text-label">
                      priority
                      <input type="number" className={`${input} !w-16 !py-0.5 !text-xs`} value={a.priority} onChange={(e) => setAttached(attached.map((x) => (x.buyerId === b.id ? { ...x, priority: Number(e.target.value) } : x)))} />
                      weight
                      <input type="number" className={`${input} !w-16 !py-0.5 !text-xs`} value={a.weight} onChange={(e) => setAttached(attached.map((x) => (x.buyerId === b.id ? { ...x, weight: Number(e.target.value) } : x)))} />
                      price $
                      <input type="number" className={`${input} !w-20 !py-0.5 !text-xs`} placeholder={(b.priceDefaultCents / 100).toFixed(0)} value={a.priceOverrideCents !== null ? a.priceOverrideCents / 100 : ""} onChange={(e) => setAttached(attached.map((x) => (x.buyerId === b.id ? { ...x, priceOverrideCents: e.target.value ? Math.round(Number(e.target.value) * 100) : null } : x)))} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-2">
            <SectionLabel>Suppliers allowed to post into this campaign</SectionLabel>
            {suppliers.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-lg border border-panelborder bg-[rgba(11,14,35,0.4)] p-2.5 text-sm font-semibold text-title">
                <input
                  type="checkbox"
                  checked={attachedSuppliers.includes(s.id)}
                  className="accent-[var(--grad-to)]"
                  onChange={(e) =>
                    setAttachedSuppliers(e.target.checked ? [...attachedSuppliers, s.id] : attachedSuppliers.filter((x) => x !== s.id))
                  }
                />
                {s.name}
                {s.allowedCampaignIds.length === 0 && <Chip tone="dim">currently allows all campaigns</Chip>}
              </label>
            ))}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <p className="text-xs text-label">
              Save as draft, fire a synthetic test lead to watch it route live through the mock buyers, then activate.
            </p>
            <div className="flex flex-wrap gap-2">
              <GradientButton variant="ghost" disabled={saving || !name || !slug} onClick={() => void save("draft")}>
                Save draft
              </GradientButton>
              <GradientButton
                variant="cyan"
                disabled={saving || !savedId}
                onClick={async () => {
                  setTestResult(null);
                  const res = await act<{ result?: Record<string, unknown> }>("campaign.testLead", { campaignId: savedId });
                  setTestResult(JSON.stringify(res.data.result ?? res.error, null, 2));
                }}
              >
                <FlaskConical size={13} /> Fire test lead
              </GradientButton>
              <GradientButton
                disabled={saving || !name || !slug || attached.length === 0}
                onClick={async () => {
                  const id = await save("active");
                  if (id) router.push(`/distribution/campaigns/${id}`);
                }}
              >
                <Check size={13} /> Activate campaign
              </GradientButton>
            </div>
            {testResult && <pre className="max-h-56 overflow-auto rounded-lg bg-[#070a1c] p-3 text-[11px] text-body">{testResult}</pre>}
          </div>
        )}

        {error && <div className="mt-3 text-xs text-danger">{error}</div>}

        <div className="mt-5 flex justify-between border-t border-panelborder pt-3">
          <GradientButton variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</GradientButton>
          {step < STEPS.length - 1 && (
            <GradientButton onClick={async () => {
              if (step === 0 && name && slug && !savedId) await save("draft");
              setStep(step + 1);
            }} disabled={!name || !slug}>
              Next
            </GradientButton>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}

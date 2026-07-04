"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel } from "@/components/ui/primitives";
import { fmtCents } from "@/lib/money";
import { act } from "@/lib/client-api";

export function CostsClient({
  costs, campaigns, suppliers,
}: {
  costs: Array<{ id: string; date: string; category: string; description: string; amountCents: number; campaignId: string | null; supplierId: string | null; recurring: boolean; paidStatus: string }>;
  campaigns: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ date: "", category: "software", description: "", amount: "", campaignId: "", recurring: false, paidStatus: "accrued" });
  const input = "rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs text-body outline-none";

  return (
    <div className="max-w-3xl space-y-4">
      <GlassPanel className="space-y-2 p-4">
        <SectionLabel>Add cost entry</SectionLabel>
        <div className="grid gap-2 md:grid-cols-3">
          <input type="date" className={input} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {["media", "data", "software", "telecom", "rev_share", "other"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="Amount $" type="number" className={input} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input placeholder="Description" className={`${input} md:col-span-2`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <select className={input} value={form.campaignId} onChange={(e) => setForm({ ...form, campaignId: e.target.value })}>
            <option value="">No campaign</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-label">
            <input type="checkbox" className="accent-[var(--grad-to)]" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} /> recurring monthly
          </label>
          <select className={input} value={form.paidStatus} onChange={(e) => setForm({ ...form, paidStatus: e.target.value })}>
            <option value="accrued">accrued (not yet paid)</option>
            <option value="paid">paid</option>
          </select>
          <GradientButton className="!text-[11px]" disabled={!form.date || !form.description || !form.amount} onClick={async () => {
            await act("cost.save", {
              date: form.date, category: form.category, description: form.description,
              amountCents: Math.round(Number(form.amount) * 100),
              campaignId: form.campaignId || null, recurring: form.recurring, paidStatus: form.paidStatus,
            });
            setForm({ date: "", category: "software", description: "", amount: "", campaignId: "", recurring: false, paidStatus: "accrued" });
            router.refresh();
          }}>
            <Plus size={12} /> Add
          </GradientButton>
        </div>
      </GlassPanel>

      <GlassPanel className="divide-y divide-[rgba(38,43,77,0.5)]">
        {costs.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
            <span className="font-mono-money w-20 text-[11px] text-label">{c.date}</span>
            <Chip tone="neutral">{c.category}</Chip>
            <span className="min-w-0 flex-1 truncate text-xs text-body">{c.description}</span>
            {c.recurring && <Chip tone="queued">recurring</Chip>}
            {c.campaignId && <Chip tone="info">{campaigns.find((x) => x.id === c.campaignId)?.name}</Chip>}
            {c.supplierId && <Chip tone="info">{suppliers.find((x) => x.id === c.supplierId)?.name}</Chip>}
            <Chip tone={c.paidStatus === "paid" ? "verified" : "warning"}>{c.paidStatus}</Chip>
            <span className="font-mono-money text-xs font-semibold text-title">{fmtCents(c.amountCents)}</span>
            <button type="button" className="cursor-pointer p-1 text-label hover:text-danger" onClick={async () => {
              await act("cost.delete", { id: c.id });
              router.refresh();
            }} aria-label="Delete cost">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </GlassPanel>
    </div>
  );
}

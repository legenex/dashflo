"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlassPanel, GradientButton, SectionLabel } from "@/components/ui/primitives";
import { act } from "@/lib/client-api";

export function GeneralForm({ org }: { org: { name: string; slug: string; timezone: string; currency: string; varianceThresholdPct: number; varianceThresholdCents: number } }) {
  const router = useRouter();
  const [form, setForm] = useState(org);
  const [saved, setSaved] = useState(false);
  const input = "rounded-lg border border-panelborder bg-elevated px-3 py-2 text-sm text-title outline-none focus:border-[var(--grad-to)]";

  return (
    <GlassPanel className="max-w-2xl space-y-3 p-5">
      <SectionLabel>Organization profile</SectionLabel>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1"><span className="df-label">Name</span>
          <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1"><span className="df-label">Slug</span>
          <input className={`${input} opacity-50`} value={form.slug} disabled />
        </label>
        <label className="flex flex-col gap-1"><span className="df-label">Timezone (schedules, rendering)</span>
          <select className={input} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
            {["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "UTC"].map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className="df-label">Currency</span>
          <select className={input} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className="df-label">Variance threshold %</span>
          <input type="number" className={input} value={form.varianceThresholdPct} onChange={(e) => setForm({ ...form, varianceThresholdPct: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-1"><span className="df-label">Variance threshold $ floor</span>
          <input type="number" className={input} value={form.varianceThresholdCents / 100} onChange={(e) => setForm({ ...form, varianceThresholdCents: Math.round(Number(e.target.value) * 100) })} />
        </label>
      </div>
      <p className="text-[11px] text-label">
        A period flags when |expected - paid| exceeds max({form.varianceThresholdPct}%, ${(form.varianceThresholdCents / 100).toFixed(0)}).
      </p>
      <GradientButton onClick={async () => {
        await act("org.update", {
          name: form.name, timezone: form.timezone, currency: form.currency,
          varianceThresholdPct: form.varianceThresholdPct, varianceThresholdCents: form.varianceThresholdCents,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
        router.refresh();
      }}>
        {saved ? "Saved" : "Save changes"}
      </GradientButton>
    </GlassPanel>
  );
}

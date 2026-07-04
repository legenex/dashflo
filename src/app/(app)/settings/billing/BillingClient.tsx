"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlassPanel, Chip, GradientButton, SectionLabel } from "@/components/ui/primitives";
import { act } from "@/lib/client-api";
import type { PlanLimits } from "@/db/schema";

const TIERS = [
  {
    id: "starter", name: "Starter", price: "$149/mo",
    limits: { leads_per_month: 2000, users: 3, ad_accounts: 2, ai_messages: 200 },
    pitch: "One vertical, one team, full truth engine.",
  },
  {
    id: "growth", name: "Growth", price: "$449/mo",
    limits: { leads_per_month: 15000, users: 10, ad_accounts: 6, ai_messages: 2000 },
    pitch: "Multi-campaign shops that need the AI analyst daily.",
  },
  {
    id: "scale", name: "Scale", price: "$1,249/mo",
    limits: { leads_per_month: 100000, users: 50, ad_accounts: 20, ai_messages: 20000 },
    pitch: "Networks and agencies reselling truth to their own clients.",
  },
];

export function BillingClient({
  tier,
  limits,
  usage,
}: {
  tier: string;
  limits: PlanLimits;
  usage: { leads: number; users: number; adAccounts: number; aiMessages: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const meters = [
    { label: "Leads this month", used: usage.leads, limit: limits.leads_per_month },
    { label: "Users", used: usage.users, limit: limits.users },
    { label: "Ad accounts", used: usage.adAccounts, limit: limits.ad_accounts },
    { label: "AI messages", used: usage.aiMessages, limit: limits.ai_messages },
  ];

  return (
    <div className="max-w-4xl space-y-4">
      <GlassPanel className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <SectionLabel>Current plan</SectionLabel>
          <Chip tone="accent">{tier}</Chip>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {meters.map((m) => {
            const pct = Math.min(100, Math.round((m.used / Math.max(1, m.limit)) * 100));
            return (
              <div key={m.label}>
                <div className="flex justify-between text-[11px]">
                  <span className="text-label">{m.label}</span>
                  <span className="font-mono-money text-body">{m.used.toLocaleString()} / {m.limit.toLocaleString()}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[rgba(199,204,230,0.1)]">
                  <div className={`h-full rounded-full ${pct > 90 ? "bg-[var(--error)]" : "bg-[var(--cyan)]"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </GlassPanel>

      <div className="grid gap-3 md:grid-cols-3">
        {TIERS.map((t) => (
          <GlassPanel key={t.id} className={`flex flex-col p-5 ${t.id === tier ? "df-gradient-border" : ""}`}>
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-title">{t.name}</span>
              <span className="font-mono-money text-sm text-accent">{t.price}</span>
            </div>
            <p className="mt-1 text-[11px] text-label">{t.pitch}</p>
            <ul className="mt-3 space-y-1 text-[11px] text-body">
              <li>{t.limits.leads_per_month.toLocaleString()} leads / month</li>
              <li>{t.limits.users} users</li>
              <li>{t.limits.ad_accounts} ad accounts</li>
              <li>{t.limits.ai_messages.toLocaleString()} AI messages</li>
            </ul>
            <div className="mt-auto pt-4">
              {t.id === tier ? (
                <Chip tone="verified">Current plan</Chip>
              ) : (
                <GradientButton
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(t.id);
                    await act("billing.tier", { tier: t.id });
                    setBusy(null);
                    router.refresh();
                  }}
                >
                  {busy === t.id ? "Switching..." : `Switch to ${t.name}`}
                </GradientButton>
              )}
            </div>
          </GlassPanel>
        ))}
      </div>
      <p className="text-[11px] text-label">
        Checkout is stubbed locally: switching flips the tier and limits immediately. The billing interface is
        structured so real Stripe subscriptions drop into the same action without touching the UI.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, ShieldCheck } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel } from "@/components/ui/primitives";
import { fmtCents } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/components/ui/format";
import { act } from "@/lib/client-api";

interface OrgRow {
  id: string; name: string; slug: string; planTier: string; status: string;
  users: number; leadsThisMonth: number; totalLeads: number; mrrCents: number; createdAt: string;
  members: Array<{ name: string; role: string }>;
}

export function AdminClient({
  orgs,
  platform,
  audit,
}: {
  orgs: OrgRow[];
  platform: { tenants: number; totalLeads: number; mrrCents: number };
  audit: Array<{ id: string; action: string; entityType: string; entityId: string | null; user: string; at: string }>;
}) {
  const router = useRouter();
  const [openOrg, setOpenOrg] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-danger" />
        <div>
          <h1 className="text-xl font-bold text-title">Master Admin</h1>
          <p className="text-xs text-label">Platform-level view. Impersonation is audit-logged and banner-marked.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <GlassPanel className="p-4 text-center">
          <div className="font-mono-money text-2xl font-bold text-title">{platform.tenants}</div>
          <SectionLabel>tenants</SectionLabel>
        </GlassPanel>
        <GlassPanel className="p-4 text-center">
          <div className="font-mono-money text-2xl font-bold text-title">{platform.totalLeads.toLocaleString()}</div>
          <SectionLabel>total leads</SectionLabel>
        </GlassPanel>
        <GlassPanel className="p-4 text-center">
          <div className="font-mono-money text-2xl font-bold text-verified">{fmtCents(platform.mrrCents)}</div>
          <SectionLabel>MRR (placeholder)</SectionLabel>
        </GlassPanel>
      </div>

      <GlassPanel className="divide-y divide-[rgba(38,43,77,0.5)]">
        {orgs.map((o) => (
          <div key={o.id}>
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => setOpenOrg(openOrg === o.id ? null : o.id)}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-title">{o.name}</span>
                  <Chip tone="accent">{o.planTier}</Chip>
                  <Chip tone={o.status === "active" ? "verified" : "danger"}>{o.status}</Chip>
                </div>
                <div className="text-[11px] text-label">
                  {o.users} users · {o.leadsThisMonth} leads this month ({o.totalLeads} total) · created {fmtDate(o.createdAt)}
                </div>
              </button>
              <span className="font-mono-money text-xs text-verified">{fmtCents(o.mrrCents)}/mo</span>
              <GradientButton
                variant="danger"
                className="!px-2.5 !py-1 !text-[10px]"
                onClick={async () => {
                  await act("admin.impersonate", { organizationId: o.id });
                  window.location.href = "/";
                }}
              >
                <Eye size={11} /> Impersonate
              </GradientButton>
            </div>
            {openOrg === o.id && (
              <div className="space-y-2 border-t border-panelborder bg-[rgba(11,14,35,0.5)] px-4 py-3">
                <SectionLabel>Members</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {o.members.map((m, i) => (
                    <Chip key={i} tone="neutral">{m.name} · {m.role}</Chip>
                  ))}
                </div>
                <div className="flex gap-2">
                  <GradientButton variant="ghost" className="!px-2.5 !py-1 !text-[10px]" onClick={async () => {
                    await act("admin.orgStatus", { organizationId: o.id, status: o.status === "active" ? "suspended" : "active" });
                    router.refresh();
                  }}>
                    {o.status === "active" ? "Suspend" : "Activate"}
                  </GradientButton>
                  {["starter", "growth", "scale"].filter((t) => t !== o.planTier).map((t) => (
                    <GradientButton key={t} variant="ghost" className="!px-2.5 !py-1 !text-[10px]" onClick={async () => {
                      await act("admin.orgStatus", { organizationId: o.id, status: o.status as "active", planTier: t });
                      router.refresh();
                    }}>
                      Move to {t}
                    </GradientButton>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </GlassPanel>

      <GlassPanel className="p-4">
        <SectionLabel className="mb-2">Audit trail</SectionLabel>
        <div className="space-y-1">
          {audit.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="font-mono-money text-label">{fmtDateTime(a.at)}</span>
              <Chip tone={a.action.startsWith("impersonation") ? "danger" : "neutral"}>{a.action}</Chip>
              <span className="text-body">{a.user}</span>
              <span className="text-label">{a.entityType}{a.entityId ? ` · ${a.entityId}` : ""}</span>
            </div>
          ))}
          {audit.length === 0 && <p className="text-xs text-label">No audit entries yet.</p>}
        </div>
      </GlassPanel>
    </div>
  );
}

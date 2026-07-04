"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel } from "@/components/ui/primitives";
import { act } from "@/lib/client-api";

const ROLES = ["owner", "admin", "analyst", "finance", "partner"];

export function UsersClient({
  members,
  currentUserId,
}: {
  members: Array<{ userId: string; role: string; partnerScope: { buyer_id?: string; supplier_id?: string } | null; name: string; email: string }>;
  currentUserId: string;
}) {
  const router = useRouter();
  const [invite, setInvite] = useState({ email: "", name: "", role: "analyst" });
  const [result, setResult] = useState<string | null>(null);
  const input = "rounded-lg border border-panelborder bg-elevated px-3 py-2 text-sm text-title outline-none";

  return (
    <div className="max-w-3xl space-y-4">
      <GlassPanel className="space-y-3 p-5">
        <SectionLabel>Invite a member</SectionLabel>
        <div className="grid gap-2 md:grid-cols-4">
          <input placeholder="email@company.com" className={input} value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <input placeholder="Full name" className={input} value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
          <select className={input} value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <GradientButton disabled={!invite.email || !invite.name} onClick={async () => {
            const res = await act<{ initialPassword?: string }>("user.invite", invite);
            setResult(res.ok ? `Invited. Initial password: ${res.data.initialPassword}` : res.error ?? "Failed");
            setInvite({ email: "", name: "", role: "analyst" });
            router.refresh();
          }}>
            <UserPlus size={13} /> Invite
          </GradientButton>
        </div>
        {result && <p className="font-mono-money text-xs text-accent">{result}</p>}
      </GlassPanel>

      <GlassPanel className="divide-y divide-[rgba(38,43,77,0.5)]">
        {members.map((m) => (
          <div key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full df-grad-bg text-xs font-bold text-white">
              {m.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-title">{m.name}{m.userId === currentUserId ? " (you)" : ""}</div>
              <div className="text-[11px] text-label">{m.email}</div>
            </div>
            {m.partnerScope?.buyer_id && <Chip tone="queued">scoped: buyer</Chip>}
            <select
              className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs text-body"
              value={m.role}
              disabled={m.userId === currentUserId}
              onChange={async (e) => {
                await act("member.role", { userId: m.userId, role: e.target.value });
                router.refresh();
              }}
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        ))}
      </GlassPanel>
      <p className="text-[11px] text-label">
        Roles: owner and admin manage everything. finance manages money and matching. analyst reads with masked PII.
        partner sees only their scoped buyer or supplier.
      </p>
    </div>
  );
}

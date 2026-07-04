"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel } from "@/components/ui/primitives";
import { timeAgo } from "@/components/ui/format";
import { act } from "@/lib/client-api";

const SCOPES = ["*", "leads:read", "leads:write", "campaigns:read", "buyers:read", "suppliers:read", "reports:read", "truth:read", "reconciliation:read"];

export function ApiKeysClient({
  keys,
}: {
  keys: Array<{ id: string; name: string; keyPrefix: string; scopes: string[]; status: string; lastUsedAt: string | null; createdAt: string }>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["*"]);
  const [freshKey, setFreshKey] = useState<string | null>(null);

  return (
    <div className="max-w-3xl space-y-4">
      <GlassPanel className="space-y-3 p-5">
        <SectionLabel>Create a scoped key</SectionLabel>
        <div className="flex flex-wrap items-center gap-2">
          <input placeholder="Key name" className="rounded-lg border border-panelborder bg-elevated px-3 py-2 text-sm text-title outline-none" value={name} onChange={(e) => setName(e.target.value)} />
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg border border-panelborder bg-elevated px-2.5 py-2 text-xs text-body">{scopes.includes("*") ? "all scopes" : `${scopes.length} scopes`}</summary>
            <div className="absolute left-0 top-10 z-30 w-56 rounded-lg border border-panelborder bg-elevated p-1.5 shadow-2xl">
              {SCOPES.map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 font-mono-money text-xs text-body hover:bg-[rgba(59,130,246,0.1)]">
                  <input type="checkbox" className="accent-[var(--grad-to)]" checked={scopes.includes(s)} onChange={() => setScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])} />
                  {s}
                </label>
              ))}
            </div>
          </details>
          <GradientButton disabled={!name} onClick={async () => {
            const res = await act<{ apiKey?: string }>("apikey.create", { name, scopes });
            if (res.data.apiKey) setFreshKey(res.data.apiKey);
            setName("");
            router.refresh();
          }}>
            <Plus size={13} /> Create key
          </GradientButton>
        </div>
        {freshKey && (
          <div className="rounded-lg border border-[rgba(34,211,238,0.4)] bg-[rgba(34,211,238,0.06)] p-3">
            <div className="df-label mb-1">Shown once, store it now</div>
            <code className="font-mono-money break-all text-sm text-accent">{freshKey}</code>
          </div>
        )}
      </GlassPanel>

      <GlassPanel className="divide-y divide-[rgba(38,43,77,0.5)]">
        {keys.map((k) => (
          <div key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <KeyRound size={14} className="text-label" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-title">{k.name}</div>
              <div className="font-mono-money text-[11px] text-label">df_live_{k.keyPrefix}...</div>
            </div>
            <Chip tone="neutral">{k.scopes.includes("*") ? "all scopes" : k.scopes.join(", ")}</Chip>
            <span className="text-[10px] text-label">{k.lastUsedAt ? `used ${timeAgo(k.lastUsedAt)}` : "never used"}</span>
            <Chip tone={k.status === "active" ? "verified" : "danger"}>{k.status}</Chip>
            {k.status === "active" && (
              <GradientButton variant="danger" className="!px-2 !py-1 !text-[10px]" onClick={async () => {
                await act("apikey.revoke", { id: k.id });
                router.refresh();
              }}>
                Revoke
              </GradientButton>
            )}
          </div>
        ))}
      </GlassPanel>
      <p className="text-[11px] text-label">
        Use keys as <code className="text-accent">Authorization: Bearer df_live_...</code> against /api/v1. Full reference in the Docs.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlassPanel, GradientButton, SectionLabel } from "@/components/ui/primitives";
import { act } from "@/lib/client-api";
import type { WhiteLabel } from "@/db/schema";

export function WhiteLabelForm({ whiteLabel }: { whiteLabel: WhiteLabel }) {
  const router = useRouter();
  const [form, setForm] = useState({
    logo_url: whiteLabel.logo_url ?? "",
    accent: whiteLabel.accent ?? "",
    sender_name: whiteLabel.sender_name ?? "",
  });
  const [saved, setSaved] = useState(false);
  const input = "rounded-lg border border-panelborder bg-elevated px-3 py-2 text-sm text-title outline-none";

  return (
    <GlassPanel className="max-w-xl space-y-3 p-5">
      <SectionLabel>White label</SectionLabel>
      <p className="text-[11px] text-label">Applied live: the accent recolors the sidebar logo mark, the sender name signs outgoing briefs.</p>
      <label className="flex flex-col gap-1"><span className="df-label">Logo URL</span>
        <input className={input} value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." />
      </label>
      <label className="flex flex-col gap-1"><span className="df-label">Accent override (CSS color)</span>
        <div className="flex items-center gap-2">
          <input className={`${input} flex-1`} value={form.accent} onChange={(e) => setForm({ ...form, accent: e.target.value })} placeholder="#22D3EE or linear-gradient(...)" />
          <span className="h-8 w-8 rounded-lg border border-panelborder" style={{ background: form.accent || "linear-gradient(135deg,#3B82F6,#8B5CF6)" }} />
        </div>
      </label>
      <label className="flex flex-col gap-1"><span className="df-label">Sender name</span>
        <input className={input} value={form.sender_name} onChange={(e) => setForm({ ...form, sender_name: e.target.value })} placeholder="Legenex Ops" />
      </label>
      <GradientButton onClick={async () => {
        await act("org.update", { whiteLabel: form });
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
        router.refresh();
      }}>
        {saved ? "Saved, applied live" : "Save white label"}
      </GradientButton>
    </GlassPanel>
  );
}

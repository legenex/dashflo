"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Clock } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel } from "@/components/ui/primitives";
import { timeAgo } from "@/components/ui/format";
import { act } from "@/lib/client-api";

export function ScheduledClient({
  briefs,
  custom,
  aiConfigured,
}: {
  briefs: Array<{ id: string; name: string; schedule: string | null; lastRenderedAt: string | null; lastRenderedBody: string | null }>;
  custom: Array<{ id: string; name: string; schedule: string | null }>;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [rendering, setRendering] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>(
    Object.fromEntries(briefs.filter((b) => b.lastRenderedBody).map((b) => [b.id, b.lastRenderedBody as string]))
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-title">Scheduled Reports</h1>
        <p className="text-xs text-label">
          AI-written briefs that lead with cash truth: booked vs verified vs gap, who owes what, what to scale, watch, and cut.
          {!aiConfigured && " Running in local analysis mode (no API key), same numbers, deterministic writing."}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {briefs.map((b) => (
          <GlassPanel key={b.id} className="flex flex-col p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-title">{b.name}</span>
              <Chip tone="queued"><Clock size={10} /> {b.schedule ?? "manual"}</Chip>
            </div>
            <div className="mt-1 text-[11px] text-label">
              {b.lastRenderedAt ? `Last rendered ${timeAgo(b.lastRenderedAt)}` : "Never rendered"}
            </div>
            <GradientButton
              variant="cyan"
              className="mt-2 self-start !text-[11px]"
              disabled={rendering === b.id}
              onClick={async () => {
                setRendering(b.id);
                const res = await act<{ body?: string; mode?: string }>("brief.render", { id: b.id });
                setRendering(null);
                if (res.data.body) setBodies((prev) => ({ ...prev, [b.id]: res.data.body ?? "" }));
                router.refresh();
              }}
            >
              <Play size={11} /> {rendering === b.id ? "Writing..." : "Render now"}
            </GradientButton>
            {bodies[b.id] && (
              <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-panelborder bg-[rgba(11,14,35,0.5)] p-3 text-[11px] leading-relaxed text-body">
                {bodies[b.id]}
              </div>
            )}
          </GlassPanel>
        ))}
      </div>

      <GlassPanel className="p-4">
        <SectionLabel className="mb-2">Custom report schedules</SectionLabel>
        {custom.length === 0 ? (
          <p className="text-xs text-label">Save a custom report first, then schedule it here.</p>
        ) : (
          <div className="space-y-1.5">
            {custom.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border border-panelborder px-3 py-2">
                <span className="text-xs font-semibold text-title">{c.name}</span>
                <Chip tone={c.schedule ? "verified" : "dim"}>{c.schedule ?? "not scheduled"}</Chip>
                <GradientButton variant="ghost" className="ml-auto !px-2 !py-1 !text-[10px]" onClick={async () => {
                  await act("report.save", { id: c.id, name: c.name, config: {}, schedule: c.schedule ? null : "Mondays, 8:00am" });
                  router.refresh();
                }}>
                  {c.schedule ? "Unschedule" : "Schedule weekly"}
                </GradientButton>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

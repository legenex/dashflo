"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlassPanel, Chip, SectionLabel } from "@/components/ui/primitives";
import { TruthGrid, type TruthGridRow } from "@/components/truthgrid/TruthGrid";
import { fmtCents } from "@/lib/money";
import { fmtDateTime } from "@/components/ui/format";

interface AttemptRow {
  id: string; leadId: string; buyer: string; type: string; outcome: string;
  code: number | null; bidCents: number | null; durationMs: number; at: string;
  request: Record<string, unknown>; response: Record<string, unknown>;
}

const OUTCOMES = ["all", "accepted", "rejected", "timeout", "error"];

export function DeliveriesClient({
  attempts,
  stats,
}: {
  attempts: AttemptRow[];
  stats: { total: number; accepted: number; p50: number; p90: number; p99: number };
  campaignsCount: number;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState("all");
  const filtered = outcome === "all" ? attempts : attempts.filter((a) => a.outcome === outcome);

  const rows: TruthGridRow[] = filtered.map((a) => ({
    key: a.id,
    identity: { title: a.buyer, sub: `${fmtDateTime(a.at)} · lead ${a.leadId.slice(0, 12)}...` },
    stat: { label: "Latency", value: `${a.durationMs}ms` },
    booked: { value: a.bidCents, tone: "default", chip: a.bidCents === null ? "no bid" : "bid" },
    verified: { value: null, tone: "dim", chip: `HTTP ${a.code ?? "-"}` },
    gap: { value: null, tone: "dim", chip: a.type },
    chip: {
      tone: a.outcome === "accepted" ? "verified" : a.outcome === "rejected" ? "warning" : "danger",
      label: a.outcome,
    },
    actions: [{ label: "Open lead", onClick: () => router.push(`/leads?open=${a.leadId}`) }],
    sortValues: { stat: a.durationMs },
  }));

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-title">Deliveries</h1>
        <p className="text-xs text-label">Every ping and post across every campaign, with full payloads.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <GlassPanel className="p-3 text-center"><div className="font-mono-money text-lg font-bold text-title">{stats.total}</div><SectionLabel>attempts (500 latest)</SectionLabel></GlassPanel>
        <GlassPanel className="p-3 text-center"><div className="font-mono-money text-lg font-bold text-verified">{stats.total > 0 ? Math.round((stats.accepted / stats.total) * 100) : 0}%</div><SectionLabel>accept rate</SectionLabel></GlassPanel>
        <GlassPanel className="p-3 text-center"><div className="font-mono-money text-lg font-bold text-title">{stats.p50}ms</div><SectionLabel>p50 latency</SectionLabel></GlassPanel>
        <GlassPanel className="p-3 text-center"><div className="font-mono-money text-lg font-bold text-warning">{stats.p90}ms</div><SectionLabel>p90 latency</SectionLabel></GlassPanel>
        <GlassPanel className="p-3 text-center"><div className="font-mono-money text-lg font-bold text-danger">{stats.p99}ms</div><SectionLabel>p99 latency</SectionLabel></GlassPanel>
      </div>
      <div className="flex gap-1.5">
        {OUTCOMES.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOutcome(o)}
            className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold ${outcome === o ? "df-grad-bg text-white" : "border border-panelborder text-label hover:text-body"}`}
          >
            {o}
          </button>
        ))}
      </div>
      <TruthGrid
        rows={rows}
        bookedHeader="BID"
        verifiedHeader="STATUS"
        gapHeader="TYPE"
        renderDrawer={(row) => {
          const a = filtered.find((x) => x.id === row.key);
          if (!a) return null;
          return (
            <div className="grid gap-3 p-4 md:grid-cols-2">
              <div>
                <SectionLabel className="mb-1">Request</SectionLabel>
                <pre className="max-h-52 overflow-auto rounded bg-[#070a1c] p-2 text-[10px] leading-relaxed text-body">{JSON.stringify(a.request, null, 2)}</pre>
              </div>
              <div>
                <SectionLabel className="mb-1">Response ({a.durationMs}ms)</SectionLabel>
                <pre className="max-h-52 overflow-auto rounded bg-[#070a1c] p-2 text-[10px] leading-relaxed text-body">{JSON.stringify(a.response, null, 2)}</pre>
              </div>
            </div>
          );
        }}
        emptyTitle="No delivery attempts match"
      />
      {filtered.length > 0 && outcome !== "all" && (
        <div className="text-[11px] text-label">
          <Chip tone="info">{filtered.length}</Chip> attempts with outcome {outcome}
        </div>
      )}
    </div>
  );
}

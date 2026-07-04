"use client";

import { GlassPanel, Chip, Sparkline, Ticker, type ChipTone } from "./primitives";
import { fmtCents } from "@/lib/money";

// StatPair: DashFlo's signature component. A booked value with its verified
// twin beneath it and a gap badge. UNKNOWN is rendered, never zeroed.

export interface StatPairProps {
  label: string;
  booked: number | null;
  verified: number | null;
  bookedLabel?: string;
  verifiedLabel?: string;
  format?: (v: number | null) => string;
  gapMode?: "amount" | "pct" | "none";
  invertGap?: boolean; // for costs: verified below booked is fine
  spark?: number[];
  delta?: number | null; // compare-to-previous, percentage points as fraction
  onClick?: () => void;
  needsSource?: boolean;
  className?: string;
}

export function StatPair({
  label,
  booked,
  verified,
  bookedLabel = "booked",
  verifiedLabel = "verified",
  format = (v) => fmtCents(v, { compact: false }),
  gapMode = "amount",
  spark,
  delta,
  onClick,
  needsSource = false,
  className = "",
}: StatPairProps) {
  const gap = booked !== null && verified !== null ? booked - verified : null;
  const gapTone: ChipTone =
    gap === null ? "dim" : gap <= 0 ? "verified" : gap > 0 ? "warning" : "neutral";

  return (
    <GlassPanel
      className={`min-w-[168px] flex-1 cursor-pointer p-3.5 ${className}`}
    >
      <button type="button" onClick={onClick} className="w-full cursor-pointer text-left" aria-label={`${label} details`}>
        <div className="flex items-start justify-between gap-2">
          <span className="df-label">{label}</span>
          {delta !== null && delta !== undefined && (
            <span className={`font-mono-money text-[11px] ${delta >= 0 ? "text-verified" : "text-danger"}`}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <Ticker value={booked} format={format} className="text-lg font-bold text-title" />
          {spark && spark.length > 1 && <Sparkline data={spark} />}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-label">{bookedLabel}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <Ticker
            value={verified}
            format={format}
            className={`text-sm font-semibold ${verified === null ? "text-label" : "text-verified"}`}
          />
          <span className="text-[10px] uppercase tracking-wide text-label">{verifiedLabel}</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {needsSource || verified === null ? (
            <Chip tone="dim">Needs Source</Chip>
          ) : gapMode !== "none" && gap !== null ? (
            <Chip tone={gapTone}>
              {gap === 0 ? "no gap" : `gap ${fmtCents(Math.abs(gap), { compact: false })}`}
            </Chip>
          ) : null}
        </div>
      </button>
    </GlassPanel>
  );
}

// Single-value stat (True CPL, Cash Margin, Data Quality) still paired with a
// qualifier line so no KPI is ever a lone number.
export function StatSingle({
  label,
  value,
  sub,
  format,
  tone = "title",
  onClick,
}: {
  label: string;
  value: number | null;
  sub: string;
  format: (v: number | null) => string;
  tone?: "title" | "verified" | "danger" | "warning";
  onClick?: () => void;
}) {
  const toneClass = { title: "text-title", verified: "text-verified", danger: "text-danger", warning: "text-warning" }[tone];
  return (
    <GlassPanel className="min-w-[150px] flex-1 p-3.5">
      <button type="button" onClick={onClick} className="w-full cursor-pointer text-left">
        <span className="df-label">{label}</span>
        <div className="mt-1.5">
          <Ticker value={value} format={format} className={`text-lg font-bold ${value === null ? "text-label" : toneClass}`} />
        </div>
        <div className="mt-1 text-[11px] text-label">{sub}</div>
      </button>
    </GlassPanel>
  );
}

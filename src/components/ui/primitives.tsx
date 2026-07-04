"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Core visual primitives: GlassPanel, GradientButton, Chip, Ticker,
// Sparkline, ConfidenceMeter, AgingBar, EmptyState, Skeleton.

export function GlassPanel({
  children,
  className = "",
  glow,
  gradientBorder = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: "verified" | "danger" | "warning" | "accent";
  gradientBorder?: boolean;
}) {
  const glowClass = glow ? ` df-glow-${glow}` : "";
  return (
    <div className={`df-panel df-panel-hover${gradientBorder ? " df-gradient-border" : ""}${glowClass} ${className}`}>
      {children}
    </div>
  );
}

export function GradientButton({
  children,
  onClick,
  disabled,
  type = "button",
  variant = "primary",
  className = "",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  variant?: "primary" | "cyan" | "ghost" | "danger";
  className?: string;
  title?: string;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";
  const variants: Record<string, string> = {
    primary: "df-grad-bg text-white hover:brightness-110 shadow-[0_4px_14px_rgba(99,102,241,0.35)]",
    cyan: "bg-[rgba(34,211,238,0.14)] text-accent border border-[rgba(34,211,238,0.35)] hover:bg-[rgba(34,211,238,0.22)]",
    ghost: "bg-transparent text-body border border-panelborder hover:border-[rgba(139,92,246,0.5)] hover:text-title",
    danger: "bg-[rgba(239,68,68,0.14)] text-danger border border-[rgba(239,68,68,0.35)] hover:bg-[rgba(239,68,68,0.22)]",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export type ChipTone =
  | "verified" | "danger" | "warning" | "info" | "queued" | "unmatched" | "neutral" | "accent" | "dim";

const CHIP_TONES: Record<ChipTone, string> = {
  verified: "bg-[rgba(34,197,94,0.12)] text-verified border-[rgba(34,197,94,0.35)]",
  danger: "bg-[rgba(239,68,68,0.12)] text-danger border-[rgba(239,68,68,0.35)]",
  warning: "bg-[rgba(245,158,11,0.12)] text-warning border-[rgba(245,158,11,0.35)]",
  info: "bg-[rgba(96,165,250,0.12)] text-info border-[rgba(96,165,250,0.35)]",
  queued: "bg-[rgba(167,139,250,0.12)] text-queued border-[rgba(167,139,250,0.35)]",
  unmatched: "bg-[rgba(249,115,22,0.12)] text-unmatched border-[rgba(249,115,22,0.35)]",
  neutral: "bg-[rgba(199,204,230,0.08)] text-body border-panelborder",
  accent: "bg-[rgba(34,211,238,0.12)] text-accent border-[rgba(34,211,238,0.35)]",
  dim: "bg-transparent text-label border-panelborder",
};

export function Chip({ tone = "neutral", children, className = "", title }: { tone?: ChipTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${CHIP_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

// Semantic mappers used everywhere so chips stay consistent.
export function paymentChip(status: string): { tone: ChipTone; label: string } {
  const map: Record<string, { tone: ChipTone; label: string }> = {
    verified_paid: { tone: "verified", label: "Verified Paid" },
    partially_paid: { tone: "info", label: "Partially Paid" },
    due_soon: { tone: "warning", label: "Due Soon" },
    overdue: { tone: "danger", label: "Overdue" },
    short_paid: { tone: "danger", label: "Short Paid" },
    no_payment_source: { tone: "dim", label: "No Payment Source" },
    needs_matching: { tone: "unmatched", label: "Needs Matching" },
    watch: { tone: "neutral", label: "Watch" },
    not_applicable: { tone: "dim", label: "n/a" },
  };
  return map[status] ?? { tone: "neutral", label: status };
}

export function profitTruthChip(status: string): { tone: ChipTone; label: string } {
  const map: Record<string, { tone: ChipTone; label: string }> = {
    cash_verified: { tone: "verified", label: "Cash-Verified" },
    booked: { tone: "info", label: "Booked" },
    estimated: { tone: "queued", label: "Estimated" },
    at_risk: { tone: "warning", label: "At-Risk" },
    unknown: { tone: "dim", label: "Unknown" },
    false_profit: { tone: "danger", label: "False Profit" },
  };
  return map[status] ?? { tone: "neutral", label: status };
}

export function decisionChip(decision: string | null): { tone: ChipTone; label: string } {
  const map: Record<string, { tone: ChipTone; label: string }> = {
    scale: { tone: "verified", label: "Scale" },
    cut: { tone: "danger", label: "Cut" },
    needs_source: { tone: "dim", label: "Needs Source" },
    review: { tone: "warning", label: "Review" },
    watch: { tone: "neutral", label: "Watch" },
  };
  return decision ? map[decision] ?? { tone: "neutral", label: decision } : { tone: "neutral", label: "" };
}

export function leadStatusChip(status: string): { tone: ChipTone; label: string } {
  const map: Record<string, { tone: ChipTone; label: string }> = {
    sold: { tone: "verified", label: "Sold" },
    unsold: { tone: "neutral", label: "Unsold" },
    queued: { tone: "queued", label: "Queued" },
    pinged: { tone: "queued", label: "Pinged" },
    received: { tone: "info", label: "Received" },
    rejected: { tone: "warning", label: "Rejected" },
    duplicate: { tone: "info", label: "Duplicate" },
    error: { tone: "danger", label: "Error" },
    unmatched: { tone: "unmatched", label: "Unmatched" },
    returned: { tone: "danger", label: "Returned" },
    test: { tone: "dim", label: "Test" },
  };
  return map[status] ?? { tone: "neutral", label: status };
}

// Animated number ticker: counts to new values.
export function Ticker({ value, format, className = "" }: { value: number | null; format: (v: number | null) => string; className?: string }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState<number | null>(value);
  const previous = useRef<number | null>(value);

  useEffect(() => {
    if (value === null || previous.current === null || reduced) {
      setDisplay(value);
      previous.current = value;
      return;
    }
    const from = previous.current;
    const to = value;
    previous.current = value;
    if (from === to) return;
    const started = performance.now();
    const duration = 650;
    let frame: number;
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);

  return <span className={`font-mono-money ${className}`}>{format(display)}</span>;
}

export function Sparkline({
  data,
  width = 72,
  height = 20,
  stroke = "var(--cyan)",
  className = "",
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
}) {
  if (data.length < 2) {
    return <span className={`inline-block ${className}`} style={{ width, height }} />;
  }
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${((i / (data.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - ((v - min) / range) * (height - 4) + 1).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} className={`inline-block ${className}`} aria-hidden>
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

export function ConfidenceMeter({ value, className = "" }: { value: number; className?: string }) {
  const color = value >= 75 ? "var(--verified)" : value >= 55 ? "var(--warning)" : "var(--error)";
  return (
    <div className={`flex items-center gap-2 ${className}`} title={`Confidence ${value}/100`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[rgba(199,204,230,0.12)]">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="font-mono-money text-xs" style={{ color }}>{value}</span>
    </div>
  );
}

export interface AgingSegment {
  label: string;
  amountCents: number;
  tone: "verified" | "info" | "warning" | "unmatched" | "danger";
}

const AGING_COLORS: Record<AgingSegment["tone"], string> = {
  verified: "var(--verified)", info: "var(--info)", warning: "var(--warning)",
  unmatched: "var(--unmatched)", danger: "var(--error)",
};

export function AgingBar({ segments, className = "" }: { segments: AgingSegment[]; className?: string }) {
  const total = segments.reduce((s, seg) => s + seg.amountCents, 0);
  return (
    <div className={className}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[rgba(199,204,230,0.08)]">
        {segments.map((seg) =>
          seg.amountCents > 0 ? (
            <div
              key={seg.label}
              style={{ width: `${total > 0 ? (seg.amountCents / total) * 100 : 0}%`, background: AGING_COLORS[seg.tone] }}
              title={`${seg.label}: $${(seg.amountCents / 100).toLocaleString()}`}
            />
          ) : null
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <span key={seg.label} className="flex items-center gap-1.5 text-[11px] text-label">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: AGING_COLORS[seg.tone] }} />
            {seg.label}
            <span className="font-mono-money text-body">${(seg.amountCents / 100).toLocaleString()}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="text-3xl opacity-40">◇</div>
      <div className="text-sm font-semibold text-title">{title}</div>
      {hint && <div className="max-w-sm text-xs text-label">{hint}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`df-skeleton ${className}`} />;
}

export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`df-label ${className}`}>{children}</div>;
}

export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

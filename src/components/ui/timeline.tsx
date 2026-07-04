"use client";

import { Banknote, Landmark, FileText, PencilLine, Zap, CircleDot } from "lucide-react";
import { fmtCents } from "@/lib/money";
import { fmtDateTime } from "./format";

// Money-aware vertical timeline mixing operational and financial events.
// Financial events carry a source badge (stripe / xero / mercury / manual).

export interface TimelineEvent {
  kind: string;
  detail: Record<string, unknown>;
  at: string | Date;
}

const FINANCIAL_KINDS = new Set([
  "revenue_booked", "payment_due", "payment_matched", "supplier_cost_accrued",
  "supplier_payment_matched", "spend_matched", "returned", "reconciled",
]);

const KIND_LABEL: Record<string, string> = {
  received: "Lead received", validated: "Validated", dedupe_checked: "Dedupe checked",
  filtered: "Filtered out", routed: "Routing evaluated", ping_sent: "Ping sent",
  bid_received: "Bid received", posted: "Posted to buyer", accepted: "Accepted",
  rejected: "Rejected", delivered: "Delivered", revenue_booked: "Revenue booked",
  payment_due: "Payment due", payment_matched: "Payment matched",
  supplier_cost_accrued: "Supplier cost accrued", supplier_payment_matched: "Supplier payout matched",
  spend_matched: "Ad spend matched", returned: "Returned, revenue clawed back",
  reconciled: "Reconciled", note: "Note",
};

function SourceBadge({ source }: { source: string }) {
  const icons: Record<string, React.ReactNode> = {
    stripe: <Banknote size={11} />, mercury: <Landmark size={11} />,
    xero: <FileText size={11} />, manual: <PencilLine size={11} />,
  };
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-panelborder bg-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-label">
      {icons[source] ?? <CircleDot size={11} />} {source}
    </span>
  );
}

export function MoneyTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="relative ml-2 space-y-0">
      {events.map((e, i) => {
        const financial = FINANCIAL_KINDS.has(e.kind);
        const amount = typeof e.detail.amount_cents === "number" ? e.detail.amount_cents
          : typeof e.detail.revenue_clawback_cents === "number" ? e.detail.revenue_clawback_cents : null;
        const source = typeof e.detail.source === "string" ? e.detail.source : null;
        return (
          <div key={i} className="relative flex gap-3 pb-4 pl-4">
            <div className="absolute left-0 top-1.5 flex h-3 w-3 items-center justify-center">
              <span
                className={`h-2 w-2 rounded-full ${
                  financial ? "bg-[var(--verified)]" : "bg-[var(--info)]"
                } ${e.kind === "returned" || e.kind === "rejected" || e.kind === "filtered" ? "!bg-[var(--error)]" : ""}`}
              />
            </div>
            {i < events.length - 1 && (
              <div className="absolute left-[3.5px] top-4 h-full w-px bg-panelborder" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {financial ? <Banknote size={12} className="text-verified" /> : <Zap size={12} className="text-info" />}
                <span className="text-xs font-semibold text-title">{KIND_LABEL[e.kind] ?? e.kind}</span>
                {amount !== null && (
                  <span className={`font-mono-money text-xs ${e.kind === "returned" ? "text-danger" : "text-verified"}`}>
                    {e.kind === "returned" ? "-" : ""}{fmtCents(amount)}
                  </span>
                )}
                {source && <SourceBadge source={source} />}
                <span className="ml-auto text-[10px] text-label">{fmtDateTime(e.at)}</span>
              </div>
              <TimelineDetail detail={e.detail} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimelineDetail({ detail }: { detail: Record<string, unknown> }) {
  const interesting = Object.entries(detail).filter(
    ([k, v]) =>
      !["amount_cents", "source", "revenue_clawback_cents"].includes(k) &&
      v !== null && v !== undefined && typeof v !== "object" && String(v).length < 80
  );
  if (interesting.length === 0) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
      {interesting.slice(0, 5).map(([k, v]) => (
        <span key={k} className="text-[11px] text-label">
          {k.replace(/_/g, " ")}: <span className="text-body">{String(v)}</span>
        </span>
      ))}
    </div>
  );
}

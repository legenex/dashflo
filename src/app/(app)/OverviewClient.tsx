"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Radio } from "lucide-react";
import { GlassPanel, Chip, SectionLabel, Reveal, decisionChip, profitTruthChip, paymentChip, GradientButton } from "@/components/ui/primitives";
import { StatPair, StatSingle } from "@/components/ui/statpair";
import { RevenueTruthChart, StatusDonut } from "@/components/ui/charts";
import { FilterBar } from "@/components/ui/filterbar";
import { fmtCents, fmtPct } from "@/lib/money";
import { timeAgo } from "@/components/ui/format";
import { act } from "@/lib/client-api";

interface Totals {
  bookedRevenue: number;
  verifiedIncome: number | null;
  reportedProfit: number | null;
  cashProfit: number | null;
  spendTracked: number | null;
  spendPaid: number | null;
  supplierAccrued: number;
  supplierPaid: number | null;
  outstanding: number | null;
  dueSoon: number | null;
  overdue: number | null;
  shortPaid: number | null;
  trueCpl: number | null;
  cashMargin: number | null;
  dataQuality: number;
  unmatchedIn: number | null;
  deltas: { booked: number | null; verified: number | null; profit: number | null; cash: number | null };
}

export function OverviewClient(props: {
  rangeLabel: string;
  totals: Totals;
  chartData: Array<{ date: string; booked: number; verified: number | null; spend: number | null }>;
  statusData: Array<{ name: string; value: number }>;
  topCampaigns: Array<{ id: string; name: string; cashProfit: number | null; bookedProfit: number | null; decision: string | null; profitTruth: string }>;
  actionQueue: Array<{ id: string; issueType: string; entityName: string; priority: string; amountAtRiskCents: number | null; description: string }>;
  totalAtRisk: number;
  buyerRisk: Array<{ id: string; name: string; outstanding: number | null; overdue: number | null; shortPaid: number | null; paymentStatus: string; booked: number; verified: number | null }>;
  connectors: Array<{ provider: string; status: string; lastSyncAt: string | null; coveragePct: number; impact: string }>;
  health: { lastLeadAt: string | null; errorsToday: number; openVariances: number; queueDepth: number };
}) {
  const router = useRouter();
  const { totals: t } = props;
  const goRecon = () => router.push("/reconciliation?tab=queue");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-title">Overview</h1>
          <p className="text-xs text-label">One truth: what was booked, what cash is verified, and the gap. {props.rangeLabel}.</p>
        </div>
        <FilterBar />
      </div>

      {/* StatPair strip */}
      <Reveal>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatPair label="Revenue" booked={t.bookedRevenue} verified={t.verifiedIncome} delta={t.deltas.booked} onClick={goRecon} />
          <StatPair label="Profit" booked={t.reportedProfit} verified={t.cashProfit} bookedLabel="reported" verifiedLabel="cash" delta={t.deltas.profit} onClick={goRecon} />
          <StatPair label="Ad Spend" booked={t.spendTracked} verified={t.spendPaid} bookedLabel="tracked" verifiedLabel="paid" onClick={() => router.push("/reconciliation?tab=spend")} />
          <StatPair label="Supplier Cost" booked={t.supplierAccrued} verified={t.supplierPaid} bookedLabel="accrued" verifiedLabel="paid" onClick={() => router.push("/reconciliation?tab=suppliers")} />
        </div>
      </Reveal>
      <Reveal delay={0.05}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <StatSingle label="Outstanding" value={t.outstanding} sub="booked, not yet verified" format={(v) => fmtCents(v)} tone="warning" onClick={goRecon} />
          <StatSingle label="Due 7 Days" value={t.dueSoon} sub="inside the terms window" format={(v) => fmtCents(v)} onClick={goRecon} />
          <StatSingle label="Overdue" value={t.overdue} sub="past payment terms" format={(v) => fmtCents(v)} tone="danger" onClick={() => router.push("/distribution/buyers")} />
          <StatSingle label="Short-Paid" value={t.shortPaid} sub="flagged period variance" format={(v) => fmtCents(v)} tone="danger" onClick={goRecon} />
          <StatSingle label="True CPL" value={t.trueCpl} sub="paid spend / lead" format={(v) => fmtCents(v)} onClick={() => router.push("/reports/ad-performance")} />
          <StatSingle label="Cash Margin" value={t.cashMargin === null ? null : Math.round(t.cashMargin * 100)} sub="on verified income" format={(v) => (v === null ? "UNKNOWN" : `${v}%`)} tone={t.cashMargin !== null && t.cashMargin < 0 ? "danger" : "verified"} onClick={goRecon} />
          <StatSingle label="Data Quality" value={t.dataQuality} sub="money source coverage" format={(v) => (v === null ? "UNKNOWN" : `${v}/100`)} tone={t.dataQuality >= 90 ? "verified" : "warning"} onClick={() => router.push("/settings/data-sources")} />
        </div>
      </Reveal>

      {/* Revenue chart */}
      <Reveal delay={0.1}>
        <GlassPanel className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <SectionLabel>Booked revenue vs verified income vs spend, daily</SectionLabel>
            <span className="text-[11px] text-label">
              The distance between the bars and the green line is money you have not proven yet.
            </span>
          </div>
          <RevenueTruthChart data={props.chartData} />
        </GlassPanel>
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Action queue */}
        <Reveal delay={0.12}>
          <GlassPanel className="p-4 lg:col-span-1" glow={props.actionQueue.length > 0 ? "warning" : undefined}>
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel>Action Queue</SectionLabel>
              <span className="font-mono-money text-xs font-bold text-warning">{fmtCents(props.totalAtRisk)} at risk</span>
            </div>
            <div className="space-y-2">
              {props.actionQueue.length === 0 && (
                <div className="py-6 text-center text-xs text-label">Nothing needs attention. Rare, enjoy it.</div>
              )}
              {props.actionQueue.map((a) => (
                <div key={a.id} className="rounded-lg border border-panelborder bg-[rgba(11,14,35,0.4)] p-2.5">
                  <div className="flex items-center gap-2">
                    <Chip tone={a.priority === "critical" ? "danger" : a.priority === "high" ? "warning" : "neutral"}>
                      {a.issueType.replace(/_/g, " ")}
                    </Chip>
                    <span className="truncate text-xs font-semibold text-title">{a.entityName}</span>
                    {a.amountAtRiskCents !== null && (
                      <span className="ml-auto font-mono-money text-xs text-warning">{fmtCents(a.amountAtRiskCents)}</span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-label">{a.description}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <GradientButton
                      variant="cyan"
                      className="!px-2 !py-0.5 !text-[10px]"
                      onClick={() => {
                        const path =
                          a.issueType === "unmatched_income" || a.issueType === "short_paid" ? "/reconciliation?tab=queue"
                          : a.issueType === "payment_overdue" ? "/distribution/buyers"
                          : a.issueType === "missing_source" ? "/settings/data-sources"
                          : a.issueType === "spend_gap" ? "/reconciliation?tab=spend"
                          : a.issueType === "zero_sold_spend" ? "/reports/ad-performance"
                          : "/ai/insights?tab=actions";
                        router.push(path);
                      }}
                    >
                      Resolve <ArrowRight size={10} />
                    </GradientButton>
                    <GradientButton
                      variant="ghost"
                      className="!px-2 !py-0.5 !text-[10px]"
                      onClick={async () => {
                        await act("action.update", { id: a.id, status: "resolved", resolutionNote: "Resolved from overview" });
                        router.refresh();
                      }}
                    >
                      <CheckCircle2 size={10} /> Done
                    </GradientButton>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/ai/insights?tab=actions" className="mt-2 block text-center text-[11px] text-accent hover:underline">
              Full action queue
            </Link>
          </GlassPanel>
        </Reveal>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Leads by status */}
            <Reveal delay={0.14}>
              <GlassPanel className="p-4">
                <SectionLabel className="mb-1">Leads by status</SectionLabel>
                <StatusDonut data={props.statusData} />
              </GlassPanel>
            </Reveal>
            {/* Top campaigns */}
            <Reveal delay={0.16}>
              <GlassPanel className="p-4">
                <SectionLabel className="mb-2">Top campaigns by cash profit</SectionLabel>
                <div className="space-y-2">
                  {props.topCampaigns.map((c) => {
                    const d = decisionChip(c.decision);
                    const pt = profitTruthChip(c.profitTruth);
                    return (
                      <Link
                        key={c.id}
                        href={`/distribution/campaigns/${c.id}`}
                        className="flex items-center gap-2 rounded-lg border border-panelborder bg-[rgba(11,14,35,0.4)] px-2.5 py-2 hover:border-[rgba(139,92,246,0.5)]"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-title">{c.name}</span>
                        <Chip tone={pt.tone}>{pt.label}</Chip>
                        <Chip tone={d.tone}>{d.label}</Chip>
                        <span className={`font-mono-money text-xs font-bold ${c.cashProfit === null ? "text-label" : c.cashProfit < 0 ? "text-danger" : "text-verified"}`}>
                          {fmtCents(c.cashProfit)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </GlassPanel>
            </Reveal>
          </div>

          {/* Buyer payment risk */}
          <Reveal delay={0.18}>
            <GlassPanel className="p-4" glow={props.buyerRisk.some((b) => (b.overdue ?? 0) > 0) ? "danger" : undefined}>
              <div className="mb-2 flex items-center justify-between">
                <SectionLabel>Buyer payment risk</SectionLabel>
                <Link href="/distribution/buyers" className="text-[11px] text-accent hover:underline">All buyers</Link>
              </div>
              <div className="space-y-1.5">
                {props.buyerRisk.length === 0 && <div className="py-4 text-center text-xs text-label">Every buyer is current.</div>}
                {props.buyerRisk.map((b) => {
                  const chip = paymentChip(b.paymentStatus);
                  return (
                    <Link key={b.id} href={`/distribution/buyers?open=${b.id}`} className="flex items-center gap-3 rounded-lg border border-panelborder bg-[rgba(11,14,35,0.4)] px-3 py-2 hover:border-[rgba(239,68,68,0.4)]">
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-title">{b.name}</span>
                      <span className="hidden text-[11px] text-label sm:inline">
                        booked <span className="font-mono-money text-body">{fmtCents(b.booked)}</span>
                      </span>
                      <span className="text-[11px] text-label">
                        out <span className="font-mono-money text-warning">{fmtCents(b.outstanding)}</span>
                      </span>
                      {(b.overdue ?? 0) > 0 && (
                        <span className="text-[11px] text-label">
                          overdue <span className="font-mono-money text-danger">{fmtCents(b.overdue)}</span>
                        </span>
                      )}
                      {(b.shortPaid ?? 0) > 0 && (
                        <span className="text-[11px] text-label">
                          short <span className="font-mono-money text-danger">{fmtCents(b.shortPaid)}</span>
                        </span>
                      )}
                      <Chip tone={chip.tone}>{chip.label}</Chip>
                    </Link>
                  );
                })}
              </div>
            </GlassPanel>
          </Reveal>

          {/* Data confidence */}
          <Reveal delay={0.2}>
            <GlassPanel className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <SectionLabel>Data confidence</SectionLabel>
                <Link href="/settings/data-sources" className="text-[11px] text-accent hover:underline">Manage sources</Link>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {props.connectors.map((c) => (
                  <Link
                    key={c.provider}
                    href="/settings/data-sources"
                    className="flex items-center gap-2.5 rounded-lg border border-panelborder bg-[rgba(11,14,35,0.4)] px-2.5 py-2 hover:border-[rgba(34,211,238,0.4)]"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${c.status === "active" ? "df-live-dot" : ""}`}
                      style={{ background: c.status === "active" ? "var(--verified)" : c.status === "error" ? "var(--error)" : "var(--label)" }}
                    />
                    <span className="w-32 shrink-0 text-xs font-semibold text-title">{c.provider.replace(/_/g, " ")}</span>
                    <div className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-[rgba(199,204,230,0.1)] sm:block">
                      <div className="h-full rounded-full bg-[var(--cyan)]" style={{ width: `${c.coveragePct}%` }} />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-[10px] text-label">
                      {c.status === "active" ? (c.lastSyncAt ? `synced ${timeAgo(c.lastSyncAt)}` : "active") : c.impact}
                    </span>
                  </Link>
                ))}
              </div>
            </GlassPanel>
          </Reveal>
        </div>
      </div>

      {/* health strip */}
      <Reveal delay={0.22}>
        <GlassPanel className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-[11px] text-label">
            <Radio size={12} className="text-verified" /> Ingest endpoint live
          </span>
          <span className="text-[11px] text-label">
            Last lead <span className="text-body">{props.health.lastLeadAt ? timeAgo(props.health.lastLeadAt) : "never"}</span>
          </span>
          <span className="text-[11px] text-label">
            Errors today <span className={props.health.errorsToday > 0 ? "text-danger" : "text-body"}>{props.health.errorsToday}</span>
          </span>
          <span className="text-[11px] text-label">
            Match queue depth <span className={props.health.queueDepth > 0 ? "text-unmatched" : "text-body"}>{props.health.queueDepth}</span>
          </span>
          <span className="text-[11px] text-label">
            Open variances <span className={props.health.openVariances > 0 ? "text-warning" : "text-body"}>{props.health.openVariances}</span>
          </span>
          {(t.unmatchedIn ?? 0) > 0 && (
            <Link href="/reconciliation?tab=queue" className="ml-auto text-[11px] font-semibold text-unmatched hover:underline">
              {fmtCents(t.unmatchedIn)} unmatched income waiting
            </Link>
          )}
        </GlassPanel>
      </Reveal>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TruthGrid, type TruthGridRow } from "@/components/truthgrid/TruthGrid";
import { Chip, ConfidenceMeter, GradientButton, SectionLabel, Skeleton, paymentChip, profitTruthChip, leadStatusChip } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/tabs";
import { PeriodBars } from "@/components/ui/charts";
import { fmtCents, fmtPct } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/components/ui/format";
import { act, query } from "@/lib/client-api";
import type { BuyerCaps, DeliveryConfig } from "@/db/schema";

interface BuyerRow {
  id: string;
  name: string;
  status: string;
  termsDays: number;
  priceDefaultCents: number;
  caps: BuyerCaps;
  deliveryConfig: DeliveryConfig;
  notes: string | null;
  spark: number[];
  lastPaymentDate: string | null;
  truth: {
    leads: number; sold: number; soldRate: number | null; acceptRate: number | null;
    booked: number; verified: number | null; outstanding: number | null; dueSoon: number | null;
    overdue: number | null; shortPaid: number | null; gap: number | null;
    paymentStatus: string; profitTruth: string; risk: number;
  } | null;
}

export function BuyersClient({ rows, openId, canManage }: { rows: BuyerRow[]; openId: string | null; canManage: boolean }) {
  const router = useRouter();

  const gridRows: TruthGridRow[] = rows.map((b) => {
    const t = b.truth;
    const pc = paymentChip(t?.paymentStatus ?? "not_applicable");
    const pt = profitTruthChip(t?.profitTruth ?? "unknown");
    return {
      key: b.id,
      identity: {
        title: b.name,
        sub: `net-${b.termsDays} · risk ${t?.risk ?? 0}/100 · ${t?.leads ?? 0} leads · ${t ? fmtPct(t.soldRate) : "-"} sold`,
        spark: b.spark,
      },
      stat: { label: "Overdue", value: t?.overdue !== null && t?.overdue !== undefined ? fmtCents(t.overdue) : "UNKNOWN" },
      booked: { value: t?.booked ?? 0 },
      verified: { value: t?.verified ?? null, tone: "verified", chip: t?.verified === null ? "Needs Source" : undefined },
      gap: {
        value: t?.gap ?? null,
        tone: (t?.overdue ?? 0) > 0 || (t?.shortPaid ?? 0) > 0 ? "danger" : "gap",
        chip: t?.gap === null ? "Needs Source" : undefined,
      },
      chip: pc,
      chip2: pt,
      glow: (t?.overdue ?? 0) > 0 || (t?.shortPaid ?? 0) > 0 ? "danger" : t?.paymentStatus === "verified_paid" ? "verified" : null,
      actions: [
        { label: "Match payments", onClick: () => router.push("/reconciliation?tab=queue") },
        { label: "View reconciliation", onClick: () => router.push("/reconciliation?tab=buyers") },
        ...(canManage
          ? [{
              label: b.status === "active" ? "Pause buyer" : "Resume buyer",
              onClick: () => void act("buyer.status", { id: b.id, status: b.status === "active" ? "paused" : "active" }).then(() => router.refresh()),
            }]
          : []),
        {
          label: "Create action item",
          onClick: () => void act("action.create", {
            entityType: "buyer", entityId: b.id, entityName: b.name,
            issueType: "review", description: `Manual review requested for buyer ${b.name}`,
            amountAtRiskCents: b.truth?.outstanding ?? null,
          }).then(() => router.refresh()),
        },
      ],
      sortValues: { stat: t?.overdue ?? 0 },
    };
  });

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-title">Buyers</h1>
        <p className="text-xs text-label">Collection truth per buyer: booked, verified paid, and who actually owes you money.</p>
      </div>
      <TruthGrid
        rows={gridRows}
        bookedHeader="BOOKED"
        verifiedHeader="PAID"
        gapHeader="GAP"
        defaultOpenKey={openId ?? undefined}
        renderDrawer={(row) => {
          const buyer = rows.find((b) => b.id === row.key);
          return buyer ? <BuyerDrawer buyer={buyer} /> : null;
        }}
        maxHeight={720}
      />
    </div>
  );
}

interface DrawerData {
  buyer: { id: string; name: string; deliveryConfig: DeliveryConfig; caps: BuyerCaps; notes: string | null; paymentTermsDays: number };
  periods: Array<{ id: string; granularity: string; periodStart: string; periodEnd: string; expectedCents: number; invoicedCents: number; paidCents: number; varianceCents: number; status: string }>;
  matchedPayments: Array<{ id: string; source: string; date: string; amountCents: number; counterpartyName: string; externalRef: string | null; direction: string }>;
  unmatchedCandidates: Array<{ paymentId: string; confidence: number; reason: string; targetName: string; target: { type: string; invoiceId?: string; id?: string } }>;
  returns: Array<{ id: string; receivedAt: string; salePriceCents: number | null; state: string | null }>;
  recentLeads: Array<{ id: string; status: string; receivedAt: string; salePriceCents: number | null; paidAllocatedCents: number; reconciliationStatus: string; state: string | null; paymentDueDate: string | null }>;
}

function BuyerDrawer({ buyer }: { buyer: BuyerRow }) {
  const router = useRouter();
  const [data, setData] = useState<DrawerData | null>(null);
  const [testResult, setTestResult] = useState<{ request?: Record<string, unknown>; response?: Record<string, unknown> } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void query<DrawerData>("buyer.drawer", { id: buyer.id }).then(setData);
  }, [buyer.id]);

  if (!data) return <div className="space-y-2 p-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-28 w-full" /></div>;

  const monthPeriods = data.periods.filter((p) => p.granularity === "month").sort((a, b) => (a.periodStart < b.periodStart ? -1 : 1));

  return (
    <Tabs
      tabs={[
        {
          id: "performance", label: "Lead Performance",
          content: (
            <div className="space-y-1">
              {data.recentLeads.slice(0, 25).map((l) => {
                const chip = leadStatusChip(l.status);
                return (
                  <div key={l.id} className="flex items-center gap-3 rounded border border-panelborder px-2.5 py-1.5 text-xs">
                    <span className="font-mono-money text-label">{fmtDateTime(l.receivedAt)}</span>
                    <span className="text-label">{l.state}</span>
                    <Chip tone={chip.tone}>{chip.label}</Chip>
                    <span className="ml-auto font-mono-money text-body">{l.salePriceCents !== null ? fmtCents(l.salePriceCents) : ""}</span>
                    {l.paidAllocatedCents > 0 && <Chip tone="verified">{fmtCents(l.paidAllocatedCents)} paid</Chip>}
                    {l.status === "sold" && l.paidAllocatedCents === 0 && <Chip tone="queued">unpaid</Chip>}
                  </div>
                );
              })}
            </div>
          ),
        },
        {
          id: "booked-vs-paid", label: "Booked vs Paid",
          content: (
            <PeriodBars
              data={monthPeriods.map((p) => ({
                period: p.periodStart.slice(0, 7),
                expected: Math.round(p.expectedCents / 100),
                paid: Math.round(p.paidCents / 100),
              }))}
            />
          ),
        },
        {
          id: "payments", label: "Matched Payments", badge: data.matchedPayments.length,
          content: (
            <div className="space-y-1">
              {data.matchedPayments.length === 0 && <div className="text-xs text-label">No payments matched to this buyer yet. That IS the finding.</div>}
              {data.matchedPayments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded border border-panelborder px-2.5 py-1.5 text-xs">
                  <Chip tone="verified">{p.source}</Chip>
                  <span className="font-mono-money text-verified">{fmtCents(p.amountCents)}</span>
                  <span className="text-label">{p.externalRef ?? "no ref"}</span>
                  <span className="ml-auto font-mono-money text-label">{p.date}</span>
                </div>
              ))}
            </div>
          ),
        },
        {
          id: "candidates", label: "Unmatched Candidates", badge: data.unmatchedCandidates.length,
          content: (
            <div className="space-y-2">
              {data.unmatchedCandidates.length === 0 && <div className="text-xs text-label">No suggestions waiting.</div>}
              {data.unmatchedCandidates.map((s) => (
                <div key={s.paymentId} className="flex flex-wrap items-center gap-3 rounded-lg border border-panelborder bg-[rgba(11,14,35,0.4)] p-2.5">
                  <ConfidenceMeter value={s.confidence} />
                  <span className="min-w-0 flex-1 text-xs text-body">{s.reason} → <span className="font-semibold text-title">{s.targetName}</span></span>
                  <GradientButton
                    variant="cyan"
                    className="!px-2 !py-1 !text-[10px]"
                    onClick={async () => {
                      const target = s.target.type === "invoice"
                        ? { type: "invoice", invoiceId: s.target.invoiceId }
                        : { type: s.target.type, id: s.target.id };
                      await act("match.apply", { paymentId: s.paymentId, target, confidence: s.confidence });
                      router.refresh();
                    }}
                  >
                    Apply
                  </GradientButton>
                </div>
              ))}
            </div>
          ),
        },
        {
          id: "returns", label: "Returns", badge: data.returns.length,
          content: (
            <div className="space-y-1">
              {data.returns.length === 0 && <div className="text-xs text-label">No returns.</div>}
              {data.returns.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded border border-panelborder px-2.5 py-1.5 text-xs">
                  <span className="font-mono-money text-label">{fmtDate(r.receivedAt)}</span>
                  <span className="text-label">{r.state}</span>
                  <span className="ml-auto font-mono-money text-danger">-{fmtCents(r.salePriceCents)}</span>
                  <Chip tone="danger">clawed back</Chip>
                </div>
              ))}
            </div>
          ),
        },
        {
          id: "delivery", label: "Delivery Config",
          content: (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <SectionLabel>Endpoint</SectionLabel>
                <code className="block break-all rounded bg-[#070a1c] p-2 text-[11px] text-accent">{data.buyer.deliveryConfig.url}</code>
                <SectionLabel>Success matcher</SectionLabel>
                <code className="block rounded bg-[#070a1c] p-2 text-[11px] text-body">
                  {data.buyer.deliveryConfig.success_matcher.kind}: {data.buyer.deliveryConfig.success_matcher.expr} = {data.buyer.deliveryConfig.success_matcher.expected}
                </code>
                <SectionLabel>Body template</SectionLabel>
                <pre className="max-h-36 overflow-auto rounded bg-[#070a1c] p-2 text-[10px] text-body">{data.buyer.deliveryConfig.body_template}</pre>
                <div className="text-[11px] text-label">
                  Caps: {JSON.stringify(data.buyer.caps)} · timeout {data.buyer.deliveryConfig.timeout_ms}ms · retries {data.buyer.deliveryConfig.retries}
                </div>
              </div>
              <div className="space-y-2">
                <SectionLabel>Payload tester (fires a real call)</SectionLabel>
                <GradientButton
                  variant="cyan"
                  disabled={testing}
                  onClick={async () => {
                    setTesting(true);
                    const res = await act<{ request?: Record<string, unknown>; response?: Record<string, unknown> }>("buyer.payloadTest", { buyerId: buyer.id });
                    setTesting(false);
                    setTestResult(res.data);
                  }}
                >
                  {testing ? "Sending..." : "Send test payload"}
                </GradientButton>
                {testResult && (
                  <div className="grid gap-2">
                    <div>
                      <div className="df-label mb-1">Request</div>
                      <pre className="max-h-32 overflow-auto rounded bg-[#070a1c] p-2 text-[10px] text-body">{JSON.stringify(testResult.request, null, 2)}</pre>
                    </div>
                    <div>
                      <div className="df-label mb-1">Response</div>
                      <pre className="max-h-32 overflow-auto rounded bg-[#070a1c] p-2 text-[10px] text-body">{JSON.stringify(testResult.response, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ),
        },
        {
          id: "notes", label: "Notes",
          content: <p className="text-xs text-body">{data.buyer.notes ?? "No notes."}</p>,
        },
      ]}
    />
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Plus, RefreshCw, Trash2 } from "lucide-react";
import { GlassPanel, Chip, ConfidenceMeter, GradientButton, SectionLabel, AgingBar, EmptyState } from "@/components/ui/primitives";
import { fmtCents } from "@/lib/money";
import { act, query } from "@/lib/client-api";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "queue", label: "Match Queue" },
  { id: "bank", label: "Bank Feed" },
  { id: "invoices", label: "Invoices" },
  { id: "buyers", label: "Buyer Matching" },
  { id: "suppliers", label: "Supplier Payables" },
  { id: "spend", label: "Spend Matching" },
  { id: "rules", label: "Rules" },
];

interface PeriodRow {
  id: string; counterpartyId: string; counterparty: string; granularity: string;
  periodStart: string; periodEnd: string; expectedCents: number; invoicedCents: number;
  paidCents: number; varianceCents: number; status: string;
}

export function ReconciliationClient(props: {
  initialTab: string;
  overview: {
    revenueGap: number | null; unmatchedIn: number | null; unmatchedOut: number | null;
    outstanding: number | null; overdue: number | null;
    openGaps: Array<{ id: string; counterparty: string; type: string; period: string; expectedCents: number; paidCents: number; varianceCents: number }>;
    oldestUnresolved: string | null; resolvedCount: number; openCount: number;
  };
  bankFeed: Array<{ id: string; date: string; amountCents: number; direction: string; counterpartyName: string; memo: string | null; matchStatus: string }>;
  monthlyStrip: Array<{ month: string; cashIn: number; cashOut: number; net: number; reportedProfit: number }>;
  invoices: Array<{ id: string; direction: string; counterparty: string; counterpartyType: string; externalRef: string | null; source: string; issueDate: string; dueDate: string; amountCents: number; amountPaidCents: number; status: string }>;
  aging: { current: number; d30: number; d60: number; d90: number; d90plus: number };
  buyerPeriods: PeriodRow[];
  supplierPeriods: PeriodRow[];
  spendMatching: Array<{ month: string; platforms: Array<{ platform: string; tracked: number; paid: number }> }>;
  rules: Array<{ id: string; name: string; counterpartyPattern: string; amountTolerancePct: number; dateWindowDays: number; target: string; targetId: string | null; active: boolean }>;
  buyerNames: Array<{ id: string; name: string }>;
  supplierNames: Array<{ id: string; name: string }>;
  buyerOverdueByName: Record<string, number>;
}) {
  const [tab, setTab] = useState(props.initialTab);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-title">Reconciliation</h1>
        <p className="text-xs text-label">The workbench: this is where gaps get closed and booked numbers become verified ones.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === t.id ? "df-grad-bg text-white" : "border border-panelborder text-label hover:text-body"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab data={props.overview} onOpenQueue={() => setTab("queue")} />}
      {tab === "queue" && <MatchQueueTab />}
      {tab === "bank" && <BankFeedTab feed={props.bankFeed} monthly={props.monthlyStrip} />}
      {tab === "invoices" && <InvoicesTab invoices={props.invoices} aging={props.aging} buyers={props.buyerNames} suppliers={props.supplierNames} />}
      {tab === "buyers" && <PeriodsTab periods={props.buyerPeriods} kind="buyer" />}
      {tab === "suppliers" && <PeriodsTab periods={props.supplierPeriods} kind="supplier" />}
      {tab === "spend" && <SpendTab data={props.spendMatching} />}
      {tab === "rules" && <RulesTab rules={props.rules} buyers={props.buyerNames} suppliers={props.supplierNames} />}
    </div>
  );
}

function OverviewTab({ data, onOpenQueue }: { data: Parameters<typeof ReconciliationClient>[0]["overview"]; onOpenQueue: () => void }) {
  const totalAtRisk = data.openGaps.reduce((s, g) => s + Math.abs(g.varianceCents), 0) + (data.overdue ?? 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <GlassPanel className="p-3.5"><SectionLabel>Revenue gap</SectionLabel><div className="font-mono-money mt-1 text-lg font-bold text-warning">{fmtCents(data.revenueGap)}</div></GlassPanel>
        <GlassPanel className="p-3.5"><SectionLabel>Unmatched in</SectionLabel><div className="font-mono-money mt-1 text-lg font-bold text-unmatched">{fmtCents(data.unmatchedIn)}</div></GlassPanel>
        <GlassPanel className="p-3.5"><SectionLabel>Overdue</SectionLabel><div className="font-mono-money mt-1 text-lg font-bold text-danger">{fmtCents(data.overdue)}</div></GlassPanel>
        <GlassPanel className="p-3.5"><SectionLabel>Total at risk</SectionLabel><div className="font-mono-money mt-1 text-lg font-bold text-danger">{fmtCents(totalAtRisk)}</div></GlassPanel>
        <GlassPanel className="p-3.5"><SectionLabel>Resolve rate</SectionLabel><div className="font-mono-money mt-1 text-lg font-bold text-verified">{data.resolvedCount}/{data.resolvedCount + data.openCount}</div><div className="text-[10px] text-label">action items closed</div></GlassPanel>
      </div>
      <GlassPanel className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Open gaps by counterparty</SectionLabel>
          {data.oldestUnresolved && <span className="text-[11px] text-label">oldest unresolved period starts {data.oldestUnresolved}</span>}
        </div>
        {data.openGaps.length === 0 ? (
          <EmptyState title="No flagged variances" hint="Every completed period reconciles within tolerance." />
        ) : (
          <div className="space-y-1.5">
            {data.openGaps.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-panelborder bg-[rgba(11,14,35,0.4)] px-3 py-2">
                <Chip tone={g.type === "buyer" ? "info" : "queued"}>{g.type}</Chip>
                <span className="text-xs font-semibold text-title">{g.counterparty}</span>
                <span className="text-[11px] text-label">{g.period}</span>
                <span className="text-[11px] text-label">expected <span className="font-mono-money text-body">{fmtCents(g.expectedCents)}</span></span>
                <span className="text-[11px] text-label">paid <span className="font-mono-money text-verified">{fmtCents(g.paidCents)}</span></span>
                <span className="ml-auto font-mono-money text-xs font-bold text-danger">{fmtCents(g.varianceCents)} short</span>
                <GradientButton variant="cyan" className="!px-2 !py-1 !text-[10px]" onClick={onOpenQueue}>Resolve</GradientButton>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

// ---- Match Queue ----
interface QueueData {
  payments: Array<{ id: string; source: string; date: string; amountCents: number; direction: string; counterpartyName: string; memo: string | null; matchStatus: string; externalRef: string | null }>;
  suggestions: Array<{ paymentId: string; confidence: number; tier: string; reason: string; targetName: string; target: { type: string; invoiceId?: string; id?: string } }>;
  targets: {
    invoices: Array<{ id: string; label: string; direction: string }>;
    buyers: Array<{ id: string; label: string }>;
    suppliers: Array<{ id: string; label: string }>;
    platforms: Array<{ id: string; label: string }>;
  };
}

function MatchQueueTab() {
  const router = useRouter();
  const [data, setData] = useState<QueueData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [targetType, setTargetType] = useState("invoice");
  const [targetId, setTargetId] = useState("");
  const [splitAmount, setSplitAmount] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    void query<QueueData>("matchqueue.list").then(setData);
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!selected || !targetId) {
      setPreview(null);
      return;
    }
    const target = targetType === "invoice" ? { type: "invoice", invoiceId: targetId } : { type: targetType, id: targetId };
    void act<{ preview?: { effect: string; target_name: string } }>("matchqueue.preview", { paymentId: selected, target }).then((res) => {
      setPreview(res.data.preview ? `${res.data.preview.target_name}: ${res.data.preview.effect}` : null);
    });
  }, [selected, targetType, targetId]);

  if (!data) return <GlassPanel className="p-8 text-center text-xs text-label">Loading queue...</GlassPanel>;

  const suggestionFor = (paymentId: string) => data.suggestions.find((s) => s.paymentId === paymentId);
  const apply = async (paymentId: string, target: Record<string, unknown>, confidence: number, split?: number) => {
    const res = await act<{ message?: string }>("match.apply", {
      paymentId, target, confidence, ...(split ? { splitAmountCents: split } : {}),
    });
    setMessage(res.ok ? "Match applied. Verified figures, periods, and action items updated." : res.error ?? "Failed");
    setSelected(null);
    setTargetId("");
    load();
    router.refresh();
  };

  const options =
    targetType === "invoice" ? data.targets.invoices.map((i) => ({ id: i.id, label: i.label }))
    : targetType === "buyer" ? data.targets.buyers
    : targetType === "supplier" ? data.targets.suppliers
    : data.targets.platforms;

  return (
    <div className="space-y-3">
      {message && (
        <GlassPanel className="flex items-center gap-2 px-4 py-2 text-xs text-verified" glow="verified">{message}</GlassPanel>
      )}
      <div className="flex items-center justify-between">
        <SectionLabel>{data.payments.length} unmatched payments</SectionLabel>
        <GradientButton variant="ghost" className="!text-[11px]" onClick={async () => {
          const res = await act<{ applied?: number }>("match.autorun");
          setMessage(`Auto-match applied ${res.data.applied ?? 0} high-confidence matches.`);
          load();
          router.refresh();
        }}>
          <RefreshCw size={12} /> Run auto-match
        </GradientButton>
      </div>
      {data.payments.length === 0 && <GlassPanel><EmptyState title="Queue is empty" hint="Every payment is matched. Verified income is fully accounted for." /></GlassPanel>}
      {data.payments.map((p) => {
        const s = suggestionFor(p.id);
        const isOpen = selected === p.id;
        return (
          <GlassPanel key={p.id} className={`p-3 ${isOpen ? "df-gradient-border" : ""}`}>
            <div className="flex flex-wrap items-center gap-3">
              {p.direction === "in" ? <ArrowDownLeft size={15} className="text-verified" /> : <ArrowUpRight size={15} className="text-unmatched" />}
              <span className="font-mono-money text-sm font-bold text-title">{fmtCents(p.amountCents)}</span>
              <span className="text-xs text-body">{p.counterpartyName}</span>
              <Chip tone="neutral">{p.source}</Chip>
              <span className="text-[11px] text-label">{p.date}{p.memo ? ` · ${p.memo}` : ""}</span>
              {p.matchStatus === "disputed" && <Chip tone="danger">disputed</Chip>}
              <div className="ml-auto flex items-center gap-2">
                {s && <ConfidenceMeter value={s.confidence} />}
                <GradientButton variant="ghost" className="!px-2 !py-1 !text-[10px]" onClick={() => setSelected(isOpen ? null : p.id)}>
                  {isOpen ? "Close" : "Match"}
                </GradientButton>
              </div>
            </div>
            {s && !isOpen && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[rgba(34,211,238,0.25)] bg-[rgba(34,211,238,0.05)] px-3 py-2">
                <span className="text-[11px] text-body">Suggestion: {s.reason} → <span className="font-semibold text-title">{s.targetName}</span></span>
                <GradientButton
                  variant="cyan"
                  className="ml-auto !px-2.5 !py-1 !text-[10px]"
                  onClick={() => {
                    const target = s.target.type === "invoice" ? { type: "invoice", invoiceId: s.target.invoiceId } : { type: s.target.type, id: s.target.id };
                    void apply(p.id, target, s.confidence);
                  }}
                >
                  Apply suggestion
                </GradientButton>
                <GradientButton variant="danger" className="!px-2.5 !py-1 !text-[10px]" onClick={async () => {
                  await act("match.dispute", { paymentId: p.id });
                  load();
                }}>
                  Dispute
                </GradientButton>
              </div>
            )}
            {isOpen && (
              <div className="mt-3 space-y-2 border-t border-panelborder pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs text-body" value={targetType} onChange={(e) => { setTargetType(e.target.value); setTargetId(""); }}>
                    <option value="invoice">Invoice</option>
                    <option value="buyer">Buyer period</option>
                    <option value="supplier">Supplier period</option>
                    <option value="ad_platform">Ad platform</option>
                  </select>
                  <select className="min-w-64 flex-1 rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs text-body" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                    <option value="">Select target...</option>
                    {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                  <input
                    type="number"
                    placeholder={`Split $ (max ${(p.amountCents / 100).toFixed(2)})`}
                    className="w-40 rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs text-body"
                    value={splitAmount}
                    onChange={(e) => setSplitAmount(e.target.value)}
                  />
                </div>
                {preview && (
                  <div className="rounded-lg border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.06)] px-3 py-2 text-[11px] text-verified">
                    Preview: {preview}
                  </div>
                )}
                <div className="flex gap-2">
                  <GradientButton
                    disabled={!targetId}
                    className="!text-[11px]"
                    onClick={() => {
                      const target = targetType === "invoice" ? { type: "invoice", invoiceId: targetId } : { type: targetType, id: targetId };
                      void apply(p.id, target, 100, splitAmount ? Math.round(Number(splitAmount) * 100) : undefined);
                    }}
                  >
                    Apply match
                  </GradientButton>
                  <GradientButton variant="danger" className="!text-[11px]" onClick={async () => {
                    await act("match.dispute", { paymentId: p.id });
                    setSelected(null);
                    load();
                  }}>
                    Dispute
                  </GradientButton>
                </div>
              </div>
            )}
          </GlassPanel>
        );
      })}
    </div>
  );
}

function BankFeedTab({ feed, monthly }: { feed: Parameters<typeof ReconciliationClient>[0]["bankFeed"]; monthly: Parameters<typeof ReconciliationClient>[0]["monthlyStrip"] }) {
  let running = 0;
  const withBalance = [...feed].sort((a, b) => (a.date < b.date ? -1 : 1)).map((p) => {
    running += p.direction === "in" ? p.amountCents : -p.amountCents;
    return { ...p, balance: running };
  }).reverse();

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        {monthly.slice(-3).map((m) => (
          <GlassPanel key={m.month} className="p-3.5">
            <SectionLabel>{m.month}</SectionLabel>
            <div className="mt-1.5 space-y-0.5 text-xs">
              <div className="flex justify-between"><span className="text-label">Cash in</span><span className="font-mono-money text-verified">{fmtCents(m.cashIn)}</span></div>
              <div className="flex justify-between"><span className="text-label">Cash out</span><span className="font-mono-money text-danger">{fmtCents(m.cashOut)}</span></div>
              <div className="flex justify-between"><span className="text-label">Net cash</span><span className={`font-mono-money font-bold ${m.net >= 0 ? "text-verified" : "text-danger"}`}>{fmtCents(m.net)}</span></div>
              <div className="flex justify-between"><span className="text-label">Reported profit</span><span className="font-mono-money text-body">{fmtCents(m.reportedProfit)}</span></div>
              <div className="flex justify-between border-t border-panelborder pt-1"><span className="text-label">Cash vs reported gap</span><span className="font-mono-money font-bold text-warning">{fmtCents(m.reportedProfit - m.net)}</span></div>
            </div>
          </GlassPanel>
        ))}
      </div>
      <GlassPanel className="divide-y divide-[rgba(38,43,77,0.5)]">
        {withBalance.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="font-mono-money w-20 text-[11px] text-label">{p.date}</span>
            {p.direction === "in" ? <ArrowDownLeft size={13} className="text-verified" /> : <ArrowUpRight size={13} className="text-unmatched" />}
            <span className={`font-mono-money w-24 text-xs font-semibold ${p.direction === "in" ? "text-verified" : "text-danger"}`}>
              {p.direction === "in" ? "+" : "-"}{fmtCents(p.amountCents)}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-body">{p.counterpartyName}{p.memo ? ` · ${p.memo}` : ""}</span>
            <Chip tone={p.matchStatus === "unmatched" ? "unmatched" : p.matchStatus === "disputed" ? "danger" : "verified"}>
              {p.matchStatus.replace(/_/g, " ")}
            </Chip>
            <span className="font-mono-money hidden w-24 text-right text-[11px] text-label md:block">{fmtCents(p.balance)}</span>
          </div>
        ))}
      </GlassPanel>
    </div>
  );
}

function InvoicesTab({ invoices, aging, buyers, suppliers }: {
  invoices: Parameters<typeof ReconciliationClient>[0]["invoices"];
  aging: Parameters<typeof ReconciliationClient>[0]["aging"];
  buyers: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ direction: "receivable", counterpartyType: "buyer", counterpartyId: "", amount: "", issueDate: "", dueDate: "", externalRef: "" });
  const overdueTotal = invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + i.amountCents - i.amountPaidCents, 0);
  const cps = form.counterpartyType === "buyer" ? buyers : suppliers;

  return (
    <div className="space-y-3">
      {overdueTotal > 0 && (
        <GlassPanel className="flex items-center gap-3 px-4 py-2.5" glow="danger">
          <Chip tone="danger">Overdue</Chip>
          <span className="text-xs text-body"><span className="font-mono-money font-bold text-danger">{fmtCents(overdueTotal)}</span> of invoiced revenue is past due.</span>
        </GlassPanel>
      )}
      <GlassPanel className="p-4">
        <SectionLabel className="mb-2">Receivables aging</SectionLabel>
        <AgingBar segments={[
          { label: "Current", amountCents: aging.current, tone: "verified" },
          { label: "1-30", amountCents: aging.d30, tone: "info" },
          { label: "31-60", amountCents: aging.d60, tone: "warning" },
          { label: "61-90", amountCents: aging.d90, tone: "unmatched" },
          { label: "90+", amountCents: aging.d90plus, tone: "danger" },
        ]} />
      </GlassPanel>
      <div className="flex justify-end">
        <GradientButton variant="ghost" className="!text-[11px]" onClick={() => setShowForm((s) => !s)}><Plus size={12} /> Manual invoice</GradientButton>
      </div>
      {showForm && (
        <GlassPanel className="grid gap-2 p-4 md:grid-cols-3">
          <select className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
            <option value="receivable">Receivable (buyer owes us)</option>
            <option value="payable">Payable (we owe)</option>
          </select>
          <select className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.counterpartyType} onChange={(e) => setForm({ ...form, counterpartyType: e.target.value, counterpartyId: "" })}>
            <option value="buyer">Buyer</option>
            <option value="supplier">Supplier</option>
          </select>
          <select className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.counterpartyId} onChange={(e) => setForm({ ...form, counterpartyId: e.target.value })}>
            <option value="">Counterparty...</option>
            {cps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input placeholder="Amount $" type="number" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input type="date" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
          <input type="date" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <input placeholder="External ref (optional)" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs md:col-span-2" value={form.externalRef} onChange={(e) => setForm({ ...form, externalRef: e.target.value })} />
          <GradientButton className="!text-[11px]" disabled={!form.counterpartyId || !form.amount || !form.issueDate || !form.dueDate} onClick={async () => {
            await act("invoice.create", {
              direction: form.direction, counterpartyType: form.counterpartyType, counterpartyId: form.counterpartyId,
              amountCents: Math.round(Number(form.amount) * 100), issueDate: form.issueDate, dueDate: form.dueDate,
              externalRef: form.externalRef || null,
            });
            setShowForm(false);
            router.refresh();
          }}>Create invoice</GradientButton>
        </GlassPanel>
      )}
      <GlassPanel className="divide-y divide-[rgba(38,43,77,0.5)]">
        {invoices.map((inv) => (
          <div key={inv.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <Chip tone={inv.direction === "receivable" ? "info" : "queued"}>{inv.direction === "receivable" ? "AR" : "AP"}</Chip>
            <span className="font-mono-money w-28 text-[11px] text-label">{inv.externalRef ?? inv.id.slice(0, 12)}</span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-title">{inv.counterparty}</span>
            <span className="text-[11px] text-label">due {inv.dueDate}</span>
            <span className="font-mono-money text-xs text-body">{fmtCents(inv.amountPaidCents)} / {fmtCents(inv.amountCents)}</span>
            <Chip tone={inv.status === "paid" ? "verified" : inv.status === "overdue" ? "danger" : inv.status === "partial" ? "warning" : "neutral"}>
              {inv.status}
            </Chip>
          </div>
        ))}
      </GlassPanel>
    </div>
  );
}

function PeriodsTab({ periods, kind }: { periods: PeriodRow[]; kind: "buyer" | "supplier" }) {
  const router = useRouter();
  const [granularity, setGranularity] = useState("month");
  const [openId, setOpenId] = useState<string | null>(null);
  const filtered = periods.filter((p) => p.granularity === granularity).sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {["month", "week"].map((g) => (
          <button key={g} type="button" onClick={() => setGranularity(g)}
            className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold ${granularity === g ? "df-grad-bg text-white" : "border border-panelborder text-label"}`}>
            {g}ly
          </button>
        ))}
      </div>
      <GlassPanel className="divide-y divide-[rgba(38,43,77,0.5)]">
        {filtered.length === 0 && <EmptyState title="No periods yet" />}
        {filtered.map((p) => (
          <div key={p.id}>
            <button type="button" className="flex w-full cursor-pointer flex-wrap items-center gap-3 px-3 py-2 text-left hover:bg-[rgba(26,31,66,0.5)]" onClick={() => setOpenId(openId === p.id ? null : p.id)}>
              <span className="w-40 truncate text-xs font-semibold text-title">{p.counterparty}</span>
              <span className="font-mono-money text-[11px] text-label">{p.periodStart} → {p.periodEnd}</span>
              <span className="text-[11px] text-label">expected <span className="font-mono-money text-body">{fmtCents(p.expectedCents)}</span></span>
              <span className="text-[11px] text-label">invoiced <span className="font-mono-money text-body">{fmtCents(p.invoicedCents)}</span></span>
              <span className="text-[11px] text-label">paid <span className="font-mono-money text-verified">{fmtCents(p.paidCents)}</span></span>
              <span className={`font-mono-money ml-auto text-xs font-bold ${p.varianceCents > 0 ? "text-danger" : "text-verified"}`}>
                {p.varianceCents === 0 ? "±$0" : fmtCents(p.varianceCents)}
              </span>
              <Chip tone={p.status === "matched" ? "verified" : p.status === "variance_flagged" ? "danger" : p.status === "resolved" ? "info" : "neutral"}>
                {p.status.replace(/_/g, " ")}
              </Chip>
            </button>
            {openId === p.id && (
              <div className="flex items-center gap-2 border-t border-panelborder bg-[rgba(11,14,35,0.5)] px-3 py-2">
                <span className="text-[11px] text-label">
                  {kind === "buyer" ? "Sold leads inside this period keep per-lead paid state, open them from the Leads page filtered to this buyer." : "Supplier cost accrues per lead, payouts allocate oldest first."}
                </span>
                <GradientButton variant="ghost" className="ml-auto !px-2 !py-1 !text-[10px]" onClick={() => router.push(kind === "buyer" ? "/leads?status=sold" : "/leads")}>
                  Open leads
                </GradientButton>
                {p.status === "variance_flagged" && (
                  <GradientButton variant="cyan" className="!px-2 !py-1 !text-[10px]" onClick={async () => {
                    await act("period.resolve", { periodId: p.id, note: "Marked resolved from workbench" });
                    router.refresh();
                  }}>
                    Mark resolved
                  </GradientButton>
                )}
              </div>
            )}
          </div>
        ))}
      </GlassPanel>
    </div>
  );
}

function SpendTab({ data }: { data: Parameters<typeof ReconciliationClient>[0]["spendMatching"] }) {
  return (
    <div className="space-y-3">
      {data.map((m) => (
        <GlassPanel key={m.month} className="p-4">
          <SectionLabel className="mb-2">{m.month}</SectionLabel>
          <div className="space-y-1.5">
            {m.platforms.map((p) => {
              const gapCents = p.tracked - p.paid;
              return (
                <div key={p.platform} className="flex flex-wrap items-center gap-3">
                  <span className="w-16 text-xs font-semibold capitalize text-title">{p.platform}</span>
                  <div className="h-2.5 min-w-32 flex-1 overflow-hidden rounded-full bg-[rgba(199,204,230,0.08)]">
                    <div className="h-full rounded-full bg-[var(--verified)]" style={{ width: `${p.tracked > 0 ? (p.paid / p.tracked) * 100 : 0}%` }} />
                  </div>
                  <span className="text-[11px] text-label">tracked <span className="font-mono-money text-body">{fmtCents(p.tracked)}</span></span>
                  <span className="text-[11px] text-label">bank-verified <span className="font-mono-money text-verified">{fmtCents(p.paid)}</span></span>
                  {gapCents > 0 ? (
                    <Chip tone="unmatched">{fmtCents(gapCents)} unverified</Chip>
                  ) : (
                    <Chip tone="verified">fully verified</Chip>
                  )}
                </div>
              );
            })}
          </div>
        </GlassPanel>
      ))}
    </div>
  );
}

function RulesTab({ rules, buyers, suppliers }: {
  rules: Parameters<typeof ReconciliationClient>[0]["rules"];
  buyers: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", pattern: "", tolerance: 10, window: 30, target: "buyer", targetId: "" });
  const [testHits, setTestHits] = useState<Array<{ id: string; counterparty: string; amount_cents: number; date: string }> | null>(null);
  const targets = form.target === "buyer" ? buyers : form.target === "supplier" ? suppliers : [{ id: "meta", name: "Meta" }, { id: "google", name: "Google" }, { id: "tiktok", name: "TikTok" }];

  return (
    <div className="space-y-3">
      <GlassPanel className="space-y-2 p-4">
        <SectionLabel>New match rule</SectionLabel>
        <div className="grid gap-2 md:grid-cols-3">
          <input placeholder="Rule name" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Counterparty pattern (regex)" className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 font-mono-money text-xs" value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} />
          <div className="flex gap-2">
            <select className="flex-1 rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value, targetId: "" })}>
              <option value="buyer">buyer</option><option value="supplier">supplier</option><option value="ad_platform">ad platform</option>
            </select>
            <select className="flex-1 rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs" value={form.targetId} onChange={(e) => setForm({ ...form, targetId: e.target.value })}>
              <option value="">target...</option>
              {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GradientButton variant="ghost" className="!text-[11px]" onClick={async () => {
            const res = await act<{ hits?: Array<{ id: string; counterparty: string; amount_cents: number; date: string }> }>("rule.test", { counterpartyPattern: form.pattern });
            setTestHits(res.data.hits ?? []);
          }} disabled={!form.pattern}>
            Test against unmatched payments
          </GradientButton>
          <GradientButton className="!text-[11px]" disabled={!form.name || !form.pattern || !form.targetId} onClick={async () => {
            await act("rule.save", {
              name: form.name, counterpartyPattern: form.pattern, amountTolerancePct: form.tolerance,
              dateWindowDays: form.window, target: form.target, targetId: form.targetId, active: true,
            });
            setForm({ name: "", pattern: "", tolerance: 10, window: 30, target: "buyer", targetId: "" });
            router.refresh();
          }}>
            Save rule
          </GradientButton>
        </div>
        {testHits && (
          <div className="rounded-lg border border-panelborder bg-[rgba(11,14,35,0.5)] p-2 text-[11px]">
            {testHits.length === 0 ? (
              <span className="text-label">No unmatched payments match this pattern.</span>
            ) : (
              testHits.map((h) => (
                <div key={h.id} className="flex gap-3 py-0.5 text-body">
                  <span className="font-mono-money">{fmtCents(h.amount_cents)}</span>
                  <span>{h.counterparty}</span>
                  <span className="text-label">{h.date}</span>
                </div>
              ))
            )}
          </div>
        )}
      </GlassPanel>
      <GlassPanel className="divide-y divide-[rgba(38,43,77,0.5)]">
        {rules.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="w-40 text-xs font-semibold text-title">{r.name}</span>
            <code className="font-mono-money text-[11px] text-accent">{r.counterpartyPattern}</code>
            <span className="text-[11px] text-label">±{r.amountTolerancePct}% · {r.dateWindowDays}d window</span>
            <Chip tone="neutral">{r.target}{r.targetId ? `: ${r.targetId}` : ""}</Chip>
            <Chip tone={r.active ? "verified" : "dim"}>{r.active ? "active" : "off"}</Chip>
            <button type="button" className="ml-auto cursor-pointer p-1 text-label hover:text-danger" onClick={async () => {
              await act("rule.delete", { id: r.id });
              router.refresh();
            }} aria-label="Delete rule">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </GlassPanel>
    </div>
  );
}

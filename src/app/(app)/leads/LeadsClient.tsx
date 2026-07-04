"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TruthGrid, type TruthGridRow } from "@/components/truthgrid/TruthGrid";
import { FilterBar } from "@/components/ui/filterbar";
import { Chip, GradientButton, leadStatusChip, Skeleton, type ChipTone } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/tabs";
import { MoneyTimeline } from "@/components/ui/timeline";
import { fmtCents } from "@/lib/money";
import { fmtDateTime } from "@/components/ui/format";
import { act, query } from "@/lib/client-api";

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "sold", label: "Sold" },
  { id: "unsold", label: "Unsold" },
  { id: "queued", label: "Queued" },
  { id: "rejected", label: "Rejected" },
  { id: "duplicates", label: "Duplicates" },
  { id: "errors", label: "Errors" },
  { id: "returned", label: "Returned" },
  { id: "unmatched", label: "Unmatched" },
];

const PAYMENT_CHIP: Record<string, { tone: ChipTone; label: string }> = {
  paid: { tone: "verified", label: "Paid" },
  partial: { tone: "info", label: "Partial" },
  pending: { tone: "queued", label: "Pending" },
  overdue: { tone: "danger", label: "Overdue" },
  returned: { tone: "danger", label: "Clawed back" },
  na: { tone: "dim", label: "n/a" },
};

interface LeadRow {
  id: string;
  receivedAt: string;
  supplier: string;
  name: string;
  phone: string;
  campaign: string;
  state: string | null;
  buyer: string | null;
  status: string;
  isTest: boolean;
  salePriceCents: number | null;
  paidAllocatedCents: number;
  cashProfit: number | null;
  paymentState: string;
}

export function LeadsClient({
  rows,
  statusCounts,
  openId,
  filterOptions,
  buyers,
}: {
  rows: LeadRow[];
  statusCounts: Record<string, number>;
  openId: string | null;
  filterOptions: {
    campaigns: Array<{ id: string; label: string }>;
    buyers: Array<{ id: string; label: string }>;
    suppliers: Array<{ id: string; label: string }>;
  };
  buyers: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const activeStatus = params.get("status") ?? "all";

  const setStatus = (id: string) => {
    const next = new URLSearchParams(params.toString());
    if (id === "all") next.delete("status");
    else next.set("status", id);
    router.push(`?${next.toString()}`, { scroll: false });
  };

  const searched = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) || r.phone.includes(q) ||
      r.campaign.toLowerCase().includes(q) || (r.buyer ?? "").toLowerCase().includes(q) ||
      r.id.includes(q) || (r.state ?? "").toLowerCase().includes(q)
    );
  });

  const gridRows: TruthGridRow[] = searched.map((r) => ({
    key: r.id,
    identity: {
      title: r.name + (r.isTest ? " (test)" : ""),
      sub: `${fmtDateTime(r.receivedAt)} · ${r.supplier} · ${r.campaign}${r.state ? ` · ${r.state}` : ""}${r.phone ? ` · ${r.phone}` : ""}`,
    },
    stat: { label: "Buyer", value: r.buyer ?? "-" },
    booked: { value: r.salePriceCents, tone: "default", chip: r.salePriceCents === null ? undefined : undefined },
    verified: {
      value: r.status === "sold" || r.status === "returned" ? r.paidAllocatedCents : null,
      tone: "verified",
      chip: r.status !== "sold" && r.status !== "returned" ? "n/a" : undefined,
    },
    gap: {
      value: r.salePriceCents !== null ? r.salePriceCents - r.paidAllocatedCents : null,
      tone: r.paymentState === "overdue" ? "danger" : "gap",
      chip: r.salePriceCents === null ? "n/a" : undefined,
    },
    chip: leadStatusChip(r.status),
    chip2: PAYMENT_CHIP[r.paymentState],
    glow: r.paymentState === "overdue" ? "danger" : r.paymentState === "paid" ? "verified" : null,
    actions: [
      { label: "View truth", onClick: () => {} },
      ...(r.status === "sold"
        ? [{ label: "Mark returned (clawback)", danger: true, onClick: () => void act("lead.return", { leadId: r.id }).then(() => router.refresh()) }]
        : []),
      ...(["unsold", "unmatched", "error", "rejected"].includes(r.status)
        ? [{ label: "Re-route", onClick: () => void act("lead.reroute", { leadId: r.id }).then(() => router.refresh()) }]
        : []),
      { label: "Create action item", onClick: () => void act("action.create", {
          entityType: "lead", entityId: r.id, entityName: r.name,
          description: `Review lead ${r.name} (${r.id})`,
        }).then(() => router.refresh()) },
    ],
    sortValues: { stat: r.buyer ?? "" },
  }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-title">Leads</h1>
          <p className="text-xs text-label">{searched.length} leads · every row carries its payment truth</p>
        </div>
        <FilterBar
          selects={[
            { param: "campaigns", label: "Campaign", options: filterOptions.campaigns },
            { param: "buyers", label: "Buyer", options: filterOptions.buyers },
            { param: "suppliers", label: "Supplier", options: filterOptions.suppliers },
          ]}
          showCompare={false}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setStatus(t.id)}
            className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              activeStatus === t.id ? "df-grad-bg text-white" : "border border-panelborder text-label hover:text-body"
            }`}
          >
            {t.label}
            {t.id !== "all" && statusCounts[t.id === "duplicates" ? "duplicate" : t.id === "errors" ? "error" : t.id] ? (
              <span className="ml-1 opacity-70">{statusCounts[t.id === "duplicates" ? "duplicate" : t.id === "errors" ? "error" : t.id]}</span>
            ) : null}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, id..."
          className="ml-auto w-52 rounded-lg border border-panelborder bg-panel px-3 py-1.5 text-xs text-title outline-none placeholder:text-label focus:border-[var(--grad-to)]"
        />
      </div>

      <TruthGrid
        rows={gridRows}
        bookedHeader="BOOKED"
        verifiedHeader="PAID"
        gapHeader="GAP"
        defaultOpenKey={openId ?? undefined}
        renderDrawer={(row) => <LeadDrawer leadId={row.key} buyers={buyers} />}
        emptyTitle="No leads in this view"
        emptyHint="Adjust the date range or fire the docs cURL to watch one arrive live."
        maxHeight={720}
      />
    </div>
  );
}

interface LeadDetail {
  lead: {
    id: string; status: string; fieldData: Record<string, unknown>; state: string | null;
    normalizedPhone: string; normalizedEmail: string | null; salePriceCents: number | null;
    supplierCostCents: number | null; paidAllocatedCents: number; supplierPaidCents: number;
    paymentDueDate: string | null; reconciliationStatus: string; isTest: boolean;
    receivedAt: string; soldAt: string | null; errorMessage: string | null;
    trustedFormUrl: string | null; jornayaId: string | null;
    adMeta: Record<string, string> | null;
  };
  campaign: { id: string; name: string } | null;
  buyer: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  events: Array<{ kind: string; detail: Record<string, unknown>; at: string }>;
  attempts: Array<{
    id: string; buyerId: string; attemptType: string; outcome: string; responseCode: number | null;
    bidCents: number | null; durationMs: number;
    requestPayload: Record<string, unknown>; responsePayload: Record<string, unknown>; at: string;
  }>;
  matchedPayments: Array<{ id: string; source: string; date: string; amountCents: number; counterpartyName: string; externalRef: string | null }>;
}

function LeadDrawer({ leadId, buyers }: { leadId: string; buyers: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [data, setData] = useState<LeadDetail | null>(null);
  const [sendBuyer, setSendBuyer] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void query<LeadDetail>("lead.detail", { id: leadId }).then(setData);
  }, [leadId]);

  if (!data) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const l = data.lead;
  const revenueGap = (l.salePriceCents ?? 0) - l.paidAllocatedCents;
  const bookedProfit = (l.salePriceCents ?? 0) - (l.supplierCostCents ?? 0);
  const cashProfit = l.paidAllocatedCents - l.supplierPaidCents;

  return (
    <Tabs
      tabs={[
        {
          id: "details", label: "Details",
          content: (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-3">
              {Object.entries(l.fieldData).map(([k, v]) => (
                <div key={k}>
                  <div className="df-label">{k.replace(/_/g, " ")}</div>
                  <div className="truncate text-xs text-body">{String(v)}</div>
                </div>
              ))}
              <div><div className="df-label">lead id</div><div className="font-mono-money text-xs text-body">{l.id}</div></div>
              {l.adMeta?.ad_id && (
                <div><div className="df-label">ad</div><div className="font-mono-money text-xs text-body">{l.adMeta.ad_id} ({l.adMeta.platform})</div></div>
              )}
              {l.errorMessage && (
                <div className="col-span-2"><div className="df-label">error</div><div className="text-xs text-danger">{l.errorMessage}</div></div>
              )}
            </div>
          ),
        },
        {
          id: "timeline", label: "Timeline", badge: data.events.length,
          content: <MoneyTimeline events={data.events} />,
        },
        {
          id: "attempts", label: "Attempts", badge: data.attempts.length,
          content: (
            <div className="space-y-2">
              {data.attempts.length === 0 && <div className="text-xs text-label">No delivery attempts.</div>}
              {data.attempts.map((a) => (
                <details key={a.id} className="rounded-lg border border-panelborder bg-[rgba(11,14,35,0.5)] p-2">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-xs">
                    <Chip tone={a.outcome === "accepted" ? "verified" : a.outcome === "rejected" ? "warning" : "danger"}>
                      {a.attemptType} · {a.outcome}
                    </Chip>
                    <span className="text-body">{buyers.find((b) => b.id === a.buyerId)?.name ?? a.buyerId}</span>
                    <span className="font-mono-money text-label">HTTP {a.responseCode} · {a.durationMs}ms</span>
                    {a.bidCents !== null && <span className="font-mono-money text-accent">bid {fmtCents(a.bidCents)}</span>}
                    <span className="ml-auto text-[10px] text-label">{fmtDateTime(a.at)}</span>
                  </summary>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <div>
                      <div className="df-label mb-1">Request</div>
                      <pre className="max-h-44 overflow-auto rounded bg-[#070a1c] p-2 text-[10px] leading-relaxed text-body">{JSON.stringify(a.requestPayload, null, 2)}</pre>
                    </div>
                    <div>
                      <div className="df-label mb-1">Response</div>
                      <pre className="max-h-44 overflow-auto rounded bg-[#070a1c] p-2 text-[10px] leading-relaxed text-body">{JSON.stringify(a.responsePayload, null, 2)}</pre>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          ),
        },
        {
          id: "truth", label: "Financial Truth",
          content: (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5 rounded-lg border border-panelborder p-3">
                <div className="df-label mb-1">Revenue truth</div>
                <TruthLine label="Booked revenue" value={l.salePriceCents} />
                <TruthLine label="Verified paid" value={l.status === "sold" || l.status === "returned" ? l.paidAllocatedCents : null} tone="verified" />
                <TruthLine label="Revenue gap" value={l.salePriceCents !== null ? revenueGap : null} tone={revenueGap > 0 ? "warning" : "verified"} />
                <div className="flex justify-between text-xs">
                  <span className="text-label">Due date</span>
                  <span className="font-mono-money text-body">{l.paymentDueDate ? l.paymentDueDate.slice(0, 10) : "-"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-label">Reconciliation</span>
                  <Chip tone={l.reconciliationStatus === "matched" ? "verified" : l.reconciliationStatus === "partial" ? "info" : "neutral"}>
                    {l.reconciliationStatus}
                  </Chip>
                </div>
                {data.matchedPayments.length > 0 && (
                  <div className="mt-2">
                    <div className="df-label mb-1">Matched transactions</div>
                    {data.matchedPayments.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-[11px] text-body">
                        <Chip tone="verified">{p.source}</Chip>
                        <span className="font-mono-money">{fmtCents(p.amountCents)}</span>
                        <span className="text-label">{p.externalRef ?? p.id} · {p.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5 rounded-lg border border-panelborder p-3">
                <div className="df-label mb-1">Cost and profit truth</div>
                <TruthLine label="Supplier cost accrued" value={l.supplierCostCents} />
                <TruthLine label="Supplier cost paid" value={l.supplierPaidCents} tone="verified" />
                <div className="my-2 border-t border-panelborder" />
                <TruthLine label="Booked profit" value={l.salePriceCents !== null ? bookedProfit : null} />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-label">Cash profit</span>
                  <span className="flex items-center gap-2">
                    <span className={`font-mono-money font-bold ${cashProfit < 0 ? "text-danger" : "text-verified"}`}>{fmtCents(cashProfit)}</span>
                    <Chip tone={l.paidAllocatedCents >= (l.salePriceCents ?? 0) && (l.salePriceCents ?? 0) > 0 ? "verified" : "warning"}>
                      {l.paidAllocatedCents >= (l.salePriceCents ?? 0) && (l.salePriceCents ?? 0) > 0 ? "cash-verified" : "unproven"}
                    </Chip>
                  </span>
                </div>
              </div>
            </div>
          ),
        },
        {
          id: "actions", label: "Actions",
          content: (
            <div className="flex flex-wrap items-center gap-2">
              {["unsold", "unmatched", "rejected", "error"].includes(l.status) && (
                <GradientButton variant="cyan" onClick={async () => {
                  const res = await act<{ message?: string }>("lead.reroute", { leadId: l.id });
                  setMessage(res.data.message ?? res.error ?? "");
                  router.refresh();
                }}>
                  Re-route
                </GradientButton>
              )}
              {l.status === "sold" && (
                <GradientButton variant="danger" onClick={async () => {
                  const res = await act<{ message?: string }>("lead.return", { leadId: l.id });
                  setMessage(res.data.message ?? res.error ?? "");
                  router.refresh();
                }}>
                  Mark returned (revenue clawback)
                </GradientButton>
              )}
              <span className="flex items-center gap-1.5">
                <select
                  value={sendBuyer}
                  onChange={(e) => setSendBuyer(e.target.value)}
                  className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 text-xs text-body"
                >
                  <option value="">Send to buyer...</option>
                  {buyers.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <GradientButton
                  variant="ghost"
                  disabled={!sendBuyer || l.status === "sold"}
                  onClick={async () => {
                    const res = await act<{ message?: string }>("lead.send", { leadId: l.id, buyerId: sendBuyer });
                    setMessage(res.data.message ?? res.error ?? "");
                    router.refresh();
                  }}
                >
                  Send
                </GradientButton>
              </span>
              <GradientButton variant="ghost" onClick={async () => {
                await act("action.create", {
                  entityType: "lead", entityId: l.id,
                  entityName: `${String(l.fieldData.first_name ?? "Lead")} ${String(l.fieldData.last_name ?? "")}`,
                  description: `Manual review requested for lead ${l.id}`,
                });
                setMessage("Action item created");
              }}>
                Create action item
              </GradientButton>
              {message && <span className="text-xs text-accent">{message}</span>}
            </div>
          ),
        },
      ]}
    />
  );
}

function TruthLine({ label, value, tone }: { label: string; value: number | null; tone?: "verified" | "warning" }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-label">{label}</span>
      <span className={`font-mono-money font-semibold ${value === null ? "text-label" : tone === "verified" ? "text-verified" : tone === "warning" ? "text-warning" : "text-title"}`}>
        {fmtCents(value)}
      </span>
    </div>
  );
}

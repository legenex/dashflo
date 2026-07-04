"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUp, ArrowDown, Copy, FlaskConical, Pause, Play } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel, decisionChip, profitTruthChip, leadStatusChip } from "@/components/ui/primitives";
import { StatPair, StatSingle } from "@/components/ui/statpair";
import { Tabs } from "@/components/ui/tabs";
import { fmtCents, fmtPct } from "@/lib/money";
import { fmtDateTime } from "@/components/ui/format";
import { act } from "@/lib/client-api";
import type { FieldDef, InboundFilters, CapiConfig } from "@/db/schema";

interface CampaignInfo {
  id: string; name: string; slug: string; vertical: string; type: string; status: string;
  distributionMethod: string; fieldMapping: FieldDef[]; inboundFilters: InboundFilters | null;
  dedupeWindowDays: number; paymentTermsDays: number; description: string | null;
  capiConfig: CapiConfig | null;
}

export function CampaignDetailClient({
  campaign, truth, routing, leads, ingest,
}: {
  campaign: CampaignInfo;
  truth: {
    leads: number; sold: number; soldRate: number | null; booked: number; verified: number | null;
    reportedProfit: number | null; cashProfit: number | null; gap: number | null;
    profitTruth: string; decision: string | null; spendTracked: number | null; spendPaid: number | null;
  };
  routing: Array<{ buyerId: string; name: string; priority: number; weight: number; priceOverrideCents: number | null; buyerStatus: string }>;
  leads: Array<{ id: string; name: string; status: string; state: string | null; receivedAt: string; salePriceCents: number | null; paidAllocatedCents: number; isTest: boolean }>;
  ingest: { url: string; supplierName: string; curl: string };
}) {
  const router = useRouter();
  const [order, setOrder] = useState(routing);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);

  const pt = profitTruthChip(truth.profitTruth);
  const dec = decisionChip(truth.decision);

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...order];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    const reOrdered = next.map((r, i) => ({ ...r, priority: i + 1 }));
    setOrder(reOrdered);
    await act("campaign.routing", {
      campaignId: campaign.id,
      order: reOrdered.map((r) => ({ buyerId: r.buyerId, priority: r.priority })),
    });
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-title">{campaign.name}</h1>
            <Chip tone="info">{campaign.vertical.replace("_", " ")}</Chip>
            <Chip tone="queued">{campaign.type === "ping_post" ? "ping post" : "direct post"}</Chip>
            <Chip tone={campaign.status === "active" ? "verified" : "neutral"}>{campaign.status}</Chip>
          </div>
          <p className="mt-1 text-xs text-label">{campaign.description}</p>
        </div>
        <GradientButton
          variant={campaign.status === "active" ? "ghost" : "primary"}
          onClick={async () => {
            await act("campaign.status", { id: campaign.id, status: campaign.status === "active" ? "paused" : "active" });
            router.refresh();
          }}
        >
          {campaign.status === "active" ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Activate</>}
        </GradientButton>
      </div>

      {/* truth header */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatPair label="Revenue" booked={truth.booked} verified={truth.verified} />
        <StatPair label="Profit" booked={truth.reportedProfit} verified={truth.cashProfit} bookedLabel="reported" verifiedLabel="cash" />
        <StatPair label="Ad Spend" booked={truth.spendTracked} verified={truth.spendPaid} bookedLabel="tracked" verifiedLabel="paid" />
        <StatSingle label="Sold Rate" value={truth.soldRate === null ? null : Math.round(truth.soldRate * 100)} sub={`${truth.sold} of ${truth.leads} leads`} format={(v) => (v === null ? "UNKNOWN" : `${v}%`)} />
        <GlassPanel className="flex flex-col justify-center gap-1.5 p-3.5">
          <SectionLabel>Truth verdict</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            <Chip tone={pt.tone}>{pt.label}</Chip>
            {dec.label && <Chip tone={dec.tone}>Decision: {dec.label}</Chip>}
          </div>
        </GlassPanel>
      </div>

      <GlassPanel>
        <Tabs
          tabs={[
            {
              id: "routing", label: "Routing",
              content: (
                <div className="space-y-2">
                  <p className="text-[11px] text-label">
                    Distribution method: <span className="font-semibold text-body">{campaign.distributionMethod}</span>.
                    Reorder priorities with the arrows, first eligible buyer wins on direct post.
                  </p>
                  {order.map((r, i) => (
                    <div key={r.buyerId} className="flex items-center gap-3 rounded-lg border border-panelborder bg-[rgba(11,14,35,0.4)] px-3 py-2">
                      <span className="font-mono-money w-6 text-center text-xs text-label">#{r.priority}</span>
                      <span className="flex-1 text-sm font-semibold text-title">{r.name}</span>
                      <Chip tone={r.buyerStatus === "active" ? "verified" : "neutral"}>{r.buyerStatus}</Chip>
                      <span className="text-[11px] text-label">weight {r.weight}</span>
                      <span className="font-mono-money text-xs text-body">
                        {r.priceOverrideCents !== null ? `${fmtCents(r.priceOverrideCents)} override` : "buyer default"}
                      </span>
                      <span className="flex gap-1">
                        <button type="button" className="cursor-pointer rounded p-1 text-label hover:text-title disabled:opacity-30" onClick={() => void move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp size={13} /></button>
                        <button type="button" className="cursor-pointer rounded p-1 text-label hover:text-title disabled:opacity-30" onClick={() => void move(i, 1)} disabled={i === order.length - 1} aria-label="Move down"><ArrowDown size={13} /></button>
                      </span>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              id: "leads", label: "Recent Leads", badge: leads.length,
              content: (
                <div className="space-y-1">
                  {leads.map((l) => {
                    const chip = leadStatusChip(l.status);
                    return (
                      <Link key={l.id} href={`/leads?open=${l.id}`} className="flex items-center gap-3 rounded-lg border border-panelborder bg-[rgba(11,14,35,0.35)] px-3 py-1.5 hover:border-[rgba(139,92,246,0.4)]">
                        <span className="w-32 truncate text-xs font-semibold text-title">{l.name || "(no name)"}{l.isTest ? " (test)" : ""}</span>
                        <span className="text-[11px] text-label">{fmtDateTime(l.receivedAt)}</span>
                        <span className="text-[11px] text-label">{l.state}</span>
                        <Chip tone={chip.tone}>{chip.label}</Chip>
                        <span className="ml-auto font-mono-money text-xs text-body">{l.salePriceCents !== null ? fmtCents(l.salePriceCents) : ""}</span>
                        {l.paidAllocatedCents > 0 && <span className="font-mono-money text-xs text-verified">{fmtCents(l.paidAllocatedCents)} paid</span>}
                      </Link>
                    );
                  })}
                </div>
              ),
            },
            {
              id: "ingest", label: "Ingest",
              content: (
                <div className="space-y-3">
                  <div>
                    <SectionLabel className="mb-1">Endpoint</SectionLabel>
                    <code className="block rounded-lg bg-[#070a1c] p-2 text-xs text-accent">POST {ingest.url}</code>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <SectionLabel>Copy-ready cURL (uses the seeded {ingest.supplierName} key)</SectionLabel>
                      <GradientButton
                        variant="ghost"
                        className="!px-2 !py-1 !text-[10px]"
                        onClick={() => {
                          void navigator.clipboard.writeText(ingest.curl);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        }}
                      >
                        <Copy size={11} /> {copied ? "Copied" : "Copy"}
                      </GradientButton>
                    </div>
                    <pre className="max-h-72 overflow-auto rounded-lg bg-[#070a1c] p-3 text-[11px] leading-relaxed text-body">{ingest.curl}</pre>
                  </div>
                </div>
              ),
            },
            {
              id: "test", label: "Test",
              content: (
                <div className="space-y-3">
                  <p className="text-xs text-label">
                    Fires a synthetic test lead through the full pipeline: validation, dedupe, filters, caps, and
                    live delivery to the mock buyers. Test leads are excluded from money, truth, and CAPI.
                  </p>
                  <GradientButton
                    disabled={testing}
                    onClick={async () => {
                      setTesting(true);
                      setTestResult(null);
                      const res = await act<{ result?: Record<string, unknown>; sent?: Record<string, unknown> }>("campaign.testLead", { campaignId: campaign.id });
                      setTesting(false);
                      setTestResult(JSON.stringify(res.data.result ?? res.error, null, 2));
                      router.refresh();
                    }}
                  >
                    <FlaskConical size={13} /> {testing ? "Routing..." : "Fire test lead"}
                  </GradientButton>
                  {testResult && (
                    <pre className="max-h-56 overflow-auto rounded-lg bg-[#070a1c] p-3 text-[11px] text-body">{testResult}</pre>
                  )}
                </div>
              ),
            },
            {
              id: "settings", label: "Settings",
              content: (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <SectionLabel className="mb-2">Field mapping ({campaign.fieldMapping.length} fields)</SectionLabel>
                    <div className="space-y-1">
                      {campaign.fieldMapping.map((f) => (
                        <div key={f.key} className="flex items-center gap-2 text-xs">
                          <code className="text-accent">{f.key}</code>
                          <Chip tone="neutral">{f.type}</Chip>
                          {f.required && <Chip tone="warning">required</Chip>}
                          <span className="ml-auto text-label">{f.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <SectionLabel className="mb-2">Inbound filters</SectionLabel>
                      {campaign.inboundFilters?.groups.map((g) => (
                        <div key={g.id} className="mb-1.5 rounded-lg border border-panelborder p-2">
                          <div className="text-xs font-semibold text-title">{g.name ?? g.id} <span className="text-label">({g.logic.toUpperCase()})</span></div>
                          {g.rules.map((r, i) => (
                            <div key={i} className="font-mono-money text-[11px] text-body">{r.field} {r.operator} {JSON.stringify(r.value)}</div>
                          ))}
                          {g.schedule && (
                            <div className="text-[10px] text-label">live {g.schedule.start_hour}:00-{g.schedule.end_hour}:00, days {g.schedule.days.join(",")}</div>
                          )}
                        </div>
                      )) ?? <div className="text-xs text-label">No filters</div>}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-label">
                      <span>Dedupe window <span className="text-body">{campaign.dedupeWindowDays}d</span></span>
                      <span>Payment terms <span className="text-body">net-{campaign.paymentTermsDays}</span></span>
                      <span>CAPI <span className="text-body">{campaign.capiConfig?.enabled ? "enabled" : "off"}</span></span>
                    </div>
                    <Link href={`/distribution/campaigns/new?edit=${campaign.id}`}>
                      <GradientButton variant="ghost">Edit in wizard</GradientButton>
                    </Link>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </GlassPanel>
    </div>
  );
}

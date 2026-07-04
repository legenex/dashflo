"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCw } from "lucide-react";
import { TruthGrid, type TruthGridRow } from "@/components/truthgrid/TruthGrid";
import { Chip, GradientButton, SectionLabel, Skeleton, type ChipTone } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/tabs";
import { fmtCents } from "@/lib/money";
import { act, query } from "@/lib/client-api";
import type { FieldDef } from "@/db/schema";

interface SupplierRow {
  id: string; name: string; status: string; pricingModel: string; fixedPriceCents: number | null;
  termsDays: number; keyPrefix: string; leads: number; sold: number; qualityScore: number;
  profitAfterCost: number; appUrl: string;
  truth: { accrued: number; paid: number | null; gap: number | null; missingStatement: boolean } | null;
}

export function SuppliersClient({ rows, openId }: { rows: SupplierRow[]; openId: string | null }) {
  const router = useRouter();

  const chipFor = (s: SupplierRow): { tone: ChipTone; label: string } => {
    const t = s.truth;
    if (!t || t.accrued === 0) return { tone: "dim", label: "No cost" };
    if (t.paid === null) return { tone: "dim", label: "Needs Source" };
    if ((t.gap ?? 0) > 25000) return { tone: "unmatched", label: "Cost Gap" };
    if (t.paid >= t.accrued * 0.99) return { tone: "verified", label: "Paid" };
    if (t.paid > 0) return { tone: "warning", label: "Accrued Not Paid" };
    return { tone: "warning", label: "Accrued Not Paid" };
  };

  const gridRows: TruthGridRow[] = rows.map((s) => ({
    key: s.id,
    identity: {
      title: s.name,
      sub: `${s.pricingModel === "fixed_cpl" ? `$${((s.fixedPriceCents ?? 0) / 100).toFixed(0)} CPL` : s.pricingModel === "rev_share" ? "rev share" : "no cost"} · net-${s.termsDays} · quality ${s.qualityScore}/100`,
    },
    stat: { label: "Leads", value: `${s.leads} (${s.sold} sold)` },
    booked: { value: s.truth?.accrued ?? 0 },
    verified: { value: s.truth?.paid ?? null, tone: "verified", chip: s.truth?.paid === null ? "Needs Source" : undefined },
    gap: { value: s.truth?.gap ?? null, tone: "gap" },
    chip: chipFor(s),
    chip2: s.truth?.missingStatement ? { tone: "dim", label: "Missing Statement" } : undefined,
    actions: [
      { label: "Statement matching", onClick: () => router.push("/reconciliation?tab=suppliers") },
      { label: "Match payments", onClick: () => router.push("/reconciliation?tab=queue") },
      {
        label: s.status === "active" ? "Pause supplier" : "Resume supplier",
        onClick: () => void act("supplier.status", { id: s.id, status: s.status === "active" ? "paused" : "active" }).then(() => router.refresh()),
      },
      {
        label: "Create action item",
        onClick: () => void act("action.create", {
          entityType: "supplier", entityId: s.id, entityName: s.name,
          description: `Manual review requested for supplier ${s.name}`,
        }).then(() => router.refresh()),
      },
    ],
    sortValues: { stat: s.leads },
  }));

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-title">Suppliers</h1>
        <p className="text-xs text-label">The payables mirror: what you owe, what you have actually paid, and lead quality per source.</p>
      </div>
      <TruthGrid
        rows={gridRows}
        bookedHeader="ACCRUED"
        verifiedHeader="PAID"
        gapHeader="GAP"
        defaultOpenKey={openId ?? undefined}
        renderDrawer={(row) => {
          const s = rows.find((x) => x.id === row.key);
          return s ? <SupplierDrawer supplier={s} /> : null;
        }}
      />
    </div>
  );
}

interface SupplierDrawerData {
  supplier: { id: string; name: string; apiKeyPrefix: string; pricingModel: string; fixedPriceCents: number | null; notes: string | null };
  periods: Array<{ id: string; granularity: string; periodStart: string; periodEnd: string; expectedCents: number; paidCents: number; varianceCents: number; status: string }>;
  payments: Array<{ id: string; source: string; date: string; amountCents: number; externalRef: string | null }>;
  leadStats: { total: number; sold: number; duplicates: number; rejected: number; errors: number };
  campaigns: Array<{ id: string; name: string; slug: string; fieldMapping: FieldDef[] }>;
}

function SupplierDrawer({ supplier }: { supplier: SupplierRow }) {
  const [data, setData] = useState<SupplierDrawerData | null>(null);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    void query<SupplierDrawerData>("supplier.drawer", { id: supplier.id }).then(setData);
  }, [supplier.id]);

  if (!data) return <div className="space-y-2 p-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-24 w-full" /></div>;

  const demoKey = supplier.name === "LeadFlow" ? "df_sup_leadflow_demo_4f8a2c91d7" : supplier.name === "Internal Meta" ? "df_sup_internalmeta_demo_1b7d9e3f52" : null;

  const buildCurl = (c: SupplierDrawerData["campaigns"][number]): string => {
    const sample: Record<string, string> = {};
    for (const f of c.fieldMapping) {
      sample[f.key] =
        f.key === "first_name" ? "Jordan" : f.key === "last_name" ? "Rivera"
        : f.type === "phone" ? "(512) 555-0135" : f.type === "email" ? "jordan@example.com"
        : f.type === "date" ? "06/12/2026" : f.type === "state" ? "TX" : f.type === "zip" ? "78701"
        : f.type === "boolean" ? "no" : f.type === "select" ? (f.options?.[0] ?? "") : f.type === "number" ? "4" : "value";
    }
    return `curl -X POST ${supplier.appUrl}/api/ingest/${c.slug} \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${rotatedKey ?? demoKey ?? "YOUR_SUPPLIER_KEY"}" \\
  -d '${JSON.stringify(sample)}'`;
  };

  return (
    <Tabs
      tabs={[
        {
          id: "quality", label: "Lead Quality",
          content: (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {Object.entries(data.leadStats).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-panelborder p-3 text-center">
                  <div className="font-mono-money text-lg font-bold text-title">{v}</div>
                  <div className="df-label">{k}</div>
                </div>
              ))}
            </div>
          ),
        },
        {
          id: "accrual", label: "Cost Accrual",
          content: (
            <div className="space-y-1">
              {data.periods.filter((p) => p.granularity === "month").map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded border border-panelborder px-3 py-2 text-xs">
                  <span className="font-mono-money text-label">{p.periodStart.slice(0, 7)}</span>
                  <span>accrued <span className="font-mono-money text-title">{fmtCents(p.expectedCents)}</span></span>
                  <span>paid <span className="font-mono-money text-verified">{fmtCents(p.paidCents)}</span></span>
                  <span className="ml-auto">
                    <Chip tone={p.status === "matched" ? "verified" : p.status === "variance_flagged" ? "danger" : "warning"}>
                      {p.status === "matched" ? "settled" : `${fmtCents(p.varianceCents)} open`}
                    </Chip>
                  </span>
                </div>
              ))}
            </div>
          ),
        },
        {
          id: "payments", label: "Payment History", badge: data.payments.length,
          content: (
            <div className="space-y-1">
              {data.payments.length === 0 && <div className="text-xs text-label">No payouts recorded.</div>}
              {data.payments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded border border-panelborder px-2.5 py-1.5 text-xs">
                  <Chip tone="verified">{p.source}</Chip>
                  <span className="font-mono-money text-body">{fmtCents(p.amountCents)}</span>
                  <span className="text-label">{p.externalRef}</span>
                  <span className="ml-auto font-mono-money text-label">{p.date}</span>
                </div>
              ))}
            </div>
          ),
        },
        {
          id: "statements", label: "Statement Matching",
          content: (
            <div className="space-y-2 text-xs text-label">
              <p>
                Supplier statements are not connected yet, so accruals are verified only by bank outflows.
                Upload statements in Settings, Data Sources to close the loop.
              </p>
              <GradientButton variant="ghost" onClick={() => (window.location.href = "/settings/data-sources")}>Open Data Sources</GradientButton>
            </div>
          ),
        },
        {
          id: "api", label: "API Access",
          content: (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <SectionLabel>Supplier key</SectionLabel>
                <code className="rounded bg-[#070a1c] px-2 py-1 text-xs text-accent">
                  {rotatedKey ?? demoKey ?? `df_sup_${data.supplier.apiKeyPrefix}...`}
                </code>
                <GradientButton
                  variant="ghost"
                  className="!px-2 !py-1 !text-[10px]"
                  onClick={async () => {
                    const res = await act<{ apiKey?: string }>("supplier.rotateKey", { id: supplier.id });
                    if (res.data.apiKey) setRotatedKey(res.data.apiKey);
                  }}
                >
                  <RefreshCw size={11} /> Rotate
                </GradientButton>
              </div>
              {data.campaigns.map((c) => (
                <div key={c.id}>
                  <div className="mb-1 flex items-center justify-between">
                    <SectionLabel>{c.name} ingest cURL (built from the live field mapping)</SectionLabel>
                    <GradientButton
                      variant="ghost"
                      className="!px-2 !py-1 !text-[10px]"
                      onClick={() => {
                        void navigator.clipboard.writeText(buildCurl(c));
                        setCopied(c.id);
                        setTimeout(() => setCopied(null), 1500);
                      }}
                    >
                      <Copy size={11} /> {copied === c.id ? "Copied" : "Copy"}
                    </GradientButton>
                  </div>
                  <pre className="max-h-40 overflow-auto rounded-lg bg-[#070a1c] p-2.5 text-[10px] leading-relaxed text-body">{buildCurl(c)}</pre>
                </div>
              ))}
            </div>
          ),
        },
        {
          id: "campaigns", label: "Campaign Mapping",
          content: (
            <div className="space-y-1">
              {data.campaigns.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded border border-panelborder px-3 py-2 text-xs">
                  <span className="font-semibold text-title">{c.name}</span>
                  <code className="text-label">/api/ingest/{c.slug}</code>
                  <Chip tone="verified" className="ml-auto">allowed</Chip>
                </div>
              ))}
            </div>
          ),
        },
        {
          id: "disputes", label: "Disputes",
          content: (
            <div className="text-xs text-label">
              No open disputes. Dispute a payout from the Match Queue and it lands here with its evidence trail.
            </div>
          ),
        },
      ]}
    />
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Check, X, AlertTriangle, TrendingUp, ShieldAlert, DollarSign } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel, EmptyState, type ChipTone } from "@/components/ui/primitives";
import { MiniChart } from "@/components/ui/charts";
import { fmtCents } from "@/lib/money";
import { timeAgo } from "@/components/ui/format";
import { act } from "@/lib/client-api";

interface Insight {
  id: string; type: string; severity: string; title: string; body: string;
  related: Record<string, unknown>; metricSnapshot: Record<string, unknown>;
  status: string; createdAt: string;
}

interface ActionRow {
  id: string; issueType: string; entityType: string; entityName: string; priority: string;
  amountAtRiskCents: number | null; description: string; source: string; status: string;
  ownerUserId: string | null; dueDate: string | null; createdAt: string; resolutionNote: string | null;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  anomaly: <TrendingUp size={14} />,
  opportunity: <DollarSign size={14} />,
  risk: <ShieldAlert size={14} />,
  false_profit: <AlertTriangle size={14} />,
  summary: <Check size={14} />,
};

export function InsightsClient({
  initialTab,
  insights,
  actions,
  members,
}: {
  initialTab: string;
  insights: Insight[];
  actions: ActionRow[];
  members: Array<{ userId: string; name: string }>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const [running, setRunning] = useState(false);
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("open");

  const severityRank = { critical: 0, warn: 1, info: 2 } as Record<string, number>;
  const visibleInsights = insights
    .filter((i) => i.status !== "dismissed")
    .sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3));

  const filteredActions = actions.filter((a) => (statusFilter === "all" ? true : a.status === statusFilter));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-title">Insights</h1>
          <p className="text-xs text-label">The app notices problems before you do. Every card cites the numbers behind it.</p>
        </div>
        <GradientButton
          variant="cyan"
          disabled={running}
          onClick={async () => {
            setRunning(true);
            await act("insights.run");
            setRunning(false);
            router.refresh();
          }}
        >
          <RefreshCw size={13} className={running ? "animate-spin" : ""} /> {running ? "Analyzing..." : "Run generator"}
        </GradientButton>
      </div>

      <div className="flex gap-1.5">
        {[
          { id: "insights", label: `Insights (${visibleInsights.filter((i) => i.status === "new").length} new)` },
          { id: "actions", label: `Action Queue (${actions.filter((a) => a.status === "open").length} open)` },
        ].map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === t.id ? "df-grad-bg text-white" : "border border-panelborder text-label hover:text-body"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "insights" && (
        <div className="grid gap-3 lg:grid-cols-2">
          {visibleInsights.length === 0 && (
            <GlassPanel className="lg:col-span-2"><EmptyState title="No insights yet" hint="Run the generator or wait for the next window." /></GlassPanel>
          )}
          {visibleInsights.map((i) => {
            const tone: ChipTone = i.severity === "critical" ? "danger" : i.severity === "warn" ? "warning" : "info";
            const link = typeof i.related.link === "string" ? i.related.link : null;
            const chart = buildChart(i.metricSnapshot);
            return (
              <GlassPanel key={i.id} className="p-4" glow={i.severity === "critical" ? "danger" : undefined}>
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 ${i.severity === "critical" ? "text-danger" : i.severity === "warn" ? "text-warning" : "text-info"}`}>
                    {TYPE_ICON[i.type] ?? <TrendingUp size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-title">{i.title}</span>
                      <Chip tone={tone}>{i.severity}</Chip>
                      <Chip tone="neutral">{i.type.replace("_", " ")}</Chip>
                      {i.status === "acknowledged" && <Chip tone="dim">ack</Chip>}
                      <span className="ml-auto text-[10px] text-label">{timeAgo(i.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-body">{i.body}</p>
                    {chart && (
                      <div className="mt-2 rounded-lg border border-panelborder bg-[rgba(11,14,35,0.4)] p-2">
                        <MiniChart kind="bar" data={chart} height={110} prefix="" />
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {link && (
                        <Link href={link}>
                          <GradientButton variant="cyan" className="!px-2 !py-1 !text-[10px]">Open</GradientButton>
                        </Link>
                      )}
                      {i.status === "new" && (
                        <GradientButton variant="ghost" className="!px-2 !py-1 !text-[10px]" onClick={async () => {
                          await act("insight.status", { id: i.id, status: "acknowledged" });
                          router.refresh();
                        }}>
                          <Check size={10} /> Acknowledge
                        </GradientButton>
                      )}
                      <GradientButton variant="ghost" className="!px-2 !py-1 !text-[10px]" onClick={async () => {
                        await act("insight.status", { id: i.id, status: "dismissed" });
                        router.refresh();
                      }}>
                        <X size={10} /> Dismiss
                      </GradientButton>
                    </div>
                  </div>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      )}

      {tab === "actions" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {["open", "in_progress", "resolved", "dismissed", "all"].map((s) => (
              <button key={s} type="button" onClick={() => setStatusFilter(s)}
                className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold ${statusFilter === s ? "df-grad-bg text-white" : "border border-panelborder text-label"}`}>
                {s.replace("_", " ")}
              </button>
            ))}
            {selectedActions.length > 0 && (
              <span className="ml-auto flex gap-1.5">
                <GradientButton variant="cyan" className="!px-2 !py-1 !text-[10px]" onClick={async () => {
                  for (const id of selectedActions) await act("action.update", { id, status: "resolved", resolutionNote: "Bulk resolved" });
                  setSelectedActions([]);
                  router.refresh();
                }}>
                  Resolve {selectedActions.length}
                </GradientButton>
                <GradientButton variant="ghost" className="!px-2 !py-1 !text-[10px]" onClick={async () => {
                  for (const id of selectedActions) await act("action.update", { id, status: "dismissed" });
                  setSelectedActions([]);
                  router.refresh();
                }}>
                  Dismiss
                </GradientButton>
              </span>
            )}
          </div>
          {filteredActions.length === 0 && <GlassPanel><EmptyState title="Nothing here" /></GlassPanel>}
          {filteredActions.map((a) => (
            <GlassPanel key={a.id} className="p-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="checkbox"
                  className="accent-[var(--grad-to)]"
                  checked={selectedActions.includes(a.id)}
                  onChange={(e) => setSelectedActions((prev) => e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id))}
                />
                <Chip tone={a.priority === "critical" ? "danger" : a.priority === "high" ? "warning" : "neutral"}>{a.priority}</Chip>
                <Chip tone="neutral">{a.issueType.replace(/_/g, " ")}</Chip>
                <span className="text-xs font-semibold text-title">{a.entityName}</span>
                {a.amountAtRiskCents !== null && <span className="font-mono-money text-xs font-bold text-warning">{fmtCents(a.amountAtRiskCents)}</span>}
                <span className="text-[10px] text-label">via {a.source.replace("_", " ")} · {timeAgo(a.createdAt)}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  <select
                    className="rounded border border-panelborder bg-elevated px-1.5 py-1 text-[10px] text-body"
                    value={a.ownerUserId ?? ""}
                    onChange={async (e) => {
                      await act("action.update", { id: a.id, ownerUserId: e.target.value || null });
                      router.refresh();
                    }}
                  >
                    <option value="">unassigned</option>
                    {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                  </select>
                  <input
                    type="date"
                    className="rounded border border-panelborder bg-elevated px-1.5 py-0.5 text-[10px] text-body"
                    value={a.dueDate ?? ""}
                    onChange={async (e) => {
                      await act("action.update", { id: a.id, dueDate: e.target.value || null });
                      router.refresh();
                    }}
                  />
                  {a.status === "open" && (
                    <>
                      <GradientButton variant="ghost" className="!px-2 !py-0.5 !text-[10px]" onClick={async () => {
                        await act("action.update", { id: a.id, status: "in_progress" });
                        router.refresh();
                      }}>
                        Start
                      </GradientButton>
                      <GradientButton variant="cyan" className="!px-2 !py-0.5 !text-[10px]" onClick={async () => {
                        const note = prompt("Resolution note") ?? "Resolved";
                        await act("action.update", { id: a.id, status: "resolved", resolutionNote: note });
                        router.refresh();
                      }}>
                        Resolve
                      </GradientButton>
                    </>
                  )}
                  {a.status === "in_progress" && (
                    <GradientButton variant="cyan" className="!px-2 !py-0.5 !text-[10px]" onClick={async () => {
                      const note = prompt("Resolution note") ?? "Resolved";
                      await act("action.update", { id: a.id, status: "resolved", resolutionNote: note });
                      router.refresh();
                    }}>
                      Resolve
                    </GradientButton>
                  )}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-label">{a.description}</p>
              {a.resolutionNote && <p className="mt-1 text-[11px] text-verified">Resolution: {a.resolutionNote}</p>}
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  );
}

function buildChart(snapshot: Record<string, unknown>): Array<{ label: string; value: number }> | null {
  const entries = Object.entries(snapshot).filter(([, v]) => typeof v === "number") as Array<[string, number]>;
  if (entries.length < 2) return null;
  return entries.slice(0, 5).map(([k, v]) => ({
    label: k.replace(/_cents$/, "").replace(/_/g, " ").slice(0, 14),
    value: k.endsWith("_cents") ? Math.round(v / 100) : k.includes("rate") || k.includes("share") ? Math.round(v * 100) : v,
  }));
}

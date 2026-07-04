"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlassPanel, Chip, GradientButton, SectionLabel } from "@/components/ui/primitives";
import { TruthGrid, type TruthGridRow } from "@/components/truthgrid/TruthGrid";
import { fmtDateTime } from "@/components/ui/format";
import { act } from "@/lib/client-api";
import type { CapiConfig } from "@/db/schema";

interface CampaignCapi {
  id: string;
  name: string;
  capiConfig: CapiConfig;
}

interface CapiEventRow {
  id: string; campaign: string; leadId: string; eventName: string; status: string;
  payload: Record<string, unknown>; response: Record<string, unknown>; at: string;
}

export function ConversionEventsClient({
  campaigns,
  events,
  tokenConfigured,
}: {
  campaigns: CampaignCapi[];
  events: CapiEventRow[];
  tokenConfigured: boolean;
}) {
  const router = useRouter();
  const [configs, setConfigs] = useState(campaigns);
  const [saving, setSaving] = useState<string | null>(null);

  const rows: TruthGridRow[] = events.map((e) => ({
    key: e.id,
    identity: { title: `${e.eventName} · ${e.campaign}`, sub: `${fmtDateTime(e.at)} · lead ${e.leadId.slice(0, 14)}...` },
    stat: { label: "Event", value: e.eventName },
    booked: { value: null, tone: "dim", chip: e.eventName },
    verified: { value: null, tone: "dim", chip: hashPreview(e.payload) },
    gap: { value: null, tone: "dim", chip: "sha-256" },
    chip: {
      tone: e.status === "sent" ? "verified" : e.status === "mock_logged" ? "info" : "danger",
      label: e.status === "mock_logged" ? "mock logged" : e.status,
    },
    actions: [{ label: "Open lead", onClick: () => router.push(`/leads?open=${e.leadId}`) }],
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-title">Conversion Events (Meta CAPI)</h1>
        <p className="text-xs text-label">
          Received leads fire as Lead, sold leads as Purchase with the sale price. Email, phone, name, state, and zip
          are SHA-256 hashed per the Meta spec before anything leaves the box. Test leads never fire.
        </p>
      </div>

      {!tokenConfigured && (
        <GlassPanel className="flex items-center gap-3 px-4 py-2.5">
          <Chip tone="info">Local mock mode</Chip>
          <span className="text-xs text-label">
            No META_CAPI_TOKEN set: outbound payloads are logged to the event log below exactly as they would be sent.
          </span>
        </GlassPanel>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {configs.map((c) => (
          <GlassPanel key={c.id} className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-title">{c.name}</span>
              <Chip tone={c.capiConfig.enabled ? "verified" : "dim"}>{c.capiConfig.enabled ? "enabled" : "off"}</Chip>
            </div>
            <label className="flex flex-col gap-1">
              <span className="df-label">Pixel ID</span>
              <input
                className="rounded-lg border border-panelborder bg-elevated px-2 py-1.5 font-mono-money text-xs text-title outline-none"
                value={c.capiConfig.pixel_id ?? ""}
                onChange={(e) => setConfigs(configs.map((x) => (x.id === c.id ? { ...x, capiConfig: { ...x.capiConfig, pixel_id: e.target.value } } : x)))}
                placeholder="pixel id"
              />
            </label>
            <div className="flex gap-3 text-xs text-label">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" className="accent-[var(--grad-to)]" checked={c.capiConfig.events.received}
                  onChange={(e) => setConfigs(configs.map((x) => (x.id === c.id ? { ...x, capiConfig: { ...x.capiConfig, events: { ...x.capiConfig.events, received: e.target.checked } } } : x)))} />
                received = Lead
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" className="accent-[var(--grad-to)]" checked={c.capiConfig.events.sold}
                  onChange={(e) => setConfigs(configs.map((x) => (x.id === c.id ? { ...x, capiConfig: { ...x.capiConfig, events: { ...x.capiConfig.events, sold: e.target.checked } } } : x)))} />
                sold = Purchase
              </label>
            </div>
            <div className="flex gap-2">
              <GradientButton
                variant={c.capiConfig.enabled ? "ghost" : "cyan"}
                className="!px-2.5 !py-1 !text-[11px]"
                disabled={saving === c.id}
                onClick={async () => {
                  setSaving(c.id);
                  const next = { ...c.capiConfig, enabled: !c.capiConfig.enabled };
                  await act("campaign.capi", { campaignId: c.id, config: next });
                  setConfigs(configs.map((x) => (x.id === c.id ? { ...x, capiConfig: next } : x)));
                  setSaving(null);
                  router.refresh();
                }}
              >
                {c.capiConfig.enabled ? "Disable" : "Enable"}
              </GradientButton>
              <GradientButton
                variant="ghost"
                className="!px-2.5 !py-1 !text-[11px]"
                disabled={saving === c.id}
                onClick={async () => {
                  setSaving(c.id);
                  await act("campaign.capi", { campaignId: c.id, config: c.capiConfig });
                  setSaving(null);
                }}
              >
                Save config
              </GradientButton>
            </div>
          </GlassPanel>
        ))}
      </div>

      <div>
        <SectionLabel className="mb-2">Event log ({events.length})</SectionLabel>
        <TruthGrid
          rows={rows}
          bookedHeader="EVENT"
          verifiedHeader="USER DATA"
          gapHeader="HASHING"
          renderDrawer={(row) => {
            const e = events.find((x) => x.id === row.key);
            if (!e) return null;
            return (
              <div className="grid gap-3 p-4 md:grid-cols-2">
                <div>
                  <SectionLabel className="mb-1">Outbound payload (hashed user data)</SectionLabel>
                  <pre className="max-h-60 overflow-auto rounded bg-[#070a1c] p-2 text-[10px] leading-relaxed text-body">{JSON.stringify(e.payload, null, 2)}</pre>
                </div>
                <div>
                  <SectionLabel className="mb-1">Response</SectionLabel>
                  <pre className="max-h-60 overflow-auto rounded bg-[#070a1c] p-2 text-[10px] leading-relaxed text-body">{JSON.stringify(e.response, null, 2)}</pre>
                </div>
              </div>
            );
          }}
          emptyTitle="No conversion events yet"
          emptyHint="Enable CAPI on a campaign and sell a lead to see hashed payloads here."
        />
      </div>
    </div>
  );
}

function hashPreview(payload: Record<string, unknown>): string {
  const data = payload.data as Array<{ user_data?: Record<string, unknown> }> | undefined;
  const userData = data?.[0]?.user_data ?? {};
  return `${Object.keys(userData).length} hashed fields`;
}

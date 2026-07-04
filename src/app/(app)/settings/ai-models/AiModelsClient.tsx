"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plug, Sparkles, Trash2, Zap } from "lucide-react";
import { GlassPanel, Chip, GradientButton, SectionLabel } from "@/components/ui/primitives";
import { timeAgo } from "@/components/ui/format";
import { act } from "@/lib/client-api";

interface ProviderCard {
  provider: string;
  label: string;
  defaultModel: string;
  consoleUrl: string;
  consoleName: string;
  model: string;
  hasKey: boolean;
  keyPreview: string | null;
  status: string;
  active: boolean;
  note: string | null;
  lastTestedAt: string | null;
}

export function AiModelsClient({ providers, envFallback }: { providers: ProviderCard[]; envFallback: boolean }) {
  const router = useRouter();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, string>>(
    Object.fromEntries(providers.map((p) => [p.provider, p.model]))
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  const activeProvider = providers.find((p) => p.active);

  return (
    <div className="max-w-4xl space-y-4">
      <GlassPanel className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Sparkles size={16} className="text-accent" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-title">
            Analyst engine: {activeProvider ? activeProvider.label : envFallback ? "Anthropic (environment key)" : "Local analysis mode"}
          </div>
          <p className="text-[11px] text-label">
            The AI Analyst, insights writing, and scheduled briefs use the active model. With nothing connected the
            deterministic local router answers from the same truth engine, so AI features never go dark.
          </p>
        </div>
        {activeProvider && (
          <GradientButton variant="ghost" className="!text-[11px]" onClick={async () => {
            await act("ai.provider.activate", { provider: null });
            router.refresh();
          }}>
            Switch to local mode
          </GradientButton>
        )}
      </GlassPanel>

      <p className="text-[11px] leading-relaxed text-label">
        A note on browser logins: Anthropic, OpenAI, and xAI do not offer sign-in-with-account OAuth for API access,
        keys from their consoles are the supported mechanism. For Gemini, sign in with your Google account at
        Google AI Studio and the key is issued against it. Each card links straight to the right key page, and
        Test fires a real request so you know the connection works before the analyst relies on it.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {providers.map((p) => (
          <GlassPanel key={p.provider} className={`space-y-2.5 p-4 ${p.active ? "df-gradient-border" : ""}`}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-title">{p.label}</span>
              <Chip tone={p.status === "connected" ? "verified" : p.status === "error" ? "danger" : "dim"}>
                {p.status}
              </Chip>
              {p.active && <Chip tone="accent">active</Chip>}
              <a href={p.consoleUrl} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-[10px] text-accent hover:underline">
                {p.consoleName} <ExternalLink size={10} />
              </a>
            </div>

            <label className="flex flex-col gap-1">
              <span className="df-label">API key {p.hasKey && <span className="normal-case text-verified">(saved: {p.keyPreview})</span>}</span>
              <input
                type="password"
                placeholder={p.hasKey ? "Leave blank to keep the saved key" : "Paste your API key"}
                className="rounded-lg border border-panelborder bg-elevated px-2.5 py-1.5 font-mono-money text-xs text-title outline-none focus:border-[var(--grad-to)]"
                value={keys[p.provider] ?? ""}
                onChange={(e) => setKeys({ ...keys, [p.provider]: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="df-label">Model</span>
              <input
                className="rounded-lg border border-panelborder bg-elevated px-2.5 py-1.5 font-mono-money text-xs text-title outline-none"
                value={models[p.provider] ?? p.defaultModel}
                onChange={(e) => setModels({ ...models, [p.provider]: e.target.value })}
              />
            </label>

            {p.note && (
              <p className={`text-[11px] ${p.status === "connected" ? "text-verified" : "text-danger"}`}>
                {p.note} {p.lastTestedAt && <span className="text-label">({timeAgo(p.lastTestedAt)})</span>}
              </p>
            )}
            {messages[p.provider] && <p className="text-[11px] text-accent">{messages[p.provider]}</p>}

            <div className="flex flex-wrap gap-1.5">
              <GradientButton
                variant="ghost"
                className="!px-2.5 !py-1 !text-[10px]"
                disabled={busy === p.provider}
                onClick={async () => {
                  setBusy(p.provider);
                  await act("ai.provider.save", {
                    provider: p.provider,
                    apiKey: keys[p.provider] ?? "",
                    model: models[p.provider] ?? p.defaultModel,
                    baseUrl: null,
                  });
                  setMessages({ ...messages, [p.provider]: "Saved" });
                  setBusy(null);
                  router.refresh();
                }}
              >
                Save
              </GradientButton>
              <GradientButton
                variant="cyan"
                className="!px-2.5 !py-1 !text-[10px]"
                disabled={busy === p.provider || (!p.hasKey && !keys[p.provider])}
                onClick={async () => {
                  setBusy(p.provider);
                  if (keys[p.provider]) {
                    await act("ai.provider.save", { provider: p.provider, apiKey: keys[p.provider], model: models[p.provider] ?? p.defaultModel, baseUrl: null });
                  }
                  const res = await act<{ message?: string }>("ai.provider.test", { provider: p.provider });
                  setMessages({ ...messages, [p.provider]: res.data.message ?? res.error ?? "" });
                  setBusy(null);
                  router.refresh();
                }}
              >
                <Zap size={10} /> Test connection
              </GradientButton>
              {p.hasKey && !p.active && (
                <GradientButton
                  className="!px-2.5 !py-1 !text-[10px]"
                  disabled={busy === p.provider}
                  onClick={async () => {
                    await act("ai.provider.activate", { provider: p.provider });
                    router.refresh();
                  }}
                >
                  <Plug size={10} /> Set active
                </GradientButton>
              )}
              {p.hasKey && (
                <button
                  type="button"
                  className="ml-auto cursor-pointer p-1 text-label hover:text-danger"
                  title="Remove provider"
                  onClick={async () => {
                    await act("ai.provider.delete", { provider: p.provider });
                    router.refresh();
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </GlassPanel>
        ))}
      </div>

      <GlassPanel className="p-4">
        <SectionLabel className="mb-1">How the analyst uses these</SectionLabel>
        <p className="text-[11px] leading-relaxed text-label">
          Anthropic models run the full agentic tool loop (query_truth, query_spend, render_chart, and friends).
          OpenAI, Grok, and Gemini receive a precomputed truth bundle from the same tools and answer over it, with
          charts supplied by the deterministic router. Every provider is told that null means UNKNOWN because a money
          source is missing, and PII is masked before anything leaves the box.
        </p>
      </GlassPanel>
    </div>
  );
}

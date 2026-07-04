import { eq, and } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { AiProviderKind } from "@/db/schema";

// Multi-provider AI layer. Anthropic, OpenAI (ChatGPT), Grok (x.ai, an
// OpenAI-compatible API), and Google Gemini. Keys come from Settings > AI
// Models; these providers issue API keys from their consoles rather than
// browser-login OAuth for API access, so the connect flow is key + live test.

export interface ProviderConfig {
  provider: AiProviderKind;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
}

export const PROVIDER_DEFAULTS: Record<AiProviderKind, { label: string; model: string; baseUrl: string; consoleUrl: string; consoleName: string }> = {
  anthropic: {
    label: "Anthropic Claude", model: "claude-sonnet-4-6",
    baseUrl: "https://api.anthropic.com",
    consoleUrl: "https://console.anthropic.com/settings/keys", consoleName: "Anthropic Console",
  },
  openai: {
    label: "OpenAI ChatGPT", model: "gpt-5.1",
    baseUrl: "https://api.openai.com/v1",
    consoleUrl: "https://platform.openai.com/api-keys", consoleName: "OpenAI Platform",
  },
  grok: {
    label: "xAI Grok", model: "grok-4",
    baseUrl: "https://api.x.ai/v1",
    consoleUrl: "https://console.x.ai", consoleName: "xAI Console",
  },
  gemini: {
    label: "Google Gemini", model: "gemini-2.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    consoleUrl: "https://aistudio.google.com/apikey", consoleName: "Google AI Studio (sign in with Google)",
  },
};

export async function getActiveProvider(organizationId: string): Promise<ProviderConfig | null> {
  const db = await getDb();
  const active = await db.query.aiProviders.findFirst({
    where: and(eq(schema.aiProviders.organizationId, organizationId), eq(schema.aiProviders.active, true)),
  });
  if (active && active.apiKey) {
    return { provider: active.provider, apiKey: active.apiKey, model: active.model, baseUrl: active.baseUrl };
  }
  // Environment fallback keeps the original behavior working.
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY, model: "claude-sonnet-4-6" };
  }
  return null;
}

// Live connection test: the cheapest possible real request per provider.
export async function testProvider(config: ProviderConfig): Promise<{ ok: boolean; message: string }> {
  try {
    if (config.provider === "anthropic") {
      const res = await fetch(`${config.baseUrl ?? PROVIDER_DEFAULTS.anthropic.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: config.model, max_tokens: 8, messages: [{ role: "user", content: "ping" }] }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return { ok: true, message: `Connected, ${config.model} responded` };
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false, message: body.error?.message ?? `HTTP ${res.status}` };
    }

    if (config.provider === "openai" || config.provider === "grok") {
      const base = config.baseUrl ?? PROVIDER_DEFAULTS[config.provider].baseUrl;
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.model, max_tokens: 8, messages: [{ role: "user", content: "ping" }] }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return { ok: true, message: `Connected, ${config.model} responded` };
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false, message: body.error?.message ?? `HTTP ${res.status}` };
    }

    // gemini
    const base = config.baseUrl ?? PROVIDER_DEFAULTS.gemini.baseUrl;
    const res = await fetch(`${base}/models/${config.model}:generateContent?key=${config.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 8 } }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return { ok: true, message: `Connected, ${config.model} responded` };
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, message: body.error?.message ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Request failed" };
  }
}

// Single completion over a prepared context bundle. Used for OpenAI, Grok,
// and Gemini (Anthropic keeps its native tool loop in analyst.ts).
export async function completeWithProvider(
  config: ProviderConfig,
  system: string,
  user: string
): Promise<string> {
  if (config.provider === "openai" || config.provider === "grok") {
    const base = config.baseUrl ?? PROVIDER_DEFAULTS[config.provider].baseUrl;
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`${config.provider} HTTP ${res.status}`);
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return body.choices?.[0]?.message?.content ?? "";
  }

  if (config.provider === "gemini") {
    const base = config.baseUrl ?? PROVIDER_DEFAULTS.gemini.baseUrl;
    const res = await fetch(`${base}/models/${config.model}:generateContent?key=${config.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 1500 },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`gemini HTTP ${res.status}`);
    const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  }

  throw new Error("completeWithProvider does not handle anthropic, use the native tool loop");
}

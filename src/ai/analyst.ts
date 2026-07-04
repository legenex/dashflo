import Anthropic from "@anthropic-ai/sdk";
import { executeTool, TOOL_DEFINITIONS, type ChartSpec, type ToolExecutionContext } from "./tools";
import { answerLocally, detectIntent } from "./fallback";
import { completeWithProvider, getActiveProvider } from "./providers";

// The AI analyst. The active provider from Settings > AI Models answers:
// Anthropic runs the native tool loop, OpenAI / Grok / Gemini answer over a
// prepared truth bundle from the same tools, and with nothing configured the
// deterministic local intent router takes over. Every path reads the same
// computed truth and cites real numbers.

export interface AnalystAnswer {
  text: string;
  charts: ChartSpec[];
  mode: "claude" | "local";
  providerLabel?: string;
}

const SYSTEM_PROMPT = `You are the DashFlo analyst for a lead generation business. DashFlo's core idea: booked numbers are claims, verified cash is truth, and the gap between them is where businesses get burned.

Rules:
- Use the tools for every factual claim. Never invent numbers. Cite exact dollar figures from tool results (amounts come back in integer cents, present them as dollars).
- null in tool results means UNKNOWN because a money source is missing. Say "unknown, needs source" for those, never zero.
- Lead with the answer and the dollar amounts. Numbers first, no filler.
- When a comparison or trend would help, call render_chart once with the key figures (values in dollars).
- Keep answers tight: a few sentences or a short list. Plain language, no jargon.
- Never use em dashes. Use commas or hyphens.
- If asked who owes money, name counterparties with exact outstanding, overdue, and short-paid amounts.
- False profit means reported profit is positive while cash reality disagrees. Treat it as the most important thing to surface.`;

export async function askAnalyst(args: {
  organizationId: string;
  question: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<AnalystAnswer> {
  const active = await getActiveProvider(args.organizationId);
  if (!active) {
    return answerLocally(args);
  }

  if (active.provider !== "anthropic") {
    return askViaBundle(args, active);
  }

  const client = new Anthropic({ apiKey: active.apiKey, baseURL: active.baseUrl ?? undefined });
  const ctx: ToolExecutionContext = { organizationId: args.organizationId, charts: [] };

  const messages: Anthropic.MessageParam[] = [
    ...args.history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: args.question },
  ];

  try {
    for (let turn = 0; turn < 6; turn++) {
      const response = await client.messages.create({
        model: active.model,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS as Anthropic.Tool[],
        messages,
      });

      if (response.stop_reason === "tool_use") {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type === "tool_use") {
            const result = await executeTool(ctx, block.name, block.input as Record<string, unknown>);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result).slice(0, 30000),
            });
          }
        }
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { text, charts: ctx.charts, mode: "claude" };
    }
    return {
      text: "I hit the tool call limit before finishing. Try a narrower question.",
      charts: ctx.charts,
      mode: "claude",
    };
  } catch (err) {
    console.error("[analyst] Claude call failed, falling back to local mode:", err);
    return answerLocally(args);
  }
}

// OpenAI / Grok / Gemini path: gather a standard truth bundle from the same
// tool layer, hand it to the model as context, and answer in one completion.
// Charts come from the deterministic router so every provider gets visuals.
async function askViaBundle(
  args: { organizationId: string; question: string },
  active: NonNullable<Awaited<ReturnType<typeof getActiveProvider>>>
): Promise<AnalystAnswer> {
  const ctx: ToolExecutionContext = { organizationId: args.organizationId, charts: [] };
  try {
    const wantsSpend = /ad|spend|roas|cpl|kill|creative/i.test(args.question);
    const [orgTruth, buyerTruth, campaignTruth, actions, variances, connectors, spend] = await Promise.all([
      executeTool(ctx, "query_truth", { scope: "org" }),
      executeTool(ctx, "query_truth", { scope: "buyer" }),
      executeTool(ctx, "query_truth", { scope: "campaign" }),
      executeTool(ctx, "query_actions", { status: "open", limit: 10 }),
      executeTool(ctx, "list_variances", {}),
      executeTool(ctx, "get_connector_status", {}),
      wantsSpend ? executeTool(ctx, "query_spend", { group_by: "ad" }) : Promise.resolve(null),
    ]);

    const bundle = JSON.stringify(
      { org_truth: orgTruth, buyer_truth: buyerTruth, campaign_truth: campaignTruth, open_actions: actions, variances, connectors, ...(spend ? { spend_by_ad: spend } : {}) }
    ).slice(0, 60000);

    const text = await completeWithProvider(
      active,
      `${SYSTEM_PROMPT}\n\nYou are given precomputed tool results as JSON. Use ONLY these numbers (integer cents unless stated). null means UNKNOWN because a money source is missing, say "unknown, needs source" for those, never zero.`,
      `Question: ${args.question}\n\nTool results:\n${bundle}`
    );

    // Reuse the deterministic router's chart for this intent so non-Anthropic
    // providers still render visuals from real numbers.
    let charts: ChartSpec[] = [];
    if (detectIntent(args.question) !== "general") {
      const local = await answerLocally(args);
      charts = local.charts;
    }

    return {
      text,
      charts,
      mode: "claude",
      providerLabel: `${active.provider} · ${active.model}`,
    };
  } catch (err) {
    console.error(`[analyst] ${active.provider} call failed, falling back to local mode:`, err);
    return answerLocally(args);
  }
}

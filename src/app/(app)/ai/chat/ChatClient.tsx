"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Plus, Sparkles } from "lucide-react";
import { GlassPanel, Chip, GradientButton } from "@/components/ui/primitives";
import { MiniChart } from "@/components/ui/charts";
import { timeAgo } from "@/components/ui/format";
import type { ChatMessage } from "@/db/schema";

const STARTERS = [
  "Am I owed money right now and by whom",
  "Which campaigns show false profit",
  "Which ads should I kill from the last 14 days",
  "Why did cash margin drop last week",
  "Compare true CPL by state for MVA",
];

const FOLLOW_UPS = [
  "Show buyer payment risk",
  "Give me the daily summary",
  "Compare campaigns on cash truth",
];

interface Thread {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: string;
}

export function ChatClient({
  threads: initialThreads,
  initialQuestion,
  aiConfigured,
}: {
  threads: Thread[];
  initialQuestion: string | null;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [threads, setThreads] = useState(initialThreads);
  const [activeId, setActiveId] = useState<string | null>(initialThreads[0]?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>(initialThreads[0]?.messages ?? []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [streamCharts, setStreamCharts] = useState<ChatMessage["charts"]>([]);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const askedInitial = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (initialQuestion && !askedInitial.current) {
      askedInitial.current = true;
      setActiveId(null);
      setMessages([]);
      void ask(initialQuestion, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  const ask = async (question: string, threadId: string | null) => {
    setBusy(true);
    setStreaming("");
    setStreamCharts([]);
    const now = new Date().toISOString();
    setMessages((prev) => [...prev, { role: "user", content: question, at: now }]);

    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, threadId: threadId ?? undefined }),
    });
    if (!res.ok || !res.body) {
      setMessages((prev) => [...prev, { role: "assistant", content: "The analyst hit an error. Try again.", at: now }]);
      setBusy(false);
      setStreaming(null);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let charts: ChatMessage["charts"] = [];
    let mode: "claude" | "local" = "local";
    let newThreadId = threadId;
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.replace(/^data: /, "").trim();
        if (!line) continue;
        try {
          const event = JSON.parse(line) as { type: string; text?: string; charts?: ChatMessage["charts"]; threadId?: string; mode?: "claude" | "local"; message?: string };
          if (event.type === "chunk") {
            text += event.text ?? "";
            setStreaming(text);
          } else if (event.type === "charts") {
            charts = event.charts ?? [];
            setStreamCharts(charts);
          } else if (event.type === "done") {
            newThreadId = event.threadId ?? newThreadId;
            mode = event.mode ?? "local";
          } else if (event.type === "error") {
            text += `\n\n(error: ${event.message})`;
          }
        } catch {
          // partial frame
        }
      }
    }

    setStreaming(null);
    setStreamCharts([]);
    setMessages((prev) => [...prev, { role: "assistant", content: text, charts, mode, at: new Date().toISOString() }]);
    setBusy(false);
    if (newThreadId && newThreadId !== activeId) {
      setActiveId(newThreadId);
      setThreads((prev) => [
        { id: newThreadId as string, title: question.slice(0, 60), messages: [], updatedAt: new Date().toISOString() },
        ...prev.filter((t) => t.id !== newThreadId),
      ]);
    }
    router.refresh();
  };

  const submit = () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    void ask(q, activeId);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* threads sidebar */}
      <div className="hidden w-56 shrink-0 flex-col gap-1.5 md:flex">
        <GradientButton
          variant="ghost"
          className="justify-center"
          onClick={() => {
            setActiveId(null);
            setMessages([]);
          }}
        >
          <Plus size={13} /> New chat
        </GradientButton>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActiveId(t.id);
                setMessages(t.messages);
              }}
              className={`block w-full cursor-pointer rounded-lg border px-2.5 py-2 text-left ${
                activeId === t.id ? "border-[rgba(139,92,246,0.5)] bg-[rgba(59,130,246,0.08)]" : "border-panelborder hover:border-[rgba(139,92,246,0.3)]"
              }`}
            >
              <div className="truncate text-xs font-semibold text-title">{t.title}</div>
              <div className="text-[10px] text-label">{timeAgo(t.updatedAt)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* chat area */}
      <GlassPanel className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-panelborder px-4 py-2.5">
          <Sparkles size={15} className="text-accent" />
          <span className="text-sm font-bold text-title">AI Analyst</span>
          <Chip tone={aiConfigured ? "verified" : "info"}>
            {aiConfigured ? "claude-sonnet-4-6" : "Local analysis mode"}
          </Chip>
          <span className="ml-auto hidden text-[10px] text-label sm:inline">
            Reads the same computed truth as every page. PII is masked before any model call.
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && !streaming && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <p className="text-sm text-label">Ask anything about your revenue truth.</p>
              <div className="flex max-w-md flex-wrap justify-center gap-1.5">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="cursor-pointer rounded-full border border-panelborder bg-panel px-3 py-1.5 text-[11px] text-body hover:border-[rgba(34,211,238,0.5)] hover:text-title"
                    onClick={() => void ask(s, activeId)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <MessageView key={i} message={m} />
          ))}
          {streaming !== null && (
            <MessageView
              message={{ role: "assistant", content: streaming + "▌", charts: streamCharts, at: "" }}
            />
          )}
          {messages.length > 0 && !busy && (
            <div className="flex flex-wrap gap-1.5">
              {FOLLOW_UPS.map((f) => (
                <button key={f} type="button" className="cursor-pointer rounded-full border border-panelborder px-2.5 py-1 text-[10px] text-label hover:text-body" onClick={() => void ask(f, activeId)}>
                  {f}
                </button>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex items-center gap-2 border-t border-panelborder p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder='Try "am I owed money right now and by whom"'
            className="flex-1 rounded-lg border border-panelborder bg-elevated px-3 py-2 text-sm text-title outline-none placeholder:text-label focus:border-[var(--grad-to)]"
            disabled={busy}
          />
          <GradientButton onClick={submit} disabled={busy || !input.trim()}>
            <Send size={14} />
          </GradientButton>
        </div>
      </GlassPanel>
    </div>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm df-grad-bg px-4 py-2 text-sm text-white">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        <div className="whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-panelborder bg-elevated px-4 py-2.5 text-sm leading-relaxed text-body">
          {message.content}
        </div>
        {message.charts?.map((chart, i) => (
          <div key={i} className="rounded-xl border border-panelborder bg-elevated p-3">
            <div className="df-label mb-1">{chart.title}</div>
            <MiniChart kind={chart.kind} data={chart.data} series={chart.series} />
          </div>
        ))}
        {message.mode && (
          <div className="text-[10px] text-label">
            {message.mode === "claude" ? "claude-sonnet-4-6 with live tools" : "Local analysis mode, deterministic intent router over the same tools"}
          </div>
        )}
      </div>
    </div>
  );
}

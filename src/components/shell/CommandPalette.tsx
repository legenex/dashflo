"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, Sparkles, Pause, DollarSign, Scale } from "lucide-react";
import { act, query } from "@/lib/client-api";

// cmd+K palette: fuzzy search across entities plus command verbs.
// "pause buyer <name>", "pause campaign <name>", "show unpaid revenue",
// "open match queue", "ask ai <question>". Keyboard-first, recent items.

interface Result {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  link: string;
  verb?: () => Promise<void>;
  icon?: React.ReactNode;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [idx, setIdx] = useState(0);
  const [recent, setRecent] = useState<Result[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 40);
      try {
        setRecent(JSON.parse(localStorage.getItem("dashflo_recent") ?? "[]") as Result[]);
      } catch {
        setRecent([]);
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const commands = buildCommands(q, router);
      if (q.trim().length < 2) {
        setResults(commands);
        return;
      }
      const data = await query<{ results: Result[] }>("search", { q });
      setResults([...commands, ...(data?.results ?? [])]);
      setIdx(0);
    }, 140);
  }, [q, open, router]);

  const run = async (r: Result) => {
    const stored = [{ type: r.type, id: r.id, title: r.title, subtitle: r.subtitle, link: r.link }, ...recent.filter((x) => x.id !== r.id)].slice(0, 6);
    localStorage.setItem("dashflo_recent", JSON.stringify(stored));
    onClose();
    if (r.verb) {
      await r.verb();
      router.refresh();
    } else if (r.link) {
      router.push(r.link);
    }
  };

  if (!open) return null;
  const list = q.trim().length < 2 && results.length === 0 ? recent : results;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-[rgba(4,6,20,0.75)] pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <div
        className="df-panel df-gradient-border w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIdx((i) => Math.min(list.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIdx((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && list[idx]) {
            e.preventDefault();
            void run(list[idx]);
          } else if (e.key === "Escape") {
            onClose();
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-panelborder px-4 py-3">
          <Search size={15} className="text-label" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Search leads, buyers, campaigns... or try "pause buyer", "ask ai"'
            className="flex-1 bg-transparent text-sm text-title outline-none placeholder:text-label"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {list.length === 0 ? (
            <div className="p-6 text-center text-xs text-label">
              {q.length >= 2 ? "No matches" : "Type to search, or use a command verb"}
            </div>
          ) : (
            list.map((r, i) => (
              <button
                key={`${r.type}:${r.id}`}
                type="button"
                onClick={() => void run(r)}
                onMouseEnter={() => setIdx(i)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left ${
                  i === idx ? "bg-[rgba(59,130,246,0.14)]" : ""
                }`}
              >
                <span className="text-label">{r.icon ?? <Search size={13} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-title">{r.title}</span>
                  <span className="block truncate text-[11px] text-label">{r.subtitle}</span>
                </span>
                {i === idx && <CornerDownLeft size={13} className="text-label" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function buildCommands(q: string, router: ReturnType<typeof useRouter>): Result[] {
  const lower = q.toLowerCase();
  const out: Result[] = [];

  const pauseBuyer = lower.match(/^pause buyer\s+(.+)$/);
  if (pauseBuyer) {
    const name = pauseBuyer[1];
    out.push({
      type: "verb", id: `pause-buyer-${name}`, title: `Pause buyer "${name}"`,
      subtitle: "Command", link: "", icon: <Pause size={13} />,
      verb: async () => {
        const data = await query<{ results: Array<{ type: string; id: string; title: string }> }>("search", { q: name });
        const buyer = data?.results.find((r) => r.type === "buyer");
        if (buyer) await act("buyer.status", { id: buyer.id, status: "paused" });
      },
    });
  }
  const pauseCampaign = lower.match(/^pause campaign\s+(.+)$/);
  if (pauseCampaign) {
    const name = pauseCampaign[1];
    out.push({
      type: "verb", id: `pause-campaign-${name}`, title: `Pause campaign "${name}"`,
      subtitle: "Command", link: "", icon: <Pause size={13} />,
      verb: async () => {
        const data = await query<{ results: Array<{ type: string; id: string; title: string }> }>("search", { q: name });
        const campaign = data?.results.find((r) => r.type === "campaign");
        if (campaign) await act("campaign.status", { id: campaign.id, status: "paused" });
      },
    });
  }
  if (lower.startsWith("show unpaid") || "show unpaid revenue".startsWith(lower) && lower.length > 4) {
    out.push({
      type: "verb", id: "show-unpaid", title: "Show unpaid revenue",
      subtitle: "Opens Buyers sorted by outstanding", link: "/distribution/buyers", icon: <DollarSign size={13} />,
    });
  }
  if (lower.startsWith("open match") || "open match queue".startsWith(lower) && lower.length > 4) {
    out.push({
      type: "verb", id: "open-queue", title: "Open match queue",
      subtitle: "Reconciliation workbench", link: "/reconciliation?tab=queue", icon: <Scale size={13} />,
    });
  }
  const askAi = q.match(/^ask ai\s+(.+)$/i);
  if (askAi) {
    out.push({
      type: "verb", id: "ask-ai", title: `Ask AI: "${askAi[1]}"`,
      subtitle: "Opens a new analyst chat", link: `/ai/chat?q=${encodeURIComponent(askAi[1])}`, icon: <Sparkles size={13} />,
    });
  } else if (lower === "ask ai" || ("ask ai".startsWith(lower) && lower.length >= 3)) {
    out.push({
      type: "verb", id: "ask-ai-blank", title: "Ask AI a question",
      subtitle: 'Try "ask ai am I owed money"', link: "/ai/chat", icon: <Sparkles size={13} />,
    });
  }
  void router;
  return out;
}

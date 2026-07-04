"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search, ChevronDown, LogOut, Command } from "lucide-react";
import { signOut } from "next-auth/react";
import { act, query } from "@/lib/client-api";
import { fmtCents } from "@/lib/money";
import { timeAgo } from "@/components/ui/format";
import { CommandPalette } from "./CommandPalette";

interface LiveEvent {
  id: string;
  kind: string;
  title: string;
  detail?: string;
  amountCents?: number | null;
  link?: string;
  at: string;
}

const KIND_COLOR: Record<string, string> = {
  lead_sold: "var(--verified)", lead_received: "var(--info)", lead_rejected: "var(--warning)",
  lead_error: "var(--error)", lead_returned: "var(--error)", payment_matched: "var(--verified)",
  match_applied: "var(--verified)", connector_changed: "var(--cyan)", action_resolved: "var(--verified)",
  insight_created: "var(--queued)", notification: "var(--label)",
};

export function TopBar({
  userName,
  orgName,
  memberships,
  activeOrgId,
  impersonating,
  isPlatformAdmin,
}: {
  userName: string;
  orgName: string;
  memberships: Array<{ organizationId: string; organizationName: string }>;
  activeOrgId: string;
  impersonating: boolean;
  isPlatformAdmin: boolean;
}) {
  const router = useRouter();
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; body: string; link: string | null; readAt: string | null; at: string }>>([]);
  const [unread, setUnread] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  // SSE live ticker.
  useEffect(() => {
    const es = new EventSource("/api/sse");
    esRef.current = es;
    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as LiveEvent;
        setEvents((prev) => [...prev.slice(-19), event]);
        if (["lead_sold", "lead_received", "payment_matched", "match_applied", "action_resolved", "connector_changed"].includes(event.kind)) {
          router.refresh();
        }
      } catch {
        // ignore malformed frames
      }
    };
    return () => es.close();
  }, [router]);

  useEffect(() => {
    void query<{ notifications: typeof notifications; unread: number }>("notifications.list").then((data) => {
      if (data) {
        setNotifications(data.notifications);
        setUnread(data.unread);
      }
    });
  }, [bellOpen]);

  // cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const latest = events.slice(-6).reverse();

  return (
    <>
      {impersonating && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-[rgba(239,68,68,0.92)] px-4 py-1.5 text-xs font-bold text-white">
          Viewing as {orgName} (impersonation active)
          <button
            type="button"
            className="cursor-pointer rounded border border-white/50 px-2 py-0.5 hover:bg-white/10"
            onClick={async () => {
              await act("admin.impersonate", { organizationId: null });
              window.location.href = "/admin";
            }}
          >
            Exit
          </button>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-panelborder bg-[rgba(11,14,35,0.85)] px-4 pl-14 backdrop-blur lg:pl-4">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-panelborder bg-panel px-2.5 py-1.5 text-xs text-label hover:border-[rgba(139,92,246,0.5)] hover:text-body"
        >
          <Search size={13} />
          <span className="hidden sm:inline">Search or command...</span>
          <span className="hidden items-center gap-0.5 rounded border border-panelborder px-1 text-[10px] sm:flex">
            <Command size={9} />K
          </span>
        </button>

        {/* live ticker */}
        <div className="relative hidden h-full flex-1 items-center overflow-hidden md:flex">
          <span className="df-live-dot mr-2 inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--cyan)]" />
          <div className="flex gap-6 overflow-hidden whitespace-nowrap">
            {latest.length === 0 ? (
              <span className="text-[11px] text-label">Live activity stream connected, waiting for events...</span>
            ) : (
              latest.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => e.link && router.push(e.link)}
                  className="flex cursor-pointer items-center gap-1.5 text-[11px] text-body hover:text-title"
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: KIND_COLOR[e.kind] ?? "var(--label)" }} />
                  {e.title}
                  {typeof e.amountCents === "number" && (
                    <span className="font-mono-money text-verified">{fmtCents(e.amountCents)}</span>
                  )}
                  <span className="text-label">{timeAgo(e.at)}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* notifications */}
          <div className="relative">
            <button
              type="button"
              className="relative cursor-pointer rounded-lg p-1.5 text-label hover:text-title"
              onClick={() => setBellOpen((o) => !o)}
              aria-label="Notifications"
            >
              <Bell size={16} />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--error)] text-[9px] font-bold text-white">
                  {unread}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="absolute right-0 top-9 z-40 w-80 rounded-xl border border-panelborder bg-elevated shadow-2xl">
                <div className="flex items-center justify-between border-b border-panelborder px-3 py-2">
                  <span className="text-xs font-bold text-title">Notifications</span>
                  <button
                    type="button"
                    className="cursor-pointer text-[11px] text-accent hover:underline"
                    onClick={async () => {
                      await act("notification.readAll");
                      setUnread(0);
                      setBellOpen(false);
                    }}
                  >
                    Mark all read
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto p-1">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-xs text-label">No notifications</div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          setBellOpen(false);
                          if (n.link) router.push(n.link);
                        }}
                        className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left hover:bg-[rgba(59,130,246,0.08)]"
                      >
                        <div className="flex items-center gap-2">
                          {!n.readAt && <span className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)]" />}
                          <span className="text-xs font-semibold text-title">{n.title}</span>
                          <span className="ml-auto text-[10px] text-label">{timeAgo(n.at)}</span>
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-label">{n.body}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* org switcher */}
          <div className="relative">
            <button
              type="button"
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-panelborder bg-panel px-2.5 py-1.5 text-xs font-semibold text-body hover:text-title"
              onClick={() => setOrgOpen((o) => !o)}
            >
              {orgName} <ChevronDown size={12} />
            </button>
            {orgOpen && (
              <div className="absolute right-0 top-9 z-40 w-56 rounded-xl border border-panelborder bg-elevated py-1 shadow-2xl">
                {memberships.map((m) => (
                  <button
                    key={m.organizationId}
                    type="button"
                    className={`block w-full cursor-pointer px-3 py-2 text-left text-xs hover:bg-[rgba(59,130,246,0.1)] ${
                      m.organizationId === activeOrgId ? "text-accent" : "text-body"
                    }`}
                    onClick={async () => {
                      await act("org.switch", { organizationId: m.organizationId });
                      window.location.href = "/";
                    }}
                  >
                    {m.organizationName}
                  </button>
                ))}
                {isPlatformAdmin && (
                  <button
                    type="button"
                    className="block w-full cursor-pointer border-t border-panelborder px-3 py-2 text-left text-xs text-danger hover:bg-[rgba(239,68,68,0.08)]"
                    onClick={() => router.push("/admin")}
                  >
                    Master admin
                  </button>
                )}
              </div>
            )}
          </div>

          {/* user menu */}
          <div className="relative">
            <button
              type="button"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full df-grad-bg text-xs font-bold text-white"
              onClick={() => setUserOpen((o) => !o)}
              aria-label="User menu"
            >
              {userName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </button>
            {userOpen && (
              <div className="absolute right-0 top-10 z-40 w-48 rounded-xl border border-panelborder bg-elevated py-1 shadow-2xl">
                <div className="border-b border-panelborder px-3 py-2 text-xs font-semibold text-title">{userName}</div>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-body hover:bg-[rgba(239,68,68,0.08)] hover:text-danger"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

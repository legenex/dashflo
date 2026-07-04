import { EventEmitter } from "node:events";

// In-process event bus powering the live ticker and page refreshes.
// One emitter per server process, shared across HMR via globalThis.

export interface LiveEvent {
  id: string;
  organizationId: string;
  kind:
    | "lead_received"
    | "lead_sold"
    | "lead_rejected"
    | "lead_error"
    | "lead_returned"
    | "payment_matched"
    | "match_applied"
    | "connector_changed"
    | "action_resolved"
    | "insight_created"
    | "notification";
  title: string;
  detail?: string;
  amountCents?: number | null;
  link?: string;
  at: string;
}

interface BusGlobal {
  __dashflo_bus?: EventEmitter;
  __dashflo_recent?: LiveEvent[];
}

const g = globalThis as unknown as BusGlobal;

export function getBus(): EventEmitter {
  if (!g.__dashflo_bus) {
    g.__dashflo_bus = new EventEmitter();
    g.__dashflo_bus.setMaxListeners(200);
    g.__dashflo_recent = [];
  }
  return g.__dashflo_bus;
}

export function emitLive(event: Omit<LiveEvent, "id" | "at">): void {
  const bus = getBus();
  const full: LiveEvent = {
    ...event,
    id: Math.random().toString(36).slice(2, 10),
    at: new Date().toISOString(),
  };
  const recent = g.__dashflo_recent ?? [];
  recent.push(full);
  if (recent.length > 100) recent.shift();
  g.__dashflo_recent = recent;
  bus.emit("live", full);
}

export function recentEvents(organizationId: string, limit = 30): LiveEvent[] {
  return (g.__dashflo_recent ?? [])
    .filter((e) => e.organizationId === organizationId)
    .slice(-limit);
}

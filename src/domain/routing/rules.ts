import type { FilterGroup, FilterRule, InboundFilters } from "@/db/schema";
import { zonedParts } from "@/lib/transforms";

// Shared rule evaluation used by campaign inbound filters, buyer filters,
// and automation conditions. Pure, no IO.

export interface RuleContext {
  now: Date;
  timezone: string;
}

export interface RuleResult {
  pass: boolean;
  failing?: { group: string; rule: FilterRule };
}

function asComparable(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  return String(v);
}

export function evaluateRule(rule: FilterRule, data: Record<string, unknown>): boolean {
  const raw = data[rule.field];
  const value = asComparable(raw);
  const target = rule.value;

  switch (rule.operator) {
    case "exists":
      return raw !== null && raw !== undefined && String(raw) !== "";
    case "equals":
      return String(value ?? "").toLowerCase() === String(target ?? "").toLowerCase();
    case "not_equals":
      return String(value ?? "").toLowerCase() !== String(target ?? "").toLowerCase();
    case "in":
      return (
        Array.isArray(target) &&
        target.some((t) => String(t).toLowerCase() === String(value ?? "").toLowerCase())
      );
    case "not_in":
      return (
        !Array.isArray(target) ||
        !target.some((t) => String(t).toLowerCase() === String(value ?? "").toLowerCase())
      );
    case "contains":
      return String(value ?? "").toLowerCase().includes(String(target ?? "").toLowerCase());
    case "gt":
      return Number(value) > Number(target);
    case "lt":
      return Number(value) < Number(target);
    case "gte":
      return Number(value) >= Number(target);
    case "lte":
      return Number(value) <= Number(target);
    case "regex":
      try {
        return new RegExp(String(target ?? ""), "i").test(String(value ?? ""));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

export function scheduleIsLive(
  schedule: { days: number[]; start_hour: number; end_hour: number } | undefined,
  ctx: RuleContext
): boolean {
  if (!schedule) return true;
  const { day, hour } = zonedParts(ctx.now, ctx.timezone);
  if (!schedule.days.includes(day)) return false;
  if (schedule.start_hour <= schedule.end_hour) {
    return hour >= schedule.start_hour && hour < schedule.end_hour;
  }
  // overnight window, e.g. 22 to 6
  return hour >= schedule.start_hour || hour < schedule.end_hour;
}

function evaluateGroup(
  group: FilterGroup,
  data: Record<string, unknown>,
  ctx: RuleContext
): { pass: boolean; failing?: FilterRule } {
  // A scheduled group only applies while its schedule is live.
  if (group.schedule && !scheduleIsLive(group.schedule, ctx)) {
    return { pass: true };
  }
  if (group.rules.length === 0) return { pass: true };
  if (group.logic === "and") {
    for (const rule of group.rules) {
      if (!evaluateRule(rule, data)) return { pass: false, failing: rule };
    }
    return { pass: true };
  }
  for (const rule of group.rules) {
    if (evaluateRule(rule, data)) return { pass: true };
  }
  return { pass: false, failing: group.rules[0] };
}

export function evaluateFilters(
  filters: InboundFilters | null | undefined,
  data: Record<string, unknown>,
  ctx: RuleContext
): RuleResult {
  if (!filters || filters.groups.length === 0) return { pass: true };
  if (filters.logic === "and") {
    for (const group of filters.groups) {
      const result = evaluateGroup(group, data, ctx);
      if (!result.pass) {
        return {
          pass: false,
          failing: { group: group.name ?? group.id, rule: result.failing! },
        };
      }
    }
    return { pass: true };
  }
  let firstFail: RuleResult["failing"];
  for (const group of filters.groups) {
    const result = evaluateGroup(group, data, ctx);
    if (result.pass) return { pass: true };
    if (!firstFail && result.failing) {
      firstFail = { group: group.name ?? group.id, rule: result.failing };
    }
  }
  return { pass: false, failing: firstFail };
}

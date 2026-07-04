import { addDays, toDateKey, startOfMonthKey, endOfMonthKey } from "@/lib/transforms";

// Resolve FilterBar URL params into date ranges (plus the compare window).

export interface ResolvedRange {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  label: string;
}

export function resolveRange(params: { range?: string; from?: string; to?: string }): ResolvedRange {
  const today = new Date();
  const todayKey = toDateKey(today);
  const preset = params.range ?? "60d";

  let from = todayKey;
  let to = todayKey;
  let label = "Today";

  if (preset === "yesterday") {
    from = to = toDateKey(addDays(today, -1));
    label = "Yesterday";
  } else if (preset === "7d") {
    from = toDateKey(addDays(today, -6));
    label = "Last 7 days";
  } else if (preset === "month") {
    from = startOfMonthKey(todayKey);
    label = "This month";
  } else if (preset === "last_month") {
    const lastMonthEnd = toDateKey(addDays(new Date(`${startOfMonthKey(todayKey)}T00:00:00Z`), -1));
    from = startOfMonthKey(lastMonthEnd);
    to = endOfMonthKey(lastMonthEnd);
    label = "Last month";
  } else if (preset === "60d") {
    from = toDateKey(addDays(today, -59));
    label = "Last 60 days";
  } else if (preset === "custom" && params.from && params.to) {
    from = params.from;
    to = params.to;
    label = `${params.from} to ${params.to}`;
  } else if (preset === "today") {
    label = "Today";
  } else {
    from = toDateKey(addDays(today, -59));
    label = "Last 60 days";
  }

  const spanDays = Math.max(
    1,
    Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000) + 1
  );
  const prevTo = toDateKey(addDays(new Date(`${from}T00:00:00Z`), -1));
  const prevFrom = toDateKey(addDays(new Date(`${prevTo}T00:00:00Z`), -(spanDays - 1)));

  return { from, to, prevFrom, prevTo, label };
}

export function csvList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const list = value.split(",").filter(Boolean);
  return list.length > 0 ? list : undefined;
}

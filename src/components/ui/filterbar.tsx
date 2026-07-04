"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { CalendarRange, GitCompareArrows } from "lucide-react";

// FilterBar: date presets, entity multi-selects, and a compare toggle that
// adds delta arrows to every StatPair on the page. State lives in the URL so
// server components read it directly.

export interface FilterOption {
  id: string;
  label: string;
}

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7" },
  { id: "month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "60d", label: "Last 60" },
];

export function FilterBar({
  selects = [],
  showCompare = true,
  className = "",
}: {
  selects?: Array<{ param: string; label: string; options: FilterOption[] }>;
  showCompare?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [custom, setCustom] = useState(false);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
      router.push(`?${next.toString()}`, { scroll: false });
    },
    [params, router]
  );

  const range = params.get("range") ?? "60d";
  const compare = params.get("compare") === "1";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-panelborder bg-panel p-1">
        <CalendarRange size={13} className="ml-1 text-label" />
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setCustom(false);
              setParam("range", p.id);
            }}
            className={`cursor-pointer rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
              range === p.id && !custom ? "df-grad-bg text-white" : "text-label hover:text-body"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustom((c) => !c)}
          className={`cursor-pointer rounded-md px-2 py-1 text-[11px] font-semibold ${custom || range === "custom" ? "df-grad-bg text-white" : "text-label hover:text-body"}`}
        >
          Custom
        </button>
        {(custom || range === "custom") && (
          <span className="flex items-center gap-1 pl-1">
            <input
              type="date"
              defaultValue={params.get("from") ?? ""}
              onChange={(e) => {
                setParam("from", e.target.value);
                setParam("range", "custom");
              }}
              className="rounded border border-panelborder bg-elevated px-1.5 py-0.5 text-[11px] text-body"
            />
            <span className="text-[11px] text-label">to</span>
            <input
              type="date"
              defaultValue={params.get("to") ?? ""}
              onChange={(e) => {
                setParam("to", e.target.value);
                setParam("range", "custom");
              }}
              className="rounded border border-panelborder bg-elevated px-1.5 py-0.5 text-[11px] text-body"
            />
          </span>
        )}
      </div>

      {selects.map((sel) => {
        const active = (params.get(sel.param) ?? "").split(",").filter(Boolean);
        return (
          <details key={sel.param} className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-panelborder bg-panel px-2.5 py-1.5 text-[11px] font-semibold text-label hover:text-body">
              {sel.label}
              {active.length > 0 && (
                <span className="rounded-full bg-[rgba(34,211,238,0.2)] px-1.5 text-accent">{active.length}</span>
              )}
            </summary>
            <div className="absolute left-0 top-9 z-40 max-h-64 w-56 overflow-y-auto rounded-lg border border-panelborder bg-elevated p-1.5 shadow-2xl">
              {sel.options.map((opt) => {
                const checked = active.includes(opt.id);
                return (
                  <label key={opt.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-body hover:bg-[rgba(59,130,246,0.1)]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked ? active.filter((a) => a !== opt.id) : [...active, opt.id];
                        setParam(sel.param, next.join(",") || null);
                      }}
                      className="accent-[var(--grad-to)]"
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </details>
        );
      })}

      {showCompare && (
        <button
          type="button"
          onClick={() => setParam("compare", compare ? null : "1")}
          className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
            compare
              ? "border-[rgba(34,211,238,0.4)] bg-[rgba(34,211,238,0.12)] text-accent"
              : "border-panelborder bg-panel text-label hover:text-body"
          }`}
        >
          <GitCompareArrows size={13} /> Compare
        </button>
      )}
    </div>
  );
}

"use client";

import { useState, type ReactNode } from "react";

export function Tabs({
  tabs,
  initial,
  onChange,
  className = "",
}: {
  tabs: Array<{ id: string; label: string; badge?: string | number; content: ReactNode }>;
  initial?: string;
  onChange?: (id: string) => void;
  className?: string;
}) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1 border-b border-panelborder px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setActive(t.id);
              onChange?.(t.id);
            }}
            className={`cursor-pointer rounded-t-md px-3 py-2 text-xs font-semibold transition-colors ${
              active === t.id
                ? "border-b-2 border-[var(--cyan)] text-title"
                : "text-label hover:text-body"
            }`}
          >
            {t.label}
            {t.badge !== undefined && t.badge !== 0 && (
              <span className="ml-1.5 rounded-full bg-[rgba(139,92,246,0.25)] px-1.5 py-0.5 text-[10px] text-queued">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="p-3">{current?.content}</div>
    </div>
  );
}

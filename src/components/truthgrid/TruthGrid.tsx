"use client";

import {
  Fragment,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MoreVertical, ChevronDown, Rows3 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Chip, EmptyState, Sparkline, type ChipTone } from "@/components/ui/primitives";
import { fmtCents } from "@/lib/money";

// TruthGrid: the only data grid in DashFlo. TanStack Table + Virtual as
// headless engines, fully custom markup (no table elements anywhere).
// Compact rows: identity, one key stat, BOOKED / VERIFIED / GAP grouped money
// cells, a status chip, and a kebab of quick actions. Row click expands an
// inline drawer. Arrow keys navigate, Enter toggles the drawer.

export interface MoneyCell {
  value: number | null;
  tone?: "default" | "verified" | "gap" | "danger" | "dim";
  chip?: string; // e.g. "Needs Source"
}

export interface TruthGridRow {
  key: string;
  identity: { title: string; sub?: string; spark?: number[] };
  stat: { label: string; value: string };
  booked: MoneyCell;
  verified: MoneyCell;
  gap: MoneyCell;
  chip: { tone: ChipTone; label: string };
  chip2?: { tone: ChipTone; label: string };
  glow?: "danger" | "verified" | null;
  actions: Array<{ label: string; onClick: () => void; danger?: boolean }>;
  sortValues?: Record<string, number | string | null>;
}

const MONEY_TONE: Record<NonNullable<MoneyCell["tone"]>, string> = {
  default: "text-title",
  verified: "text-verified",
  gap: "text-warning",
  danger: "text-danger",
  dim: "text-label",
};

function MoneyCellView({ cell, dense }: { cell: MoneyCell; dense: boolean }) {
  if (cell.value === null) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-mono-money text-xs text-label">UNKNOWN</span>
        {cell.chip && <Chip tone="dim">{cell.chip}</Chip>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end">
      <span className={`font-mono-money ${dense ? "text-xs" : "text-sm"} font-semibold ${MONEY_TONE[cell.tone ?? "default"]}`}>
        {fmtCents(cell.value)}
      </span>
      {cell.chip && <span className="text-[10px] text-label">{cell.chip}</span>}
    </div>
  );
}

export function TruthGrid({
  rows,
  bookedHeader = "BOOKED",
  verifiedHeader = "VERIFIED",
  gapHeader = "GAP",
  renderDrawer,
  emptyTitle = "Nothing here yet",
  emptyHint,
  maxHeight = 640,
  defaultOpenKey,
}: {
  rows: TruthGridRow[];
  bookedHeader?: string;
  verifiedHeader?: string;
  gapHeader?: string;
  renderDrawer?: (row: TruthGridRow) => ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
  maxHeight?: number;
  defaultOpenKey?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [dense, setDense] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(defaultOpenKey ?? null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const columns = useMemo<ColumnDef<TruthGridRow>[]>(
    () => [
      {
        id: "identity",
        accessorFn: (r) => r.identity.title,
      },
      { id: "stat", accessorFn: (r) => r.sortValues?.stat ?? r.stat.value },
      { id: "booked", accessorFn: (r) => r.booked.value ?? -1 },
      { id: "verified", accessorFn: (r) => r.verified.value ?? -1 },
      { id: "gap", accessorFn: (r) => r.gap.value ?? -1 },
    ],
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sortedRows = table.getRowModel().rows.map((r) => r.original);

  const rowHeight = dense ? 52 : 66;
  const virtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (sortedRows[i] && openKey === sortedRows[i].key ? rowHeight + 420 : rowHeight),
    overscan: 8,
  });

  const toggleSort = (id: string) => {
    setSorting((prev) => {
      const current = prev.find((s) => s.id === id);
      if (!current) return [{ id, desc: true }];
      if (current.desc) return [{ id, desc: false }];
      return [];
    });
  };

  const sortIndicator = (id: string) => {
    const s = sorting.find((x) => x.id === id);
    return s ? (s.desc ? " ↓" : " ↑") : "";
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(sortedRows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = sortedRows[focusIdx];
      if (row) setOpenKey((k) => (k === row.key ? null : row.key));
    } else if (e.key === "Escape") {
      setOpenKey(null);
      setMenuKey(null);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="df-panel">
        <EmptyState title={emptyTitle} hint={emptyHint} />
      </div>
    );
  }

  return (
    <div className="df-panel overflow-hidden">
      {/* header */}
      <div className="flex items-center border-b border-panelborder bg-[rgba(11,14,35,0.4)] px-3 py-2">
        <button type="button" className="df-label flex-1 cursor-pointer text-left hover:text-body" onClick={() => toggleSort("identity")}>
          Name{sortIndicator("identity")}
        </button>
        <button type="button" className="df-label hidden w-28 cursor-pointer text-right hover:text-body sm:block" onClick={() => toggleSort("stat")}>
          {rows[0]?.stat.label ?? "Stat"}{sortIndicator("stat")}
        </button>
        <button type="button" className="df-label w-24 cursor-pointer text-right hover:text-body" onClick={() => toggleSort("booked")}>
          {bookedHeader}{sortIndicator("booked")}
        </button>
        <button type="button" className="df-label w-24 cursor-pointer text-right hover:text-body" onClick={() => toggleSort("verified")}>
          {verifiedHeader}{sortIndicator("verified")}
        </button>
        <button type="button" className="df-label hidden w-24 cursor-pointer text-right hover:text-body sm:block" onClick={() => toggleSort("gap")}>
          {gapHeader}{sortIndicator("gap")}
        </button>
        <div className="w-32 text-right lg:w-40">
          <button
            type="button"
            className="cursor-pointer rounded p-1 text-label hover:text-body"
            onClick={() => setDense((d) => !d)}
            title="Toggle row density"
          >
            <Rows3 size={14} />
          </button>
        </div>
      </div>

      {/* virtualized body */}
      <div
        ref={scrollRef}
        className="overflow-y-auto outline-none"
        style={{ maxHeight }}
        tabIndex={0}
        onKeyDown={onKeyDown}
        role="grid"
        aria-rowcount={sortedRows.length}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const row = sortedRows[vi.index];
            if (!row) return null;
            const open = openKey === row.key;
            const focused = focusIdx === vi.index;
            return (
              <div
                key={row.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}
              >
                <div
                  className={`flex cursor-pointer items-center border-b border-[rgba(38,43,77,0.5)] px-3 transition-colors ${
                    focused ? "bg-[rgba(59,130,246,0.08)]" : "hover:bg-[rgba(26,31,66,0.6)]"
                  } ${row.glow === "danger" ? "shadow-[inset_3px_0_0_var(--error)]" : row.glow === "verified" ? "shadow-[inset_3px_0_0_var(--verified)]" : ""}`}
                  style={{ height: rowHeight }}
                  onClick={() => {
                    setFocusIdx(vi.index);
                    setOpenKey((k) => (k === row.key ? null : row.key));
                  }}
                  role="row"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-title">{row.identity.title}</span>
                      {row.identity.spark && row.identity.spark.length > 1 && !dense && (
                        <Sparkline data={row.identity.spark} width={56} height={16} />
                      )}
                    </div>
                    {row.identity.sub && <div className="truncate text-[11px] text-label">{row.identity.sub}</div>}
                  </div>
                  <div className="hidden w-28 text-right sm:block">
                    <span className="font-mono-money text-xs text-body">{row.stat.value}</span>
                  </div>
                  <div className="w-24"><MoneyCellView cell={row.booked} dense={dense} /></div>
                  <div className="w-24"><MoneyCellView cell={row.verified} dense={dense} /></div>
                  <div className="hidden w-24 sm:block"><MoneyCellView cell={row.gap} dense={dense} /></div>
                  <div className="flex w-32 items-center justify-end gap-1.5 lg:w-40">
                    <div className="flex flex-col items-end gap-0.5">
                      <Chip tone={row.chip.tone}>{row.chip.label}</Chip>
                      {row.chip2 && <Chip tone={row.chip2.tone} className={dense ? "!py-0 !text-[10px]" : ""}>{row.chip2.label}</Chip>}
                    </div>
                    {row.actions.length > 0 && (
                      <div className="relative">
                        <button
                          type="button"
                          className="cursor-pointer rounded p-1 text-label hover:text-title"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuKey((k) => (k === row.key ? null : row.key));
                          }}
                          aria-label="Row actions"
                        >
                          <MoreVertical size={15} />
                        </button>
                        {menuKey === row.key && (
                          <div className="absolute right-0 top-7 z-30 w-52 rounded-lg border border-panelborder bg-elevated py-1 shadow-2xl">
                            {row.actions.map((action) => (
                              <button
                                key={action.label}
                                type="button"
                                className={`block w-full cursor-pointer px-3 py-1.5 text-left text-xs hover:bg-[rgba(59,130,246,0.12)] ${
                                  action.danger ? "text-danger" : "text-body"
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuKey(null);
                                  action.onClick();
                                }}
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <ChevronDown
                      size={14}
                      className={`text-label transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {open && renderDrawer && (
                    <motion.div
                      initial={reduced ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={reduced ? undefined : { opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                      className="overflow-hidden border-b border-panelborder bg-[rgba(11,14,35,0.55)]"
                    >
                      <Fragment>{renderDrawer(row)}</Fragment>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

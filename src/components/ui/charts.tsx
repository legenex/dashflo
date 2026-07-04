"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

// Recharts, themed to the DashFlo token layer. No default colors anywhere.

const AXIS = { stroke: "#8A91B4", fontSize: 10 };
const GRID = "rgba(38,43,77,0.6)";

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "#1A1F42",
    border: "1px solid #262B4D",
    borderRadius: 10,
    fontSize: 12,
    color: "#C7CCE6",
  },
  labelStyle: { color: "#fff", fontWeight: 600 },
  cursor: { fill: "rgba(59,130,246,0.06)" },
};

function money(v: number): string {
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// The Overview centerpiece: booked bars, verified income line, spend bars.
// The divergence between the bars and the line IS the product.
export function RevenueTruthChart({
  data,
  height = 260,
}: {
  data: Array<{ date: string; booked: number; verified: number | null; spend: number | null }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={28} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={money} width={54} />
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value: number | string, name: string) => [money(Number(value)), name]}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: "#8A91B4" }} />
        <Bar dataKey="booked" name="Booked revenue" fill="url(#dfBooked)" radius={[3, 3, 0, 0]} maxBarSize={18} />
        <Bar dataKey="spend" name="Ad spend" fill="rgba(249,115,22,0.55)" radius={[3, 3, 0, 0]} maxBarSize={18} />
        <Line
          dataKey="verified"
          name="Verified income"
          stroke="#22C55E"
          strokeWidth={2.5}
          dot={false}
          connectNulls
          type="monotone"
        />
        <defs>
          <linearGradient id="dfBooked" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.95} />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.55} />
          </linearGradient>
        </defs>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const DONUT_COLORS = ["#22C55E", "#8A91B4", "#F59E0B", "#60A5FA", "#EF4444", "#F97316", "#A78BFA"];

export function StatusDonut({
  data,
  height = 210,
}: {
  data: Array<{ name: string; value: number }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#8A91B4" }} iconSize={8} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// Small inline chart used in AI answers and drawers.
export function MiniChart({
  kind,
  data,
  series,
  height = 160,
  prefix = "$",
}: {
  kind: "bar" | "line";
  data: Array<{ label: string; value: number; value2?: number }>;
  series?: [string, string];
  height?: number;
  prefix?: string;
}) {
  const hasSecond = data.some((d) => d.value2 !== undefined);
  const fmt = (v: number) => `${prefix}${v.toLocaleString()}`;
  if (kind === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={20} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={fmt} width={48} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: number | string) => fmt(Number(v))} />
          <Line dataKey="value" name={series?.[0] ?? "Value"} stroke="#22D3EE" strokeWidth={2} dot={false} type="monotone" />
          {hasSecond && <Line dataKey="value2" name={series?.[1] ?? "Series 2"} stroke="#8B5CF6" strokeWidth={2} dot={false} type="monotone" />}
        </LineChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} angle={data.length > 5 ? -18 : 0} height={data.length > 5 ? 44 : 24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={fmt} width={48} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v: number | string) => fmt(Number(v))} />
        {series && <Legend wrapperStyle={{ fontSize: 11, color: "#8A91B4" }} />}
        <Bar dataKey="value" name={series?.[0] ?? "Value"} fill="#3B82F6" radius={[3, 3, 0, 0]} maxBarSize={30} />
        {hasSecond && <Bar dataKey="value2" name={series?.[1] ?? "Series 2"} fill="#22C55E" radius={[3, 3, 0, 0]} maxBarSize={30} />}
      </BarChart>
    </ResponsiveContainer>
  );
}

// Booked vs paid period bars for buyer drawers.
export function PeriodBars({
  data,
  height = 180,
}: {
  data: Array<{ period: string; expected: number; paid: number }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="period" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={money} width={52} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v: number | string) => money(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#8A91B4" }} />
        <Bar dataKey="expected" name="Expected" fill="#3B82F6" radius={[3, 3, 0, 0]} maxBarSize={26} />
        <Bar dataKey="paid" name="Paid" fill="#22C55E" radius={[3, 3, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Day-of-week x hour-of-day heatmap, custom-rendered (no library default).
export function Heatmap({
  matrix,
  maxLabel = "high",
}: {
  matrix: number[][]; // 7 rows (Sun..Sat) x 24 cols
  maxLabel?: string;
}) {
  const flat = matrix.flat();
  const max = Math.max(...flat, 1);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        {matrix.map((row, d) => (
          <div key={d} className="flex items-center gap-0.5">
            <span className="w-8 text-right text-[10px] text-label">{days[d]}</span>
            {row.map((v, h) => (
              <div
                key={h}
                title={`${days[d]} ${h}:00 · ${v}`}
                className="m-px h-4 flex-1 rounded-[3px]"
                style={{
                  background:
                    v === 0
                      ? "rgba(38,43,77,0.5)"
                      : `rgba(34, 211, 238, ${0.15 + (v / max) * 0.75})`,
                }}
              />
            ))}
          </div>
        ))}
        <div className="ml-8 mt-1 flex justify-between text-[10px] text-label">
          <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
        </div>
        <div className="ml-8 mt-1 text-[10px] text-label">Brighter = {maxLabel}</div>
      </div>
    </div>
  );
}

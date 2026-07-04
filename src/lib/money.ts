// Money helpers. Everything is integer cents until the edge.
// null means UNKNOWN, never zero. Renderers must respect that.

export function fmtCents(cents: number | null | undefined, opts?: { compact?: boolean; sign?: boolean }): string {
  if (cents === null || cents === undefined) return "UNKNOWN";
  const sign = cents < 0 ? "-" : opts?.sign && cents > 0 ? "+" : "";
  const abs = Math.abs(cents);
  if (opts?.compact && abs >= 1000000) {
    return `${sign}$${(abs / 100000).toFixed(abs >= 10000000 ? 0 : 1).replace(/\.0$/, "")}k`.replace(
      /^(-?)\$(\d+(?:\.\d)?)k$/,
      (_m, s: string, n: string) => `${s}$${(Number(n) / 10).toFixed(1).replace(/\.0$/, "")}k`
    );
  }
  const dollars = abs / 100;
  const str = dollars.toLocaleString("en-US", {
    minimumFractionDigits: abs % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${sign}$${str}`;
}

export function fmtCentsExact(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "UNKNOWN";
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "UNKNOWN";
  return `${(value * 100).toFixed(digits).replace(/\.0$/, "")}%`;
}

export function pctOf(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return part / whole;
}

export function sumCents(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const v of values) total += v ?? 0;
  return total;
}

// Sum that preserves UNKNOWN: if every input is null the result is null.
export function sumOrNull(values: Array<number | null | undefined>): number | null {
  let seen = false;
  let total = 0;
  for (const v of values) {
    if (v !== null && v !== undefined) {
      seen = true;
      total += v;
    }
  }
  return seen ? total : null;
}

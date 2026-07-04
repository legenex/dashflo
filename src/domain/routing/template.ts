import type { SuccessMatcher } from "@/db/schema";

// {{token}} template rendering, dotted-path extraction, and success matching.

export function renderTemplate(template: string, tokens: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const value = extractPath(tokens, key);
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}

// Lightweight jsonpath: supports $.a.b, a.b, a[0].b
export function extractPath(obj: unknown, pathExpr: string): unknown {
  const cleaned = pathExpr.replace(/^\$\.?/, "");
  if (cleaned === "") return obj;
  const segments = cleaned
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((s) => s.length > 0);
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

export function evaluateMatcher(
  matcher: SuccessMatcher,
  responseBody: string,
  parsed: unknown
): boolean {
  if (matcher.kind === "regex") {
    try {
      return new RegExp(matcher.expr, "i").test(responseBody);
    } catch {
      return false;
    }
  }
  const value = extractPath(parsed, matcher.expr);
  if (matcher.expected === undefined) {
    return value !== null && value !== undefined && value !== false && value !== "";
  }
  return String(value ?? "").toLowerCase() === matcher.expected.toLowerCase();
}

// Price extraction: dotted path into the parsed response, dollars or cents heuristic
// is avoided, buyers respond in cents when integer-like and dollars when decimal.
export function extractPriceCents(parsed: unknown, pricePath: string): number | null {
  const value = extractPath(parsed, pricePath);
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return null;
  // Decimal values are dollars, integers are dollars too unless suspiciously large.
  // Convention for DashFlo buyers: responses carry dollars. 95 -> 9500 cents.
  return Math.round(n * 100);
}

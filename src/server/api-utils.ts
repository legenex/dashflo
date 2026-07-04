import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { sha256Hex } from "@/lib/hash";

// Shared API plumbing: error envelope, Zod parsing, bearer org keys with
// scopes, and an in-memory rate limiter.

export function apiError(code: string, message: string, status: number, details?: unknown): NextResponse {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

export function apiOk(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export async function parseBody<T>(req: NextRequest, zodSchema: z.ZodType<T>): Promise<
  | { ok: true; data: T }
  | { ok: false; response: NextResponse }
> {
  let raw: unknown;
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("form")) {
      const form = await req.formData();
      raw = Object.fromEntries(form.entries());
    } else {
      raw = await req.json();
    }
  } catch {
    return { ok: false, response: apiError("invalid_body", "Body must be JSON or form encoded", 400) };
  }
  const parsed = zodSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError("validation_failed", "Request failed validation", 422, parsed.error.flatten()),
    };
  }
  return { ok: true, data: parsed.data };
}

// ---- Rate limiter: token bucket per key, in-memory ----
interface Bucket {
  tokens: number;
  updatedAt: number;
}
interface RateGlobal {
  __dashflo_rate?: Map<string, Bucket>;
}
const g = globalThis as unknown as RateGlobal;

export function rateLimit(key: string, perMinute = 120): boolean {
  const buckets = (g.__dashflo_rate ??= new Map());
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: perMinute, updatedAt: now };
    buckets.set(key, bucket);
  }
  const refill = ((now - bucket.updatedAt) / 60000) * perMinute;
  bucket.tokens = Math.min(perMinute, bucket.tokens + refill);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

// ---- Bearer org API keys for /api/v1 ----
export interface V1Auth {
  organizationId: string;
  keyId: string;
  scopes: string[];
}

export async function authenticateV1(req: NextRequest): Promise<
  | { ok: true; auth: V1Auth }
  | { ok: false; response: NextResponse }
> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, response: apiError("missing_token", "Provide Authorization: Bearer <api key>", 401) };
  }
  const key = match[1].trim();
  const db = await getDb();
  const row = await db.query.apiKeys.findFirst({
    where: eq(schema.apiKeys.hashedKey, sha256Hex(key)),
  });
  if (!row || row.status !== "active") {
    return { ok: false, response: apiError("invalid_token", "Unknown or revoked API key", 401) };
  }
  if (!rateLimit(`v1:${row.id}`, 240)) {
    return { ok: false, response: apiError("rate_limited", "Too many requests, slow down", 429) };
  }
  void db.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, row.id));
  return { ok: true, auth: { organizationId: row.organizationId, keyId: row.id, scopes: row.scopes } };
}

export function requireScope(auth: V1Auth, scope: string): NextResponse | null {
  if (auth.scopes.includes("*") || auth.scopes.includes(scope)) return null;
  return apiError("insufficient_scope", `This key lacks the ${scope} scope`, 403);
}

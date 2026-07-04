import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// API keys: df_live_<prefix>_<secret>. We store prefix + sha256(full key).
export function generateApiKey(kind: "org" | "supplier"): {
  key: string;
  prefix: string;
  hash: string;
} {
  const prefix = randomBytes(4).toString("hex");
  const secret = randomBytes(18).toString("hex");
  const key = `df_${kind === "org" ? "live" : "sup"}_${prefix}_${secret}`;
  return { key, prefix, hash: sha256Hex(key) };
}

// Meta CAPI user-data hashing: lowercase, trim, then sha256.
export function capiHash(value: string): string {
  return sha256Hex(value.trim().toLowerCase());
}

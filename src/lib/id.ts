import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

// Compact, prefix-tagged ids: ld_x8k2..., readable in logs and URLs.
export function newId(prefix: string): string {
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}_${out}`;
}

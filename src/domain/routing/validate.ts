import type { FieldDef } from "@/db/schema";
import { normalizeDate, normalizeEmail, toE164, toStateCode, isValidZip } from "@/lib/transforms";

// Validate and transform an inbound payload against a campaign field mapping.

export interface ValidationSuccess {
  ok: true;
  values: Record<string, unknown>;
  normalizedPhone: string | null;
  normalizedEmail: string | null;
  state: string | null;
}

export interface ValidationFailure {
  ok: false;
  errors: Array<{ field: string; message: string }>;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

function applyTransforms(def: FieldDef, raw: string): string {
  let value = raw;
  for (const t of def.transforms ?? []) {
    if (t === "trim") value = value.trim();
    if (t === "lowercase") value = value.toLowerCase();
  }
  return value;
}

export function validateAndTransform(
  mapping: FieldDef[],
  body: Record<string, unknown>
): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];
  const values: Record<string, unknown> = {};
  let normalizedPhone: string | null = null;
  let normalizedEmail: string | null = null;
  let state: string | null = null;

  for (const def of mapping) {
    const raw = body[def.key];
    const present = raw !== null && raw !== undefined && String(raw).trim() !== "";

    if (!present) {
      if (def.required) errors.push({ field: def.key, message: "required field missing" });
      continue;
    }

    const strRaw = applyTransforms(def, String(raw));

    switch (def.type) {
      case "phone": {
        const e164 = toE164(strRaw);
        if (!e164) {
          errors.push({ field: def.key, message: "invalid phone number" });
        } else {
          values[def.key] = e164;
          if (!normalizedPhone) normalizedPhone = e164;
        }
        break;
      }
      case "email": {
        const email = normalizeEmail(strRaw);
        if (!email) {
          errors.push({ field: def.key, message: "invalid email address" });
        } else {
          values[def.key] = email;
          if (!normalizedEmail) normalizedEmail = email;
        }
        break;
      }
      case "date": {
        const date = normalizeDate(strRaw);
        if (!date) {
          errors.push({ field: def.key, message: "invalid date, expected mm/dd/yyyy or ISO" });
        } else {
          values[def.key] = date;
        }
        break;
      }
      case "state": {
        const code = toStateCode(strRaw);
        if (!code) {
          errors.push({ field: def.key, message: "invalid US state" });
        } else {
          values[def.key] = code;
          if (!state) state = code;
        }
        break;
      }
      case "zip": {
        if (!isValidZip(strRaw)) {
          errors.push({ field: def.key, message: "invalid zip code" });
        } else {
          values[def.key] = strRaw.trim();
        }
        break;
      }
      case "number": {
        const n = Number(strRaw);
        if (Number.isNaN(n)) {
          errors.push({ field: def.key, message: "expected a number" });
        } else {
          values[def.key] = n;
        }
        break;
      }
      case "boolean": {
        const v = strRaw.toLowerCase();
        if (["true", "yes", "1", "y"].includes(v)) values[def.key] = true;
        else if (["false", "no", "0", "n"].includes(v)) values[def.key] = false;
        else errors.push({ field: def.key, message: "expected true or false" });
        break;
      }
      case "select": {
        const options = def.options ?? [];
        const hit = options.find((o) => o.toLowerCase() === strRaw.toLowerCase());
        if (!hit) {
          errors.push({ field: def.key, message: `expected one of: ${options.join(", ")}` });
        } else {
          values[def.key] = hit;
        }
        break;
      }
      default:
        values[def.key] = strRaw;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, values, normalizedPhone, normalizedEmail, state };
}

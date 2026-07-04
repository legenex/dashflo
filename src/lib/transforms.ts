// Field normalization used by ingest and the routing engine. Pure functions.

const STATE_MAP: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};

const VALID_STATES = new Set(Object.values(STATE_MAP));

export function toStateCode(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 2 && VALID_STATES.has(trimmed.toUpperCase())) {
    return trimmed.toUpperCase();
  }
  const mapped = STATE_MAP[trimmed.toLowerCase()];
  return mapped ?? null;
}

// US-default E.164. Accepts (555) 123-4567, 555-123-4567, 15551234567, +15551234567.
export function toE164(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  const bare = digits.startsWith("+") ? digits.slice(1) : digits;
  if (bare.length === 10) return `+1${bare}`;
  if (bare.length === 11 && bare.startsWith("1")) return `+${bare}`;
  if (digits.startsWith("+") && bare.length >= 11 && bare.length <= 15) return `+${bare}`;
  return null;
}

// Accepts mm/dd/yyyy, m/d/yyyy, yyyy-mm-dd (with optional time). Returns YYYY-MM-DD.
export function normalizeDate(input: string): string | null {
  const trimmed = input.trim();
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const mm = Number(us[1]);
    const dd = Number(us[2]);
    const yyyy = Number(us[3]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const mm = Number(iso[2]);
    const dd = Number(iso[3]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  return null;
}

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

export function isValidZip(input: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(input.trim());
}

// Date helpers used across engines. All storage is UTC.
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

export function startOfMonthKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

export function endOfMonthKey(dateKey: string): string {
  const [y, m] = dateKey.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${dateKey.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

// ISO week start (Monday) for weekly reconciliation periods.
export function startOfWeekKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  return toDateKey(new Date(d.getTime() - diff * 86400000));
}

// Hour of day and weekday in a target IANA timezone, for filter schedules.
export function zonedParts(date: Date, timeZone: string): { day: number; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const dayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayStr);
  return { day: dayIdx < 0 ? 0 : dayIdx, hour: Number(hourStr) % 24 };
}

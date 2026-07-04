"use client";

// Tiny client helpers for the app action dispatcher and query endpoint.

export async function act<T = Record<string, unknown>>(
  action: string,
  payload: unknown = {}
): Promise<{ ok: boolean; data: T; error?: string }> {
  const res = await fetch("/api/app/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    return { ok: false, data, error: data.error?.message ?? `Request failed (${res.status})` };
  }
  return { ok: true, data };
}

export async function query<T = Record<string, unknown>>(
  kind: string,
  params: Record<string, string> = {}
): Promise<T | null> {
  const qs = new URLSearchParams({ kind, ...params });
  const res = await fetch(`/api/app/query?${qs.toString()}`);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

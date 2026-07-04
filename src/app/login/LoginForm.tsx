"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { GradientButton } from "@/components/ui/primitives";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("nick@legenex.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn("credentials", { email, password, redirect: false });
    setBusy(false);
    if (result?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push(params.get("next") ?? "/");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="df-label">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-panelborder bg-elevated px-3 py-2 text-sm text-title outline-none focus:border-[var(--grad-to)]"
          autoComplete="email"
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="df-label">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-panelborder bg-elevated px-3 py-2 text-sm text-title outline-none focus:border-[var(--grad-to)]"
          autoComplete="current-password"
          required
        />
      </label>
      {error && <div className="text-xs text-danger">{error}</div>}
      <GradientButton type="submit" disabled={busy} className="mt-1 justify-center py-2">
        {busy ? "Signing in..." : "Sign in"}
      </GradientButton>
    </form>
  );
}

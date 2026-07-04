import { Grid2x2 } from "lucide-react";
import { getDbMode } from "@/db/client";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const mode = process.env.DATABASE_URL ? "postgres" : getDbMode();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="df-panel df-gradient-border w-full max-w-sm p-8">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl df-grad-bg text-white">
            <Grid2x2 size={20} />
          </span>
          <span className="text-2xl font-bold">
            <span className="text-title">Dash</span>
            <span className="df-grad-text">Flo</span>
          </span>
        </div>
        <p className="mb-6 text-center text-xs text-label">
          Lead distribution with revenue truth. Booked, verified, and the gap between them.
        </p>
        <LoginForm />
        <div className="mt-6 rounded-lg border border-panelborder bg-[rgba(11,14,35,0.5)] p-3 text-[11px] text-label">
          <div className="mb-1 font-semibold text-body">Demo logins (password: dashflo2026)</div>
          <div className="font-mono-money">nick@legenex.com (owner)</div>
          <div className="font-mono-money">finance@legenex.com · analyst@legenex.com</div>
        </div>
      </div>
      <div className="mt-4 text-[10px] text-label">
        Database mode: <span className="font-mono-money text-body">{mode}</span>
        {mode === "pglite" && " (embedded Postgres, no Docker needed)"}
      </div>
    </div>
  );
}

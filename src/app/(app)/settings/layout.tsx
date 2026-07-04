import Link from "next/link";
import { SettingsNav } from "./SettingsNav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-title">Settings</h1>
        <p className="text-xs text-label">
          Every connection lives here. Toggle a source off and watch downstream metrics flip to Needs Source, that is the gating working.
          {" "}<Link href="/" className="text-accent hover:underline">Back to overview</Link>
        </p>
      </div>
      <SettingsNav />
      {children}
    </div>
  );
}

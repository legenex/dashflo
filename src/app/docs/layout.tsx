import Link from "next/link";
import { Grid2x2 } from "lucide-react";
import { DocsSidebar } from "./DocsSidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-panelborder bg-[rgba(11,14,35,0.9)] px-4 backdrop-blur">
        <Link href="/docs" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg df-grad-bg text-white">
            <Grid2x2 size={15} />
          </span>
          <span className="text-base font-bold">
            <span className="text-title">Dash</span>
            <span className="df-grad-text">Flo</span>
            <span className="ml-2 text-xs font-normal text-label">Docs</span>
          </span>
        </Link>
        <Link href="/" className="ml-auto rounded-lg border border-panelborder px-3 py-1.5 text-xs font-semibold text-body hover:text-title">
          Open the app
        </Link>
      </header>
      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6">
        <DocsSidebar />
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}

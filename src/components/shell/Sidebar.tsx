"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Users, GitBranch, Scale, BarChart3, Sparkles, Workflow,
  Settings, BookOpen, ChevronDown, Grid2x2, ShieldCheck, Menu, X,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  children?: Array<{ label: string; href: string }>;
}

const NAV: NavItem[] = [
  { label: "Overview", href: "/", icon: <LayoutDashboard size={16} /> },
  { label: "Leads", href: "/leads", icon: <Users size={16} /> },
  {
    label: "Distribution", href: "/distribution/campaigns", icon: <GitBranch size={16} />,
    children: [
      { label: "Campaigns", href: "/distribution/campaigns" },
      { label: "Buyers", href: "/distribution/buyers" },
      { label: "Suppliers", href: "/distribution/suppliers" },
      { label: "Deliveries", href: "/distribution/deliveries" },
      { label: "Conversion Events", href: "/distribution/conversion-events" },
    ],
  },
  { label: "Reconciliation", href: "/reconciliation", icon: <Scale size={16} /> },
  {
    label: "Reports", href: "/reports", icon: <BarChart3 size={16} />,
    children: [
      { label: "Report Pages", href: "/reports" },
      { label: "P&L", href: "/reports/pnl" },
      { label: "Ad Performance", href: "/reports/ad-performance" },
      { label: "Scheduled", href: "/reports/scheduled" },
    ],
  },
  {
    label: "AI Analyst", href: "/ai/chat", icon: <Sparkles size={16} />,
    children: [
      { label: "Chat", href: "/ai/chat" },
      { label: "Insights", href: "/ai/insights" },
    ],
  },
  { label: "Automations", href: "/automations", icon: <Workflow size={16} /> },
  { label: "Settings", href: "/settings/general", icon: <Settings size={16} /> },
  { label: "Docs", href: "/docs", icon: <BookOpen size={16} /> },
];

const PARTNER_NAV: NavItem[] = [
  { label: "My Portal", href: "/portal", icon: <BarChart3 size={16} /> },
  { label: "Docs", href: "/docs", icon: <BookOpen size={16} /> },
];

export function Sidebar({
  isPlatformAdmin,
  accent,
  role = "owner",
}: {
  isPlatformAdmin: boolean;
  accent?: string;
  role?: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = role === "partner" ? PARTNER_NAV : NAV;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href.split("/").slice(0, 2).join("/"));

  const nav = (
    <nav className="flex h-full flex-col gap-0.5 p-3">
      <Link href="/" className="mb-4 flex items-center gap-2 px-2" onClick={() => setMobileOpen(false)}>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
          style={{ background: accent ? accent : "linear-gradient(135deg, #3B82F6, #8B5CF6)" }}
        >
          <Grid2x2 size={17} />
        </span>
        <span className="text-lg font-bold">
          <span className="text-title">Dash</span>
          <span className="df-grad-text">Flo</span>
        </span>
      </Link>

      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <div key={item.label}>
            <Link
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition-all ${
                active
                  ? "df-grad-bg text-white shadow-[0_4px_14px_rgba(99,102,241,0.3)]"
                  : "text-body hover:bg-elevated hover:text-title"
              }`}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.children && <ChevronDown size={13} className={active ? "rotate-180" : ""} />}
            </Link>
            {item.children && active && (
              <div className="ml-8 mt-0.5 flex flex-col gap-0.5 border-l border-panelborder pl-2">
                {item.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={() => setMobileOpen(false)}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      pathname === child.href || pathname.startsWith(`${child.href}/`)
                        ? "text-accent"
                        : "text-label hover:text-body"
                    }`}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {isPlatformAdmin && (
        <Link
          href="/admin"
          onClick={() => setMobileOpen(false)}
          className={`mt-auto flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold ${
            pathname.startsWith("/admin") ? "bg-[rgba(239,68,68,0.15)] text-danger" : "text-label hover:text-danger"
          }`}
        >
          <ShieldCheck size={16} /> Master Admin
        </Link>
      )}
    </nav>
  );

  return (
    <>
      {/* mobile toggle */}
      <button
        type="button"
        className="fixed left-3 top-3 z-50 rounded-lg border border-panelborder bg-panel p-2 text-body lg:hidden"
        onClick={() => setMobileOpen((o) => !o)}
        aria-label="Toggle navigation"
      >
        {mobileOpen ? <X size={16} /> : <Menu size={16} />}
      </button>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-[rgba(4,6,20,0.7)] lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-56 border-r border-panelborder bg-[rgba(15,18,44,0.97)] backdrop-blur transition-transform lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {nav}
      </aside>
    </>
  );
}

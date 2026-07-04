"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/users", label: "Users & Roles" },
  { href: "/settings/white-label", label: "White Label" },
  { href: "/settings/data-sources", label: "Data Sources" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/ai-models", label: "AI Models" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/settings/fields", label: "Fields & Library" },
  { href: "/settings/costs", label: "Cost Entries" },
  { href: "/settings/errors", label: "Error Logs" },
  { href: "/settings/billing", label: "Billing & Plan" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-1.5">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            pathname === item.href ? "df-grad-bg text-white" : "border border-panelborder text-label hover:text-body"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

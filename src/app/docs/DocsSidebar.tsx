"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOC_SECTIONS } from "./registry";

export function DocsSidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-5rem)] w-52 shrink-0 overflow-y-auto md:block">
      {DOC_SECTIONS.map((section) => (
        <div key={section.title} className="mb-4">
          <div className="df-label mb-1.5">{section.title}</div>
          <div className="flex flex-col gap-0.5">
            {section.entries.map((entry) => {
              const href = entry.slug === "getting-started" ? "/docs" : `/docs/${entry.slug}`;
              const active = pathname === href || pathname === `/docs/${entry.slug}`;
              return (
                <Link
                  key={entry.slug}
                  href={href}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    active ? "bg-[rgba(59,130,246,0.12)] text-accent" : "text-body hover:text-title"
                  }`}
                >
                  {entry.title}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}

// Docs navigation registry. Content lives in /docs-content as markdown.

export interface DocEntry {
  slug: string;
  title: string;
  file: string;
}

export interface DocSection {
  title: string;
  entries: DocEntry[];
}

export const DOC_SECTIONS: DocSection[] = [
  {
    title: "Start Here",
    entries: [{ slug: "getting-started", title: "Getting Started", file: "getting-started.md" }],
  },
  {
    title: "Campaigns",
    entries: [
      { slug: "campaigns", title: "Campaign Basics", file: "campaigns/basics.md" },
      { slug: "campaigns-direct-vs-ping", title: "Direct Post vs Ping Post", file: "campaigns/direct-vs-ping.md" },
      { slug: "campaigns-field-mapping", title: "Field Mapping", file: "campaigns/field-mapping.md" },
      { slug: "campaigns-inbound-filters", title: "Inbound Filters", file: "campaigns/inbound-filters.md" },
      { slug: "campaigns-caps", title: "Caps and Budgets", file: "campaigns/caps.md" },
      { slug: "campaigns-test-mode", title: "Test Mode", file: "campaigns/test-mode.md" },
      { slug: "campaigns-wizard", title: "Setup Wizard", file: "campaigns/wizard.md" },
      { slug: "campaigns-scheduling", title: "Scheduling Filters", file: "campaigns/scheduling.md" },
    ],
  },
  {
    title: "Partners",
    entries: [
      { slug: "buyers", title: "Buyers", file: "buyers.md" },
      { slug: "suppliers", title: "Suppliers", file: "suppliers.md" },
    ],
  },
  {
    title: "Money Truth",
    entries: [
      { slug: "reconciliation", title: "Reconciliation & Payment Truth", file: "reconciliation.md" },
      { slug: "data-sources", title: "Data Sources", file: "data-sources.md" },
      { slug: "reports", title: "Reports", file: "reports.md" },
    ],
  },
  {
    title: "Intelligence",
    entries: [
      { slug: "ai-analyst", title: "AI Analyst", file: "ai-analyst.md" },
      { slug: "automations", title: "Automations", file: "automations.md" },
      { slug: "conversion-events", title: "Conversion Events", file: "conversion-events.md" },
    ],
  },
  {
    title: "Developers",
    entries: [
      { slug: "api-reference", title: "API Reference", file: "api-reference.md" },
      { slug: "webhooks", title: "Webhooks", file: "webhooks.md" },
    ],
  },
];

export function findDoc(slug: string): DocEntry | null {
  for (const section of DOC_SECTIONS) {
    const entry = section.entries.find((e) => e.slug === slug);
    if (entry) return entry;
  }
  return null;
}

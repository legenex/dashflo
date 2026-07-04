import { eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { GlassPanel, Chip, SectionLabel } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

// Custom fields in use across campaigns plus the reusable mapping library.
export default async function FieldsPage() {
  const ctx = await requireOrg();
  const campaigns = await ctx.db.query.campaigns.findMany({
    where: eq(schema.campaigns.organizationId, ctx.organizationId),
  });

  const systemKeys = new Set(["first_name", "last_name", "phone", "email", "zip", "state"]);
  const fieldUsage = new Map<string, { label: string; type: string; campaigns: string[]; required: boolean }>();
  for (const c of campaigns) {
    for (const f of c.fieldMapping) {
      const existing = fieldUsage.get(f.key);
      if (existing) existing.campaigns.push(c.name);
      else fieldUsage.set(f.key, { label: f.label, type: f.type, campaigns: [c.name], required: f.required });
    }
  }

  const library = [
    {
      name: "MVA legal set",
      description: "incident_date, incident_state, at_fault, attorney_status, injury_type, currently_represented, description, trusted_form_url, jornaya_id",
      fields: 13,
    },
    { name: "Basic contact set", description: "first_name, last_name, phone, email", fields: 4 },
    {
      name: "Mass tort set",
      description: "Adds usage_years and diagnosis to the legal set for pharmaceutical claims",
      fields: 13,
    },
  ];

  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
      <GlassPanel className="p-5">
        <SectionLabel className="mb-3">Fields in use ({fieldUsage.size})</SectionLabel>
        <div className="space-y-1.5">
          {[...fieldUsage.entries()].map(([key, f]) => (
            <div key={key} className="flex flex-wrap items-center gap-2 rounded-lg border border-panelborder px-2.5 py-1.5">
              <code className="font-mono-money text-xs text-accent">{key}</code>
              <Chip tone="neutral">{f.type}</Chip>
              {f.required && <Chip tone="warning">required</Chip>}
              {!systemKeys.has(key) && <Chip tone="queued">custom</Chip>}
              <span className="ml-auto text-[10px] text-label">{f.campaigns.length} campaign{f.campaigns.length === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-label">Add or edit fields per campaign in the campaign wizard, step 2.</p>
      </GlassPanel>

      <GlassPanel className="p-5">
        <SectionLabel className="mb-3">Field Mapping Library</SectionLabel>
        <div className="space-y-2">
          {library.map((set) => (
            <div key={set.name} className="rounded-lg border border-panelborder p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-title">{set.name}</span>
                <Chip tone="info">{set.fields} fields</Chip>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-label">{set.description}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-label">
          Apply a library set from the campaign wizard. The MVA legal set includes TrustedForm and Jornaya compliance fields.
        </p>
      </GlassPanel>
    </div>
  );
}

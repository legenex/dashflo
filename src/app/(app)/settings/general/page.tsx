import { requireOrg } from "@/server/org";
import { GeneralForm } from "./GeneralForm";

export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  const ctx = await requireOrg();
  return (
    <GeneralForm
      org={{
        name: ctx.organization.name,
        slug: ctx.organization.slug,
        timezone: ctx.organization.timezone,
        currency: ctx.organization.currency,
        varianceThresholdPct: ctx.organization.varianceThresholdPct,
        varianceThresholdCents: ctx.organization.varianceThresholdCents,
      }}
    />
  );
}

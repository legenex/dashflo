import { eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { PROVIDER_DEFAULTS } from "@/ai/providers";
import { AiModelsClient } from "./AiModelsClient";

export const dynamic = "force-dynamic";

export default async function AiModelsPage() {
  const ctx = await requireOrg();
  const rows = await ctx.db.query.aiProviders.findMany({
    where: eq(schema.aiProviders.organizationId, ctx.organizationId),
  });

  const providers = (Object.keys(PROVIDER_DEFAULTS) as Array<keyof typeof PROVIDER_DEFAULTS>).map((key) => {
    const saved = rows.find((r) => r.provider === key);
    const def = PROVIDER_DEFAULTS[key];
    return {
      provider: key,
      label: def.label,
      defaultModel: def.model,
      consoleUrl: def.consoleUrl,
      consoleName: def.consoleName,
      model: saved?.model ?? def.model,
      hasKey: Boolean(saved?.apiKey),
      keyPreview: saved?.apiKey ? `${saved.apiKey.slice(0, 7)}...${saved.apiKey.slice(-4)}` : null,
      status: saved?.status ?? "disconnected",
      active: saved?.active ?? false,
      note: saved?.note ?? null,
      lastTestedAt: saved?.lastTestedAt?.toISOString() ?? null,
    };
  });

  return <AiModelsClient providers={providers} envFallback={Boolean(process.env.ANTHROPIC_API_KEY)} />;
}

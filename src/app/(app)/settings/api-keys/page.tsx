import { eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { ApiKeysClient } from "./ApiKeysClient";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const ctx = await requireOrg();
  const keys = await ctx.db.query.apiKeys.findMany({
    where: eq(schema.apiKeys.organizationId, ctx.organizationId),
  });
  return (
    <ApiKeysClient
      keys={keys.map((k) => ({
        id: k.id, name: k.name, keyPrefix: k.keyPrefix, scopes: k.scopes,
        status: k.status, lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
      }))}
    />
  );
}

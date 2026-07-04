import { and, desc, eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { ChatClient } from "./ChatClient";

export const dynamic = "force-dynamic";

export default async function AiChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requireOrg();
  const threads = await ctx.db
    .select()
    .from(schema.aiChatThreads)
    .where(and(eq(schema.aiChatThreads.organizationId, ctx.organizationId), eq(schema.aiChatThreads.userId, ctx.userId)))
    .orderBy(desc(schema.aiChatThreads.updatedAt))
    .limit(30);

  return (
    <ChatClient
      threads={threads.map((t) => ({
        id: t.id,
        title: t.title,
        messages: t.messages,
        updatedAt: t.updatedAt.toISOString(),
      }))}
      initialQuestion={params.q ?? null}
      aiConfigured={Boolean(process.env.ANTHROPIC_API_KEY)}
    />
  );
}

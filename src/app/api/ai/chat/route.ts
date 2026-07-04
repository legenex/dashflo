import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { getOrgContext } from "@/server/org";
import { askAnalyst } from "@/ai/analyst";
import { newId } from "@/lib/id";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  question: z.string().min(1).max(4000),
  threadId: z.string().optional(),
});

// POST: ask the analyst. The answer streams as SSE events:
//   {type:"chunk", text}  {type:"charts", charts}  {type:"done", threadId, mode}
export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await getOrgContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: { code: "validation_failed", message: "question required" } }, { status: 422 });
  }
  const { question, threadId } = parsed.data;
  const db = await getDb();

  let thread = threadId
    ? await db.query.aiChatThreads.findFirst({
        where: and(
          eq(schema.aiChatThreads.id, threadId),
          eq(schema.aiChatThreads.organizationId, ctx.organizationId),
          eq(schema.aiChatThreads.userId, ctx.userId)
        ),
      })
    : null;

  if (!thread) {
    const id = newId("thr");
    await db.insert(schema.aiChatThreads).values({
      id,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      title: question.slice(0, 60),
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    thread = await db.query.aiChatThreads.findFirst({ where: eq(schema.aiChatThreads.id, id) });
  }
  if (!thread) return new Response("thread error", { status: 500 });
  const threadRef = thread;

  const history = threadRef.messages.map((m) => ({ role: m.role, content: m.content }));
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        const answer = await askAnalyst({
          organizationId: ctx.organizationId,
          question,
          history,
        });

        // Stream the text in word chunks for a live feel in both modes.
        const words = answer.text.split(/(\s+)/);
        let buffer = "";
        for (const word of words) {
          buffer += word;
          if (buffer.length > 24) {
            send({ type: "chunk", text: buffer });
            buffer = "";
            await new Promise((r) => setTimeout(r, 12));
          }
        }
        if (buffer) send({ type: "chunk", text: buffer });
        if (answer.charts.length > 0) send({ type: "charts", charts: answer.charts });

        const now = new Date().toISOString();
        const messages = [
          ...threadRef.messages,
          { role: "user" as const, content: question, at: now },
          {
            role: "assistant" as const,
            content: answer.text,
            mode: answer.mode,
            charts: answer.charts,
            at: now,
          },
        ];
        await db
          .update(schema.aiChatThreads)
          .set({ messages, updatedAt: new Date() })
          .where(eq(schema.aiChatThreads.id, threadRef.id));

        send({ type: "done", threadId: threadRef.id, mode: answer.mode });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "analyst failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}

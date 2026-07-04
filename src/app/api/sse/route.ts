import type { NextRequest } from "next/server";
import { getBus, recentEvents, type LiveEvent } from "@/lib/sse";
import { getOrgContext } from "@/server/org";

export const dynamic = "force-dynamic";

// Live event stream for the activity ticker and page refreshes.
export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await getOrgContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });
  const organizationId = ctx.organizationId;

  const encoder = new TextEncoder();
  const bus = getBus();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: LiveEvent) => {
        if (event.organizationId !== organizationId) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          bus.off("live", send);
        }
      };
      for (const event of recentEvents(organizationId, 20)) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      bus.on("live", send);
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          clearInterval(keepalive);
          bus.off("live", send);
        }
      }, 20000);
      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        bus.off("live", send);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { ingestLead } from "@/server/ingest";
import { apiError, rateLimit } from "@/server/api-utils";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ campaignSlug: string }> }
): Promise<NextResponse> {
  const { campaignSlug } = await params;
  const apiKey = req.headers.get("x-api-key") ?? "";
  if (!apiKey) {
    return apiError("missing_api_key", "Provide the supplier key in X-API-Key", 401);
  }
  if (!rateLimit(`ingest:${apiKey}`, 300)) {
    return apiError("rate_limited", "Too many requests", 429);
  }

  let body: Record<string, unknown>;
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("json")) {
      body = (await req.json()) as Record<string, unknown>;
    } else {
      const form = await req.formData();
      body = Object.fromEntries(form.entries());
    }
  } catch {
    return apiError("invalid_body", "Body must be JSON or form encoded", 400);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const result = await ingestLead({ campaignSlug, apiKey, body, ip });
  return NextResponse.json(result.body, { status: result.code });
}

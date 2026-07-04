import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { evaluateFilters } from "@/domain/routing/rules";
import { renderTemplate } from "@/domain/routing/template";
import { emitLive } from "@/lib/sse";
import type { AutomationTrigger } from "@/db/schema";

// Automation trigger runner. Fire-and-forget from callers; every run is
// persisted to automation_runs with results per action.

export async function fireAutomations(
  organizationId: string,
  trigger: AutomationTrigger,
  payload: Record<string, unknown>
): Promise<void> {
  const db = await getDb();
  const automations = await db.query.automations.findMany({
    where: and(
      eq(schema.automations.organizationId, organizationId),
      eq(schema.automations.trigger, trigger),
      eq(schema.automations.status, "enabled")
    ),
  });

  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, organizationId),
  });

  for (const automation of automations) {
    const started = Date.now();
    const conditions = automation.conditions ?? null;
    const conditionResult = evaluateFilters(conditions, payload, {
      now: new Date(),
      timezone: org?.timezone ?? "America/New_York",
    });

    if (!conditionResult.pass) {
      await db.insert(schema.automationRuns).values({
        id: newId("run"),
        organizationId,
        automationId: automation.id,
        triggerPayload: payload,
        results: [{ skipped: true, reason: "conditions not met" }],
        status: "skipped",
        durationMs: Date.now() - started,
        at: new Date(),
      });
      continue;
    }

    const results: Array<Record<string, unknown>> = [];
    let anyFail = false;

    for (const action of automation.actions) {
      try {
        switch (action.kind) {
          case "slack": {
            const text = renderTemplate(String(action.config.message ?? "DashFlo automation fired"), payload);
            const webhookUrl = String(action.config.webhook_url ?? process.env.SLACK_WEBHOOK_URL ?? "");
            if (webhookUrl) {
              const res = await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
                signal: AbortSignal.timeout(6000),
              });
              results.push({ kind: "slack", delivered: res.ok, status: res.status });
            } else {
              console.log(`[automation:slack] ${automation.name}: ${text}`);
              results.push({ kind: "slack", delivered: false, logged: true, text });
            }
            break;
          }
          case "email": {
            const subject = renderTemplate(String(action.config.subject ?? "DashFlo alert"), payload);
            const body = renderTemplate(String(action.config.body ?? ""), payload);
            console.log(`[automation:email] to=${String(action.config.to ?? "owner")} subject=${subject}`);
            // Email stub: log plus notification for every org member.
            const members = await db.query.memberships.findMany({
              where: eq(schema.memberships.organizationId, organizationId),
            });
            for (const m of members) {
              await db.insert(schema.notifications).values({
                id: newId("ntf"),
                organizationId,
                userId: m.userId,
                kind: "automation_email",
                title: subject,
                body: body.slice(0, 500),
                link: String(action.config.link ?? "") || null,
                at: new Date(),
              });
            }
            results.push({ kind: "email", logged: true, subject, notified: members.length });
            break;
          }
          case "webhook": {
            const url = String(action.config.url ?? "");
            const body = renderTemplate(String(action.config.body ?? "{}"), payload);
            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
              signal: AbortSignal.timeout(8000),
            });
            results.push({ kind: "webhook", status: res.status, ok: res.ok });
            break;
          }
          case "pause_buyer": {
            const buyerId = String(action.config.buyer_id ?? payload.buyer_id ?? "");
            if (buyerId) {
              await db
                .update(schema.buyers)
                .set({ status: "paused" })
                .where(and(eq(schema.buyers.id, buyerId), eq(schema.buyers.organizationId, organizationId)));
              results.push({ kind: "pause_buyer", buyerId, paused: true });
            }
            break;
          }
          case "pause_campaign": {
            const campaignId = String(action.config.campaign_id ?? payload.campaign_id ?? "");
            if (campaignId) {
              await db
                .update(schema.campaigns)
                .set({ status: "paused" })
                .where(
                  and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.organizationId, organizationId))
                );
              results.push({ kind: "pause_campaign", campaignId, paused: true });
            }
            break;
          }
          case "update_lead_field": {
            const leadId = String(payload.lead_id ?? "");
            const field = String(action.config.field ?? "");
            const value = action.config.value;
            if (leadId && field) {
              const lead = await db.query.leads.findFirst({
                where: and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, organizationId)),
              });
              if (lead) {
                await db
                  .update(schema.leads)
                  .set({ fieldData: { ...lead.fieldData, [field]: value } })
                  .where(eq(schema.leads.id, leadId));
                results.push({ kind: "update_lead_field", leadId, field });
              }
            }
            break;
          }
          case "create_action_item": {
            await db.insert(schema.actionItems).values({
              id: newId("act"),
              organizationId,
              issueType: "review",
              entityType: String(payload.entity_type ?? "automation"),
              entityId: String(payload.entity_id ?? automation.id),
              entityName: String(payload.entity_name ?? automation.name),
              priority: "medium",
              amountAtRiskCents: typeof payload.amount_cents === "number" ? payload.amount_cents : null,
              description: renderTemplate(
                String(action.config.description ?? `Automation ${automation.name} flagged this for review`),
                payload
              ),
              source: "manual",
              status: "open",
              createdAt: new Date(),
            });
            results.push({ kind: "create_action_item", created: true });
            break;
          }
        }
      } catch (err) {
        anyFail = true;
        results.push({ kind: action.kind, error: err instanceof Error ? err.message : "failed" });
      }
    }

    await db.insert(schema.automationRuns).values({
      id: newId("run"),
      organizationId,
      automationId: automation.id,
      triggerPayload: payload,
      results,
      status: anyFail ? (results.some((r) => !r.error) ? "partial" : "failed") : "success",
      durationMs: Date.now() - started,
      at: new Date(),
    });
    await db
      .update(schema.automations)
      .set({ lastRunAt: new Date() })
      .where(eq(schema.automations.id, automation.id));

    emitLive({
      organizationId,
      kind: "notification",
      title: `Automation ran: ${automation.name}`,
      detail: trigger,
    });
  }
}

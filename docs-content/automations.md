# Automations

When something happens, do something, with the receipts logged.

## Triggers

`lead_sold`, `lead_rejected`, `lead_error`, `lead_unmatched`, `buyer_cap_hit`, `supplier_error_spike`, `payment_received`, `invoice_overdue`, `variance_flagged`, `short_paid`, `action_item_created`, `insight_created`, `daily_summary`.

## Conditions

Optional rules over the trigger payload using the same rule engine as campaign filters. Example: only fire when `price_cents gt 10000`.

## Actions

- **Slack**: posts to your incoming webhook, falls back to console logging when none is configured. Message templates render `{{tokens}}` from the payload.
- **Email**: a stub that logs to the console and drops a notification in the bell for every member (swap in a real provider later).
- **Webhook**: POST a templated JSON body anywhere.
- **Update lead field**, **pause buyer**, **pause campaign**, **create action item**.

## The four seeded defaults

1. Slack on variance or short pay (`variance_flagged`).
2. Slack when a buyer hits a daily cap (`buyer_cap_hit`).
3. Email at 7 days invoice overdue (`invoice_overdue`).
4. A 7am daily summary with booked vs verified (`daily_summary`).

## Run log

Every execution records the trigger payload, per-action results, duration, and status (success, partial, failed, or skipped when conditions did not match). The Test button fires a realistic synthetic payload so you can verify wiring without waiting for a real event.

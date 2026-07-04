# DashFlo Final Report

Built in one shot: a multi-tenant lead distribution and revenue-truth platform where every performance number carries its verified-cash twin, and the gap between them drives insights and actions. All ten Definition of Done items pass on a clean `pnpm setup && pnpm dev` boot with zero external dependencies (no Docker, no API keys required).

## What was built

### Domain engines (pure, framework-free, unit-tested)
- **Routing** (`src/domain/routing`): field validation with US-default transforms (E.164, date, state), phone/email dedupe windows, AND/OR filter groups with timezone-aware schedules, atomic cap check-and-reserve (race-tested), priority/weighted/round-robin ordering, direct post (first accept wins) and ping post (parallel bids, highest wins, fallthrough on post rejection), token templates, JSONPath/regex success matchers, price extraction.
- **Matching** (`src/domain/matching`): four confidence tiers (external ref 100, amount+date 85 decaying to 76 with date distance, rule regex 75, fuzzy 55), auto-apply at 75+, payment allocation across sold leads oldest first with partial states, weekly and monthly reconciliation period builder with max(2%, $250) variance flagging and plain-language narratives.
- **Truth** (`src/domain/truth`): `computeTruth` produces four layers (performance, booked, verified, gap) per campaign/buyer/supplier/day/state/org row. Missing sources force null (UNKNOWN), never zero, per row and per field. Per-entity payment-source detection at buyer/supplier scope.
- **Decisions** (`src/domain/decisions`): profit truth classifier (Cash-Verified, Booked, Estimated, At-Risk, Unknown, False Profit) and campaign decisions (Scale/Cut/Review/Needs Source/Watch), thresholds in one commented config file.
- **Insights** (`src/domain/insights`): sold-rate anomalies (2 sigma vs trailing baseline), duplicate spikes per supplier, cap-constrained revenue with estimated dollar loss, zero-sold spend, CPL divergence, false profit, short pays, overdue receivables, buyer accept-rate degradation. Dedupe-keyed so re-runs never spam.

### Platform
- Next.js 15 App Router, strict TypeScript (zero errors), Tailwind 4 token layer, Auth.js v5 credentials + JWT, Drizzle with a Postgres/PGlite driver abstraction (login footer shows the active mode), in-memory SSE bus with a live topbar ticker that also refreshes pages on money events.
- Every data view is the custom TruthGrid (TanStack Table + Virtual headless, zero table elements app-wide) or a purpose-built component: StatPair, Chip, Sparkline, Ticker, ConfidenceMeter, AgingBar, money-aware Timeline, themed Recharts, custom heatmaps.
- Full app surface: Overview command center, Leads with 5-tab drawers, Campaigns (grid, detail with drag-priority routing and live test firing, 6-step wizard with the MVA legal set and CO suppression template), Buyers (collection truth, payload tester, inline match suggestions), Suppliers (payables mirror, per-campaign cURL built from live field mappings, key rotation), Deliveries with latency percentiles, Meta CAPI with SHA-256 hashing and mock mode, the 8-tab Reconciliation workbench, P&L with four-layer periods and CSV export, Ad Performance with spend-to-cash funnel and one-click Kill, Custom report builder, AI-written scheduled briefs, AI chat (Claude claude-sonnet-4-6 with a 7-tool layer, or a deterministic local intent router with the same tools), Insights + Action Queue, Automations with run logs, 9 Settings pages including the connector hub with live truth gating, Master Admin with impersonation and audit trail, and a 19-page public docs site whose API reference cURLs run as written.
- Public API `/api/v1` with hashed Bearer keys, scopes, rate limiting, cursor pagination, the four-layer `/truth` endpoint, and HMAC-signed org webhooks with retry logs.
- Mock buyer server (3 endpoints, realistic latency) auto-starts with dev so routing works offline end to end.

## Test results

- `pnpm test`: 74/74 unit tests green (routing 32, matching 21, truth 12, decisions 19 across 4 suites).
- `pnpm typecheck`: zero errors, strict mode.
- `pnpm smoke` (headless Chrome via playwright-core): 13/13 checks, including login, hydrated virtualized grids, drawer tabs, and the DoD states below.
- Manual DoD walk (all via the running app):
  1. Clean boot on PGlite, seeded logins work, DemoAgency sees zero Legenex data.
  2. The docs cURL sold a lead to AG1 Walker through the mock buyer with a 10-event money-aware timeline and full request/response attempt log. A ping-post ingest sold to AG2 at the winning $110 bid; a Colorado lead rejected with the CO suppression rule recorded.
  3. Overview: booked $28,435 vs verified $14,020 with the gap visible on the chart, action queue totaling $30,900 at risk, buyer risk led by AG1, mixed connector states.
  4. AG1 Walker: exactly $4,200 overdue and $1,450 short-paid with matching action items. AG2 Quintessa: Verified Paid, Cash-Verified. Overflow Network: No Payment Source, At-Risk.
  5. Depo-Provera: False Profit, decision Cut ($4,519 reported profit, $0 of $7,500 verified, cash -$2,595).
  6. Applying the 82-confidence $4,200 wire: AG1 verified 247,000 to 667,000 cents, overdue to $0, invoice paid, the payment_overdue action item auto-resolved with a note, SSE-driven refresh (no manual reload).
  7. Toggling Stripe+Mercury off flipped every buyer to UNKNOWN / Needs Source / no_payment_source; toggling back restored exact figures.
  8. AI (local mode, no key): "Am I owed money" answered with exact per-buyer figures including AG1's $1,450 short-pay, plus an inline bar chart; "Which campaigns show false profit" named Depo-Provera with the numbers.
  9. AAT-V3 Static Retarget: $335 spend, zero sold, red glow, Kill created the action item and the suggested (disabled) automation. CAPI log shows 64-hex SHA-256 hashes for email/phone/name/state/zip on sold seed leads.
  10. Automation log shows seed-time runs (variance Slack, overdue emails, daily summary). Payload tester round-tripped against the mock buyer. /admin lists both orgs; impersonation set the red banner and wrote start/end audit entries. Zero `<table>` elements and zero em dashes across src, docs, seeds, and scripts.

The database was re-seeded after verification, so first boot presents the pristine demo story.

## Demo script

See README.md, "The demo script" (9 steps, mirrors the DoD).

## Judgment calls

1. **PGlite as the default runtime.** Docker is unavailable in this environment, so the driver abstraction defaults to embedded PGlite at `./.data/pglite` and upgrades to Postgres automatically when `DATABASE_URL` is set (or when `pnpm setup` finds Docker). One caveat: PGlite is single-process, so `pnpm insights` cannot run while dev holds the lock; the Insights page has a Run generator button that executes in-process instead.
2. **The 82-confidence suggestion.** The spec's tiers (100/85/75/55) cannot produce 82, so tier-2 confidence decays one point per day of payment-to-due-date distance beyond two days (floor 76). The seeded AG1 wire lands 5 days before the invoice due date: exactly 82. It sits in the queue because the seed does not run auto-match at the end; any Sync Now would legitimately auto-apply it, which is correct product behavior.
3. **At-Risk vs False Profit ordering.** Zero-verified revenue classifies as False Profit only when it is past the payment terms window (Depo-Provera), otherwise At-Risk. Additionally, a buyer with no payment evidence at all (Overflow) downgrades False Profit to At-Risk plus a No Payment Source chip, because claiming false profit implies a certainty the data cannot support.
4. **Short-paid semantics.** A period counts as short-paid only when the counterparty paid something (paid > 0); fully unpaid balances surface through overdue instead. This keeps AG1's two problems ($4,200 unpaid month, $1,450 light payment) from double-counting, and org totals aggregate flagged short pays across counterparties.
5. **Payments bucket to the period they cover** (matched entity period or invoice period), not their bank date, so a July remittance for the June invoice reconciles June.
6. **Verified income attribution is per-lead** (`paid_allocated_cents`), which lets campaign, buyer, day, and state scopes all report verified income consistently from one source of truth.
7. **Seed dates are relative to seed time** with calendar-month periods, so the story (month A unpaid, month B short-paid) is exact when seeded early in a month and stays coherent later; overall verified share lands near 50% of booked rather than the spec's ~60%, a trade made to keep AG1's exact $4,200/$1,450 figures and every truth state simultaneously true.
8. **Streaming**: both AI modes stream token-by-token to the client over SSE; Claude mode runs a non-streaming tool loop internally, then streams the final answer, keeping one code path for charts and persistence.
9. **App mutations** go through one Zod-validated action dispatcher (`/api/app/actions`) with per-action role gates and audit logging, instead of 40 route files; reads for drawers go through one query endpoint. Public integration surface remains conventional REST under `/api/v1`.
10. **Email and Slack are honest stubs**: without config they log to the console and the notification bell, and every automation run records what actually happened.

## Known limits (deliberate scope edges)

- CSV import wizards parse simple comma-separated files (no quoted-comma handling).
- Playwright smoke uses the local Chrome install via playwright-core (`pnpm smoke`), kept out of `pnpm test`.
- Per-state true CPL needs state-tagged ad campaigns; the AI says so rather than inventing an allocation.
- The seed's exact overdue/short-pay figures assume the demo runs reasonably soon after seeding (due-date math is relative to real time). Re-run `pnpm db:seed` any time to reset the story.

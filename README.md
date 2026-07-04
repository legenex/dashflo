# DashFlo

Lead distribution with revenue truth. Every performance number is fused with proof of payment from bank, Stripe, and accounting feeds, and an AI analyst turns the gap between booked and verified money into insights and actions.

## 60 second quickstart

```bash
pnpm install
pnpm setup    # docker postgres if available, embedded PGlite otherwise; migrates + seeds
pnpm dev      # app on http://localhost:4780, mock buyer server on :4010
```

The login page footer shows which database mode is active. No Docker, no external services, and no API keys are required for a fully working install.

## Seeded logins (password for all: `dashflo2026`)

| Login | Role |
| --- | --- |
| nick@legenex.com | Owner of Legenex, platform admin (can open /admin and impersonate) |
| finance@legenex.com | Finance |
| analyst@legenex.com | Analyst (PII masked) |
| partner.ag1@legenex.com | Partner scoped to buyer AG1 Walker |
| demo@demoagency.com | Owner of the second org, proves tenant isolation |

## Seeded API keys

| Key | Use |
| --- | --- |
| `df_live_legenex_demo_9c31b7e2a8` | Org key for /api/v1 (Bearer) |
| `df_sup_leadflow_demo_4f8a2c91d7` | LeadFlow supplier key for /api/ingest |
| `df_sup_internalmeta_demo_1b7d9e3f52` | Internal Meta supplier key |

## The demo script

1. **Log in** as nick@legenex.com. The Overview shows booked vs verified StatPairs with real gaps, the revenue chart's green verified line diverging from booked bars, an Action Queue with dollar amounts, Buyer Payment Risk led by AG1 Walker, and a Data Confidence panel with mixed connector states.
2. **Buyers**: AG1 Walker is $4,200 overdue and short-paid $1,450 for last month, with matching action items. AG2 Quintessa is fully paid and Cash-Verified. Overflow Network shows No Payment Source and At-Risk profit.
3. **Campaigns**: Mass Tort Depo-Provera shows False Profit with a Cut decision, booked revenue and paid spend but zero verified income.
4. **Ingest a lead live**: run the cURL from Docs, API Reference (or a campaign's Ingest tab). It routes through the mock buyers, appears in Leads within seconds via the live ticker, and carries a full timeline and attempt log with payloads.
5. **Reconciliation, Match Queue**: a $4,200 wire from AG1 Walker waits at 82 confidence. Apply it and watch verified figures, the Overview gap, and the overdue action item resolve without a refresh.
6. **Settings, Data Sources**: toggle Stripe inactive. Buyer payment verification flips to Needs Source on the Overview and Buyers. Toggle it back, verification restores. Missing is never zero.
7. **AI Analyst**: ask "Am I owed money right now and by whom". With or without an Anthropic key you get exact figures naming AG1's balances, with an inline chart. Ask "Which campaigns show false profit" and it names Depo-Provera.
8. **Ad Performance**: at least one ad spent with zero sold leads glows red with a one-click Kill. Conversion Events shows SHA-256 hashed CAPI payloads in mock mode.
9. **Reports**: six default report pages (Performance Overview, Daily, Buyer, Supplier, Campaign, Lead Quality) with editable metric cards (Revenue through Net Profit, lead counts, GP Margin, Conv Rate), custom formula metrics, relative-date field filters ("Accident Date within 7 days"), and State/Daily performance tables. Clone a buyer or supplier page, scope it, and publish it to their portal.
10. **Portal**: log in as partner.ag1@legenex.com and you land on the AG1 Walker portal, seeing only their published report, locked to their leads.
11. **Settings, AI Models**: connect Anthropic, ChatGPT, Grok, or Gemini with a key, Test fires a live request, Set active routes the analyst through it.
12. **Settings, Integrations**: Connect (demo mode) provisions a Meta business manager, ad accounts, pages, and 16 lead forms. Map a form to a campaign, enable it, and Test pushes a submission through the full ingest pipeline. Add Facebook app credentials and the same button becomes real browser-login OAuth.
13. **/admin** (as nick): both orgs listed, impersonation with a persistent red banner and an audit trail.

## Scripts

| Command | Does |
| --- | --- |
| `pnpm setup` | Migrate + seed (compose up first when Docker exists) |
| `pnpm dev` | Next dev server + mock buyer server |
| `pnpm test` | Vitest suites: routing, matching, truth, decisions (74 tests) |
| `pnpm insights` | Run the insight generator once (use the in-app Run button while dev holds the PGlite lock) |
| `pnpm mockbuyers` | Mock buyer server alone |
| `pnpm typecheck` | Strict TypeScript |

## Environment

Copy `.env.example` to `.env`. Everything is optional locally. Set `ANTHROPIC_API_KEY` to upgrade the AI analyst from the deterministic local mode to Claude (claude-sonnet-4-6); set `DATABASE_URL` to use your own Postgres; set `SLACK_WEBHOOK_URL` to receive automation alerts.

## Architecture

- Next.js 15 App Router, TypeScript strict, Tailwind 4 with a token layer.
- Postgres 16 via Drizzle (PGlite fallback through a driver abstraction in `src/db/client.ts`).
- Pure domain engines in `src/domain` (routing, matching, truth, decisions, insights), no framework imports, fully unit-tested.
- The truth engine computes four layers per row: performance, booked, verified, gap. Missing sources force UNKNOWN, never zero.
- The AI layer (`src/ai`) exposes tools over computed aggregates with PII masking; a deterministic intent router answers offline.

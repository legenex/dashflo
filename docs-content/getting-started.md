# Getting Started

DashFlo is a lead distribution platform with one idea at its core: a booked number is a claim, verified cash is truth, and the gap between them is where lead businesses get burned. Every screen shows both, side by side, always.

## The 60 second tour

- **Overview** is the command center. Every KPI is a pair: booked on top, verified beneath it, a gap badge under that. The revenue chart overlays verified income on booked revenue, the divergence you see there is money you have not proven yet.
- **Leads** is the operational log. Every lead carries its payment truth: booked price, verified paid amount, and a payment chip.
- **Distribution** holds campaigns, buyers, suppliers, the delivery log, and Meta conversion events.
- **Reconciliation** is the workbench. Unmatched payments arrive here, suggestions carry confidence scores, and applying a match updates every downstream number without a refresh.
- **AI Analyst** answers questions like "am I owed money right now and by whom" with real figures from the same truth engine the pages use.

## First five minutes

1. Sign in with the seeded owner account: `nick@legenex.com` / `dashflo2026`.
2. Look at the Overview. AG1 Walker owes you money ($4,200 overdue plus a $1,450 short pay), Depo-Provera shows False Profit, and Overflow Network has no payment source at all. This is intentional seed data, every truth state exists on first boot.
3. Open Reconciliation, Match Queue. A $4,200 wire from AG1 Walker sits at 82 confidence. Apply it and watch the overdue balance, the Overview gap, and the related action item resolve together.
4. Fire the [API Reference](/docs/api-reference) cURL and watch the lead route through the mock buyers live.

## Core concepts

| Concept | Meaning |
| --- | --- |
| Booked | What your operational system claims: sale prices, accrued costs, tracked spend |
| Verified | What your bank, Stripe, and accounting feeds prove actually happened |
| Gap | Booked minus verified. The number that should keep you honest |
| UNKNOWN | A money source is missing. DashFlo never shows zero for missing data |
| False Profit | Reported profit is positive while cash reality disagrees |

## Running locally

```bash
pnpm install
pnpm setup   # migrates and seeds (uses Docker postgres if available, embedded PGlite otherwise)
pnpm dev     # starts the app on :4780 and the mock buyer server on :4010
```

The seed prints every login and API key. The login page footer shows which database mode is active.

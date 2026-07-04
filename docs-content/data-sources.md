# Data Sources

Settings, Data Sources is the only place connections live. Each card shows status, last sync, coverage, and exactly what breaks when it is off.

## The gating rule

An inactive source forces UNKNOWN on every field it feeds, everywhere, including the AI analyst. Toggle Stripe off and watch buyer payment verification flip to Needs Source on the Overview and the Buyers grid in real time. Toggle it back and verification restores. This is deliberate: a dashboard that silently shows zero when the feed is down is how six-figure gaps happen.

| Source | Feeds |
| --- | --- |
| Stripe | Buyer remittances, verified income |
| Mercury | Bank feed, spend verification, supplier payouts |
| Xero | Invoices and receivables aging |
| Meta / Google / TikTok Ads | Tracked media cost per ad |
| Supplier Statements | Second signature on supplier accruals |
| Slack | Automation alerts |

## CSV import wizards

Every money and ad source accepts CSV paste with a live preview: spend files (`date, campaign_name, adset_name, ad_name, spend, impressions, clicks`) and payment files (`date, amount, direction, counterparty, memo, external_ref`). Payment imports run auto-match immediately and report how many rows matched.

## Spend mapping

Ad spend attributes to campaigns by name-pattern rules (regex on the ad campaign or adset name) with a brand label. Unmapped spend sits in a visible queue, it never silently counts as zero and never silently disappears. Apply rules from the same page.

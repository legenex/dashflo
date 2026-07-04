# Suppliers

Suppliers post leads in and get paid out. DashFlo mirrors the buyer ledger for them: accrued cost, verified payouts, and the gap.

## API access

Each supplier gets a key (`df_sup_...`) shown once and stored hashed. They post to a campaign's ingest URL with `X-API-Key`. The supplier drawer builds a copy-ready cURL from the live field mapping of every campaign they are allowed on, so onboarding a supplier is one paste.

Rotating the key invalidates the old one immediately.

## Pricing models

| Model | Cost stamping |
| --- | --- |
| fixed_cpl | Cost stamps at ingest for every non-duplicate, non-error lead |
| rev_share | Cost computes at sale time as a percentage of the sale price |
| none | No per-lead cost (internal traffic) |

## Payables truth

Accrued cost rolls up per week and month into reconciliation periods. Bank outflows matched to the supplier allocate across their leads oldest first, so every lead knows whether its cost has actually been paid. The grid shows Accrued, Paid, and Gap with chips: Paid, Accrued Not Paid, Due Soon, Overdue, Cost Gap, Missing Statement.

## Quality

Duplicate rate and error rate feed a 0 to 100 quality score. The insight engine flags duplicate spikes per supplier before you pay for junk volume.

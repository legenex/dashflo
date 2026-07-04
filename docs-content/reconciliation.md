# Reconciliation and Payment Truth

This page explains DashFlo's four layers and profit truth statuses in plain language. It is the heart of the product.

## The four layers

Every report row, every campaign, every buyer computes the same four layers:

1. **Performance**: leads, sold rate, duplicate rate, accept rate, response times. What happened operationally.
2. **Booked**: sold prices minus returns, accrued supplier cost, tracked ad spend, other costs. What your systems claim the money looks like.
3. **Verified**: income actually matched from Stripe and bank feeds, supplier payouts actually sent, ad spend actually covered by bank outflows. Cash profit is computed only from this layer.
4. **Gap**: booked minus verified, split into outstanding, due soon, overdue, short-paid, spend gap, and supplier cost gap.

Missing is never zero. If a required source is inactive, the affected fields show UNKNOWN with a Needs Source chip everywhere, including in the AI's answers and CSV exports.

## Profit truth statuses

| Status | Plain meaning |
| --- | --- |
| Cash-Verified | At least 90% of booked revenue is verified and the spend behind it is bank-verified. This profit is real |
| Booked | Nothing verified yet, nothing overdue either. Too early to celebrate |
| Estimated | Partially verified. Directionally real, not settled |
| At-Risk | Booked revenue with zero verified income. If the source never pays, this profit never existed |
| False Profit | Reported profit is positive while cash disagrees: either cash profit is negative, or less than half the booked revenue verified past the payment terms window |
| Unknown | A required money source is off. DashFlo refuses to guess |

## How matching works

Payments classify in confidence order: exact external reference to an invoice (100), amount within 1% and date within 7 days of an open invoice (85, decaying slightly with date distance), a match rule regex hit (75, this is how bank outflows map to Meta and to suppliers), and fuzzy counterparty similarity (55, suggestion only). At 75 and above the engine can auto-apply, below that suggestions wait in the Match Queue with a confidence meter.

Applying a match cascades: the invoice's paid amount and status update, the payment allocates across the counterparty's sold leads oldest first (partial coverage marks leads partial), ad platform matches flip spend rows to paid-verified, reconciliation periods rebuild, related action items auto-resolve, and every affected lead gets a `payment_matched` timeline event. The Overview updates without a refresh.

## Periods and short pays

For every buyer and supplier, weekly and monthly periods roll up expected money (sold leads minus returns, or accrued cost), invoiced amounts, and matched payments. A completed period whose variance exceeds max(2%, $250) flags, creates an action item with the shortfall in dollars and approximate lead count, and can notify Slack. Thresholds are configurable in Settings, General.

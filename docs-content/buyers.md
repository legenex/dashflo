# Buyers

A buyer is a demand endpoint plus a collection relationship. DashFlo treats both as first class: the delivery config decides whether they get leads, the payment truth decides whether they deserve them.

## Delivery config

- **URL, headers, auth** (none, basic, bearer, or a custom header), and content type (JSON or form).
- **Templates**: `body_template` for direct post, `ping_template` and `post_template` for ping post. Templates render `{{tokens}}` from the field mapping plus `lead_id`, `campaign`, `supplier`, `timestamp`.
- **Success matcher** decides acceptance: a JSONPath check (`status equals accepted`) or a regex over the raw body.
- **Price path** optionally extracts the sale price or bid from the response (dollars, dotted path like `bid.amount`).
- **Timeout, retries, backoff** control transport behavior. Every call, success or not, lands in the Deliveries log with full payloads.

The **Payload Tester** in the buyer drawer fires a real request at the endpoint with sample data and shows request and response side by side. The seeded buyers point at the bundled mock buyer server so this works offline.

## Collection truth

The buyer grid is a receivables ledger: booked, verified paid, outstanding, due soon, overdue, short-paid, and a risk score from 0 to 100. Payment chips:

| Chip | Meaning |
| --- | --- |
| Verified Paid | Payments cover essentially all booked revenue |
| Partially Paid | Some verified income, more outstanding |
| Due Soon | Unpaid balance due within 7 days |
| Overdue | Unpaid balance past terms |
| Short Paid | A completed period was paid light and flagged |
| No Payment Source | Zero payment evidence covers this buyer, their booked profit is At-Risk |
| Needs Matching | Unmatched payments likely belong here |

## Returns

A returned lead claws back its booked revenue, appears in the buyer's Returns tab, and adjusts the reconciliation period it belonged to.

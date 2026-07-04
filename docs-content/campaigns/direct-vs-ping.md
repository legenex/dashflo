# Direct Post vs Ping Post

## Direct post

The engine orders eligible buyers by the campaign's distribution method and delivers sequentially. The first buyer whose endpoint accepts wins the lead at their configured price (or the price extracted from their response). Every call is logged as a distribution attempt with the full request and response.

Use it when prices are fixed per buyer and speed matters.

## Ping post

The engine sends a partial payload (no contact details) to every eligible buyer in parallel. Buyers respond with bids. The highest bid wins, ties break by priority. The winner then receives the full payload as a post. If the winner rejects the post, the engine falls through to the next bidder. If everyone rejects, the lead is `unsold`.

Use it when buyers compete on price per lead.

## What the buyer sees

- **Ping** renders the buyer's `ping_template` with non-PII tokens: state, injury type, incident date, lead id.
- **Post** renders `post_template` (or `body_template`) with everything: name, phone, email, plus `lead_id`, `campaign`, `supplier`, `timestamp`.

## Outcome semantics

| Outcome | Meaning |
| --- | --- |
| sold | A buyer accepted, revenue booked, payment due date stamped |
| unsold | Eligible buyers existed, all rejected |
| unmatched | No buyer was eligible (filters, schedules, or caps) |

Unmatched leads matter: the insight engine watches for clusters of unmatched leads on days a buyer cap was exhausted and estimates the revenue you left on the table.

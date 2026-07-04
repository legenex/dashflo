# Caps and Budgets

Buyers carry caps in two dimensions and four windows each:

| Dimension | Windows |
| --- | --- |
| Leads | daily, weekly, monthly, total |
| Budget (dollars) | daily, weekly, monthly, total |

Campaign attachments can override caps per campaign.

## How enforcement works

Cap checks are atomic check-and-reserve. When several leads race for the last slot under a daily cap, exactly one wins the reservation, the rest see the buyer as capped and fall through to the next buyer. Reservations release when a delivery attempt settles.

A lead that finds every buyer capped lands as `unmatched` with the blocking cap recorded (for example `leads.daily`). The buyer cap hit also fires the `buyer_cap_hit` automation trigger, the seeded Slack alert uses it.

## Why unmatched leads matter financially

The insight generator watches for unmatched clusters on cap-exhausted days and estimates lost revenue at the average sold price. If you see the "leads went unmatched while buyer caps were exhausted" insight, raising a cap or adding an overflow buyer is usually free money.

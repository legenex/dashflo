# Campaign Basics

A campaign is a lead product: a vertical, a field schema, a set of inbound rules, and an ordered list of buyers. Suppliers post into a campaign's ingest URL, the routing engine validates, dedupes, filters, and delivers, and the truth engine tracks what the sale was worth against what actually got paid.

## Anatomy

- **Slug** becomes the ingest URL: `POST /api/ingest/{slug}`.
- **Vertical** labels the campaign (mva, mass_tort, workers_comp, home_services, insurance, solar, other).
- **Type** is `direct_post` or `ping_post`, see [Direct Post vs Ping Post](/docs/campaigns-direct-vs-ping).
- **Distribution method** orders buyers: priority, weighted random, or round robin.
- **Dedupe window** rejects repeat phone or email inside N days as `duplicate`. Duplicates are never routed and never accrue supplier cost.
- **Payment terms** stamp a due date on every sale. Terms come from the buyer, the campaign default applies when a buyer has none.

## Statuses

| Status | Behavior |
| --- | --- |
| draft | Only accepts test leads |
| active | Full routing |
| paused | Ingest returns 409 |
| archived | Hidden from routing entirely |

## The decision chip

Every campaign row carries a decision computed from cash truth, not booked claims: **Scale** (verified strong economics), **Cut** (cash negative or money not arriving), **Review** (books look good, verification weak), **Needs Source** (a money feed is missing), or **Watch**. Thresholds live in one config file, `src/domain/decisions/config.ts`.

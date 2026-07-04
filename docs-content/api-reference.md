# API Reference

The public API lives under `/api/v1` and authenticates with org API keys as a Bearer token. Keys are created in Settings, API Keys, shown once, stored hashed, and scoped. Requests are rate limited per key. Errors always use the envelope:

```json
{ "error": { "code": "validation_failed", "message": "...", "details": {} } }
```

The seeded demo key works out of the box against your local instance:

```
Authorization: Bearer df_live_legenex_demo_9c31b7e2a8
```

## Ingest a lead (supplier keys)

**POST** `/api/ingest/{campaign_slug}`

Suppliers post leads with their own key in `X-API-Key`. Accepts JSON or form encoding. The full pipeline runs synchronously: validation, dedupe, filters, caps, and live delivery. This cURL routes a real lead through the mock buyers on a seeded install:

```bash
curl -X POST http://localhost:4780/api/ingest/mva-direct \
  -H "Content-Type: application/json" \
  -H "X-API-Key: df_sup_leadflow_demo_4f8a2c91d7" \
  -d '{
    "first_name": "Jordan",
    "last_name": "Rivera",
    "phone": "(512) 555-0135",
    "email": "jordan.rivera@example.com",
    "incident_date": "06/12/2026",
    "incident_state": "TX",
    "at_fault": "no",
    "attorney_status": "none",
    "injury_type": "whiplash",
    "currently_represented": "no",
    "description": "Rear-ended at a stoplight",
    "zip": "78701"
  }'
```

Response:

```json
{ "lead_id": "ld_...", "status": "sold", "buyer": "AG1 Walker", "price_cents": 9500 }
```

| Field | Notes |
| --- | --- |
| `lead_id` | Poll `/api/v1/leads/{id}` for the full timeline |
| `status` | `sold`, `unsold`, `unmatched`, `rejected`, `duplicate`, or `error` |
| `errors` | Present on 422 validation failures, per field |

## Leads

**GET** `/api/v1/leads`

| Parameter | Type | Notes |
| --- | --- | --- |
| `status` | string | `sold`, `rejected`, `duplicate`, ... |
| `campaign` | string | campaign slug |
| `buyer` | string | buyer id |
| `supplier` | string | supplier id |
| `from` / `to` | date | YYYY-MM-DD received window |
| `cursor` | string | value of `next_cursor` from the prior page |
| `limit` | number | max 100 |

```bash
curl "http://localhost:4780/api/v1/leads?status=sold&limit=5" \
  -H "Authorization: Bearer df_live_legenex_demo_9c31b7e2a8"
```

**GET** `/api/v1/leads/{id}` returns the lead with its full event timeline and delivery attempts.

**POST** `/api/v1/leads/{id}/return` marks a sold lead returned and claws back the booked revenue.

```bash
curl -X POST "http://localhost:4780/api/v1/leads/LEAD_ID/return" \
  -H "Authorization: Bearer df_live_legenex_demo_9c31b7e2a8"
```

**POST** `/api/v1/ingest/{campaign_slug}` ingests with the org key instead of a supplier key. Optional `supplier_id` in the body attributes the lead, otherwise the first active supplier is used.

## Entities

**GET** `/api/v1/campaigns`, **GET** `/api/v1/buyers`, **GET** `/api/v1/suppliers`

```bash
curl "http://localhost:4780/api/v1/campaigns" \
  -H "Authorization: Bearer df_live_legenex_demo_9c31b7e2a8"
```

## Truth

**GET** `/api/v1/truth?scope=campaign&from=2026-05-01&to=2026-06-30`

DashFlo's signature endpoint: the four layers per row. `scope` is one of `campaign`, `buyer`, `supplier`, `day`, `org`, `state`. All money is integer cents. `null` means UNKNOWN because a required source is inactive, it never means zero.

```bash
curl "http://localhost:4780/api/v1/truth?scope=buyer" \
  -H "Authorization: Bearer df_live_legenex_demo_9c31b7e2a8"
```

```json
{
  "data": {
    "rows": [{
      "key": "buy_ag1",
      "name": "AG1 Walker",
      "performance": { "leads": 92, "sold": 92, "sold_rate": 1 },
      "booked": { "booked_revenue": 878500 },
      "verified": { "verified_income": 247000 },
      "gap": { "overdue": 420000, "short_paid": 145000, "payment_status": "short_paid" },
      "profit_truth": "false_profit"
    }]
  }
}
```

## Reports

**GET** `/api/v1/reports/pnl?from=2026-05-01&to=2026-06-30&group_by=campaign`

| Parameter | Type | Notes |
| --- | --- | --- |
| `from` / `to` | date | defaults to the last 30 days |
| `group_by` | string | `campaign` or `buyer` |

```bash
curl "http://localhost:4780/api/v1/reports/pnl?group_by=buyer" \
  -H "Authorization: Bearer df_live_legenex_demo_9c31b7e2a8"
```

## Reconciliation

**GET** `/api/v1/reconciliation/periods?counterparty_type=buyer&status=variance_flagged`

Returns the weekly and monthly expectation periods with expected, invoiced, paid, and variance amounts.

```bash
curl "http://localhost:4780/api/v1/reconciliation/periods?counterparty_type=buyer" \
  -H "Authorization: Bearer df_live_legenex_demo_9c31b7e2a8"
```

## Scopes

Keys carry scopes checked per endpoint: `leads:read`, `leads:write`, `campaigns:read`, `buyers:read`, `suppliers:read`, `reports:read`, `truth:read`, `reconciliation:read`, or `*` for everything. The seeded demo key has `*`.

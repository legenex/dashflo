# Webhooks

Subscribe URLs to org events and receive signed JSON.

## Events

| Event | Fires when |
| --- | --- |
| lead.sold | A non-test lead sells |
| lead.rejected | A lead fails inbound filters |
| payment.received | A payment matches (auto or manual) |
| variance.flagged | A completed period misses its expectation beyond threshold |

## Delivery

```json
{
  "event": "lead.sold",
  "data": { "lead_id": "ld_...", "campaign": "mva-direct", "buyer": "AG1 Walker", "price_cents": 9500 },
  "sent_at": "2026-07-04T12:00:00.000Z"
}
```

Headers carry `X-DashFlo-Event` and an HMAC signature:

```
X-DashFlo-Signature: sha256=<hex hmac of the raw body with your signing secret>
```

Verify by computing `HMAC-SHA256(signing_secret, raw_body)` and comparing hex digests with a constant-time comparison.

## Retries and the log

Failed deliveries retry up to 3 times with backoff. Every attempt lands in the delivery log with the response code and attempt count. The signing secret is generated at subscription time and shown once.

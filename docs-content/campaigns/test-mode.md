# Test Mode

Test leads flow through the complete pipeline (validation, dedupe, filters, caps, live delivery to buyers) but are excluded from money, truth, conversion events, and automations. They carry a test badge in the lead timeline.

## Marking a lead as test

- Send `"test": true` in the ingest payload.
- Enable test mode on the supplier (every lead they send becomes test).
- Enable test mode on the campaign.
- Use the Test tab on the campaign detail page or the wizard's final step, which fires a synthetic lead with realistic values and shows you the routing result live.

## Draft campaigns

A draft campaign rejects real traffic but accepts test leads, so you can verify the full delivery loop against your buyers (or the bundled mock buyer server) before going live.

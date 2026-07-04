# Setup Wizard

New Campaign walks six steps. Nothing goes live until the final Activate.

1. **Basics**: name, slug (the ingest URL), vertical, type, distribution method, dedupe window, payment terms.
2. **Field Mapping**: apply a library set (the MVA legal set covers legal intake including TrustedForm and Jornaya), then add or edit fields inline.
3. **Inbound Filters**: the visual AND/OR builder, the CO suppression template, the state allowlist shortcut, and per-group schedules.
4. **Attach Buyers**: pick buyers with per-campaign priority, weight, and price overrides.
5. **Attach Suppliers**: choose which suppliers may post into this campaign.
6. **Test & Activate**: save a draft, fire a synthetic test lead, watch it route through the mock buyers, then activate.

## Duplicating a campaign

Open any campaign, Settings tab, Edit in wizard. Change the name and slug on step one and activate: the wizard saves it as a new campaign when the slug does not match an existing one, which is the fastest way to clone a working setup for a new state or buyer mix.

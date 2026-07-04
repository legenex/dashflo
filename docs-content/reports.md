# Reports

## Report Pages

Reports are built from customizable pages. Six ship by default: Performance Overview, Daily Performance, Buyer
Performance, Supplier Performance, Campaign Performance, and Lead Quality. Every page can be edited, cloned,
deleted, or created from scratch, and Restore defaults brings the originals back.

### Cards

Each page opens with metric cards: Revenue, Net Revenue, Cost, CPL, Profit, and Net Profit (cash) on the money
side, and Total Leads, Sold Leads, Fake Leads, Returns, Duplicates, GP Margin, Conversions, and Conv Rate on the
volume side. In edit mode any card can be removed and any registry metric added. Custom metrics are formulas over
base metric ids, for example `net_revenue / sold_leads`, with money, number, or percent formatting. Revenue and
profit cards carry their verified twin beneath them, and any value gated by a missing money source renders as
UNKNOWN, never zero.

### Filters

Pages filter by date presets and by lead fields, including relative-date filters like "Accident Date within 7
days" against any custom field a campaign captures. Filters saved on the page become one-click toggles at the top.

### Widgets

Pages compose widgets: the State Performance table (default on buyer and supplier pages), Daily Performance table,
buyer, supplier, and campaign breakdowns, and the booked-vs-verified truth chart. Table columns are configurable
from the same metric registry, custom metrics included.

### Partner portal pages

Clone Buyer Performance or Supplier Performance, scope the clone to a specific partner, and flip the portal
toggle. When that partner's user logs in (the `partner` role, scoped to their entity), they land on /portal and
see only the pages published to them, locked to their own leads. Internal roles can preview the portal any time.

## P&L

Periods as rows, the four layers as grouped columns. Each month carries summary chips (Fully Verified, Revenue Pending, Spend Missing, Supplier Cost Unpaid, Buyer Overdue, Short Paid, Unknown Profit) and expands to campaigns, then buyers. The 6-month compare mode lines up half a year. CSV export writes UNKNOWN for gated values, never zero.

## Ad Performance

The funnel runs spend, impressions, clicks, leads, sold, booked revenue, and ends at verified income, because a funnel that stops at booked revenue is a story, not a business. Grids by platform, campaign, adset, and ad carry brand labels, ROAS, and cash-ROAS (verified income over spend). Top-decile cash-ROAS rows glow green. Rows that spent with zero sold leads glow red with a one-click Kill that creates an action item and suggests an automation. Day-of-week and hour-of-day heatmaps show volume and sales patterns.

## Custom

Pick a dimension (date, campaign, buyer, supplier, brand, platform, state) and any metrics from all four layers. Table or chart, saveable, CSV export.

## Scheduled

The AI-written briefs: a daily ops brief, a weekly review, and a monthly P&L narrative. Every brief leads with cash truth: booked vs verified vs gap, who owes what, then scale, watch, and cut calls. Render on demand from the page, works with or without an Anthropic key.

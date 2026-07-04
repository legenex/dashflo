# AI Analyst

The analyst reads the same computed truth the pages read, through a tool layer, never raw tables. PII is masked before anything reaches a model: names reduce to initials, contact fields are stripped entirely.

## Tools

| Tool | Returns |
| --- | --- |
| query_truth | The four layers by campaign, buyer, supplier, day, org, or state |
| query_leads | Aggregate counts only, never individual contacts |
| query_actions | Open action items by amount at risk |
| list_variances | Flagged short pays per counterparty and period |
| query_spend | Spend, ROAS, and cash-ROAS by platform, campaign, adset, ad, or brand |
| get_connector_status | Which sources are live and what each gap blocks |
| render_chart | Draws a small inline chart in the answer |

## Choosing a model (Settings, AI Models)

Connect Anthropic Claude, OpenAI ChatGPT, xAI Grok, or Google Gemini with an API key, test the connection live,
and set one active. Anthropic models run the full agentic tool loop; OpenAI, Grok, and Gemini answer over a
precomputed truth bundle from the same tools. These providers issue keys from their consoles rather than
browser-login OAuth for API access (Gemini's key comes from Google AI Studio against your Google account), and
each card links to the right key page. With nothing connected, a deterministic intent router answers the common
questions from the same tools, clearly labeled "Local analysis mode": owed money, false profit, kill ads,
campaign compare, buyer risk, cash margin, and the daily summary. Either way, `null` from a tool renders as
"unknown, needs source", never as zero.

## Starter prompts

- Am I owed money right now and by whom
- Which campaigns show false profit
- Which ads should I kill from the last 14 days
- Why did cash margin drop last week

## Insights

The generator runs over 1, 7, and 28 day windows (seed runs it once, `pnpm insights` or the Run generator button re-runs it): sold-rate anomalies beyond two standard deviations, CPL spikes, buyer accept-rate degradation, cap-constrained revenue with an estimated dollar loss, duplicate spikes per supplier, zero-sold spend, false profit detections, variance flags, and receivables crossing overdue thresholds. Insights dedupe by key so re-runs never spam the feed.

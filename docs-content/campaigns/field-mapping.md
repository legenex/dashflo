# Field Mapping

The field mapping defines what a valid lead looks like: keys, labels, types, required flags, and transforms. Validation failures return HTTP 422 with per-field errors and the lead lands in the error log.

## Types and normalization

| Type | Normalization |
| --- | --- |
| phone | US-default E.164: `(512) 555-0135` becomes `+15125550135` |
| email | Lowercased and format checked |
| date | Accepts `mm/dd/yyyy` and ISO, stores `YYYY-MM-DD` |
| state | Full names and codes become 2-letter: `texas` becomes `TX` |
| zip | 5 or 9 digit |
| boolean | yes/no/true/false/1/0 |
| select | Must match one of the configured options |
| number, text | Coerced and trimmed |

Transforms (`trim`, `lowercase`) run before type checks.

## The MVA legal set

The Field Mapping Library ships a prebuilt set for motor vehicle accident intake: `incident_date`, `incident_state`, `at_fault`, `attorney_status`, `injury_type`, `currently_represented`, `description`, plus `trusted_form_url` and `jornaya_id` for compliance. Apply it in the wizard with one click, then add custom fields on top.

## Tokens for delivery

Every mapped field is available as a `{{token}}` in buyer body templates, along with `{{lead_id}}`, `{{campaign}}`, `{{supplier}}`, and `{{timestamp}}`.

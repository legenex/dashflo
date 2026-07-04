# Conversion Events (Meta CAPI)

Feed sale signals back to Meta so the algorithm optimizes for leads that actually sell, not leads that merely submit.

## Event mapping

| DashFlo event | Meta event |
| --- | --- |
| Lead received | Lead |
| Lead sold | Purchase, with `value` set to the sale price |

Enable per campaign under Distribution, Conversion Events, with the pixel id and an access token.

## Hashing

User data hashes with SHA-256 per the Meta spec before anything leaves the box: email, phone (digits only), first and last name, state, and zip, all lowercased and trimmed first. The event log shows the exact hashed payload for every event.

## Mock mode

With no access token configured, events log locally with the exact payload that would have been sent, marked `mock_logged`. This makes the integration inspectable offline and in development.

## Test leads never fire

Test-mode leads are excluded from CAPI entirely, along with money and truth.

# Scheduling Filters

Filter groups and buyers both accept schedules: a set of weekdays plus an hour range, evaluated in the org's timezone.

## Filter group schedules

A scheduled group only applies while live. Outside its window the group is dormant and leads pass it untouched. Typical uses:

- Suppress low-intent overnight traffic: a group requiring `attorney_status equals none` from 9 to 17 filters harder during business hours when buyers answer their phones.
- Overnight windows work too: a start hour later than the end hour (22 to 6) wraps past midnight.

## Buyer schedules

A buyer with a schedule is simply not eligible outside their window, leads flow to the next buyer in order. Combine with caps for buyers who only take calls during intake hours.

## Timezone

All schedules evaluate in the organization timezone from Settings, General. Storage stays UTC, only the schedule check converts.

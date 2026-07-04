# Inbound Filters

Filters decide whether a valid lead is worth routing. They run after validation and dedupe, before buyer selection. A failed lead lands as `rejected` with the exact failing rule stored on it, visible in the drawer and in supplier quality stats.

## Structure

Filters are groups of rules. Rules inside a group combine with the group's logic (AND or OR), groups combine with AND across the campaign. Operators: `equals`, `not_equals`, `in`, `not_in`, `contains`, `gt`, `lt`, `gte`, `lte`, `exists`, `regex`. String comparisons are case-insensitive.

## The CO suppression template

Colorado SB26-174 restricts purchased MVA leads, so the wizard ships a one-click template:

```json
{
  "name": "CO Suppression - MVA",
  "logic": "and",
  "rules": [{ "field": "incident_state", "operator": "not_equals", "value": "CO" }]
}
```

Both seeded MVA campaigns carry it. Colorado leads reject with the rule recorded, which is your compliance audit trail.

## The state allowlist shortcut

The wizard also generates an `in` rule from a comma separated state list, useful when buyers only license specific states.

## Scheduled groups

A group can carry a schedule (days of week plus an hour range in the org timezone). The group only applies while its schedule is live. Use it for rules that should only run during intake hours, see [Scheduling Filters](/docs/campaigns-scheduling).

# Date-only Plan scheduling (#838)

## Status

Accepted implementation contract for eimir. / eimir. Planning.

**Current product-design authority:** [Product Reference v1](../../product/design/product-reference-v1.md), especially R3, governs the Mobile Web Product Reference. This decision remains binding for date-only scheduling, timezone, and API/domain semantics; its scheduling controls must be composed within anticipation-first planning.

## Product states

A Plan has exactly these scheduling states:

1. **Unscheduled:** no calendar date and no time.
2. **Date-only:** one calendar date and no time.
3. **Timed:** one timezone-aware start instant and an optional timezone-aware end instant.

A time without a date is not a product state. A date-only Plan is a calendar day, not an instant. No client, API layer, migration, reminder, sorter, or presentation may invent `00:00`, `12:00`, the current time, or another wall-clock value to represent date-only.

## Persistence

The authoritative Plan row uses two mutually exclusive start representations:

- `planned_on DATE NULL` for date-only;
- `planned_start TIMESTAMPTZ NULL` for timed schedules;
- `planned_end TIMESTAMPTZ NULL` only when `planned_start` exists.

`PLANNED` requires exactly one of `planned_on` or `planned_start`. `IDEA` requires all scheduling fields to be null. A completed Plan may retain whichever schedule representation it had as history.

The #838 migration is additive. Existing `planned_start` / `planned_end` values are never converted or backfilled into `planned_on`; existing real instants therefore retain their exact semantics. A downgrade refuses to proceed while any `planned_on` values exist because the previous schema has no lossless date-only representation.

## API and generated clients

`PlanSchedule` exposes the semantic distinction directly:

- `plannedOn` — OpenAPI `date`;
- `plannedStart` — OpenAPI `date-time`;
- `plannedEnd` — OpenAPI `date-time` and valid only with `plannedStart`.

Exactly one of `plannedOn` and `plannedStart` is accepted. `PlanCreate` and `WishToPlan` may carry an optional nested `schedule` so creation/conversion and the selected schedule commit in one transaction. The dedicated `/schedule` and `/unschedule` lifecycle operations remain authoritative for later schedule changes; normal Plan PATCH does not own lifecycle fields.

Generated mappings are intentional:

- Web: OpenAPI `date` is transported by the generator as `Date`, but product code must format/read its UTC calendar components rather than treat it as an instant.
- Android: `plannedOn` is `LocalDate`; `plannedStart`/`plannedEnd` remain `OffsetDateTime`.
- iOS: the future native client must model `plannedOn` as a date-only/calendar value, not as `Date`/`NSDate` at an invented midnight. Timed schedules remain real instants.

## Product flows

Mobile Web is the Product Reference. Create, Wish -> Plan and schedule/edit flows expose date first and time only in the context of a selected date. Saving a selected date does not require choosing a time. Clearing time preserves the date; clearing the date clears/disables time.

Android follows the same three states with native date/time pickers. Platform controls may differ, but absence of time is preserved through UI state, generated DTOs, serialization and cache restoration.

## Chronology

Date-only Plans are eligible by their calendar date. Timed Plans are eligible by their real instant. In mixed chronological presentation the calendar day is primary; date-only entries precede timed entries on the same day, timed entries retain real wall-clock ordering, and the resource ID is the stable final tie-breaker.

No sorting implementation may create an artificial instant for `planned_on`.

## Dashboard / Today

Dashboard projection keeps the distinction:

- `scheduledOn` for a calendar day;
- `scheduledAt` for a real instant.

A date-only Plan is never projected into `scheduledAt`.

## Reminders

The existing generated Plan-start reminder remains an instant-based rule and therefore applies only to Plans with `planned_start`. Date-only does not acquire an invented notification time. When a timed Plan becomes date-only, reminder reconciliation removes the obsolete generated timed reminder.

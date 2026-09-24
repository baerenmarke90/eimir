# Personal Quiet Hours: stored contract (#515)

The canonical Account timezone and optional local start/end boundaries live on
the same Account row. Both boundaries are null when off. They must be distinct,
naive, minute-precise wall times; a later end is a same-day window, and an
earlier end crosses midnight. The stored values do not encode a UTC offset.
Changes to the Account timezone therefore change the next computed window.

The half-open interval and DST choices are specified by
`engagement.quiet_hours.QuietHoursWindow` and use the same shared wall-time
resolver as Reminders. The start of an autumn overlap is its earlier
occurrence, the end its later one. A nonexistent spring boundary moves forward
by the gap. Release instants are UTC.

The eligibility contract in `engagement.quiet_hours_preferences` allows
recipient-owned Quiet Hours to defer voluntary partner gestures
(`THINKING_OF_YOU`, `PARTNER_KISS`, `PARTNER_CHECK_IN`). A due Reminder follows
its own configured schedule and is never delayed by this personal window.
`COMMENT_CREATED` remains DIGESTIBLE and Center-only, pending its explicitly
opted-in digest; it cannot become an individual Push or Email through Quiet
Hours. Existing channel choices and the stricter target, privacy, membership
and module rules always win.

This storage and eligibility slice does not expose a setting or alter jobs or
provider effects. A later delivery slice must check current Account timezone,
choice, membership, target and module again before each external effect;
reschedule on timezone changes and coalesce events accumulated overnight so
release cannot create a burst of individual notifications. A user-facing
Settings slice needs its own product-design preflight and generated visual
reference against the current screen before implementation.

The capability stays Free/Core with identical Cloud and Self-Hosted behavior.
There is no new provider or dependency. Account deletion removes the fields;
old accounts retain the off state until they explicitly opt in.

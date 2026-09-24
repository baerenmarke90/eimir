# Personal Quiet Hours: stored and Push delivery contract (#515)

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

The Push worker checks the current Account timezone, personal window, channel
choice, membership, target privacy and Space module before calling the generic
Push provider. During a window it records the UTC release boundary on the
PushDelivery and reschedules the same Job for the earlier of that boundary or
15 minutes later. A hold does not consume a provider or queue retry attempt.
Each recheck can move the release when the Account's timezone or window changes.
On release, only the newest deferred PushDelivery per recipient, Space and
endpoint reaches the provider; older deliveries end with
`QUIET_HOURS_COALESCED`. Their Notification Center entries remain intact.
This also applies when the window is turned off while delivery is waiting.

The setting is not exposed through an API or UI yet, and this Push behavior is
off by default for existing Accounts. Email delivery still follows its existing
independent channel contract. Expose Quiet Hours only after Email has matching
delivery semantics. A user-facing Settings slice needs its own product-design
preflight and generated visual reference against the current screen before
implementation.

The capability stays Free/Core with identical Cloud and Self-Hosted behavior.
There is no new provider or dependency. Account deletion removes the fields;
old accounts retain the off state until they explicitly opt in.

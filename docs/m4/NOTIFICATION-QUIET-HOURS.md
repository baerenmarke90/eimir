# Personal Quiet Hours: stored and external delivery contract (#515)

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
`COMMENT_CREATED` remains DIGESTIBLE and Center-only for existing users; an
explicitly opted-in [backend comment digest](./NOTIFICATION-COMMENT-DIGEST.md)
can wait for the same personal window. It cannot become an individual Push or
Email through Quiet Hours. Existing channel choices and the stricter target, privacy, membership
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

The separate notification Email worker applies the same eligibility, UTC
release and 15-minute recheck to its existing opted-in mail channel. It leaves
an EmailDelivery pending while Quiet Hours are active, so no SMTP claim has
been committed. The worker rechecks all current authorization, preference,
module, target, verified address and transport rules immediately before SMTP.
If the window starts between the committed claim and that final check, the
still-unsent claim returns to pending and the same Job is deferred. Only the
newest deferred mail per recipient and Space can be sent after release; older
deliveries end with `QUIET_HOURS_COALESCED` and their Center entries remain.
The existing at-most-once SMTP rule still applies once a mail is claimed: an
ambiguous transport error must never trigger a second send attempt.

The Account-owned Quiet Hours setting is exposed through the own-Account API
and Notification Settings after the whole-screen product-design preflight.
Both boundaries remain absent by default for existing Accounts. A digest
opt-in is still separate from the Quiet Hours toggle.

The capability stays Free/Core with identical Cloud and Self-Hosted behavior.
There is no new provider or dependency. Account deletion removes the fields;
old accounts retain the off state until they explicitly opt in.

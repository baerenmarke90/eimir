# Account push preferences: #638 backend foundation

**Baseline:** `main` at `c3f1e8cc`, 24 September 2026. This is the first
backend slice of #638, not its user-facing settings or complete channel
matrix. The authoritative event keys are the five persisted
`NotificationKind` values. A private `notification_preferences` row is keyed
by Account, kind and channel; the schema admits `IN_APP`, `PUSH` and `EMAIL`
without creating a competing event taxonomy. Only `PUSH` overrides are
implemented in this slice. No client can write them yet.

| Kind | Current effective PUSH default without an override | Reason |
| --- | --- | --- |
| `THINKING_OF_YOU`, `PARTNER_KISS`, `PARTNER_CHECK_IN`, `REMINDER_DUE` | Enabled when an active endpoint exists | Preserve the previously delivered immediate-push behavior during migration; sender-side domain gates still apply. |
| `COMMENT_CREATED` | Disabled | #515 classifies it as DIGESTIBLE; no individual push or digest exists. |

The personal override and the #515 delivery/preview policy intersect:
enabling a channel cannot promote a digestible or unknown event to an
immediate push. Existing domain rules and current membership remain
authoritative. Each enabled recipient's endpoint is checked at projection;
an event suppressed by a disabled preference receives a terminal technical
PushDelivery receipt, with no job, so re-enabling cannot replay that old
event. A delivery already queued is rechecked after locking the recipient
Account and before calling the provider. It terminates with
`PUSH_PREFERENCE_DISABLED` if the Account has muted that kind. Preference
writes lock the Account first, so they serialize with the same provider
boundary and Account deletion. No preference is controlled by a Space or
partner; Account removal cascades its private rows.

This does not change the existing in-app Center or its read state. It adds no
mail channel delivery, digest, Quiet Hours or new external provider. The
[own-Account API follow-up](./NOTIFICATION-PREFERENCES-API.md) exposes PUSH
choices and truthful capabilities with a generated client. Visible settings
still require the issue visual reference and Compact/Expanded UX preflight.
The later channel slices must wire `IN_APP` and
`EMAIL` independently, show unavailable capabilities, and obtain an explicit
opt-in before a new comment digest starts pushing. An absent channel row is
an intentional catalog default; no migration pre-populates per-account rows.

**Quality and reuse:** the existing Outbox, Notification, PushDelivery,
provider adapter and PostgreSQL Job Queue stay in use. A normalized override
table is needed because personal choices are durable and must be checked at
retry time; an in-memory or Space-wide switch cannot provide this authority.
No new service or dependency is added. Notification quality remains Free/Core
and identical on Cloud/Self-Hosted. The new rows contain only Account ID,
kind, channel and a boolean; they contain no relationship plaintext, email
address, recipient name or endpoint token. Foreign-key deletion and normal
database backup/restore apply; no new retention path or secret is introduced.
The lookup uses the unique Account/kind/channel index, and no external
request is made on the settings write path.

**Validation:** PostgreSQL tests cover established defaults, personal
isolation, no new job when muted, terminal suppression on reenable, and a
queued push invalidated before its provider call. No UI evidence or complete
#638 acceptance is claimed for this backend-only slice.

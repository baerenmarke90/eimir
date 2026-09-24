# Notification delivery classification: #515 foundation

The closed v2 catalog began with #515's first runtime slices; this document
describes the current policy, not the complete notification-policy feature.
`backend/src/eimir/engagement/notification_policy.py` is the versioned,
closed delivery-class catalog for the five currently persisted
`NotificationKind` values. An unknown kind fails closed for push. Domain
privacy/authorization, recipient derivation and module gates remain
authoritative ahead of delivery decisions.

| Kind | Class v2 | Current effect |
| --- | --- | --- |
| `THINKING_OF_YOU` | IMMEDIATE | Existing content-free generic push for an explicit, server-paced Free/Core signal. |
| `PARTNER_KISS`, `PARTNER_CHECK_IN` | IMMEDIATE | Existing content-free generic push when a permitted extended gesture is sent; Premium only governs sending. |
| `REMINDER_DUE` | IMMEDIATE | Existing generic push for an already due recipient-specific reminder; source rule/preference controls whether it exists. |
| `COMMENT_CREATED` | DIGESTIBLE | Notification Center by default; a bounded generic Push digest requires an explicit Account opt-in. No per-comment push. |

`IN_APP_ONLY` is an available catalog class for future explicitly approved
notification kinds, not a wildcard for arbitrary Outbox/Activity events.
`IMMEDIATE` currently preserves the existing push handoff. `DIGESTIBLE`
does **not** send a push for existing users; the [bounded comment digest](./NOTIFICATION-COMMENT-DIGEST.md)
checks an explicit Account opt-in at projection and provider time. The choice
is available in Notification Settings, independently of transport readiness.
A delivery already queued before a later policy change is
re-evaluated before calling the provider; a blocked delivery terminates with
the technical `PUSH_POLICY_BLOCKED` code and cannot replay on reenable.

The only push preview remains `notification.generic`. The catalog explicitly
disallows sender names, event categories, titles, and non-neutral lock-screen
copy for each kind. Provider presentation is constructed centrally from only
the canonical notification ID and kind. A catalog edit requesting a richer
preview fails closed at both enqueue and provider-send boundaries until the
transport and stricter domain rules have been reviewed and implemented. Never
pass recipient-controlled plaintext, actor name, target title,
unrevealed-surprise hint or private content to a provider. The
existing Notification API read path rechecks current authorization.
No new provider, broker, job queue or storage is needed; the existing Outbox,
PushDelivery and PostgreSQL Job Queue are reused. External libraries,
WebSocket and secondary preference stores are unsuitable for this catalog.

**Still separate:** #515's daily summary, wider rate/noise policy and category
controls; #565's provider transport. Do not infer that a new notification class enables email, a
foreground banner or a richer lock-screen preview. #1211 retains the current
badge/preview/Center, and #1212 rejects motion from unread-count polling.
Later deliveries must intersect the #515 class, the #638 recipient channel
choice, domain privacy/module rules and technical channel availability.
In particular, a comment digest cannot silently enable a new push channel
before the recipient has an explicit opt-in under #638.
The [#638 backend foundation](./NOTIFICATION-PUSH-PREFERENCES.md) enforces
PUSH overrides for current immediate kinds and explicit digest opt-in. The
[own-Account API and IN_APP follow-up](./NOTIFICATION-PREFERENCES-API.md)
expose independent recipient choices. The
[EMAIL delivery follow-up](./NOTIFICATION-EMAIL-DELIVERY.md) enables explicit
opt-in for immediate kinds; EMAIL digests remain outstanding.

**Business and operations:** notification quality is Free/Core in
`docs/FREEMIUM-FEATURE-MATRIX.md` and identical for Cloud/Self-Hosted; no
entitlement, quota, retention or deployment setting changes. The bounded
digest reuses the existing PushDelivery and Job Queue, with one supporting
index. Missing push providers stay nonfatal. Quiet Hours uses the authoritative
Account timezone, coalesces after a hold and retains normal in-app access.
The [Quiet Hours stored contract](./NOTIFICATION-QUIET-HOURS.md) defines the
per-Account window and eligible kinds before provider behavior is activated.

**Validation:** a catalog coverage test fails if a NotificationKind is added
without classification; the existing signal/reminder integration paths
preserve generic immediate push and idempotency; an integration regression
checks that a DIGESTIBLE comment neither enqueues an individual push nor
passes a stale queued delivery to the provider. A policy test verifies that
every current kind uses the neutral preview and a catalog change asking for
sender names is blocked, while existing immediate-provider handoffs remain
generic. No UI change or screenshot is claimed in these backend-only slices.

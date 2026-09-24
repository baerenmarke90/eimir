# Notification delivery classification: #515 foundation

**Current baseline:** `main` at `fb82fb7a`, 24 September 2026. This covers
the first two runtime slices of #515, not the complete notification-policy feature.
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
| `COMMENT_CREATED` | DIGESTIBLE | Notification Center only; no per-comment push. Digest delivery is **not implemented**. |

`IN_APP_ONLY` is an available catalog class for future explicitly approved
notification kinds, not a wildcard for arbitrary Outbox/Activity events.
`IMMEDIATE` currently preserves the existing push handoff. `DIGESTIBLE`
does **not** send a push until a bounded, idempotent digest is designed and
delivered. A delivery already queued before a later policy change is
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

**Not delivered by these slices:** #515's digest aggregation, rate/noise policy,
account-timezone Quiet Hours and category controls; #638's per-account,
per-event, per-channel IN_APP/PUSH/EMAIL preference authority; #565's provider
transport. Do not infer that a new notification class enables email, a
foreground banner or a richer lock-screen preview. #1211 retains the current
badge/preview/Center, and #1212 rejects motion from unread-count polling.
Later deliveries must intersect the #515 class, the #638 recipient channel
choice, domain privacy/module rules and technical channel availability.
In particular, a comment digest cannot silently enable a new push channel
before the recipient has an explicit opt-in under #638.

**Business and operations:** notification quality is Free/Core in
`docs/FREEMIUM-FEATURE-MATRIX.md` and identical for Cloud/Self-Hosted; no
entitlement, quota, retention, migration, schema or deployment setting
changes. This catalog adds no polling or background job and keeps missing
push providers nonfatal. The follow-up for Quiet Hours must use the
authoritative account timezone, avoid push-flooding on reconnect and retain
normal in-app access even if external delivery is delayed.

**Validation:** a catalog coverage test fails if a NotificationKind is added
without classification; the existing signal/reminder integration paths
preserve generic immediate push and idempotency; an integration regression
checks that a DIGESTIBLE comment neither enqueues an individual push nor
passes a stale queued delivery to the provider. A policy test verifies that
every current kind uses the neutral preview and a catalog change asking for
sender names is blocked, while existing immediate-provider handoffs remain
generic. No UI change or screenshot is claimed in these backend-only slices.

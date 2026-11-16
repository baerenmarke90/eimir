# Notification delivery classification: #515 foundation

## Current module workflow (v15)

The Product Owner-approved [module notification workflow](../product/notification-workflow.md)
now owns cross-domain admission. It extends the historical foundation below.
Accepted invitations notify the inviter. New Plans for today or tomorrow use
the existing reminder preference and coalesce with nearby standard start
reminders on each endpoint. Personal Wish reminders notify only their owners
at the chosen time. Imminent Plan changes and cancellations, shared Wish-round
invitations and results, and owner-only transfer outcomes use neutral immediate
delivery. Photo reactions use the recipient's existing comment Push preference
and Quiet Hours.
Daily question sets, quotes, presence and Vibe submissions,
rediscovery, ordinary edits and local games stay silent. Existing comments,
recipient consent and quiet hours remain effective; no daily summary is added.

A shared list a partner deliberately sends (#1907 E2, `COLLECTION_SENT`) uses
neutral immediate delivery without the list title, its own recipient switch,
Quiet Hours and no email choice; see the
[module workflow](../product/notification-workflow.md).

A garden seed from the partner (#1907 H3, `GARDEN_SEED_ARRIVED`) uses neutral
immediate delivery without the attached words, its own recipient switch,
Quiet Hours and no email choice; the notice is current only while the seed
waits to be planted. A bouquet from the partner reuses the same kind with the
target `GARDEN_BOUQUET` and its own text ("gave you a bouquet"), current only
while its card waits; a person gets at most one garden notice per local day,
so a later seed or bouquet on that day stays silent and waits in the garden.

The [#1910 Wish date exchange](../product/notification-workflow.md#wish-date-exchange-presentation-1910)
uses immediate delivery for deliberate proposals, counters and acceptance.
This is the scoped exception to neutral system copy. Source authorization
and validation precede delivery, provider-facing relationship content stays
encrypted, and device notification settings govern display.

New UnifiedPush clients explicitly advertise reference-routing version 1.
Only those subscriptions receive a canonical Notification ID inside the
encrypted wake. Legacy subscriptions retain exactly the old one-field wake,
so upgrading the backend does not disable notifications in older installed apps.
There is still no relationship plaintext, actor name or category on the provider
boundary. Fresh authenticated resolution and the editor/account/Space guards
own navigation. The following v2 text is historical foundation for the unchanged
gesture/comment/reminder semantics, not the complete current kind catalog.

The closed v2 catalog began with #515's first runtime slices and covered five
`NotificationKind` values. The current delivery-class catalog is
`backend/src/eimir/engagement/notification_policy.py`.
An unknown kind fails closed for push. Domain
privacy/authorization, recipient derivation and module gates remain
authoritative ahead of delivery decisions.

| Kind | Class v2 | Current effect |
| --- | --- | --- |
| `THINKING_OF_YOU` | IMMEDIATE | Existing content-free generic push for an explicit, server-paced Free/Core signal. |
| `PARTNER_KISS`, `PARTNER_CHECK_IN` | IMMEDIATE | Existing content-free generic push when a permitted extended gesture is sent; Premium only governs sending. |
| `HEART_HUNT_HIDDEN`, `HEART_HUNT_FOUND` | IMMEDIATE | Herzversteck (#1907 H3): content-free generic push naming no photo; the recipient can read the partner name in the encrypted preview where that is already allowed. Premium only governs playing. |
| `REMINDER_DUE` | IMMEDIATE | Existing generic push for an already due recipient-specific reminder; source rule/preference controls whether it exists. |
| `COMMENT_CREATED` | DIGESTIBLE | Notification Center by default; bounded generic Push and EMAIL digests each require a separate explicit Account opt-in. No per-comment external delivery. |

### Current noise-control audit

| Kind | Admission and external noise bound |
| --- | --- |
| `THINKING_OF_YOU` | One sender/Space request per 30 minutes, with client-request replay and per-event delivery uniqueness. |
| `PARTNER_KISS`, `PARTNER_CHECK_IN` | The same 30-minute pacing per sender/Space/gesture kind, with request replay and per-event delivery uniqueness. Different deliberate gestures remain independent. |
| `HEART_HUNT_HIDDEN`, `HEART_HUNT_FOUND` | At most one hidden and one found notice per round, and one open round per hider; per-event delivery uniqueness. Quiet Hours defer them like other explicit partner signals. |
| `REMINDER_DUE` | One generated occurrence per recipient, rule and due key; the chosen reminder schedule governs delivery, with source-event and channel receipt uniqueness. |
| `COMMENT_CREATED` | One opted-in generic Push per recipient/Space/endpoint/fixed UTC hour and one separately opted-in generic EMAIL per recipient/Space/hour. Quiet Hours additionally coalesces held external receipts. |

Both selected channels may notify the recipient for one event; channel choices
are independent Account consent. The comment Push bucket now closes after a
terminal provider attempt, including an ambiguous `FAILED` outcome. A later
worker cannot promote an older comment receipt into another send for that
hour. A pre-provider `UNAVAILABLE` receipt does not close the bucket, so an
eligible older receipt can still deliver. This uses the existing Account
lock, receipt statuses and indexed hourly lookup, without a new rate ledger.
A daily summary is deferred: the Product Owner decision on #1268
(2026-09-25, closed as not planned) adds no daily consent, schedule, delivery
job or UI, and existing hourly consent choices are unchanged. A later proposal needs a
fresh explicit product decision. Wider Activity kinds and cross-kind noise
rules likewise require a separate product decision rather than silent
suppression of deliberate gestures or user-selected channels.

`IN_APP_ONLY` is an available catalog class for future explicitly approved
notification kinds, not a wildcard for arbitrary Outbox/Activity events.
`IMMEDIATE` currently preserves the existing push handoff. `DIGESTIBLE`
does **not** send a push for existing users; the [bounded comment digest](./NOTIFICATION-COMMENT-DIGEST.md)
checks an explicit Account opt-in at projection and provider time. The choice
is available in Notification Settings, independently of transport readiness.
A delivery already queued before a later policy change is
re-evaluated before calling the provider; a blocked delivery terminates with
the technical `PUSH_POLICY_BLOCKED` code and cannot replay on reenable.

The baseline provider presentation is `notification.generic`. The catalog
keeps neutral presentation for ordinary kinds. `notification.wish_date` is
limited to the three deliberate Wish date events under the current workflow
above. An arbitrary catalog edit requesting richer presentation fails closed
at enqueue and provider-send boundaries. The existing Notification API read
path rechecks current authorization.
No new provider, broker, job queue or storage is needed; the existing Outbox,
PushDelivery and PostgreSQL Job Queue are reused. External libraries,
WebSocket and secondary preference stores are unsuitable for this catalog.

**Still separate:** wider Activity kinds and cross-kind noise policy (see the
daily-summary deferral above), and the remainder of #565's Push transport. #565 now has
the authenticated endpoint API and a configured-only
[UnifiedPush backend sender](./UNIFIEDPUSH-TRANSPORT.md); the Capacitor device
lifecycle, FCM and real-device acceptance of Push delivery and tap routing are
not delivered, so a green backend test is not live-device acceptance. Do not infer that a new notification class enables email, a
foreground banner or a richer lock-screen preview. The scoped approvals in
#1211 and #1212 require a fresh authorized notice before showing a receipt.
Later deliveries must intersect the #515 class, the #638 recipient channel
choice, domain privacy/module rules and technical channel availability.
In particular, a comment digest cannot silently enable a new push channel
before the recipient has an explicit opt-in under #638.
The [#638 backend foundation](./NOTIFICATION-PUSH-PREFERENCES.md) enforces
PUSH overrides for current immediate kinds and explicit digest opt-in. The
[own-Account API and IN_APP follow-up](./NOTIFICATION-PREFERENCES-API.md)
expose independent recipient choices. The
[EMAIL delivery follow-up](./NOTIFICATION-EMAIL-DELIVERY.md) enables explicit
opt-in for immediate kinds. The [comment EMAIL digest](./NOTIFICATION-COMMENT-EMAIL-DIGEST.md)
is available by explicit recipient opt-in in Notification Settings when SMTP
and a verified primary Account address are present.

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
the three approved Wish date events are the only catalog-level exception to
the neutral policy. Existing immediate-provider handoffs stay generic unless
the transport has an independently reviewed device preview. This historic
foundation has no UI acceptance evidence.

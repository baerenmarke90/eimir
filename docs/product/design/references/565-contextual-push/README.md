# Contextual Android notifications — #565

## Product decision and baseline

On 2026-11-01 the Product Owner confirmed actual FCM receipt, then requested
sender, concrete event and an appropriate action instead of the generic body:
a named partner sending a kiss; a named partner creating a titled reminder with
an action to view it. This explicitly supersedes generic-only **device**
presentation for the selected FCM rollout. A due reminder must not be described
as newly created. FCM-only operation and the separate Play acceptance #1577 remain.

Inspected baseline: main `36ccc13a162502a7122820a32b45569c17b72521`.
Existing surfaces: native NotificationCompat channel and activation-bound
PendingIntent; canonical recipient Notification/open API; Settings notification
preferences; shared manual Reminder API and existing source authorization.
There is no general manual-reminder detail screen in this baseline. Add a focused
read-only destination for the exact authorized reminder rather than sending an
arbitrary URL or opening its editor. Existing generated-source/private-content
eligibility must still be checked.

The [generated native reference](android-preview.png) shows the complete Android
shade with two fictional events and a neutral locked-state inset. It is a design
preflight, not runtime evidence. Android controls typography, system layout,
theme, expansion, action placement, accessibility and animation.

## Mobile interaction contract

Product Reference v1's content → meaning → action hierarchy and platform-native
interaction rule apply. Reuse OS notifications, localized Android resources,
the existing Web read-detail pattern and authenticated notification resolver.
The partner/action and actual title are the focal point, followed by one view
action. No typing or new technical configuration is needed. Compact is primary;
Expanded reuses the same read destination and existing shell. Preserve draft
guards, Back, current Account/API/Space validation, reduced motion and source
unavailable fallback. The public lock-screen version stays generic without names,
titles or actions. System sensitive-content settings remain user-controlled.

Creation notices cover deliberate **manual shared** reminders only, once for the
other active partner; generated rules/imports/private-source changes remain
silent. Due notices retain their actual occurrence semantics and preferences.
All existing eligible kinds receive an accurate localized event label; digest
text must describe a digest rather than imply only one new comment.

## Reuse and privacy review

Use standard JWE (RFC 7516), `dir` + `A256GCM`, through JWCrypto 1.6.1 (BSD-3-Clause)
and Nimbus JOSE+JWT 10.10 (Apache-2.0), rather than a hand-written cryptographic
protocol. Reuse AndroidKeyStore, SecureRandom and the existing bounded native
session cipher for local wrapping. The random per-activation preview key is
registered only through the authenticated endpoint API over the selected HTTPS
instance, protected by existing encrypted endpoint storage, and wrapped in the
device's no-backup storage. It is never embedded in an APK or sent to Google.
FCM receives an activation-bound encrypted, short-lived preview only; names,
event type, title and canonical notification reference are inside that envelope.

Considered plaintext FCM notification bodies (unnecessary provider disclosure),
native background authenticated fetching (additional networking, token-refresh
coordination and background execution limits), RSA key wrapping (unneeded for a
server/device shared registration secret), and generic event-only labels (do not
meet the requested sender/title behavior). Keep one delivery pipeline and no new
provider, broker, auth flow, polling or background product-data cache.

Both libraries are usable commercially and Self-Hosted; their licenses and
locked versions/checksums must be recorded. Firebase's already accepted terms and
no-cost transport remain; encrypted data stays within provider size limits. No
normal-user setup or new operator secret is added. Both Cloud/Self-Hosted reuse
the same protocol. Older registrations/builds/servers keep the generic wake.

Primary sources checked 2026-11-01:
[Firebase encrypted message guidance](https://firebase.google.com/docs/cloud-messaging/encryption),
[Nimbus JOSE](https://connect2id.com/products/nimbus-jose-jwt),
[JWCrypto](https://jwcrypto.readthedocs.io/en/stable/jwe.html).

## Business/freemium and cross-cutting preflight

Business/freemium impact reviewed: Notification Policy/Digest/Quiet Hours remain
Free/Core, equally available in Cloud/Self-Hosted. No entitlement, paid sender or
recipient, plan quota or downgrade/data-access change. Provider and host costs
remain operational costs; previews are bounded and no content cache is added.

Recheck current recipient/source/actor authorization immediately before delivery;
retain consent, Quiet Hours, read-state suppression and normal retry policy.
Never persist preview plaintext in Outbox, jobs, delivery diagnostics or logs.
Bind decryption to the current activation, reject altered/expired/unknown data,
use a unique immutable PendingIntent per notification and invalidate on logout.
An external tap still reauthorizes the canonical source. Additive negotiation
must support mixed client/server versions. Migration covers only derived catalog
state; rollback preserves authored reminders. Test provider ciphertext, cross-
Account/source privacy, normal domain projection, repeat delivery, wrong/stale
keys, pending-intent isolation, localization, lock-screen redaction, source tap,
and current signed-build/live deployment separately. No force-stop delivery or
guaranteed latency is claimed.

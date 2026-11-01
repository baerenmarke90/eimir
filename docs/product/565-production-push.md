# Production Android push — #565

## Scope and ownership

Reconcile the existing FCM implementation from #1392 with the canonical
notification workflow from #1573 and the subsequent #1575 product baseline.
The Product Owner selected **FCM-only operation** on 2026-11-01, superseding the
earlier dual-transport target in #565. No new UnifiedPush identity, distributor or
operator configuration is part of this rollout. Existing optional repository
support remains compatible; the selected channel requires only FCM configuration.
Keep #565 open until the operator has configured the real server and the selected
signed Android build has passed real provider/device delivery acceptance.
The Product Owner reserved server deployment for themselves on 2026-11-01.
Code merge, provider authentication, fixture tests and an unsigned build do not
constitute that delivery acceptance or Play Store publication.

## Reuse review

Reuse the existing notification policy, Account-owned endpoints, encrypted endpoint
storage, outbox/job delivery, digest and Quiet Hours. Reuse #1392's shared native
activation and FCM adapter instead of introducing another push pipeline.

The current alternatives review retains UnifiedPush/Web Push with the existing
connector and direct Google Firebase Messaging through the official Android SDK,
HTTP v1 API and Google-auth library. Android notification permissions, channels,
PendingIntent and Capacitor remain platform/framework responsibilities. An extra
broker, OneSignal account or custom OAuth/JWT implementation would duplicate
existing infrastructure and increase data processing and operating obligations.
The small application adapters enforce eimir.'s Account/API ownership, private wake
contract and authenticated navigation; these are application responsibilities.

Official Firebase Android and Google-auth libraries retain their existing
Apache-2.0 license records in `docs/DEPENDENCIES.md`; Firebase/Cloud terms apply to
the provider account. FCM is available without a paid billing plan. Both Cloud and
Self-Hosted support the same transport interfaces. Operators supply sender access;
normal couples only grant the Android notification permission and enable their
device. An unavailable FCM configuration can use a configured UnifiedPush
distributor. This is not a silent failover during a transient provider outage.

Sources checked on 2026-11-01:

- [Firebase Android setup](https://firebase.google.com/docs/cloud-messaging/android/get-started)
- [FirebaseMessaging Android API](https://firebase.google.com/docs/reference/android/com/google/firebase/messaging/FirebaseMessaging)
- [FCM HTTP v1 message contract](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages)
- [FCM errors](https://firebase.google.com/docs/cloud-messaging/error-codes)
- [Google service-account key guidance](https://docs.cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys)
- [Public certificate upload](https://docs.cloud.google.com/iam/docs/keys-upload)

## Business/freemium impact reviewed

Push delivery and the existing Notification Policy, Digest & Quiet Hours remain
Free/Core under `docs/FREEMIUM-FEATURE-MATRIX.md`. There is no subscription check,
paid device activation, recipient quota by plan or artificial Self-Hosted
restriction. Both partners and all eligible Accounts use the same delivery path.
An originating Premium feature keeps its existing authorization; receiving an
authorized notification does not introduce another Premium requirement.
Provider/server operating costs remain the operator's responsibility. Existing
retention, downgrade, export and deletion rules remain authoritative.

"Everyone receives push" means equal supported delivery after device permission
and activation. It does not override an Android denial, disabled channel,
recipient preference, Quiet Hours, revoked Account access, or Android force-stop.
The app must never claim successful registration before both native registration
and the authenticated server endpoint write have succeeded.

## Product design and mobile interaction contract

Use Product Reference v1, R5 Settings, the existing Settings template,
`NotificationSettingsPanel`, `PreferenceSwitch`, problem feedback and semantic
tokens. The whole-screen generated #565 reference remains the composition
preflight. This reconciliation adds no new screen composition or operator fields
to the couple-facing UI. #1575's independently reviewed product changes remain
the new baseline.

The focal point is the person's notification preference. The dominant action is
enable, disable, retry, or open Android Settings according to state. Native
permission and Settings screens retain OS behavior. Loading, connecting,
disconnecting, unavailable, denied, on/off and error states use localized text.
Existing nonblocking feedback, reduced motion, draft guard, Compact reflow and
Expanded adaptation remain. Provider notice presentation evidence and its limits
are recorded in `docs/design/eimir/565-fcm/evidence/README.md`; it is not live
delivery evidence.

A notification tap revalidates the current authenticated Account, API instance,
activation and Space before opening its authorized canonical target. An invalid,
removed or inaccessible reference falls back to the notification center. An open
draft blocks navigation. Account/Space replacement, logout or disable invalidates
pending resolution, including switching away and back to the same Space.

## Cross-cutting quality

- Security/privacy: provider data is a content-free wake. FCM sends exactly
  `type` and `activationId`; it carries no Account, Space, source or notification
  ID. UnifiedPush can carry an opaque notification reference only when both
  server and connector advertise version 1; older peers retain the generic wake.
  All source resolution remains authenticated. Sender access is mounted read-only
  into API/worker only; Web, migrations and images never receive the private key.
- Lifecycle/concurrency: one native activation owns the Account/API/provider
  binding. Serialized FCM registration/retirement, endpoint replacement,
  token refresh, pending revocation and sign-out cleanup reject stale callbacks.
  Storage failures fail closed. A genuine provider `UNREGISTERED` can retire a
  subscription; sender authorization failures cannot masquerade as a dead device.
- Resilience/performance: reuse persisted bounded retries, provider timeout/body
  limits, sanitized errors and Retry-After. No request-path Google registration
  call, new polling loop, content cache or extra database schema is introduced.
- Contracts: regenerate OpenAPI and TypeScript from the actual merged ASGI app.
  A missing new configuration route (HTTP 404 only) can use the old authenticated
  UnifiedPush configuration route; a server outage cannot switch transports.
- Accessibility/i18n: reuse localized controls, Android permission/settings,
  existing focus/reflow/motion behavior and generic private native presentation.
- Operations: partial explicitly requested FCM configuration refuses startup.
  Generic deployments can still select UnifiedPush only. An explicitly selected
  Play Store artifact refuses missing Firebase configuration in both publisher
  preparation and Gradle; compiled APK resources are checked against build input.
  Existing release identity, signing, provenance and deployment gates remain.

Installed Android test APKs use a separate class loader from the target APK.
Fixture-accessed helpers therefore expose annotated testing entry points instead
of relying on Java package-private access across those loaders. This does not
export an Android service or expose the bridge to another application. The UP
replacement test respects an actual installed default distributor rather than
assuming its synthetic distributor is the only installed option.

## Configured provider identity

The operator created Firebase project `eimir-production` under their business
account on 2026-11-01. Public project number: `742745449123`. Android package:
`de.eimir.app`; Firebase app ID:
`1:742745449123:android:3ae71a9959a3e9faef5516`.
Analytics, Gemini and paid billing were not enabled.

The dedicated `eimir-push-sender@eimir-production.iam.gserviceaccount.com` has the
project-scoped `roles/firebasecloudmessaging.admin` role. Its authorized persistent
RSA-2048 public certificate is registered without an annual expiry. The private
key remains outside Git in the operator's protected local configuration directory.
No private credential belongs in an APK, environment value, issue or build log.
The public Android API key is restricted to FCM Registration and Firebase
Installations APIs. It is distinct from the private server credential.

OAuth authentication succeeded against Google. An FCM `validate_only` request
using a deliberately synthetic unregistered installation reached the provider and
returned `UNREGISTERED`. No message was delivered. This proves sender login and
provider reachability; it does not prove real device delivery.

See `docs/ARCANE.md` and `docs/PRIVATE-TEST-CHANNEL.md` for the mount and supported
launcher. The `eimir-test` deployment channel uses this new business-owned Firebase
project; the channel name is not the Firebase project ID.

## Acceptance boundary

The earlier integration pass completed 1,243 backend/unit/real-PostgreSQL cases,
27 endpoint-matrix cases, 2,450 Web cases with two intentional skips, and 31 native
push/notification fixture cases on the connected physical Android device. These
results preceded the #1575 reconciliation. Current follow-up logs are retained in
the operator's local `output/565-production-push` handoff; remote CI must run on
the final combined revision before merge.

The #1575 reconciliation subsequently passed the complete Web suite (2,462
passes, two existing skips), 1,279 backend/unit/real-PostgreSQL cases including
Dashboard preferences, and all 31 physical Android fixture cases. The release,
exporter, identity and configuration group passed 97 checks. Strict Android
Debug/test builds, lint and JVM tests, API drift, TypeScript, semantic tokens,
Capacitor foundation, Ruff and formatting passed. The actual Gradle Play Store
guard rejected an absent Firebase configuration. These local checks remain
separate from current-head hosted CI and real deployed delivery.

The subsequent FCM-only deployment decision passed 120 release/exporter/
configuration checks, including real Compose resolution without distributor
settings and refusal of missing FCM inputs. The selected channel explicitly
leaves the alternate transport disabled. Sanitized source/build identities and
the physical-fixture/real-delivery distinction are retained in
`docs/design/eimir/565-fcm/evidence/reconciliation-2026-11-01.json`.

Before merging the auto-synced channel, the operator must confirm that the private
host file and the FCM inputs are ready. This preserves #565's existing
deployment sequencing requirement and avoids a failing restart. The Product Owner
explicitly authorized the later merge on top of #1575, but confirmed that the
server was not prepared yet; the implementation can be reviewed while deployment
and merge wait for that preparation.

A configured unsigned APK/AAB was built with strict dependency verification.
All four compiled Firebase strings matched the public configuration; 78 packaged
Web assets matched the current native Web bundle. This is a packaging check,
not the stable production signing or Play-distributed installation gate.

Release acceptance still requires the exact stable-signed/published build and the
operator-configured server: real FCM receipt from an existing
notification-producing action, foreground/background/cold-start tap, permission
denial and recovery, reinstall/rotation, logout/Account replacement, offline and
provider recovery, and the recipient's preference/Quiet Hours boundaries. Record
the exact app/server revision and evidence without identifiers or credentials.
Do not close #565 or claim Play Store readiness before those checks pass.

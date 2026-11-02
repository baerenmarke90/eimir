# Android test.39 integration and canonical package

The Product Owner explicitly requested on 2026-11-02: switch the test publisher
to `de.eimir.app` and publish. This supersedes the temporary sideload override
introduced while integrating main `38bd4e6ac544e5da6adf425749621dce62773e42`
into test.38 orchestration `75a65debe39768b5380fc1d0e1ab8674e4576edc`.
Main includes normally merged #1591–#1594. The release foundation stays a draft
in #1443 and must never merge into main. Keep the plan on published test.38
until the exact corrected combined source passes every required check; then
select that frozen source with a separate plan-only commit.

## Package and data contract

All build variants inherit main's canonical `de.eimir.app` identity. Test.39 is
a same-key update for the existing canonical fcm.2 app, consistent with #565 and
`docs/PROJECT-IDENTITY-MIGRATION.md`. Install its APK directly and sign in to the
existing Account on the same persistent server when installing alongside the legacy app. The old `de.sidebyside.app`
installation and sandbox remain intact. No cross-package cleanup, credentials
copy, uninstall, local-data transfer or in-place upgrade is introduced or claimed.
Server-side Account/Space/content identities do not change.

Reuse the existing protected Android test publisher, independent canonical certificate already used by fcm.1/fcm.2,
persistent API origin, regular mode, native updater and strict exact-source gates.
The publisher retains predecessor hash/signature checks and accepts the package
boundary only for the exact test.38/code 38 → test.39/code 39 pair with explicit
`--fresh-package`. Also verify the published canonical fcm.2/code 2 predecessor
with the canonical certificate, proving an in-place upgrade from that app.
Subsequent releases require same-package updates again.
Immutable legacy plans remain anonymously verifiable. The canonical native
catalog validates and skips historical test.1–test.38 legacy-package markers;
other invalid packages and malformed metadata still fail closed.

Canonical certificate: `1d403a18b4d3694f8e5fd9853906a60c012644d23e5a3a1ef40819b119cb1da9`.
The existing protected signing bindings must match it; a legacy key is rejected.
Retain FCM with the existing eimir-production client input, validate it through
`android_firebase_configuration.py`, and verify all four compiled APK resources.
No new provider, signing identity, infrastructure, entitlement, quota or backend
migration is added. Cloud/Self-Hosted product behavior remains main's behavior.
Native push/renderer recovery, updater registration and both browser inventories
remain integrated. The existing Firebase client is preserved; no Play publication
is introduced.

## Acceptance and publication

Product design, behavior and visual evidence remain those accepted in #1591–#1594
and linked from #1590. Packaging/catalog compatibility adds no new composition.
The Product Owner's scoped decision in #1590 moves physical-device cold-start,
resume and process-loss acceptance to the test-release stage; it does not establish
passing results or diagnose the originally reported device crash. Fresh-install,
existing-account login, Space/content access, OS App Links, TalkBack/IME/OEM and
subsequent canonical-package update continuity remain device acceptance.

The matching Web/API test deployment uses main's existing private-channel
publisher and `deploy/eimir-test`; verify its selected source independently.
Published Android artifacts remain immutable, draft-first and marker-last.

## Preserve the installed FCM test target

The private installation is FCM-only. Reuse the existing Firebase build helper
and named protected client input to prepare eimir-production configuration and
verify all four compiled resources in the signed APK before packaging. Remove
the temporary public client JSON along with signing material. No server
credential, new provider or new Firebase project is introduced.

The unprivileged preflight downloads the immutable canonical FCM.2 predecessor,
checks its SHA256SUMS and actual APK signature with build-tools 36.0.0, and
records only its public certificate fingerprint. A selected canonical release
must match that installed-package signer; an incompatible cloud signer blocks
publication instead of requesting uninstall/data clearing. Existing legacy
release plans remain verifiable. Retain only the four already-public verified
release assets for three days to supply the user-requested APK download.

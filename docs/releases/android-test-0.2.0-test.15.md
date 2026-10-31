# Android test.15 — Build 14 delivery correction

Owner: #1331 / #1332; continuation of #1443. This preserves the existing private
sideload channel and does not accept the draft foundation into main.

## Trigger and intended behavior

An installed-app report shows **Build 14** at source
`c6ed91eec29a7426164e0a09160b44a88dfbe0d0`. The published immutable test.14
contains checked source `11a24139e372d5f97fc0d1fde276066f208c1123` but also has
versionCode 14. The updater requires a strictly greater code, so it correctly
reports current and cannot offer that different same-code APK.

Publish **0.2.0-test.15 / versionCode 15** against the exact checked source
selected in `.github/android-test-release.json`. Published test.14 is the verified
predecessor. Preserve `de.sidebyside.app`, certificate
`b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472`, persistent
origin `https://demo.eimir.ur-cloud.de`, Demo/reset disabled and the updater.

The canonical Web and native client source are unchanged from shipped test.14.
This correction adds release notes and increments the build identity. Do not make
equal-code or downgrade installs eligible, replace published test.14 bytes, edit its
marker to claim code 15, change signing identity, or remove installed data.

## Release procedure and evidence boundary

1. Commit these notes while the release plan still selects the already published
   test.14; its automatic run must verify public bytes without signing again.
2. Wait for the existing exact-source CI, browser, security, recovery and native
   resource gates on this clean source commit.
3. Commit the test.15 plan with this full source SHA, code 15, predecessor
   `0.2.0-test.14` and the source-bound notes file. The existing unattended sole
   publisher owns build, signature/package/version checks, draft-first/marker-last
   publication and bounded anonymous byte verification.
4. Confirm the public marker reports code 15 and the expected source, and that the
   native updater's strict code comparison offers 15 to installed Build 14.

The earlier test.14 source/build/public-byte evidence remains bound to that release;
test.15 requires its own signed APK and publication checks. Physical-device
installation, session/Space/data continuity, launcher appearance and OS App Links
remain device acceptance until exercised on the installed app.

## Reuse, product and business review

Reuse the existing release-plan validator, exact original signing identity,
Capacitor client, updater and immutable GitHub release lifecycle. No new SDK,
provider, permission, native or Web runtime behavior is introduced. No new visual
composition is needed. Existing Product Reference v1 and inherited design evidence
remain applicable. Official maintenance remains Free/Core; icon entitlements,
relationship ownership, quotas, Cloud/Self-Hosted parity, retention and downgrade
semantics are unchanged.

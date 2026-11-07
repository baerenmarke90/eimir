# Android test.50 integration

The Product Owner requested a new test release based on latest main on
2026-11-06 (Europe/Berlin). The inspected main baseline is
`aa62b721aafcb6fd56d4176f46f9f0dcda07d578`, including merged #1658, #1671,
#1673 and #1675. Integrate that exact main into the standing delivery branch.

## Scope and reuse

Reuse `release/android-test.14-20261026`, its validated release plan and sole
protected `android-test-release` publisher. Preserve package `de.eimir.app`,
the canonical certificate, `eimir-production` Firebase client, persistent regular
test origin and removable updater. Published test.49 is the same-package and
same-key predecessor. No additional provider, dependency, permission, key or
publication path is introduced by packaging.

Resolve the English locale conflict by retaining every current main namespace
and the existing complete updater namespace. Use main's accepted Today freshness
journey, which independently orders the initial read and device-context refresh.
Preserve both browser ownership inventories and main's native voice-share intake.
No assertion, retry policy, required check or publishing protection is weakened.

## Android test-environment correction

The initial candidate `85c699f723414665e52bc93ce96cb9f4fd11fd6d` passed all
1,128 browser cases and every required source check except Android API 37.1.
API 28 and 36 passed. The first API 37.1 failure found a collapsed notification
child after delayed SystemUI expansion. Its sole targeted retry failed earlier
in the combined media picker: the native tap produced `TYPE_VIEW_LONG_CLICKED`,
and the expected system-picker window never opened.

Both diagnostic artifacts were downloaded, checksum-verified and inspected:
`13501896201` (`077b303808f6e21c08475e64842e6e4b66b272aef7aa8547007c741fe760d4a2`)
and `13502256630`
(`9b76f9ada5870282ab39dac47b3807df9c8ff5386d124ec90f9ee3b23730a161`).
The retry records only CPUs `0-1`, a 1080x2340 display, 1,950 ms app rendering,
and a 2,897 ms input-manager Binder transaction. The test and affected native
selection/notification code are unchanged from published test.49.

Reuse the existing accepted API 36 AVD resource configuration for API 37.1:
four guest cores, 720x1560 pixels and density 294. This retains the same ~392 dp
Compact viewport while reducing software-rendering work. Verify actual online
cores and display metrics before instrumentation. Retain the API 37.1 system
image, emulator, graphics backend, memory, tests, assertions, deadlines, themes,
large text, media grants/bytes/decoding and notification privacy checks.
No application code or runtime behavior changes. This uses existing Android AVD
configuration, with no dependency/provider or custom gesture implementation;
see https://developer.android.com/studio/run/managing-avds.

The corrected commit requires fresh exact-source checks. Keep the publication
plan on test.49 until those checks pass; earlier successes do not certify the
corrected source. If the release-contract path filter omits its source check,
use the existing workflow's private-channel selector on the delivery branch:
its main-only runtime guard rejects promotion there, while the unprivileged
contracts execute. Do not select the product-publication path.

## Product, business and cross-cutting review

Product Reference v1 and the #1331 updater Mobile Interaction Contract remain
authoritative. This packages accepted main features without composing another
product surface. Relevant source-bound feature evidence remains under
`docs/product/design/heart-voice-notes.md`,
`docs/product/design/evidence/terms-of-use-acceptance/`,
`docs/product/design/references/once-messages/`,
and the existing `docs/product/design/references/1331/` updater reference.

**No business/freemium impact from packaging:** preserve main's versioned feature
matrix, Space-scoped capabilities, opt-in one-time reception, non-paywallable
privacy/security/accessibility and retained-content/export rights. Voice-note
and one-time-message eligibility retain their accepted main boundaries. This is
the requested test channel, not a store or general production rollout.

Signing credentials remain exclusively in the established protected publisher.
Do not read or reset runtime data, credentials, sessions or memberships. Checks
bind the clean embedded source, increasing code, actual signature, predecessor,
Firebase resources and immutable public bytes. The persistent origin retains
Demo/reset disabled. Main adds migrations 0113-0115; backend/Web runtime revision,
readiness and compatibility must be verified separately from APK publication.

## Candidate and publication acceptance

Keep the plan on published test.49 while validating the integrated source.
Freeze the source only after all publisher-defined named checks pass, including
backend integration/security, browser shards and owned specs, Android API
28/36/37.1, release contracts, artifacts and provenance. Missing, failed, skipped,
pending or cancelled required checks block publication. Run focused local merge,
locale, build and release preflights first; hosted CI supplies Android SDK,
emulators and service acceptance unavailable locally.

Select the accepted immutable source in a separate plan-only commit for
`0.2.0-test.50`, versionCode 50, predecessor `0.2.0-test.49`, with notes already
present in that source. The existing publisher validates unsigned sideload
assembly, lint and actual policy/catalog JVM tests before protected signing.
It verifies the predecessor, stages exactly four draft assets with marker last,
publishes the complete immutable prerelease and verifies anonymous public bytes
and the bounded update catalog.

Verify the separate checked-main backend/Web/video runtime channel and public
Web/API readiness before claiming runtime deployment. Physical-device in-place
installation, session/Space/data continuity, OS App Links, microphone behavior
and actual push delivery remain separate observed acceptance.

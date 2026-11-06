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

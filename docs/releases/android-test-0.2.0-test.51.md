# Android test.51 integration

The Product Owner requested the next Android test release on 2026-11-06
(Europe/Berlin). The inspected main baseline is
`43cec016ce399acdfcbb2ef8cfca9edeeb06059e`, including merged #1680, #1681,
#1684 and #1685. Integrate it into the standing delivery branch without merging
that delivery foundation into main.

## Scope and reuse

Reuse `release/android-test.14-20261026`, its validated release plan and sole
protected `android-test-release` publisher. Preserve `de.eimir.app`, the
canonical certificate, `eimir-production`, the persistent regular test origin,
the removable updater and published test.50 as the same-package/same-key
predecessor. No new dependency, provider, permission, signing identity or
publication path is introduced by packaging.

Keep both app-updater and current main browser ownership entries when resolving
the test-groups merge. Retain main's current namespaces plus the complete updater
namespace in English. Preserve the accepted Android API 37.1 emulator-resource
correction from test.50 and every existing assertion and required check.

## Product, business and cross-cutting review

Product Reference v1 and the existing #1331 updater Mobile Interaction Contract
remain authoritative. This packages accepted main features without composing a
new product surface. Current generated references, Compact/Expanded and
Light/Dark behavioral evidence are owned by the accepted contextual-create,
people-profiles and tabs-pro-private-tags references under
`docs/product/design/references/`.

**No business/freemium impact from packaging:** preserve main's versioned feature
matrix, Space-scoped capabilities, parent-private location contract, shared
People decision and non-paywallable privacy/security/accessibility and retained
content/export rights. Optional photo sources and Pro decoration retain main's
existing eligibility. This is the requested test channel, not a store release.

Signing credentials stay exclusively in the protected publisher. Runtime data,
sessions, credentials and memberships are not read or reset. Demo/reset remain
disabled. Migration 0116 belongs to the separately checked backend runtime;
verify Web/API readiness and source selection independently of APK publication.
The APK embeds the shared Web product and must retain all updater locale and
native sideload contracts alongside the current main features.

## Candidate and publication acceptance

Keep the plan on published test.50 while validating the integrated source.
Freeze the candidate only after all publisher-defined named checks pass,
including complete backend/browser acceptance, Android API 28/36/37.1,
release contracts, build artifacts, security and provenance. Missing, failed,
pending, cancelled or skipped required work blocks publication. Use focused
local release/merge/locale/build and browser-planning preflights; hosted CI
supplies the pinned Android SDK/emulators and full service acceptance.

Select the frozen source in a separate plan-only commit for
`0.2.0-test.51`, code 51, predecessor `0.2.0-test.50`, using notes already present
in that source. The existing publisher validates unsigned sideload assembly,
lint and actual policy/catalog JVM tests before protected signing; verifies
package, predecessor, signer, Firebase and embedded source identity; stages
exactly four draft assets with marker last; publishes the immutable prerelease;
then verifies anonymous public bytes and the bounded updater catalog.

Physical-device in-place installation, session/Space/data continuity,
microphone behavior, OS App Links and actual push delivery remain separate
observed acceptance. Keep the standing draft delivery PR unmerged and record
the final source, checks, publisher, release and public downloads there.

# Android test.31 — Passport playback and current main integration

The Product Owner explicitly authorized merging #1543 and publishing a new
Android test release on 2026-10-30. Accepted main
`dd3ff8dfeb56b21d0968738e9771ebff7cc91f8c` is an explicit merge parent of this
isolated test source. Draft PR #1443 remains a private test foundation and must
never merge into main. Published test.30 and all previous assets remain immutable.

## Scope, reuse and product review

Package the current accepted product, including #1543 Passport discovery on Wir,
finite slideshow playback, accessible pause/replay, source return and bounded
local narration; #1541 Wir ordering/design/gesture and settings simplification;
and the accepted shared wish-selection flow and additive migration 0094.
Existing native session lifecycle, App Updates and test installation identity
remain intact. No new screen, native capability or distribution provider is added.

Reuse Product Reference v1, owning generated preflights and actual evidence:

- `docs/product/design/references/1542/README.md` and its Compact/Expanded,
  Light/Dark, large-text, reduced-motion and sparse-state evidence;
- `docs/product/design/evidence/1538/README.md`;
- `docs/product/design/shared-wish-selection.md` and its owning evidence;
- the existing App Updates evidence under references/1331.

Main's canonical Moments tab tests supersede the older equivalent test-only
alignment on this branch. Merge resolution retains the App Updates locale and
fixture together with main's wish-selection translations. Existing route,
Settings, browser inventory and dependency-documentation updater integrations
remain bounded to this isolated channel. No assertion or timeout is weakened.

Reuse the existing fixed-source plan, original signer, protected unattended
`android-test-release` Environment, Capacitor/Gradle packaging, native installer
and bounded public catalog. No dependency, permission, secret or signing-custody
change is requested. Public release assets contain only APK bytes, build metadata
and synthetic acceptance evidence, never user content or credentials.

## Business and cross-cutting review

Retain accepted main's versioned business/freemium matrix and capability checks.
New Passport composition remains under `relationship.passport`; retained
artifacts and essential client updates retain their existing readable/Free/Core
contracts. Wish-selection ownership, privacy and entitlements remain server-owned.
Packaging adds no billing, quota, retention, downgrade or Cloud/Self-Hosted change.

Preserve source reauthorization, tenant isolation, encrypted private drafts,
media concealment, transfer/invalidation and task-return behavior. The APK does
not configure local inference or regenerate stored editions. Updated narration
requires the matching worker deployment; actual model quality/latency and
1000-couple capacity are not established by packaging tests.

The independent private server channel must deploy the matching backend and
additive migration 0094. APK publication does not attest Arcane deployment.
Localized notes disclose this dependency. No reset/bootstrap is part of delivery.

## Validation and immutable publication

Keep the published test.30 plan selected while this source is checked. Require all
32 named exact-source checks and applicable workflows: Android APIs 28/36/37.1,
browser critical/changed groups, backend integration, security, build artifacts,
provenance, Product Design and Reuse. Diagnose failures before fixes or targeted
same-commit retries; every code/test fix requires fresh relevant source checks.

Only after acceptance, select this frozen source as `0.2.0-test.31`, code `31`,
predecessor `0.2.0-test.30`, in a separate plan-only commit on allowlisted
`release/android-test.14-20261026`. Preserve package `de.sidebyside.app`, certificate
`b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472`, regular-mode
`https://demo.eimir.ur-cloud.de`, disabled Demo/reset behavior and existing assets.

The protected publisher verifies the predecessor signer, unsigned assembly/lint
and actual policy/catalog tests, then the signed source/package/version and
higher-version upgrade identity. Stage exactly four assets, upload the update
marker last, publish once and verify anonymous bytes/hashes and embedded identity.

Physical update/session/data continuity, TalkBack/IME/OEM, App Links and store
acceptance remain device acceptance. Update through Settings → App Updates on the
existing installation; do not uninstall or clear app data.

# Android test.46 integration

The Product Owner requested a new test release from the latest main through the
usual channel on 2026-11-05 (Europe/Berlin). The inspected baseline is
`426f6ef4f23aee9e633cbfaaf336c4fe31f5f1fb`, including merged #1646, #1650,
#1652 and #1654. Normally merge this baseline into the existing temporary updater
foundation. The standing draft #1443 remains against its release base; never merge
the temporary updater foundation into main.

## Scope and reuse

Reuse the allowlisted `release/android-test.14-20261026` branch, existing release
plan, protected `android-test-release` publisher, canonical `de.eimir.app` package
and signing certificate, `eimir-production` Firebase client, persistent regular
test API origin and removable updater. Published test.45 is the same-package and
same-signer predecessor. Signing credentials remain within the protected publisher.
No new dependency, provider, update mechanism or signing path is introduced.

Main provides shared-worker normalization for common HEVC/HDR recordings,
authorized preview reuse after restart, complete alphabetical Wishes, native
Diary safe-area scrolling, full-width retrospective stories, distinct shared
answer surfaces, consumed current attention, corrected Diary Happiness markers
and concealed sensitive previews. Backend runtime, migrations, generated API and
native acceptance match main. Resolve only adjacent updater/new acceptance fixture
and browser-inventory entries, preserving both entries and both ownership maps.

Product Reference v1 and the existing #1331 updater Mobile Interaction Contract
remain authoritative. Accepted main references and evidence include
`docs/product/design/references/app-continuity-polish/` and
`docs/product/design/references/1653-diary-preview/`. Packaging authors no new
product composition. Preserve Compact/Expanded, Light/Dark, large text, reduced
motion, draft/return behavior, authorization and sensitive-media classification.

**No business/freemium impact:** release packaging preserves main's authoritative
feature matrix, Space capability boundaries, managed-resource limits and
non-destructive downgrade/export/existing-data rights. The test updater remains
Free/Core maintenance. No store or general production rollout is requested.

## Freeze and publication acceptance

Keep `.github/android-test-release.json` on published test.45 while validating
the integrated source. Require all publisher-defined exact-source checks plus
the affected real-codec/video acceptance. Missing, pending, skipped, cancelled or
failed required work cannot substitute for success. Retain both complete browser
inventories and the independent Android matrix; do not weaken any gate.

After acceptance and compatible-server readiness, select the frozen source in
a separate plan-only commit for `0.2.0-test.46`, versionCode 46 and predecessor
`0.2.0-test.45`. The publisher verifies exact-source checks, unsigned sideload
assembly/lint/unit tests, canonical signing, actual APK identity and predecessor
compatibility. It stages all four assets as a draft, uploads the marker last,
publishes the complete immutable prerelease and verifies all anonymous bytes.
Report publication only after that workflow and an independent public read pass.

The separate private runtime channel advances main only through its own exact
source gates. Git publication alone does not prove Arcane deployment. Observe
public Web/API revision and readiness without modifying or resetting runtime
data. Physical-device in-place installation, session/Space/data continuity,
OS App Links and actual push delivery remain separate observed acceptance.

# Android test.32 — current main, relationship surfaces and native navigation

The Product Owner requested a new test release from the latest main on
2026-10-31. Accepted main `f7660401c60552bb8d8b33a72d98040f96bbf4c5`
is retained as the frozen main baseline in this candidate's merge ancestry.
The test-only delivery repair in #1552 is integrated without runtime changes.
Preserve draft PR #1443
as the private test foundation; never merge it into main. Published test.31 and
all previous release assets remain immutable.

## Scope and existing product evidence

Package the accepted shared product, including #1547 relationship-surface
refinements, Pro saved-memory map, finite couple games, dated Plan calendar
handoff, multiweek observations and private weekly feedback; #1548 responsive
native cold launch and shared primary-tab motion; and #1550 keyboard tab ordering.
No additional product UI or native capability is implemented for packaging.

The initial candidate `0a4bf36d84afc8f93ba77e5837a55df39955ef27` was rejected
by three deterministic changed-browser cases, also seen in main's full regression.
Two stale assertions still required the optional Memory title after narrative and
media despite #1547's accepted title-first contract. The third measured a mouse
drag handle at y=577.5 in a 600px viewport, behind fixed mobile navigation, so the
gesture never reached the handle. Align the asserted title/date/narrative/media/
visibility/action sequence with the accepted product and center/actionability-check
the handle before both raw mouse gestures. Preserve actual reorder persistence,
normal row scrolling, edge autoscroll, geometry, accessibility and every timeout.
No runtime code changes and no manual same-commit retry are used for these fixes;
the corrected candidate requires fresh exact-source checks.

Retain accepted main's Product Reference v1 and owning generated preflights,
interaction contracts and actual Compact/Expanded, Light/Dark, large-text,
reduced-motion and sparse-state evidence under
`docs/product/design/references/1546/` and
`docs/product/design/evidence/1549/`. Existing Passport playback evidence under
references/1542 and App Updates evidence under references/1331 remain applicable.

Resolve the two integration conflicts by retaining both App Updates and main's
calendar translations, and preserving the updater imports while accepting main's
removal of the unused Settings route import. No assertion, timeout, grouping,
permission or source-selection gate is weakened.

## Reuse and business/freemium review

Reuse the existing protected fixed-source publisher, original signer,
Capacitor/Gradle packaging, Android installer and bounded anonymous release
catalog. Alternatives are the product/store publisher or a new distribution
service; neither is needed for this existing private test installation. Existing
GitHub Actions/Releases, Android and Capacitor retain their accepted licenses,
privacy boundaries, build/storage costs and fallback behavior. No new provider,
dependency, secret, signing-custody decision or end-user setup is introduced.

Business/freemium impact reviewed: retain accepted main's versioned matrix and
server-owned capability boundaries. The memory map and weekly extensions retain
their owning Premium/Mixed classifications; ordinary client access, secure
updates, privacy, existing data and essential export retain their existing
Free/Core or non-paywallable contracts. Packaging changes no entitlement, billing,
quota, ownership, retention, downgrade or Cloud/Self-Hosted behavior.

## Cross-cutting and server deployment

Preserve package `de.sidebyside.app`, certificate
`b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472`,
regular persistent origin `https://demo.eimir.ur-cloud.de`, disabled Demo/reset
behavior, session/draft safety, tenant isolation, media concealment and source
reauthorization. Release assets contain only APK bytes, distribution/build
metadata and synthetic acceptance evidence, never user content or credentials.

The independent main publisher and Arcane Git Sync remain the sole server
promotion route. The matching backend/worker and additive migration 0095 must
deploy before the new server features are usable. Verify public Web/API source
and readiness independently. Do not reset/bootstrap the instance, replace keys,
edit operator settings or configure local inference. APK publication does not
prove model quality/capacity or physical-device installation.

## Validation and immutable publication

Keep the already published test.31 plan selected while this candidate is checked.
Require all 32 named exact-source checks and applicable workflows, including
Android APIs 28/36/37.1, browser critical/changed groups, backend integration,
security, build artifacts, provenance, Product Design and Reuse. Diagnose failures
before any targeted retry; fixes require a new checked source revision.

After acceptance, select this frozen source as `0.2.0-test.32`, versionCode `32`,
with `0.2.0-test.31` as predecessor, in a separate plan-only commit on existing
allowlisted `release/android-test.14-20261026`. The localized
[update notes](android-test-0.2.0-test.32-notes.txt) must already exist in the source.

The sole protected unattended publisher verifies the predecessor signer,
unsigned sideload assembly/lint and policy/catalog tests before signing; then
checks the signed APK's exact source, package, certificate, version and monotonic
upgrade identity. Stage exactly four draft assets, compare downloaded bytes,
upload the marker last, publish once, and independently verify all anonymous
assets, checksums and embedded regular-mode build identity.

Update the existing installation through Settings → App Updates. Physical
upgrade/session/data continuity, TalkBack/IME/OEM behavior, OS App Links and store
acceptance remain separate device acceptance. Do not uninstall or clear data.

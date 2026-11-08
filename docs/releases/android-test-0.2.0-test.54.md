# Android test.54 integration

The Product Owner requested the next test release on 2026-11-08 (Europe/Berlin), after merging #1698. The inspected main baseline is `04d625cc68bc960c92b990fa6c3a75fe534f32d6`.

## Scope and reuse

Integrate accepted main into the standing `release/android-test.14-20261026` delivery source. Reuse its release plan and sole protected `android-test-release` publisher. Retain `de.eimir.app`, its canonical signing certificate, `eimir-production`, the persistent regular test origin, removable updater and published test.53 as the same-package/same-key predecessor. No new dependency, provider, permission, signing identity or publication path. Keep this delivery foundation separate from main.

## Product, business and cross-cutting review

Package the accepted #1698 correction: shared filled canonical-blue add pills, plus icons and visible localized labels across Planning, Moments, People, important days, tags, media, places, chapters, profiles, shared/private lists and contextual insertion. Main's updated component contract supersedes the earlier circular-only interpretation. Product Reference v1, the existing #1331 updater Mobile Interaction Contract and current-main product contracts remain authoritative. Packaging introduces no new composition.

The [source-bound Compact/Expanded, Light/Dark and text-scaling evidence](https://github.com/baerenmarke90/eimir/blob/03a90e7f726d438a7e88a39de45167909bd1e587/docs/product/design/references/1697-add-actions/evidence/README.md) belongs to accepted #1698. Preserve native input/link semantics, visible labels, pending dimensions, focus, drafts and save/result/Back behavior. Main's Date-only monthly-fixture correction is identical to the existing test.53 correction; do not duplicate it. Three-way merge only the changed English product labels and retain the sideload updater locale subtree. Existing unrelated #1695 and #1690 remain separate findings.

**No business/freemium impact from packaging:** preserve main's feature matrix, Space-scoped entitlements, authorization, private visibility and retained-content/export rights. Official maintenance remains Free/Core. No API, schema, migration, runtime-data or credential change.

Do not read/reset runtime data, sessions, memberships or credentials. Signing material stays in the protected publisher; Demo/reset remain disabled. The separate exact-main Web/API publisher must select and deploy matching main. No settings, branch allowlist, assertions or required checks are weakened.

## Candidate and publication acceptance

Keep the plan on published test.53 while validating the integrated source. Freeze the candidate only after all 32 publisher-defined named checks succeed, including backend/browser acceptance, Android API 28/36/37.1, release contracts, artifacts, provenance and security. Missing, pending, failed, cancelled or skipped required work blocks signing/publication.

Run focused merge/locale/release preflight before pushing; hosted jobs supply pinned Android SDK/emulators and services. After exact-source validation, use a separate plan-only commit for `0.2.0-test.54`, versionCode 54, predecessor `0.2.0-test.53` and notes already committed in the frozen source. The existing publisher checks unsigned sideload assembly, lint and actual policy/catalog JVM tests before protected signing, then verifies package/signer/predecessor/Firebase/source identity, stages four draft assets with the update marker last, publishes the immutable prerelease and verifies anonymous assets/catalog.

Main's initial media jobs failed before codec analysis when the pinned FFmpeg source download returned HTTP 503/504. Retry only those diagnosed failed jobs at unchanged main; preserve successful checks. Exact-source Android candidate validation remains independent. Record any further diagnosed retry and final checks/publisher/release/downloads in standing delivery PR #1443.

Physical-device installation/login, session/Space/data continuity, native permissions, OS App Links and actual push delivery remain device acceptance. The delivery PR stays draft and unmerged.

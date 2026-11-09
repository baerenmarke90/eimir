# Android test.57 integration

The Product Owner requested the next test release on 2026-11-09
(Europe/Berlin), after merging #1703 and #1706 at current main
`ec309e23c86f3a7e6c79b81d2eb5422bfeb93db2`.

## Scope, source and reuse

Integrate main into the standing `release/android-test.14-20261026` delivery
head `651241ad35f5ac70464b611e8d22ab3a6f0cfbc3`, following published test.56.
The common product baseline is `3ecbbe162f31893951f7512cb40e5c77cdc8949c`.
Preserve all current main changes and the standing sideload updater.
The German browser fixture has adjacent independently added objects:
retain both `appUpdates` and `planLinkedLists`. Preserve both browser
inventory ownership entries and English updater/product translations.
No production behavior is invented during packaging.

Reuse the sole protected plan-driven publisher, canonical package
`de.eimir.app`, canonical signer, `eimir-production`, persistent regular
test origin and removable updater. Published test.56 is the same-package,
same-key predecessor. No new publication path, dependency, provider,
branch allowlist or protection change. Keep the delivery foundation draft
and unmerged against its existing release baseline.

## Product, business and cross-cutting review

Package #1703's general native video file-size admission fix and truthful
pending-upload/recovery feedback. Package accepted #1706: typed links from
Plans to existing shared lists with progress and scoped open/return;
Place continuity into Memory/HeartMoment capture; and Open / Completed /
All shared-list scopes. Plan and list completion remain independent.
Reuse Product Reference v1, canonical capture/selection/Planning contracts
and [source-bound feature evidence](https://github.com/baerenmarke90/eimir/blob/18663fe876f722bda1367be60d56450e86568a36/docs/product/design/references/1705-plan-lists/README.md).
Packaging adds no further product composition or native capability.

Retain same-Space authorization, shared/private ownership, private
HeartMoment location snapshots, source/session fencing, manual-selection
and recovered-draft priority, scoped query invalidation, localized
accessible status, text scaling and reduced motion. Main adds compatible
API/generated-client changes and additive migration 0118. Deploy matching
API/media roles through the separate exact-main runtime channel; preserve
the existing environment, credentials and stores. Do not reset user data.

No additional business/freemium impact from packaging. Plan lifecycle,
shared lists and ordinary authored Place relations remain Free/Core.
Existing video admission remains Pro; retained reads, privacy, deletion
and essential export stay available. No entitlement, quota, retention,
provider, cost-model, downgrade or Cloud/Self-Hosted behavior is changed.

## Candidate and publication acceptance

Keep the plan on verified test.56 while validating this integrated source.
Commit these notes before freezing the candidate. Run unchanged helper/plan
regressions and verify the three-way integration, source preservation,
merged JSON inventories/locales and updater/native hook retention.
Require every publisher-defined named source check, including backend,
browser, Android API 28/36/37.1, artifacts, security and provenance.
Missing, pending, failed, cancelled or skipped required work blocks signing.

After exact-source acceptance, one separate plan-only commit selects
`0.2.0-test.57`, versionCode 57, predecessor `0.2.0-test.56` and the notes
already committed in the frozen source. The existing publisher verifies
canonical/predecessor signing continuity, unsigned sideload assembly,
lint and actual updater JVM tests before protected signing. It verifies
signed package/Firebase/source identity, stages four complete draft assets
with the update marker last, publishes the immutable prerelease and checks
anonymous bytes/catalog. Independently verify hashes and source binding.

Record the exact candidate, validation, any diagnosed retry, orchestration,
publication run, release and APK in standing delivery PR #1443.
No speculative reruns, assertion/deadline changes or weakened gates.
Physical-device installation/login, session/Space/data continuity,
permission/App Link and actual live behavior remain device acceptance.

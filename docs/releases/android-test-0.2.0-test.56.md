# Android test.56 integration

The Product Owner requested the next test release on 2026-11-08
(Europe/Berlin), immediately after merging #1702 at main
`3ecbbe162f31893951f7512cb40e5c77cdc8949c`.

## Scope, source and reuse

Integrate main into the standing `release/android-test.14-20261026` delivery
head `806a280abb16c0c28bcd1edd1a200a9e9f3e68b1`, following published test.55.
The common baseline is `6d1c61d70617fda782dd6e64ed74d5d3470c2d46`.
Preserve all 98 changed main files and the standing sideload updater.
The five shared files merge without conflicts: native launcher workflow,
MainActivity, browser group/impact inventories and the English locale.
The main production changes remain intact while the existing test plugin,
release gates, updater journeys and translations are retained.

Reuse the sole protected plan-driven publisher, canonical package
`de.eimir.app`, canonical signer, `eimir-production`, persistent regular
test origin and the removable updater. Published test.55 is the verified
same-package/same-key predecessor. No new signing or publication path,
dependency, provider, branch allowlist or protection change. The delivery
foundation remains draft and unmerged against its existing release baseline.

## Product, business and cross-cutting review

Package accepted #1702: immediate pending video save, Android-owned background
transport and generic progress, a universal 1080p stored-video ceiling, inline
Place trash, typed relation links, internal map navigation/zoom/filter/reset,
and complete alphabetical wish selection.
Reuse Product Reference v1, the existing capture/reader/map contracts and
[the source-bound feature evidence](https://github.com/baerenmarke90/eimir/blob/c9b8c696ee18397bc872787f268761730c7209cf/docs/product/design/references/media-background-context/README.md).
This packaging introduces no further product composition or native capability.

Retain shared/private authorization, Space-scoped entitlements, pending-byte
read denial, saved-gallery ordering, sensitive media, cancellation/session
ownership, bounded staging, localized accessible status and reduced motion.
The accepted main change records its API/DTO and media-worker consequences.
No database migration is required; deploy the matching API and restricted
media worker together through the separate exact-main private channel.
Do not read/reset user content, memberships, sessions or credentials.
Browser tab closure/reload and Android force-stop/reboot are not promised
as resumable transfers.

No additional business/freemium impact from packaging. New video admission
remains Premium; ordinary capture, Places and retained authorized media,
privacy, deletion and essential export remain Core. Existing input/gallery
limits, bounded staging, downgrade behavior, operating costs and Cloud/
Self-Hosted parity remain as reviewed in #1702.

## Candidate and publication acceptance

Keep the plan selecting already published test.55 while validating this
integrated source. Commit these notes before freezing the candidate.
Run the unchanged release helper/plan preflight and verify the three-way
merge, JSON inventories, exact main file preservation and parent lineage.
Require all 32 publisher-defined named source checks, including backend/
browser, Android API 28/36/37.1, release contracts, artifacts, security and
provenance. Missing, pending, failed, cancelled or skipped required work
blocks signing/publication.

After exact-source acceptance, one separate plan-only commit selects
`0.2.0-test.56`, versionCode 56, predecessor `0.2.0-test.55` and the notes
already committed in the frozen source. The existing publisher verifies
canonical/predecessor signing continuity, unsigned sideload assembly, lint
and actual updater JVM tests before protected signing. It verifies the signed
APK/package/Firebase/source, stages the four draft assets with the update
marker last, publishes the immutable prerelease and checks anonymous bytes
and catalog. Independently verify public identity, hashes and source binding.

Record the exact candidate, actual validation, diagnosed retries if any,
orchestration, publication run, release and APK in standing delivery PR #1443.
No speculative reruns, assertion/timeout changes or weakened gates.
Physical-device installation/login, session/Space/data continuity, permission/
App Link handling and actual live notification delivery remain device acceptance.

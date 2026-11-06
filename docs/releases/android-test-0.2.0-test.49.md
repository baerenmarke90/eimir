# Android test.49 integration

The Product Owner explicitly requested publication of a new test release on
2026-11-06 (Europe/Berlin). The inspected main baseline is
`c5e15a4c29eb60adaec5a1d39f574fdc9b8c4d25`, including merged #1665, #1668 and #1669.
Integrate that exact main into the standing delivery branch without merging the
temporary updater foundation into main.

## Scope and reuse

Reuse `release/android-test.14-20261026`, its validated release plan and sole
protected `android-test-release` publisher. Preserve package `de.eimir.app`,
the canonical certificate, `eimir-production` Firebase client, persistent regular
test origin and removable updater. Published test.48 is the same-package and
same-key predecessor. No new provider, dependency, permission, key or publisher.

The three-way integration preserves accepted main behavior and the existing
test-channel foundation. Resolve the localization conflict by retaining main's
shared locale registry, adding the existing updater's German pack there and
supplying its complete English counterpart. Keep main's language resolution,
account preference, native recipient language and static offline resources.
Both browser inventories retain updater ownership and current main coverage.
No test assertion, timeout, retry policy, workflow gate or branch allowlist is
weakened.

## Product, business and cross-cutting review

Product Reference v1 and the existing #1331 updater Mobile Interaction Contract
remain authoritative. This packages accepted UI and translates the existing
update task without changing its composition or lifecycle. Main's source-bound
Compact/Expanded, Light/Dark, large-text and behavioral evidence remains under
`docs/product/design/references/1663/`, `1664/` and `1667/`; the updater reference
remains under `docs/product/design/references/1331/`.

**No business/freemium impact:** packaging preserves the versioned feature
matrix, Space-level eligibility, privacy, resource limits, retained-content
access, deletion and export rights. Localization and secure maintenance remain
non-paywallable. The existing Google source safety and Pro gates remain closed
where main requires them; this release does not enable the separate #1666 work.

Signing credentials stay exclusively in the established protected publisher.
Do not read or reset runtime data, credentials, sessions or memberships. Checks
bind the clean embedded source, increasing code, actual signature, predecessor,
Firebase resources and immutable public bytes. This channel is regular persistent
operation with Demo/reset disabled. The main runtime adds migration 0112 for
personal language preferences; Web/API compatibility and live revision must be
reported separately from APK publication.

## Candidate and publication acceptance

Keep the release plan on published test.48 during integrated-source validation.
Freeze the source only after every publisher-defined named source check passes,
including backend integration/security, browser shards and owned specs,
Android API 28/36/37.1, release contracts, artifacts and provenance. Missing,
failed, skipped, pending or cancelled required checks block publication.
Run focused local release, localization, type/build and merge preflights first;
hosted CI supplies Android SDK/emulator and service acceptance unavailable locally.

Select the accepted frozen source in a separate plan-only commit for
`0.2.0-test.49`, versionCode 49, predecessor `0.2.0-test.48`, with the notes already
present in that source. The publisher validates unsigned sideload assembly,
lint and actual policy/catalog JVM tests before canonical signing. It verifies
the predecessor, stages all four assets draft-first and marker-last, publishes
the complete immutable prerelease and verifies anonymous public bytes/catalog.

Verify the separate checked-main backend/Web/video runtime channel and live
Web/API readiness before claiming deployment. No Arcane access or runtime reset
is part of this task. Physical-device in-place installation, session/Space/data
continuity, OS App Links and actual push delivery remain separate acceptance.

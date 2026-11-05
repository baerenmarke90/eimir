# Android test.47 integration

The Product Owner requested an immediate new test release from freshly merged
main on 2026-11-05 (Europe/Berlin), through the established publication channels.
The inspected baseline is `91a12b2eb87d9e95c9a7f4ff57bc7cb410ea4714`,
including merged #1656 and #1659. Integrate that exact main into the standing
temporary-updater branch; the updater foundation remains outside main.

## Scope and reuse

Reuse the existing allowlisted `release/android-test.14-20261026` branch,
release plan, protected `android-test-release` publisher, canonical
`de.eimir.app` package/signing certificate, `eimir-production` Firebase client,
persistent regular-mode test origin and removable updater. Published test.46
is the same-package/same-key predecessor. No dependency, provider, permission,
signing identity or publishing mechanism is added.

The three-way integration preserves all accepted main runtime, API, migration
0111 and native push-preview catalogue changes. Both current browser ownership
inventories and the updater entries survive. Locale fixture additions coexist;
the narrow historical-package classifier and all new main classifier fixtures
remain covered. Source assertions, timeouts, retry policy and independent gates
are unchanged.

## Product, business and cross-cutting review

Product Reference v1 and the existing #1331 updater Mobile Interaction Contract
remain authoritative. This packages the accepted main compositions without
authoring a new product surface. Current design and behavioral evidence lives
in `docs/product/design/references/planning-search-private-profile/` and
`docs/product/design/references/vibe-immich-clarity/`. Preserve Compact/Expanded,
Light/Dark, large text, reduced motion, authorized note reveal, native media,
draft safety and return context.

**No business/freemium impact:** packaging retains the versioned feature matrix,
Space-level capability/privacy boundaries, existing resource limits and
non-destructive downgrade/export rights. Main's Immich Pro eligibility and
Core capture/history remain unchanged. Only the authorized private test channel
is selected; store readiness is not established.

Signing credentials stay inside the established protected publisher. Runtime
data, login sessions and private credentials are neither read nor reset.
The same-package signed predecessor, increasing code, clean embedded source,
Firebase resources, strict dependencies and immutable assets are verified.

## Candidate and publication acceptance

Keep the plan on published test.46 during source validation. Freeze the
integrated candidate only after all 32 publisher-defined exact-source checks
succeed, including all four browser shards, complete additional owned specs,
backend integration, security, Android API 28/36/37.1, release contracts and
provenance. Missing, failed, skipped, pending or cancelled required work cannot
admit publication. Existing meaningful release and merge preflights supplement
the remote source gates.

Then select that immutable source in a separate plan-only commit for
`0.2.0-test.47`, versionCode 47, predecessor `0.2.0-test.46`, and this source's
release notes. The sole publisher verifies unsigned sideload assembly, actual
policy/catalog JVM tests and lint before protected signing, verifies the
canonical key and predecessor, stages all four assets draft-first/marker-last,
publishes atomically and verifies every anonymous public byte.

The separate private runtime publisher advances backend/Web/video images and
`deploy/eimir-test` only through its existing main gates. Verify its source,
successful image publication and public Web/API health/revisions before
claiming runtime delivery. No Arcane access or runtime reset is part of this task.
Physical-device in-place installation, session/Space/data continuity, OS App
Links and actual push delivery remain separate observed acceptance.

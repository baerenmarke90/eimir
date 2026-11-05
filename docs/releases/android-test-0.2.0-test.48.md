# Android test.48 integration

The Product Owner requested a new test release on 2026-11-05 (Europe/Berlin).
The inspected main baseline is `c37d427f2b7b914b3dbc86cbe218c92df0bb7d56`,
including merged #1662. Integrate that exact main into the standing delivery
branch; the temporary updater foundation remains outside main.

## Scope and reuse

Reuse `release/android-test.14-20261026`, the validated release plan and sole
protected `android-test-release` publisher. Preserve the canonical `de.eimir.app`
package and certificate, `eimir-production` Firebase client, persistent regular
test origin and removable updater. Published test.47 is the same-package and
same-key predecessor. No new dependency, provider, permission, key or publisher
is introduced.

The three-way integration preserves main's accepted runtime and the existing
test-channel foundation. Both browser ownership inventories retain the new
More-return destinations and the updater coverage. Previously corrected Today
system-context and Android selector fixtures remain intact. No test assertion,
timeout, retry policy, branch allowlist or protected gate is weakened.

## Product, business and cross-cutting review

Product Reference v1 and the existing #1331 updater Mobile Interaction Contract
remain authoritative. This packages accepted main UI without composing a new
surface. The latest Compact/Expanded, Light/Dark, large-text and interaction
evidence is in `docs/product/design/references/1661/`. Preserve smartphone
reachability, direct device selection, existing optional external sources,
draft safety, gallery controls and More-origin return context.

**No business/freemium impact:** packaging preserves the versioned feature
matrix, Space-level eligibility and privacy, resource limits, retained-content
access, deletion and export rights. Core planning/media/navigation and existing
Pro integration boundaries remain unchanged. This selects only the authorized
private test channel and does not establish store readiness.

Signing credentials remain inside the established protected publisher. Runtime
data, login sessions and private credentials are not read or reset. Checks bind
the clean embedded source, increasing code, actual signature, predecessor,
Firebase resources and immutable public asset bytes.

## Candidate and publication acceptance

Keep the plan on published test.47 while validating the integrated source.
Freeze that source only after all 32 publisher-defined named source checks
succeed, including backend integration, security, four browser shards,
additional owned specs, Android API 28/36/37.1, release contracts and provenance.
Missing, failed, skipped, pending or cancelled required work blocks publication.
Run the existing relevant local release and merge preflights before pushing.

Select the accepted immutable source in a separate plan-only commit for
`0.2.0-test.48`, versionCode 48, predecessor `0.2.0-test.47`, and the notes file
already present in that source. The existing publisher verifies unsigned
sideload assembly, lint and actual policy/catalog JVM tests before protected
signing. It verifies the canonical signer and predecessor, stages four assets
draft-first and marker-last, publishes the complete prerelease atomically and
verifies all anonymous public bytes and updater-catalog selection.

The separate main publisher advances checked backend/Web/video images through
its existing runtime gates. Verify its source, successful publishing run,
channel commit and public Web/API readiness before claiming runtime delivery.
No Arcane access or runtime reset is part of this task. Physical-device in-place
installation, session/Space/data continuity, OS App Links and actual push
delivery remain separate observed acceptance.

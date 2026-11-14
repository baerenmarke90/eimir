# Android test.55 integration

The Product Owner requested merge and the next test release on 2026-11-08
(Europe/Berlin). PR #1700 is merged at main
`6d1c61d70617fda782dd6e64ed74d5d3470c2d46`.

## Scope and reuse

Integrate accepted main into the standing `release/android-test.14-20261026`
delivery source after published test.54. Reuse the release plan and sole protected
`android-test-release` publisher. Preserve package `de.eimir.app`, its canonical
signing certificate, `eimir-production`, the persistent regular test origin and
the removable updater. Published test.54 is the same-package/same-key predecessor.
No new dependency, provider, permission, signer or publication path. Keep this
delivery foundation separate from main.

## Product, business and cross-cutting review

Package accepted #1700: Lists and Places keep their existing labeled blue add
actions at the left content edge below the title, before filters/content.
The bounded shared-content hover correction keeps linked moment text readable
in Dark. Preserve the existing task, draft, native input/ref/focus, save/result/
return, filter and privacy contracts. No new composition or native capability.
Product Reference v1, the #1697 add contract and #1331 updater Mobile Interaction
Contract remain authoritative.

The [immutable source-bound design evidence](https://github.com/baerenmarke90/eimir/blob/f6fa5faf6657d7646384d52fbc568b02ba2eeb63/docs/product/design/references/1697-add-actions/1700-alignment-evidence/README.md)
contains all twelve Compact/Expanded, Light/Dark and large-text overview captures.
Accepted feature source `3092f971cf178b6e9c8f08bf2d211116f95b77cc` passed 2,771
Web tests and 208 browser cases, including explicit hover contrast, actual button
geometry and complete creation/result/return journeys. Packaging source acceptance
remains a separate exact-source gate.

**No business/freemium impact from packaging:** preserve the versioned feature
matrix, Free/Core maintenance, Space-scoped entitlements, ownership, private
visibility, retained content and essential export. No quota, managed-resource,
operating-cost, data-lifecycle or Cloud/Self-Hosted boundary change. No API,
schema, migration or runtime credential change.

Do not read/reset runtime data, sessions, memberships or credentials. Keep Demo
and reset disabled. Signing stays in the existing protected publisher. The
separate exact-main Web/API channel must select and deploy matching main.
No workflow, assertion, required check, branch allowlist or protection changes.

## Candidate and publication acceptance

Keep the release plan selecting already published test.54 while validating the
integrated source. Commit these notes before freezing the candidate. Require all
32 publisher-defined named source checks, including backend/browser, Android
API 28/36/37.1, release contracts, artifacts, security and provenance. Missing,
pending, failed, cancelled or skipped required work blocks signing/publication.

After exact-source acceptance, use one separate plan-only commit selecting
`0.2.0-test.55`, versionCode 55, predecessor `0.2.0-test.54` and the notes in the
frozen source. The existing publisher verifies predecessor/canonical signing,
unsigned sideload assembly, lint and actual policy/catalog JVM execution before
protected signing. It verifies the signed APK/package/Firebase/source, stages
the four draft assets with the update marker last, publishes the immutable
prerelease and verifies anonymous assets/catalog. Independently verify the same
public bytes and source binding afterward.

Record exact source, validation, any diagnosed targeted retry, publication run,
release and APK in standing delivery PR #1443. Physical-device installation/login,
session/Space/data continuity, OS permissions/App Links and actual push delivery
remain device acceptance. The delivery PR stays draft and unmerged.

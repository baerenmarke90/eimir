# Android test.28 — App composition and media continuity

The Product Owner requests a new published Android test release after PR #1518
merged into main at `9fd0c0a64fa72efd1e8f5eec5575386b0251d177`.
Integrate that main as an explicit parent of the existing isolated test source.
Draft foundation PR #1443 remains isolated and must not merge into main.

## Scope and existing contracts

Package the accepted More/Settings, Modern Wir, Diary, quote preferences, monthly
highlights, Memory/Place editing and authorized media continuity changes from
#1518. The normative composition, generated references, screenshots, behavior,
accessibility, large-text and cache lifecycle evidence remain in
[the reviewed delivery record](../product/design/1517-cloud-checkpoint.md) and
[acceptance evidence](../product/design/evidence/1517-app-composition/README.md).

The only integration overlap is SettingsIndex and SettingsPage. Retain the
existing test-only updater adapter, summary, route and capability filter while
applying main's icon-led settings composition and conditional eyebrow. The
existing settings icon also represents the test-only update destination.

Reuse review relevant: use the existing Capacitor wrapper, native updater,
fixed-source plan and protected publisher. No provider, dependency, signing key,
package, account, distribution channel or new runtime capability is added by
packaging. Business/freemium impact reviewed: the accepted #1518 classification
and cache/resource bounds apply unchanged; the existing updater remains confined
to the temporary test channel. Cloud/Self-Hosted authorization, Account/Space
ownership, export and downgrade behavior remain unchanged.

The current authorized session remains required before cached media delivery.
No offline-media authorization, local encryption, physical-device upgrade,
session continuity, OS App Links or store acceptance is claimed by packaging.
Publishing matching Web/API images does not establish Arcane deployment; no
server reset, data deletion or configuration change belongs to APK publication.

## Immutable release sequence

Freeze the integrated source and these localized notes while leaving the
published test.27 selection unchanged. Wait for all 32 required exact-source
named checks, including PostgreSQL shards, browser groups and changed browser
specs, Android APIs 28/36/37.1, security, artifacts and provenance.

After rechecking the public catalog for monotonicity, select `0.2.0-test.28`,
code `28`, predecessor `0.2.0-test.27` in a separate plan-only commit.
Use only allowlisted `release/android-test.14-20261026` and the existing
unattended `android-test-release` Environment. Preserve package
`de.sidebyside.app`, certificate
`b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472`,
regular-mode `https://demo.eimir.ur-cloud.de`, disabled Demo/reset behavior,
and immutable prior assets.

The existing publisher verifies source checks, predecessor signer, unsigned
assembly, sideload lint and catalog/policy tests; it then confirms the protected
original signing certificate and verifies the signed APK's package, source,
version and upgrade compatibility. Stage all four assets as a draft, upload the
marker last, publish the complete immutable prerelease and verify anonymous
asset bytes, hashes, marker and embedded identity. Preserve all existing gates.

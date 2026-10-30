# Android test.27 — Plan photo galleries and accepted main

The Product Owner requests implementation, merge and a new published test release
from latest accepted main, with full authorization. Main `44cd3d59bd33a47472b320025efd6bc9ab22a26d` includes
#1513 (Wir/quote, diary month headings and rediscovery polish) and #1515 (ordered
Plan photo galleries). Integrate that main as an explicit parent of the existing
isolated test source. The updater foundation PR #1443 remains a draft and must
not merge into main.

## Product and quality scope

Package the accepted UI unchanged. The normative gallery preflight, generated
reference and actual Compact/Expanded Light/Dark/large-text behavioral evidence
are in [the gallery contract](../product/design/references/plan-photo-gallery/README.md)
and [acceptance evidence](../product/design/references/plan-photo-gallery/evidence/README.md).
The first photo remains the cover; viewing reuses the Memory carousel, full-screen,
keyboard, touch and Back lifecycle. Reordering, classification and removal are
staged until one atomic save. Existing Plan lifecycle, shared privacy and native
session/data continuity remain intact.

Reuse review relevant: use the existing Capacitor package, native updater,
fixed-source plan and protected publisher. No new dependency, provider, account,
configuration, distribution channel or signing key is added by packaging.
Business/freemium impact reviewed: ordinary Plan galleries stay Free/Core with
the existing 20-image/500 MiB collection safety boundary and Cloud byte quota.
Existing Space grants, downgrade retention, Cloud/Self-Hosted parity, media
ownership, export/restore and uploader offboarding remain as accepted in #1515.

The matching Web/API source must include additive migration 0092. The normal
private test channel publishes matching immutable Web/backend digests from this
main. Publishing/selecting a channel does not establish that Arcane has adopted
it; do not reset data or change server configuration as part of APK publication.
No manual installation or physical-device acceptance is claimed.

## Immutable release sequence

Freeze this integrated source and localized notes while leaving the published
test.26 selection unchanged. Wait for all 32 required exact-source named checks,
including four real PostgreSQL shards, four browser groups, changed browser specs,
Android APIs 28/36/37.1, security, artifact and provenance gates. Then select
`0.2.0-test.27`, code `27`, predecessor `0.2.0-test.26` in a separate plan-only
commit, after rechecking the public catalog for monotonicity.

Use only allowlisted `release/android-test.14-20261026` and the existing unattended
`android-test-release` Environment. Preserve package `de.sidebyside.app`, certificate
`b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472`, regular-mode
`https://demo.eimir.ur-cloud.de`, disabled demo/reset behavior and immutable prior
assets. The protected publisher verifies unsigned assembly/lint and native catalog
policy, checks predecessor/package/signer identity, signs the selected source,
uploads the marker last and atomically publishes the complete immutable prerelease.
Verify all four public assets, digests/sizes, marker, APK embedded source/version,
package and signer. Device installation/sign-in/App Links remain separate device
acceptance.

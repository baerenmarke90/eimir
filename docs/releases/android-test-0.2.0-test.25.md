# Android test.25 — current-main integration

The Product Owner requested a new published updater test release based on the
new main on 2026-10-29. The selected main is
`f35f82dbab2465fe337850a1e8db147f4eb3942a`, including accepted PRs #1499, #1500,
#1501 and #1502. Merge this revision into the existing allowlisted private
test branch; the updater foundation remains a draft and must never merge into main.

## Product scope and evidence

Package the accepted cozy Wir/media refinements, clear Today/countdown and docked
navigation, smartphone moment selection, native lifecycle/read continuity,
unified Plan editor/covers/map selection and richer Pro relationship passport.
No additional product behavior is implemented for this release. Preserve the
existing updater and combine its foreground checks with main's native focus
manager and minimize-on-root-Back behavior.

The accepted product references, Mobile Interaction Contracts and real rendered
evidence remain authoritative:

- [Wir and media](../product/design/references/1498/README.md).
- [Today and navigation](../product/design/references/today-clarity/README.md).
- [Moment selection](../product/design/place-moment-picker.md).
- [Continuity and passport](../product/design/native-continuity-and-passport.md).
- [Plan images and map selection](../product/design/plan-images-and-map-picker.md).
- [Final continuity/Plan validation](../product/design/references/native-continuity/validation.md).
- [Existing native updater](../ANDROID-TEST-UPDATES.md).

## Reuse, business and cross-cutting review

Reuse the existing React/Router/Query product UI, Capacitor packaging, native
installer/catalog, fixed-source plan and protected GitHub publisher. No additional
dependency, provider, account, secret, audience or distribution service is added
by packaging. Accepted main already documents Leaflet/OSM/Photon boundaries.

Business/freemium impact reviewed: packaging does not change the versioned
feature matrix. Native continuity, normal Plans/covers/place selection and secure
updates remain Free/Core; the passport and optional cosmetic choices keep their
existing Space-scoped Pro capabilities and non-destructive downgrade behavior.
Cloud/Self-Hosted parity, ownership, quotas, export and retention stay intact.

Preserve tenant/privacy and snapshot invalidation boundaries, localized truthful
loading/error/read-only states, reduced motion, focus, draft/conflict safety and
existing media cleanup. Main's additive migration 0091 and matching API must reach
the independent backend deployment for server-dependent features; APK publication
alone cannot prove host adoption. Do not reset data or alter server configuration.

## Release procedure

Commit the integrated source and localized notes while leaving the already
published test.24 plan unchanged. Wait for all 29 required named checks on the
exact integrated source, including real backend integration, browser, Android,
security and provenance gates. Then make a separate plan-only commit selecting
version `0.2.0-test.25`, versionCode `25`, predecessor `0.2.0-test.24` and the
checked source. Recheck the catalog before selection for monotonicity.

Use only the existing allowlisted `release/android-test.14-20261026` branch and
`android-test-release` Environment. Retain package `de.sidebyside.app`, certificate
`b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472`, regular
`https://demo.eimir.ur-cloud.de` origin, disabled Demo/reset behavior and immutable
earlier releases. The sole publisher verifies predecessor/package/signer identity,
unsigned validation, sideload lint and actual policy/catalog JVM tests, then builds
and signs the selected source. Assemble and byte-check the draft assets, upload
the marker last, and publish the complete immutable prerelease atomically.

Verify all four public assets against metadata, hashes, marker and embedded source
identity. Exercise the existing native catalog/offer policy above installed code24.
Physical installation, real sign-in, OS App Links and on-device session/data
continuity remain device acceptance and must not be claimed from publication.

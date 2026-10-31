# Android test.34 — clearer planning, consistent story heading and Vibe symbols

The Product Owner explicitly requested merging #1559 and publishing a new
Android test release. Accepted main: `850ab01c81fb9f2bed57bc54d8a8cf794508ffea`, selected after that merge.
Preserve the isolated test foundation in draft #1443; never merge that foundation
into main. Published test.33 and previous assets remain immutable.

## Accepted scope and product evidence

Package the shared Web product from accepted main: remove redundant calendar and
Wish explanations, preserve the complete empty-Wishes invitation, reuse the
common section-heading typography for Eure Geschichte, and replace ambiguous
Vibe drawings with four recognizable faces, a heart and a crescent. Include the
five source-verified public-domain relationship excerpts in the backend catalog.
The catalog is served by the installation API, so its additions require the
matching server deployment rather than APK installation alone.

No new product composition or native capability is authored for packaging.
Reuse Product Reference v1 R3/R4, existing Today/Plan Hub/Create contracts, the
pre-implementation review and Mobile Interaction Contract in #1558, and the
source-derived and actual-app evidence under `docs/product/design/evidence/1558/`
and #1559. Preserve Compact/Expanded, Light/Dark, large-text/reflow, reduced
motion, localized labels, focus/return, drafts, mutual reveal and failure recovery.

Retain App Updates and the release foundation. Keep the published test.33 plan
selected throughout candidate acceptance. Do not change publisher logic,
signing boundaries, test thresholds, assertions, retries, permissions or admission.

## Reuse and business/freemium review

Reuse the existing protected fixed-source publisher, GitHub Actions/Releases,
Capacitor/Gradle, original certificate, Android installer and native update catalog.
Existing platform licenses/terms, public distribution metadata, operator build and
storage costs, rate limits and offline/manual fallback remain applicable. No new
provider, dependency, secret, end-user setup or signing-custody change is needed.

Business/freemium impact reviewed: keep the authoritative matrix, Space-owned
server capabilities and quote preferences. Wish/Plan lifecycle remains Free/Core;
everyday Vibe remains the Core part of Mixed Vibe Check; Daily Quote remains
Premium `daily.quote`. Secure client updates remain non-paywallable maintenance.
No entitlement, ownership, billing, quota, managed resource, retention, downgrade,
restore, export or Cloud/Self-Hosted behavior is changed by packaging.

## Security, privacy and deployment

Preserve package `de.sidebyside.app`, original certificate
`b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472`,
regular persistent origin `https://demo.eimir.ur-cloud.de`, App Updates, disabled
Demo/reset behavior, session/draft safety, tenant isolation and media concealment.
Signing material remains exclusively in the protected GitHub Environment.
Public assets contain only APK/build/distribution metadata and synthetic evidence.

Main's existing Web/API publisher and Arcane Git Sync remain the sole server
promotion route. There is no backend schema or deployment configuration change.
Verify channel/source/readiness independently; do not reset/bootstrap the
installation, replace keys or edit operator settings. Publisher success alone
does not prove that the installation has deployed the selected revision.

## Exact-source acceptance and immutable publication

Require all 32 named source checks and applicable workflows, including launcher
APIs 28/36/37.1, browser critical/changed suites, backend integration, security,
artifacts/provenance, Product Design and Reuse. Inspect failures before targeted
same-commit retries; deterministic fixes require fresh source and checks. Never
transfer statuses from another revision. The recap test synchronization correction
in #1559 preserves every progression, pause, return, finish and no-loop assertion.

After acceptance, publish a separate plan-only commit on allowlisted
`release/android-test.14-20261026`, selecting the checked candidate as
`0.2.0-test.34`, versionCode `34`, above predecessor `0.2.0-test.33`. The localized
[update notes](android-test-0.2.0-test.34-notes.txt) already belong to that source.

The unchanged protected publisher verifies the predecessor signer, unsigned
sideload assembly/lint/catalog tests, original keystore certificate, signed
source/package/certificate/version/SDK identity and upgrade compatibility.
Stage exactly four draft assets, compare downloaded bytes, upload the marker
last, publish once, and independently verify anonymous asset digests, checksum,
embedded identity and actual APK signature with SDK build-tools 36.0.0.

Update the existing installation through Settings → App Updates. Physical-device
upgrade/session/data continuity, TalkBack/IME/OEM behavior, OS App Links and
public/Store acceptance remain separate from automated publication. Do not
uninstall or clear data.

# Android test.24 — overnight relationship package

The Product Owner authorized implementation of #504 (Free special-Plan countdown)
and #497 (Pro relationship passport), hourly observation of #1493/#1494, normal
merge of the three resulting PRs and a new signed test release before 07:00
Europe/Berlin on 2026-10-29. This delivery packages #1495, #1496 and #1497 together.
The release foundation remains a separate draft branch and never enters main.

## Product and acceptance

Sensitive overview images use the shared blur lifecycle; only the Privacy icon
reveals a preview, while card navigation retains canonical detail concealment.
Wir reuses the same authorized content and module preferences across personal
Warm (Free default), Modern and Classic (new Pro selections). Existing saved
cosmetics survive expiry; default reset is Free. Countdown metadata belongs to
the existing shared Plan and its confirmed versioned write contract. The Profile
passport uses live, shared-only aggregates behind its own Pro capability; private
content, underlying Free history, duration and data portability are preserved.

Generated preflight, Mobile Interaction Contracts, source fingerprints and real
Compact/Expanded/Light/Dark/large-text evidence live in the owning references:
[blur](../product/design/references/1493/README.md),
[countdown and passport](../product/design/references/504-497/VALIDATION.md), and
[personal Wir designs](../product/design/references/wir-layouts/VALIDATION.md).
Product Reference v1 R3/R4/R5 and the existing Today/Profile/Settings templates
remain authoritative. No duplicate dashboard, media pipeline or native UI is added.

## Reuse, business and cross-cutting review

Reuse the existing React/Router/Query primitives, versioned appearance store,
server entitlement authority, SQLAlchemy/PostgreSQL, Capacitor packaging, native
installer/update catalog and protected GitHub publisher. No new dependency,
provider, configuration, recipient, credential or managed-resource contract.
Matrix v1.7 records the explicit personal design/passport Pro boundaries. All
Free content/data, shared entitlement ownership, downgrade retention, membership,
privacy, no-store responses and ordinary Cloud/Self-Hosted parity remain intact.

Migrations 0089 and 0090 are linear and additive, with safe defaults for old rows.
The normal Cloud channel must publish/deploy the matching Backend and Web pair;
shipping APK bytes alone does not prove the server migration or API is available.
No database reset, Demo mode, audience or deployment secret changes are authorized.

## Release procedure

The initial source's Android 37.1 / 16K-page guest twice lost its test process
to Android's `LOW_MEMORY` killer before an assertion could run. Both captured
`ApplicationExitInfo` records report reason 3 with an empty crash buffer and
119/137 MB application RSS. The [two-attempt diagnostic run](https://github.com/baerenmarke90/eimir/actions/runs/40797829170)
is retained. API 28/36 and the real Android File-to-Web/API/worker/Place pipeline
passed on the same product code.

The release-only CI adjustment gives that guest 6144 MB rather than 4096 MB and
captures host/guest memory beside the existing process-exit evidence. It uses
the same standard public runner, system image, application and test assertions;
no test, timeout, platform or gate is removed. GitHub documents
[16 GB for the public Ubuntu runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
and Android supports this [explicit emulator RAM override](https://developer.android.com/studio/run/emulator-commandline).
All exact-source checks must run again on the adjusted source before selection.

Integrate accepted main into the existing allowlisted
`release/android-test.14-20261026`, preserving its native updater and publisher.
Commit this integrated source and the [localized notes](android-test-0.2.0-test.24-notes.txt)
while leaving the published test.23 plan unchanged. Wait for all 29 required named
checks on that exact source. Then make a separate plan-only commit selecting
`0.2.0-test.24`, versionCode `24`, predecessor `0.2.0-test.23`, and that checked
sourceRevision. Recheck the anonymous catalog before admission to avoid a reused
or non-monotonic version.

The sole protected publisher preserves `de.sidebyside.app`, original certificate
`b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472`, regular
`https://demo.eimir.ur-cloud.de` origin and existing user data. Earlier assets are
immutable. Verify the four public assets, their exact hashes, embedded source,
version/package/signer and the actual native catalog/offer policy above installed
Build23. Inspect the bundled CSS/JavaScript for all three compositions, countdown,
passport and icon-only sensitive reveal. Physical installation and real user
sign-in remain separately unverified until performed on the target device.

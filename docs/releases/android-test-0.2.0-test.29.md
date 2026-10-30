# Android test.29 — Primary-tab swipe navigation

The Product Owner authorizes merge of PR #1523 after its exact-head checks and
publication of a new Android test release with the requested RWN Messenger-style
primary-tab swiping. Integrate the accepted main as an explicit parent of the
existing isolated test source. Draft foundation PR #1443 remains isolated and
must never merge into main.

## Scope and reviews

Package horizontal navigation between Wir, Momente, Planen and Mehr from #1521
and #1523. Existing links and swipes share primary destination/history ownership.
Existing bounded TaskOriginProvider retains query, Timeline scroll and Planning
segment state. No hidden route trees, prefetch-all or added runtime dependency.
Content galleries/scrollers retain gestures at either edge and without overflow;
vertical scrolling, pull-to-refresh, controls, editing, selected text, dirty owners,
menus/modals and system edges retain priority. Details and secondary tasks remain
outside primary swiping. Cancellation, consumed clicks and reduced motion follow
[the accepted interaction and evidence](../product/design/evidence/primary-tab-swipe/README.md).

Reuse review relevant: retain existing Capacitor, native updater, fixed-source
plan and protected publisher. No additional package, signer, provider, dependency,
native capability, background task or persistent preference is added. Business /
freemium impact reviewed: essential navigation remains Core with the same Cloud
and Self-Hosted authorization and Account/Space ownership. No entitlement, quota,
cost, retention, downgrade, export, API or migration changes arise from packaging.

The only divergent integration file is the browser inventory: retain the existing
six App Updates cases while incorporating the six accepted primary-swipe cases.
The previous More heading correction and evidence match main byte-for-byte.
All other main integration entries use the accepted GitHub blobs directly.
Existing isolated updater, Settings composition, package and original signer stay
unchanged. Product Reference v1 and the accepted generated preflight/Compact,
Expanded, Light/Dark and reduced-motion evidence remain authoritative.

## Validation and immutable publication

Freeze this source and the localized notes while retaining the published test.28
plan. Wait for all 32 required named exact-source checks, all source workflows,
browser critical groups/changed specs, Android APIs 28/36/37.1, security, artifacts
and provenance. Real code failures require corrections and fresh checks; only a
proven transient same-commit failure permits a targeted failed-job retry.

After rechecking the release catalog, select `0.2.0-test.29`, code `29`, predecessor
`0.2.0-test.28` in a separate plan-only commit on allowlisted
`release/android-test.14-20261026`. Use the existing unattended
`android-test-release` Environment and protected fixed-source publisher.

Preserve package `de.sidebyside.app`, certificate
`b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472`,
regular-mode `https://demo.eimir.ur-cloud.de`, disabled Demo/reset behavior and
immutable predecessor assets. Verify predecessor identity, unsigned sideload
assembly/lint/policy/catalog tests, protected original signing certificate,
signed APK source/package/version and same-package higher-version compatibility.
Stage all four assets in a draft, upload the marker last, publish the complete
immutable prerelease and verify anonymous bytes, hashes and embedded identity.

Browser acceptance uses synthetic fixtures. Publication does not establish
physical-device upgrade/session continuity, TalkBack/IME/OEM, App Links, store
acceptance, backend deployment or a server reset. Update through Settings → App
Updates on the existing installation; do not uninstall or clear data.

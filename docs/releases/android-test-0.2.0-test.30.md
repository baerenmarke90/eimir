# Android test.30 — Current accepted main integration

The Product Owner explicitly requests creation and publication of a new test
release on 2026-10-30. Package accepted main
`9e7ef0042c94ddb6521c13c30d5a4edd29acf1b2` as an explicit merge parent of the
existing isolated Android test foundation. Draft PR #1443 remains isolated and
must never merge into main. Published test.29 remains immutable.

## Scope and product evidence

Include accepted changes since test.29: automatic monthly/yearly relationship
recaps (#1534), restored Moments peer tabs (#1536), mobile Places and shared Lists
(#1532), Timeline markers/filter (#1533), Today/composer clarity (#1531), and
Diary/category/caption/edit polish (#1526). Preserve the existing primary-tab
swipes, native session lifecycle, Settings updater and test installation identity.

Reuse the approved Product Reference v1 and owning generated preflights and
actual behavioral/visual evidence:

- `docs/product/design/automatic-relationship-recaps.md` and its reference validation;
- `docs/product/design/places-and-lists.md`;
- `docs/product/design/timeline-marker-filter.md`;
- `docs/product/design/wir-composer-clarity.md`;
- `docs/product/design/journal-category-edit-polish.md`;
- `docs/product/design/references/moments-tabs/`;
- `docs/product/design/evidence/primary-tab-swipe/README.md`;
- the existing native App Updates evidence under references/1331.

This release adds no new product UI design. Main's accepted product/runtime
changes are retained. Five changed-main files additionally preserve established
updater integration: dependency documentation, browser inventory, localized test
fixture, Settings route registration and the locale module registration. Existing
updater foreground checks and build activation remain separate from main.

## Reuse, business and cross-cutting review

Reuse review relevant: use the existing fixed-source plan, protected publisher,
Capacitor/Gradle packaging, Android package installer, GitHub immutable prerelease
and original signer. No new distribution provider, dependency, permission,
credential, entitlement bypass or native capability is introduced by packaging.

Business/freemium impact reviewed: retain the accepted versioned main feature
matrix. Automated recaps use `relationship.passport`, personal reflections follow their
existing ownership/privacy rules, essential history/export and official client
updates remain Free/Core. No additional quota, billing, entitlement, downgrade,
retention or Cloud/Self-Hosted change arises from packaging. Existing optional
local inference remains operator controlled and is not configured by the APK.

Preserve main's tenant, shared-only recap sources, encrypted personal drafts,
authorization, invalidation and transfer contracts. Recaps require the separate
matching backend deployment and additive migration 0093; APK publication does
not establish server deployment or local-model availability. No resets or account
bootstrap are part of this release. Localized notes identify the server dependency.

## Validation and immutable publication

Freeze this source and its notes while keeping the already published test.29
plan selected. Require all 32 named exact-source checks and all applicable source
workflows, browser critical/changed groups, Android APIs 28/36/37.1, security,
artifacts and provenance before selecting the frozen source for signing. Fix real
failures and refresh checks; retry only an evidenced transient same-commit failure.

Then select version `0.2.0-test.30`, code `30`, predecessor `0.2.0-test.29` in a
separate plan-only commit on allowlisted `release/android-test.14-20261026`.
Use the existing unattended `android-test-release` Environment and publisher.
Preserve package `de.sidebyside.app`, certificate
`b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472`, regular-mode
`https://demo.eimir.ur-cloud.de`, disabled Demo/reset behavior and previous assets.

Verify predecessor signer, unsigned assembly/lint/catalog/policy tests, protected
original certificate, signed source/package/version and higher-version upgrade
compatibility. Stage exactly four draft assets, upload the marker last, publish
one complete immutable prerelease and verify every anonymous public byte/hash and
embedded identity against the frozen plan.

Physical upgrade/session/data continuity, TalkBack/IME/OEM, App Links and store
acceptance remain device acceptance. Update through Settings → App Updates on
the existing installation; do not uninstall or clear data.

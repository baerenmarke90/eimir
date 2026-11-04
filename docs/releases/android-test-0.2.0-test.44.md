# Android test.44 integration

The Product Owner requested a new published test release from current main on
2026-11-04. This candidate integrates main
`0d0ab5f809b61059a862fa2bd97d414684d449e1`, including merged #1636 and #1637,
into the existing temporary test-channel foundation. The foundation remains a
draft in #1443 and must not merge into main.

Reuse the existing allowlisted branch, protected publisher, canonical package
`de.eimir.app`, canonical signing certificate, `eimir-production` Firebase client,
persistent API origin, regular registration and removable updater. Published
test.43 is the same-package/same-key predecessor. Signing credentials stay in
the existing protected environment; branch restrictions and all exact-source,
native, dependency, predecessor and anonymous-publication checks remain intact.

The only textual merge conflict combines adjacent German fixture translations
for Chapters and the existing updater; retain both. Main's browser-impact
inventory also receives explicit ownership for the already existing updater
journey, without making it always-run or changing the core selection policy.
No new product implementation, dependency, provider, entitlement, quota, signing
identity or production deployment is introduced by packaging.

Product composition, generated preflight, Mobile Interaction Contracts and
behavioral evidence belong to `docs/product/design/chapter-experience/README.md`
and `docs/product/design/device-review-20261104/acceptance.md`. Preserve their
accepted Compact/Expanded, Light/Dark, enlarged-text, reduced-motion, privacy,
ownership and draft/return semantics. The existing updater keeps the #1331
reference and platform installer contract.

No business/freemium impact from packaging: the current feature matrix and main's
capability, downgrade, export, existing-data and Cloud/Self-Hosted boundaries
remain unchanged. Additive migrations 0107/0108, backend and API are integrated
unchanged from main and must pass the exact candidate's checks.

Keep the plan on published test.43 while validating this source. After all
publisher-required named checks pass, select the frozen candidate with a separate
plan-only commit for `0.2.0-test.44` / versionCode 44. Verify the successful
publisher, immutable release, all four anonymous public assets and the embedded
APK source before reporting publication complete. Installed-device upgrade,
session/Space/data continuity, OS App Links and actual push delivery remain
separately observed acceptance boundaries.

## Browser integration correction

The initial exact-source run found one obsolete updater assertion: the fixture
still used an isolated MemoryRouter and expected the Settings return link that
main intentionally removed in `962436cd6e8ad9f5df0f763f701bc45831f70dd3`.
The failure trace and screenshot show the installer-opened state correctly;
the other 215 additional browser cases passed. Use BrowserRouter and the real
same-document history, then assert browser Back restores the exact Settings
route, index and updater entry. Retain the complete check/download/cancel/
permission/explicit-install journey. No runtime UI, assertion deadline or
release gate is changed. The corrected candidate requires fresh source checks.

The old assertion reproduced locally. After the correction, all six updater
browser cases pass with zero retries, including 320/360/430 px, Expanded,
Light/Dark, enlarged text, accessibility and the complete installation/return
journey. Browser-fixture typecheck and formatting pass. All four independent
PR-critical groups on the initial candidate also passed; their results diagnose
the scope and are not substituted for the corrected candidate's fresh checks.

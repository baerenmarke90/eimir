# Android test.44 integration

The Product Owner requested a new published test release from current main on
2026-11-04. This candidate integrates main
`e7bc4769a010206442e662560773ba2649e00929`, including merged #1643, #1636 and #1637,
into the existing temporary test-channel foundation. The foundation remains a
draft in #1443 and must not merge into main.

Reuse the existing allowlisted branch, protected publisher, canonical package
`de.eimir.app`, canonical signing certificate, `eimir-production` Firebase client,
persistent API origin, regular registration and removable updater. Published
test.43 is the same-package/same-key predecessor. Signing credentials stay in
the existing protected environment; branch restrictions and all exact-source,
native, dependency, predecessor and anonymous-publication checks remain intact.

The newest-main merge conflict combines adjacent German fixture translations
for unified subpage context and the existing updater; retain both, alongside
the already integrated Chapter translations. Main's browser-impact
inventory also receives explicit ownership for the already existing updater
journey, without making it always-run or changing the core selection policy.
No new product implementation, dependency, provider, entitlement, quota, signing
identity or production deployment is introduced by packaging.

Product composition, generated preflight, Mobile Interaction Contracts and
behavioral evidence belong to `docs/product/design/chapter-experience/README.md`
and `docs/product/design/device-review-20261104/acceptance.md`, together with
`docs/product/design/subpage-navigation-context/README.md`. Preserve their
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

## Newest-main integration

The Cloud continuation refreshes main before freezing the APK source. The previous
candidate `5895b773cf5ae46b6b43344ba6781de7aba3b770` is superseded and is not the
publication source. Main #1643 adds universal secondary-page Back controls,
calendar dates and ordered Place metadata above moments, and original prompt,
author and date context for incoming shared answers. Its optional dashboard
prompt and generated API contract are integrated unchanged, with no migration.

The updater remains an ordinary Settings category. The shared SubpageNavigation
supplies its default Back control and canonical Settings parent; its existing
BrowserRouter fixture and browser Back journey retain the exact Settings route,
index and updater-entry assertions. Preserve the complete check, download,
cancel, permission and deliberate installer handoff. Main's AppShell and backend
runtime must match main exactly; only the established updater route/category
extensions remain in the route registry and Settings composition. The browser
ownership map retains both the new context spec and existing updater spec.

Every required publisher check must pass on the newly integrated source. Earlier
candidate successes are diagnostic history only. The release plan stays on
published test.43 during this validation; source selection and publication follow
only after the complete exact-source check set succeeds.

### Cloud preflight on the merged tree

- 25 Android release/plan/launcher/adaptive-resource checks, 48 publisher-contract
  checks, 45 private-channel checks and 17 release-evidence checks pass.
- All 38 browser-planning regressions pass; inventory retains 91 specs and actual
  full collection contains 1,041 cases, including the six updater cases.
- The production Web build, token/PWA checks, fixture typecheck, locale-fixture
  formatting and all 75 focused updater/navigation/routes/shell checks pass.
- All 20 complete updater and new subpage-context browser cases pass together
  with zero retries using the installed system Chromium. This supplementary
  local run does not replace the required hosted browser checks.
- Initial local execution exposed an incomplete prepared Web dependency tree
  and sandbox IPC restrictions. Locked installation and the executor's supported
  network permission resolved those setup failures without changing product code,
  lockfiles, assertions, timeouts or workflow gates. The obsolete pre-install
  browser run was stopped; the complete clean-start 20-case run above is binding.
- Backend/API, AppShell and native-matrix assertions match main exactly. The
  test.43 plan and all publication/signing protections remain unchanged.

# Shared Story deletion and Heart Moment ownership

Owning issue: #1344; parent #508; related #503. Baseline `main@3732eb59242fe1f3e2e7cad0c04250d5f74ff6ca`, including merged #1339, #1341 and #1343.

## Contract and reuse

Heart Moment deletion previously followed mutable route/scope closures, removed later Query state and navigated after departure. It could pause offline and dispatch on reconnect, lose pending protection after return, and compete with save or visibility changes. The shared `useStoryDeletion` hook extracts the already-characterized Memory/Milestone lifecycle and supplies that same protection to all three Story products. Domain consumers retain their existing API, If-Match representation, confirmation rendering and success feedback.

Capture immutable Account/Space/kind/resource/version/API callbacks, the exact authorized Query and the submitting route activation at admission. Recheck after cancellation, before dispatch and after persistent revocation/projection recovery. A confirmed server deletion always revokes its original persistent snapshot, even after departure or Query removal. Only its exact authorized Query can be removed; only its original active task can navigate. Denied/replaced Queries and later scopes remain untouched. Resource mutation counts survive route return and synchronously exclude duplicate or competing writes. Heart Moment visibility and deletion exclude one another through the actual detail/editor consumers. Offline confirmation settles locally; reconnect alone never retries.

Reuse React Router location identity, TanStack Query mutation keys/counts/matching/cancellation, `useTaskActivation`, `captureAuthorizedQuery`, `assertOnlineWrite`, existing cache revocation and projection invalidation. No new cache, retry, navigation or persistence framework, dependency or provider. The hook holds lifecycle policy; it does not generalize the domain APIs.

## Product acceptance

Product Reference v1 R1/R2 and Templates 9/11 govern the unchanged bounded Story detail/editor composition. Preserve body/tags/emotion/date/photo, Back/Cancel/Save, two-step permanent deletion and canonical Timeline return. Reuse current shell, controls, tokens, localized feedback and reduced-motion behavior. No extra typing, gestures, relationship microcopy or celebratory motion for permanent deletion. Shared and owner-only content retain their privacy boundary. This is an existing behavioral repair with no new composition, capability or material visual redesign; the generated-feature-reference gate does not introduce a new visual design in this scope.

Eight production-browser journeys exercise 390 Light, 430 Dark, both 1440 themes, 320 Dark/200% root text, private 390 Dark, and offline 360 in both themes. Open canonical Timeline/detail → Edit → author draft → cancel/reopen confirmation → keyboard confirm → 503 → preserve draft → deliberate retry → pending → More departure → server-confirmed completion without route takeover → canonical Timeline without deleted content. The 390 shared case also opens the real detail while pending, verifies privacy exclusion and returns to the pending editor. Private content enters directly and is excluded from the shared Timeline fixture. Offline/reconnect alone dispatches no DELETE; deliberate retry sends exactly the original If-Match.

Whole-page Axe, document overflow, actual field/action rectangles and 44px interactive targets pass. No CSS, tokens or composition changed. The extreme 320px/200% state retains the existing heavy wrapping and long scroll; this proof establishes control containment and behavior, not a redesign of that typography. Single-line/native fields retain their platform editing behavior. Keyboard journeys can expose the shell's skip link; fixed navigation overlays in full-page captures remain scrollable. All nine retained images were inspected with the behavioral results.

| Evidence | State |
| --- | --- |
| [390 Light return](heart-delete-return-pending-390-light.png) | Pending survives an actual detail/editor return |
| [430 Dark failure](heart-delete-failure-430-dark-SHARED.png) | Draft preserved; deliberate retry available |
| [320 Dark / 200%](heart-delete-pending-320-dark-SHARED.png) | Existing large-text wrapping with contained controls |
| [1440 Light](heart-delete-pending-1440-light-SHARED.png) / [Dark](heart-delete-pending-1440-dark-SHARED.png) | Same bounded editor and pending confirmation |
| [Private 390 Dark](heart-delete-pending-390-dark-PRIVATE.png) | Owner-only deletion requires no publication |
| [Offline 360 Light](heart-delete-offline-360-light.png) / [Dark](heart-delete-offline-360-dark.png) | Preserved draft and explicit retry |
| [Other task](heart-delete-other-task-390-light-SHARED.png) | Confirmed deletion leaves the current task active |

## Counterfactual and verification

- Final new component suite: 25 cases, **22 fail unchanged runtime; 3 controls pass**. Includes persistent-cache/Query replacement and removal, denied/newer reads, original Account/Space/API, reused route, cancellation/version/capability/offline admission, revocation/projection awaits, departure/return, synchronous duplicates, save and actual detail privacy writes. [Baseline output](unit-baseline.txt).
- Final new browser suite: **all eight fail unchanged production assets** at intended save-exclusion/offline-feedback boundaries, with the final identical test source. [Baseline output](browser-baseline.txt).
- Repaired production assets: **85 browser cases pass, zero retries**: new 8 + unchanged Memory 7, Milestone 7, Heart Moment visibility/create 15, task boundaries 35 and Timeline reference 13. [Final output](browser-final.txt).
- Shared production-component proof: **70 pass**, comprising all 25 new Heart Moment cases and unchanged 23 Memory/22 Milestone cases. [Focused output](unit-focused.txt).
- Full Web: **1,772 pass, one existing skip**. [Output](web-unit.txt).
- Production build, semantic design validation, PWA and Capacitor checks, lint (25 existing warnings/13 infos), format, direct E2E TypeScript, both language audits, inventory and 20 changed-spec planner tests pass. [Build](build.txt), [lint](lint.txt), [format](format.txt). The eight new cases are PR_CRITICAL; actual collected critical inventory is 379 cases across 40 files. Existing reference classifications are unchanged.

[Identity manifest](identity.json) binds final source/tests/locks and both production bundles by SHA-256. Local proof uses Playwright 1.62.1 and Chrome Headless Shell 153.0.8010.0. Hosted pinned-browser checks remain a separate final-head gate. The baseline worktree contains the final new component test with unchanged production runtime. No retries, waits, assertions, security controls or CI gates were weakened. This is bounded Web acceptance, not final #946 acceptance or native-device validation.

## Business and cross-cutting result

No business/freemium impact: Story relationship history remains Free/Core, and privacy/deletion/security/accessibility remain non-paywallable. No entitlement, couple ownership, Cloud/Self-Hosted difference, managed cost, quota, retention, downgrade, restore/export or feature-matrix change. Server authorization and If-Match remain authoritative. Existing localized strings and accessible confirmation controls are retained. No new sensitive diagnostics, backend/API/schema/migration, persistence format, telemetry, dependencies, deployment or native capability. Fixtures are synthetic. Broader create/update reconciliation remains outside this deletion repair; native drafts #1271/#1332 remain independent.

# Milestone delete ownership — source-bound acceptance

Owning issue: #1342. Baseline `main@bb8ccd7b34c4c56c6b65fe296e0461b555a1d119`.

This is a bounded #508 repair, not final #946 or native-device acceptance. Open #1339/#1341 and native drafts #1332/#1271 are independent. No merge or deployment is performed here.

## Behavior and shared contracts

Delete admission captures immutable Account/Space/Milestone/version/API, the exact authorized Query, and the submitting route activation. Cancellation, persistent revocation and projection recovery are separate asynchronous boundaries. Recheck ownership after each. Confirmed deletion revokes its original persisted snapshot even after departure or Query removal. Only the original authorized Query may be removed, and only the original activation may navigate. Later denied/replacement reads stay intact.

Reuse TanStack Query mutation keys/counts, cancellation and existing `captureAuthorizedQuery`/`assertOnlineWrite`. `useTaskActivation` extracts the existing ownership responsibility from `useTaskEditorLifecycle`; it does not install a second history or editor lifecycle. Both existing editor consumers and this route use the shared primitive. Resource pending survives actual return and suppresses synchronous duplicate/competing save/delete. Offline confirmation settles without reconnect replay; retry remains deliberate. No optimistic delete or new cache/mutation framework.

A measured 320px/200% overflow is repaired at the shared Story editor grid boundary using shrinkable tracks and wrapping. No hidden overflow, font reduction, new visual tokens or composition. The native date control and normal single-line text input retain their platform editing behavior. Broader create/edit reconciliation remains separate.

## Product acceptance

Product Reference v1 R1/R2 and Templates 9/11 apply. Preserve title/body/date, Back/Cancel/Save, explicit two-step permanent deletion, shared history, current shell and canonical detail/Timeline. No extra typing, hidden gesture, table/admin composition, celebration or relationship copy. Existing localized pending/error/offline feedback and reduced motion remain.

Seven new production-browser journeys cover 390 Light, 430 Dark, both 1440 themes, 320 Dark with 200% root text, and 360 offline in both themes. Open Timeline → Milestone → Edit → author draft → cancel/reopen confirmation → keyboard confirm → 503 → preserve draft → deliberate retry → pending → actual More departure → confirmed response without route takeover → canonical history without deleted item. The 390 journey additionally returns while pending and verifies restored exclusion. Offline/reconnect alone dispatches no DELETE; explicit retry sends exactly the original If-Match. All routes use strict API fixture handling, actual shell/history and reduced motion.

Whole-page Axe, document reflow, actual control rectangles and 44px targets are asserted. Captures show actual user content and navigation, not isolated mockup cards. Expanded keeps the same bounded task. Keyboard journey captures can include the shell's visible skip-to-content link. Large-text field editing remains platform-native. Screenshots accompany behavior assertions; they are not standalone product acceptance.

| Evidence | State |
| --- | --- |
| [390 Light](milestone-return-pending-390-light.png) | Pending protection after actual leave/return |
| [430 Dark](milestone-failure-430-dark.png) | Failed deletion retains authored draft and explicit retry |
| [320 Dark / 200%](milestone-pending-320-dark.png) | Narrow large-text layout and pending controls |
| [1440 Light](milestone-pending-1440-light.png) / [Dark](milestone-pending-1440-dark.png) | Same bounded editor and confirmation |
| [360 offline Light](milestone-offline-360-light.png) / [Dark](milestone-offline-360-dark.png) | Offline error and preserved draft |
| [Other task](milestone-other-task-390-light.png) | Server-confirmed completion does not navigate away |

All eight retained captures were inspected as whole-screen states. No content clipping or off-screen control is used to achieve reflow; single-line/native input content retains normal internal editing/scrolling behavior.

## Counterfactual and validation

- Final component suite: 22 new cases; **20 fail unchanged runtime**, normal deletion and deliberate-retry controls pass. Cases cover replacement/removed/denied Queries, original Account/Space, reused route, cancellation/version/capability/cache/departure admission, revocation and projection awaits, return pending, duplicates and competing save. See [counterfactual output](unit-baseline.txt).
- All **seven new browser journeys fail unchanged production assets** at intended pending/offline boundaries, not fixture errors. See [baseline output](browser-baseline.txt). The separate large-text failure additionally demonstrated the existing editor overflow before the grid correction.
- Repaired production bundle: **55 browser cases passed**, zero retries: new seven + existing 35 task-boundary and 13 Momente reference cases. See [output](browser-final.txt).
- Final full Web: **1,703 passed, one existing skip**. [Output](web-unit.txt).
- Build/typecheck, tokens/PWA/Capacitor, lint (25 pre-existing warnings/13 infos), format, both language audits, inventory and 20 changed-spec planner tests pass. Browser spec also receives a direct TypeScript check. [Build](build.txt), [lint](lint.txt), [format](format.txt).
- Browser inventory: the new seven are PR_CRITICAL; actual collected critical group is **357 cases**. Existing reference classifications/counts are unchanged.

[Identity manifest](identity.json) binds source/test/lockfile and both immutable production bundles by SHA-256. Local proof uses Playwright 1.62.1 and isolated Chrome Headless Shell 153.0.8010.0; hosted pinned-browser checks are a separate gate, reported against the final PR head. The baseline worktree contains the final new component test, with production code unchanged. No assertions, timeouts, retries or protections were weakened.

## Business, privacy and limits

Milestones/shared relationship history remain Free/Core; deletion/security/accessibility remain non-paywallable. No entitlement, relationship ownership, Cloud/Self-Hosted behavior, managed resource/cost, quota, retention, downgrade, export/restore or matrix change. No backend/API/schema/migration, persistence format, telemetry, dependency/provider, deployment or native capability change. Existing server authorization and If-Match remain authoritative. No real user data appears in these synthetic fixtures or proof.

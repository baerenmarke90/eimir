# Comment edit ownership acceptance

Issue #1348; follow-up to #508 and #1346. Baseline `main@f6a77ba6da6a9539c16eec0a5db33a0a03d8ce3b`.

## Behavior and scope

The existing inline edit task now owns its draft, revision, submitted API/Space/comment/version, feedback and completion. A successful older PATCH cannot consume later text, even when that text returns to the submitted value, or close another comment's editor. Later text requires a deliberate save with the version confirmed by the previous success. A background read does not silently rebase an authored draft. Failed writes retain text and their original If-Match version for deliberate retry. A transient GET failure after confirmed saving keeps the cached comments and newer editor visible with existing retry feedback; 401/403/404 still hide the cached content and editor.

Reuse keyed React task lifetime, installed TanStack Query mutation-cache admission, `useTaskActivation`, `captureAuthorizedQuery`, `assertOnlineWrite`, generated API and localized feedback. One update is admitted per resource, including immediate duplicate form events and return while pending. Undispatched work stops after task departure; dispatched success may invalidate only its original exact authorized Query after unmount. Removed/replacement/401/403/404 Queries cannot be refreshed by that response. Account/Space/parent changes reset the panel's in-memory task state. No new store, persistence, outbox, dependency, API or native behavior.

The extraction moves existing edit feedback beside its owning form; controls, styling, copy, tokens, menu, form hierarchy and detail composition are retained. Product Reference v1 draft/interruption and result/return rules, Detail View template 11 and contextual inline editing remain authoritative. The issue records the pre-implementation reuse, business, cross-cutting and Mobile Interaction Contract, plus the directly related failed-refresh extension. A separate characterization fails the first repair on confirmed PATCH → transient GET failure; the final code preserves its newer draft. Existing whole-screen references remain representative: this behavior repair does not introduce a new or materially changed visual feature.

Create/delete cache and task ownership, deletion confirmation UX, broader #508, final #946 and native drafts #1271/#1332 remain separate. Comments remain Free/Core with identical Cloud/Self-Hosted behavior. No entitlement, cost, quota, retention, export/restore or business-matrix change.

## Verification

- Final focused component suite: **65 passed**, including **29 new characterizations**. Against unchanged runtime, **23 fail and 6 controls pass**. The controls cover existing correct failure/retry, account ownership, preservation of the older version against background reads and fail-closed 401/403/404 rendering. The post-unmount case establishes the exact-query invalidation contract; its baseline failure also reflects the missing exact filter.
- Full Web suite under `TZ=UTC`: **1,822 passed, one existing skip**. The inherited runtime timezone issue already documented in #1346 is not changed here.
- Production browser acceptance: **36 passed, zero retries**: eleven new edit journeys, twelve unchanged offline comment journeys and thirteen unchanged Timeline/detail/reference cases. New journeys cover all three Story consumers plus Expanded, later text after success/failure, correct version on deliberate retry, another editor, preserved partner content and Browser Back to the original Timeline.
- Counterfactual browser run uses the unchanged baseline production bundle: seven intended late-success/task-feedback/failed-refresh failures and four passing failure/retry controls. It uses the final test source; source and bundle hashes are in the identity manifest.
- Whole-page Axe, 360/390/430/1440, Light/Dark, reduced motion and 320px/200% text reflow passed. Actual Save/Cancel and return remain usable; no horizontal document/descendant overflow is accepted. The full-page large-text capture includes fixed navigation at its viewport position.
- Production build/typecheck, direct browser-spec TypeScript, format, semantic-token/PWA checks, Capacitor foundation, language audits and browser inventory passed. Lint retains 25 existing warnings and 13 infos; no new diagnostic. Inventory planner: 20 passed. Actual PR-critical inventory: **402 cases in 42 files**.

Local browser is isolated Chromium **153.0.8010.0**, Playwright **1.62.1**, production Vite preview, two workers, retries zero. The pinned Chromium 151 download returned an invalid ZIP in this runtime. No dependency or lockfile was changed for the local browser. Canonical hosted Chromium 151 CI acceptance is required separately before merge; these local results do not claim physical Android acceptance.

## Inspected captures

All seven captures are actual final-source product renders with synthetic fixture content. PNGs were converted losslessly to WebP; original and delivered checksums, source blobs and both production bundles are recorded in [identity.json](identity.json). Bounded local output is in [verification.txt](verification.txt). No production data or credentials are used.

| Capture | State |
| --- | --- |
| [Memory, 360 Light](comment-edit-success-360-light.webp) | Older save confirmed; newer draft remains editable |
| [Heart Moment, 390 Dark](comment-edit-success-390-dark.webp) | Same journey on shared emotional content |
| [Milestone, 430 Light](comment-edit-success-430-light.webp) | Same journey on shared milestone |
| [Memory, 1440 Dark](comment-edit-success-1440-dark.webp) | Expanded adaptation of the same task |
| [Milestone, 320 / 200% text](comment-edit-success-320-200.webp) | Wrapped controls and retained draft |
| [Heart Moment failure, 390 Dark](comment-edit-failure-390-dark.webp) | Localized error stays with its form; newer text survives |
| [Memory refresh failure, 360 Light](comment-edit-refresh-failure-360-light.webp) | Confirmed update, failed GET and retained later draft |

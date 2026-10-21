# Comment deletion ownership — #1382

Baseline: `main@ac74b40a346f52d745bc4563658061a500edc327`. This bounded #508 follow-up repairs comment DELETE admission and settlement across Memory, shared Heart Moment and Milestone details. It does not close broader #508 or the final #946 gate.

## Result and reuse

DELETE now captures its generated API request (Space, comment ID and original If-Match), API, exact authorized comments/presence Query lifetimes and panel activation at deliberate admission. TanStack Query owns synchronous duplicate admission and pending state across departure/return. Undispatched work stops when its task leaves; dispatched work may refresh only its original still-authorized reads. A newer removed/replacement/401/403/404 lifetime wins before dispatch and settlement, including after awaited cancellation. An absent presence query is not created. The existing shared comment refresh primitive cancels stale reads and reconciles canonical pages; no direct optimistic deletion, second cache, new mutation engine, dependency or automatic retry is added. Existing offline rejection and deliberate retry remain.

## Product Design / UX and business review

The pre-implementation contract in [#1382](https://github.com/baerenmarke90/eimir/issues/1382) identifies Product Reference v1 R2 Moments and the existing content-detail/inline comment interaction. This is a nonvisual behavioral correction: existing overflow text action, authored content hierarchy, ProblemState, shell, typography, spacing, theme, motion/reduced motion and localization remain. No new or materially changed composition requires a generated design reference. One partner can delete their own comment without the other contributing. Destructive confirmation UX remains separate.

Comments remain Free/Core with identical Cloud/Self-Hosted behavior. No entitlement, provider/cost, quota, retention, export, downgrade, schema, configuration, backend or native capability changes. The authoritative feature matrix is unchanged. No protected content enters logs or additional persistence.

## Verification

- Final Web suite: **1,963 passed, one existing skip**. Build/typecheck, format, lint (existing warnings), token/PWA checks and browser inventory pass.
- New component coverage: **27 passed**. Against unchanged baseline runtime, **25 fail at the intended boundaries and two existing-correct failure/retry and stale-read controls pass**. Includes immediate duplicates, return pending, captured API/version, departure before dispatch, offline reactivation, current-task failure/retry, denied admission, query/presence removal/replacement/denial and rechecking after awaited cancellation.
- Final production-browser acceptance: **52 passed, zero retries**. Six new DELETE journeys, nine create, eleven edit, twelve offline writes, thirteen existing Timeline/detail/reference journeys and one comment-presence journey.
- Against unchanged production baseline, **five new browser cases fail**: four returned-pending variants and same-frame double activation. The existing-correct failure/retry control passes.
- Open detail → delete → leave/return while held → disabled duplicate action → confirmed canonical comments → preserved partner comment → return to originating Timeline. Check 360/390/430px and 1440px, Light/Dark, reduced motion, 320px/200% text reflow and full-page Axe. Failure preserves both comments until deliberate retry.

Local browser verification uses Playwright 1.62.1 and isolated Chromium 153.0.8010.0 outside product dependencies. The pinned Chromium 151 download returned an invalid archive. The temporary serverless binary configuration needed valid font paths and multiple renderer processes; initial infrastructure-only failures are excluded from acceptance. Canonical hosted browser CI is a separate merge gate. Synthetic HTTP fixtures are not live-backend, physical Android or final-product acceptance.

[Source blobs, dependency/bundle and original PNG checksums](identity.json) bind these results to the implementation. [Bounded validation output](verification.txt) preserves final and counterfactual totals. The original inspected PNG captures below are synthetic data, without rescaling or editing.

## Inspected captures

| State | Capture |
| --- | --- |
| 390px Dark, returned panel with DELETE still pending | [Pending](comment-delete-pending-390-dark.png) |
| 1440px Dark, confirmed deletion preserves partner comment | [Complete](comment-delete-complete-1440-dark.png) |
| 320px / 200% text, Light, existing detail reflow | [Reflow](comment-delete-complete-320-200.png) |
| 360px Light, failed DELETE retains content and error recovery | [Failure](comment-delete-error-360-light.png) |

# Deliberate online comment writes

Issue #1346; continues #508. Baseline `main@e1f83785905688310d2b494184307c5d02e051a1` includes regularly merged #1345. This is bounded Web acceptance, not final #946 or native-device acceptance.

## Contract and reuse

`CommentsPanel` owns the same create/edit/delete controls in Memory, shared Heart Moment and Milestone detail. Default TanStack Query online mode previously paused an offline action and could dispatch it on reconnect. All three mutations now use `networkMode: always`, explicit `retry: false` and the existing `assertOnlineWrite` primitive at dispatch. Both Query's online signal and `navigator.onLine` must permit a write. Offline intent settles as the existing localized inline error, preserving the current draft/comment; reconnect alone never sends it. Another deliberate action uses the existing API, If-Match and create-request identity. Ambiguous online create outcomes retain their existing reconciliation contract.

No new queue, mutation framework, dependency, persistence, API or retry mechanism. Broader comment task/cache ownership and deletion confirmation UX are separate from this dispatch repair; no general comment lifecycle completion is claimed.

## Product and reflow

Product Reference v1 R2 recovery/result/return, Templates 11/12 and the existing detail/comment composition govern this repair. Content stays first, discussion follows, the composer opens deliberately, and own-comment management stays in its existing menu. Existing privacy, keyboard, localized status, motion/reduced-motion and individual participation remain. No new visual feature or material composition change requires a generated concept image.

Acceptance exposed an existing 320px/200% sizing gap: Milestone detail could expand to 576px. Extend the existing Heart Moment grid/shrink contract to the equivalent Milestone detail and its shared page; move existing compose containment into `CommentsPanel.css` and wrap edit actions. Reuse semantic tokens and existing typography. Do not clip overflow, shrink text or truncate authored content. The extreme enlarged-text state still involves heavy wrapping/long scrolling, recorded honestly in the capture.

Twelve new production-browser journeys cover all three writes in Memory at 360 Light, Heart Moment at 390 Dark, Milestone at 430 Light and Memory at 1440 Dark. The Milestone journeys also resize to 320px/200% before reconnect/manual retry. Open canonical Timeline → detail → compose/edit/delete → actual browser offline → inline error → retained draft/comment → reconnect without write → deliberate retry with the original API/version → authoritative result → Browser Back to Timeline. Preserve the partner comment and own-only management. Full-page Axe, document containment and enlarged-text element rectangles pass. Reduced motion is enabled. These are mocked API browser journeys, not a backend integration or physical device run.

| Capture | State |
| --- | --- |
| [360 Light](comments-create-offline-360-light.webp) | Memory composer retains its unsent draft |
| [390 Dark](comments-create-offline-390-dark.webp) | Shared Heart Moment composer and inline error |
| [430 Light](comments-create-offline-430-light.webp) | Milestone keeps both comments and the draft |
| [1440 Dark](comments-create-offline-1440-dark.webp) | Expanded uses the same bounded detail task |
| [390 deletion](comments-delete-offline-390-dark.webp) | Comment remains; its management menu stays usable |
| [320 / 200% text](comments-edit-offline-320-200.webp) | Edit/recovery remains contained and operable with full-size text |

Captures are lossless WebP conversions of actual production-browser PNGs. Their original PNG hashes and published hashes are recorded in [identity.json](identity.json).

## Verification

- All **21 new component cases fail unchanged runtime**. They independently cover both offline signals for each operation/parent and override inherited automatic retries. Repaired runtime: **36 focused cases pass**, including all 15 existing comment tests for newer drafts and ambiguous-create reconciliation.
- All **12 final new browser cases fail unchanged production assets** at the intended missing offline-feedback boundary, using the identical final test source. Final production bundle: **62 pass, zero retries**: 12 new + 50 unchanged adjacent Timeline, Heart Moment capture and all three Story deletion cases.
- Full Web in UTC: **1,793 pass, one existing skip**. Initial inherited `TZ=Asia/Taipei` reveals two unchanged date-fixture assumptions in `formatRecency`/`planningOverview`; the same failures reproduce on pristine baseline. No test or runtime assertion was weakened. The UTC run uses the normal CI timezone.
- Production build/typecheck, direct new-spec TypeScript, design tokens, PWA/Capacitor, format, lint (25 existing warnings / 13 infos), both language audits, inventory and all 20 changed-spec planner tests pass. Dependency audit meets the unchanged high-severity threshold, with three existing moderate Capacitor/uuid findings.
- [Bounded verification log](verification.txt) retains counterfactual, focused, full-suite and browser summaries. [Identity](identity.json) binds source/tests/locks and baseline/final production assets by SHA-256. Local browser: Chromium 153.0.8010.0 through Playwright 1.62.1; hosted pinned-browser CI is a separate final-head gate. No retry, timeout or CI protection was changed.

## Business and cross-cutting

No business/freemium impact: comments/basic interaction remain Free/Core; privacy, security and accessibility remain non-paywallable. No entitlement/couple ownership, Cloud/Self-Hosted difference, managed cost, quotas/retention, downgrade/trial, export/restore or feature-matrix change. Preserve server authorization, own-comment restrictions, private-parent exclusion, If-Match and ambiguous-create identity. No new sensitive diagnostics, provider/data flow, backend/schema/migration, deployment or native capability. Native drafts #1271/#1332 and final #946 remain separate.

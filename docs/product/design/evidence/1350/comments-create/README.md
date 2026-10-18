# Comment create admission and completion acceptance

Issue #1350; follow-up to #508, #1346 and #1348. Baseline `main@16ece5654f645fa4e79adf5476b1f55c5537823e`.

## Behavior and reuse

The existing comment composer now admits one deliberate create per Account/Space/parent, including immediate duplicate events and return while a POST remains pending. Snapshot API/body/parent and the original comments/presence Query lifetimes at admission. Undispatched work stops after its composer activation ends. A dispatched success can refresh only its original eligible Queries; removed, replacement and denied 401/403/404 lifetimes win. No returned content is inserted directly and no missing cache is recreated.

Reuse installed TanStack Query mutation-cache admission, React keyed context, `useTaskActivation`, `captureQueryIdentity`, problem classification, `assertOnlineWrite`, generated CommentsApi and the existing create request identity helper. The private comment-refresh adapter permits an initial empty/loading/transiently failed read when parent canComment permits writing. After confirmed creation it cancels only that original eligible read, rechecks ownership after the await and obtains a fresh canonical page; an eventual pre-create GET cannot overwrite the result. Presence settlement additionally requires the original comments authority.

Normalize comment read errors in the shared `listCommentsPage` boundary. Both the detail and Timeline presence reader now expose the same ClientProblemError contract; raw generated HTTP failures no longer bypass the presence denial guard. Remove the duplicate detail-only normalization. Existing API, DTO, pagination and server idempotency semantics remain.

Only the live admitting activation may clear its submitted draft revision or show its error. Retain newer text through refresh and protect a fresh activation even when it contains identical words. Unknown-outcome retry keeps the existing identity; no automatic mutation retry or reconnect POST is added. In-memory task state and its existing reconciliation window are unchanged; durable drafts and cross-session reconciliation are not promised.

## Product and business review

Product Reference v1 draft/interruption and result/return rules, Detail View template 11 and the existing short inline-reply pattern remain authoritative. Shared authored content leads; the same Comment trigger, textarea, Send/Cancel, localized states, styles and semantic tokens remain. Compact is normative and Expanded adapts the same composition. Existing motion, reduced motion, keyboard/navigation and touch patterns remain. Precise pending/error feedback needs no added celebration, romantic copy, configuration or typing.

The issue records the pre-implementation Mobile Interaction Contract, reuse, business and cross-cutting review, plus the initial-read and transport findings. This behavior repair introduces no new or materially changed visual feature requiring a new generated concept; current whole-detail references remain representative. All seven actual captures were inspected. Full-page captures show fixed navigation at its viewport position; acceptance also performs the actual subsequent action and return.

Comments remain Free/Core with identical Cloud/Self-Hosted behavior. No entitlement, relationship ownership, managed cost/provider, quota, retention, downgrade, export/restore, dependency, schema/migration, native or deployment change. No sensitive telemetry, URL or durable draft storage. Broader #508, comment deletion/confirmation, #946 and device drafts #1271/#1332 remain separate.

## Verification

- **106 focused component cases pass**, including **33 new characterizations** and eight existing StoryList cases. Against unchanged runtime, **30 new cases fail and three controls pass**. Controls cover already-correct later typing through refresh, transient initial-read recovery and manual unknown-outcome identity retry. The exact-query post-unmount case also establishes exact filter shape. Three real generated HTTP presence failures fail the first repair before shared normalization.
- Full Web suite under **TZ=UTC: 1,855 passed, one existing skip**. The inherited date-fixture timezone issue documented in #1346 is unchanged.
- **46 production-browser cases pass, zero retries**: nine new create journeys, eleven existing edit journeys, twelve offline comment cases, thirteen existing Timeline/detail/reference cases and the existing comment-presence journey. All nine final new cases fail the unchanged baseline production bundle at duplicate-request, returned-pending or initial-read boundaries.
- New journeys exercise Open → type → send → navigate/return → author new text → observe old completion → deliberate send → canonical result → return. Verify one POST on immediate duplicate events, a distinct key after known success, retained partner content and later draft, and fresh canonical reading after an initial delayed GET.
- Actual 360/390/430/1440, Light/Dark, reduced motion, 320px/200% text, whole-page Axe and document/descendant overflow checks pass. Pending controls are exercised after return; input remains editable and no new POST occurs until deliberate action.
- Production build/typecheck, direct browser-spec TypeScript, format, semantic-token/PWA checks, Capacitor foundation, language audits and inventory pass. Lint retains 25 existing warnings and 13 infos, with no new diagnostic. Inventory planner: 20 passed. Actual PR-critical inventory: **411 cases in 43 files**.

Local production preview uses Playwright 1.62.1 and isolated Chromium 153.0.8010.0 outside product dependencies, two workers, retries zero. The pinned Chromium 151 download was unavailable as a valid ZIP in this runtime. Canonical hosted Chromium 151 remains a separate required gate before merge; local tests do not claim physical Android acceptance.

## Source-bound captures

[identity.json](identity.json) records source blobs, dependencies, final and baseline production bundles, original PNG and delivered lossless WebP checksums. [verification.txt](verification.txt) retains bounded local output. All content is synthetic fixture data.

| Capture | State |
| --- | --- |
| [Memory, 360 Light](comment-create-return-360-light.webp) | Previous comment confirmed; new visit draft remains |
| [Heart Moment, 390 Dark](comment-create-return-390-dark.webp) | Same shared-content journey |
| [Milestone, 430 Light](comment-create-return-430-light.webp) | Same milestone journey |
| [Memory, 1440 Dark](comment-create-return-1440-dark.webp) | Expanded adaptation of the same task |
| [Milestone, 320 / 200% text](comment-create-return-320-200.webp) | Wrapped controls and retained draft |
| [Heart Moment pending return, 390 Dark](comment-create-return-pending-390-dark.webp) | One resource remains pending; the new draft stays editable |
| [Memory initial read, 360 Light](comment-create-initial-read-360-light.webp) | Fresh confirmed comment and retained later words |

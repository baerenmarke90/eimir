# R3 — Planen: preflight and delivery contract

**Owner:** [#968](https://github.com/baerenmarke90/eimir/issues/968), within the #955 program.  
**Authority:** [Product Reference v1](product-reference-v1.md), [R3 reference experience](reference-screens.md#r3--planen), [system direction](design-system-direction.md), and the accepted F1/F2/R1/R2 contracts.  
**Status:** Web implementation complete and awaiting Product Owner review; preflight recorded before runtime implementation on 2026-09-17. Product Owner acceptance remains a separate review decision.

## Fresh baseline and ownership

Branch `feat/968-r3-planen` was freshly fetched and verified against `origin/main` at `d61542d79bd0793ea14d64937c214c02021effb8`, the accepted R2 merge named by #968. The branch and `origin/main` were identical and the worktree was clean before this record was added.

#968 and #955 with all comments were re-read. Open PRs were reviewed on 2026-09-17: #963 and the open dependency/Space-picker PRs do not touch Planning, Wishes, Plans, navigation, schedule, completion, or the files inventoried below. Open issue collisions were reviewed: #837 owns Web-reference-first sequencing; #952 remains the accepted schedule contract; #812 owns personal Wish reminders and is excluded; #825 remains the broader parity audit; closed #836 is not revived; #946 remains the final product gate. No competing open R3 implementation was found.

## Current-main reuse and collision inventory

- `SharedPlanningOverviewPage` already owns Plans/Wishes tabs, paged Wish reads, active Plan reads, local create mutations, place options, and readable error/loading primitives. Its gaps are equal card treatment, creation below the collection, no focal/later/undated/history composition, and `<details>`-hosted long forms.
- `planningOverview` already preserves #952 date-only versus timed eligibility and stable upcoming ordering. It is the correct pure selection boundary to extend with explicit focal/later/undated/past/completed groups; no parallel scheduling model is needed.
- `planningPresentation` already owns localized date-only, same-day timed, and cross-day labels. It remains the sole display formatter; R3 changes where the summary appears, not its meaning.
- `PlanningReference.css` and `SharedPlanningPages.css` provide scoped Planning roles and shared form/picker mechanics. Existing semantic F1 tokens remain sufficient; R3 replaces the old card-wall selectors only for the bounded Planen surfaces and does not add token literals or a design-system rewrite.
- `PlanScheduleFields` is the accepted #952 progressive schedule control. It already enforces optional date, time-with-date, end-with-start, cross-day disclosure, clearing semantics, inline validation, and native inputs. It is reused unchanged.
- `PlanProductPage` already owns optimistic-concurrency headers, schedule/unschedule/complete/return/delete mutations, place resolution, and cache invalidation. Its gap is permanent lifecycle form chrome around a read surface.
- `WishProductPage` already owns edit, direct completion, Wish-to-Plan conversion, concurrency, and cache invalidation. Its gap is operational forms dominating the readable desire and a static Back target that loses Wishes context.
- `PlanStoryContinuation` currently implements a second generic Memory/Milestone editor plus Chapter continuation inside Planning. R3 will retire the duplicate Memory editor and hand Memory capture to the canonical R1 route/result contract after Plan completion is already confirmed. Milestone remains a secondary canonical continuation only; Plan completion never depends on either capture result.
- F2 `TaskOriginProvider`, `useEditorHistoryEntry`, `ShortTaskSheet`, and route-result state already provide bounded in-memory origin, dirty/pending exit protection, focus restoration, account/Space invalidation, and safe canonical fallback. R3 extends their existing metadata vocabulary for the selected Planning peer mode instead of adding history or persistent draft storage.
- Wish → Plan remains the existing atomic API transition with `If-Match`; direct Wish completion remains a separate existing mutation. No reminder/deadline semantics are added.
- Current Web unit/E2E coverage includes Planning overview/detail, Wish completion/conversion, focused create, schedule presentation/clearing, completion continuation, keyboard/reflow and the #952 range cases. R3 updates these tests and adds exact-build evidence rather than weakening them.
- Android already has a single Planning destination, Compose/Material sheets, saved focus state, 48 dp targets, domain/ViewModel mutations, schedule semantics, and JVM/Robolectric coverage. Per #837, this PR first settles the normative Web R3 contract. No Android runtime UI is modified before Product Owner review; therefore no native parity or device acceptance is claimed in this delivery.

## Product Design Preflight and Mobile Interaction Contract

**User-facing UI/UX impact: yes.**

| Concern | Bounded contract |
| --- | --- |
| Human outcome | Immediately understand what the couple is looking forward to next, open it as shared content, add an intention with low friction, and return to the same Plans/Wishes context. |
| Relationship value | Anticipation leads; operational state supports it. The surface must not resemble project management. |
| Screen templates | Plan Hub for overview, Detail View for Plan/Wish reading, and focused Create/Edit for Plan creation. |
| Primary Compact state | `Planen` context → Plans/Wishes peer tabs → local add action → nearest dated intention → later agenda → undated intentions → receded past/completed access. |
| Dominant action | On overview, open the focal intention; the local add action remains reachable before content. In creation, Save is the sole dominant action. In completion continuation, canonical Memory capture is optional and Plan completion is already authoritative. |
| Content hierarchy | Title/intention and real localized schedule lead. Description/place/shared context follow. Status, edit, schedule, completion, return-to-Wish, and deletion are contextual operations. |
| Immediate vs. disclosed | Overview content and current peer mode are immediate. Create enrichments, lifecycle operations, destructive confirmation, and completed/past history use deliberate disclosure. Consequences, errors, and unsaved state never hide. |
| Interaction pattern | Native tabs for peer modes; links for content destinations; a dedicated focused route for sustained Plan creation; contextual disclosure for detail operations; native date/time inputs through `PlanScheduleFields`; canonical R1 route for Memory capture. |
| Typing / keyboard | The create task does not autofocus before user intent. Only the intention is required. Date, time, place, and description are optional and progressively disclosed. Completion remains reachable in normal flow and the task protects dirty/pending state. |
| Loading / refresh error | Initial loading is distinct from empty. Known content remains visible during refresh failure and the affected region offers Retry. |
| Empty | Plan-specific copy explicitly allows adding the date later; Wish-specific copy remains about an idea/desire. Each has one local create action. |
| Error / offline | Failed writes retain the task and inputs; offline attempts are truthfully unsaved. No outbox or durable draft is implied. |
| Success | Confirmed Plan creation opens the actual canonical Plan detail. Confirmed Plan completion remains visible before any optional Memory capture; cancelling/failing capture cannot undo it. |
| Return | F2 origin metadata restores Plans versus Wishes, scroll/selected item and focus where supported. Plan returns to Plans; Wish returns to Wishes. Missing/untrusted origin falls back to canonical `/plan` with the resource's semantic mode. |
| Privacy | Wish and Plan remain fixed `SPACE_SHARED`; existing authorization/capability checks and tenant boundaries are unchanged. No owner-only content decorates the overview. |
| Compact / Expanded | 320 px fully reflows. 360/390/430 keep one focal plan and one-column compact agenda. Expanded increases breathing/read width without adding management columns or permanent action panes. |
| Accessibility | Native tab/link/button semantics, semantic headings, textual schedule meaning, visible focus, at least 44 px targets, 200% text, long-label wrapping, focus transfer/restoration, and explicit destructive consequences. |
| Motion | Existing fast/standard semantic motion gives hover/reveal/result feedback. Reduced motion removes transforms and preserves identical state, focus, and recovery information. |
| Visual acceptance | Exact-build browser journeys cover empty/sparse/dense/undated/history, create and later schedule, date-only/same-/cross-day, Wish return/conversion/completion, Plan completion skip/canonical capture cancellation or failure, refresh/save failure, keyboard/focus, 320/360/390/430/Expanded, 200% text, Light/Dark, and reduced motion. |

The compact agenda is intentional because chronological anticipation is the human task. It is not a generic record list: the nearest intention has a distinct focal composition, successors are naturally separated schedule/title rows, and undated/history groups have explicit meaning. Expanded does not introduce a management table or master-detail dashboard.

## Reuse decision

No new dependency, database/domain schema, provider, router, form framework, schedule model, Memory editor, or persistent draft store is introduced. The existing idempotent Wish-to-Plan `200` response now declares the same existing `WishToPlanResponse` body as `201`, allowing canonical client generation to retain the authoritative converted Plan instead of discarding it.

The selected implementation reuses React Router, TanStack Query, native HTML controls, existing F1 semantic tokens, F2 task-origin/editor lifecycle primitives, R1 canonical Memory capture/result, `PlanScheduleFields`, `planningPresentation`, generated Planning clients, and current cache invalidation/concurrency helpers. External OSS/provider review is not applicable: this is a bounded recomposition of existing product behavior and framework capabilities, not commodity infrastructure. A custom universal Planning renderer is rejected because Plan focal content, agenda rows, and Wishes have deliberately different meanings.

## Business / Freemium consistency

**No business/freemium impact.** Shared Plans/Wishes, scheduling, completion, accessibility, return continuity, and canonical Memory continuation remain Free/Core under the current matrix. There is no new entitlement, quota, provider, storage/compute category, managed cost, downgrade behavior, Self-Hosted degradation, or data migration.

## Cross-cutting review

- **Security / authorization / tenant boundaries:** unchanged account/Space-scoped generated clients and capability checks; origin metadata never grants access.
- **Privacy / lifecycle / observability:** no content enters analytics/logs/public URLs or durable browser storage. In-memory origins are invalidated by account/Space changes under F2.
- **i18n / locale:** all new product copy uses localization resources. `planningPresentation` remains the locale-aware schedule source for date-only, same-day and cross-day output.
- **Accessibility:** tabs, headings, textual ranges, focus, dirty-exit confirmation, error association, 44 px targets, reflow, zoom and reduced motion are explicit acceptance items.
- **Concurrency / consistency:** existing `If-Match`, mutation pending locks, Query cache ownership and server-confirmed result ordering remain. Optional capture cannot participate in or roll back Plan completion.
- **Resilience / offline:** reads retain known content; failed/offline writes preserve task state and never imply queued synchronization.
- **Performance:** grouping is a linear pass over already loaded bounded pages. No additional per-item request or media processing is added.
- **API / DTO / migration:** the response payload, database, routes and schedule DTO semantics remain unchanged. The OpenAPI declaration for the existing idempotent conversion response is corrected and the Web client is canonically regenerated to return `WishToPlanResponse`; no migration is required.
- **Self-Hosted / release:** client-only composition, no configuration or provider difference.
- **Testing:** pure selector/presentation tests, RTL component/task lifecycle tests, targeted and full browser tests, build/type/lint/format/governance gates, and exact-build visual/behavioral evidence are required.

## Native sequencing decision

Web is the completed scope of this reviewable R3 delivery. Android current behavior and infrastructure were inventoried, but runtime adaptation is intentionally deferred under #837 until Product Owner review stabilizes the normative Web contract. This document does not claim native R3 parity or native device acceptance.

## Delivery and validation

The Web delivery implements the anticipation-first Plan Hub, dedicated focused Plan/Wish creation, read-first Plan/Wish detail, disclosed lifecycle operations, canonical post-completion Memory/Milestone routes, and origin-aware return continuity. Wish creation retains shared-visibility information with Wish-specific language, and Wish-to-Plan conversion opens the authoritative returned Plan detail while carrying a valid F2 origin. It preserves the accepted #952 scheduling semantics and existing optimistic-concurrency, cache, tenant, and capability boundaries.

Validation completed against the final implementation:

- `npm run tokens:check` — passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed across 427 files.
- `npm run format:check` — passed across 424 files.
- `npm run build` — passed. Vite reported only its existing third-party `use client` notices and the non-blocking bundle-size advisory.
- `npx vitest run --reporter=dot --maxWorkers=1` — 139 files passed, 1 skipped; 864 tests passed, 1 skipped. A preceding parallel run hit two unrelated five-second timeouts; both passed in isolation (20/20) before this clean serialized run.
- The consolidated Chromium suite for Planning creation, overview, detail, Plan/Wish completion, inline Place creation, accessibility, Quick Create, and Today freshness — 71/71 passed.
- `git diff --check` — passed before commit.

Exact-build visual and behavioral evidence is stored in [`evidence/r3/`](evidence/r3/README.md), covering 320/360/390/430 px Compact, representative Expanded, 200% layout zoom, Light/Dark, reduced motion, sparse/dense/empty content, cross-day ranges, and completion continuations. The captures correspond to product-source commit `52cf5d9525a0bc1e0587ab9f3c006cf96446ba47`, recorded alongside checksums in the evidence directory.

Known scope boundary: Android runtime adaptation and native device acceptance are intentionally deferred under #837. No Product Owner acceptance, native parity, or merge readiness is inferred from this record, local validation, or green CI.

# F2 task boundaries — preflight and delivery contract

**Owner:** [#958](https://github.com/baerenmarke90/eimir/issues/958), within the #955 program.  
**Authority:** [Product Reference v1](product-reference-v1.md), Interaction DNA/D3/D4, [R1/R2](reference-screens.md) and [system direction](design-system-direction.md).  
**Status:** implementation under review; preflight recorded before runtime implementation on 2026-09-16. This document does not accept the finished R1/R2 compositions.

## Fresh baseline and ownership

The isolated `codex/958-task-boundaries` worktree starts at `01fd7fe114aedeb9e0ece49e9b3c8d8186ce4c7a`, freshly fetched `origin/main`. F1 #957 is complete via merged #960; its additive visual roles and evidence are the baseline. #953 identity migration and #951/#952 progressive planning behavior remain accepted.

#955 was read completely with comments. It initially had no comments and was closed by GitHub's PR-linked event immediately after #960 merged, although the master acceptance criteria remain incomplete. The tracker was restored with an explanatory comment; no product decision changed. Future PR descriptions must put the parent reference on a separate line from closing keywords, including negated closing phrases.

The 18 open PRs are #763, #762, #339, #317, #234, #233, #232, #207, #157, #156, #142, #141, #140, #139, #136, #135, #133 and #132. No competing lifecycle/design implementation is open. Draft #317 targets `feat/298-m5-web-space-context` and overlaps `App.tsx`, Space context and German localization: F2 preserves current authorized Space selection and will recheck overlapping hunks. Dependency/build PRs are not adopted; package versions stay locked. #685 remains the broader native editor lifecycle owner; this slice handles only Memory capture. #825, #837 and final acceptance #946 retain their broader scopes.

Mandatory engineering, Clean-Room, reuse, cross-cutting, business/matrix, provider, roadmap/status/M5, design foundations, component contracts, tokens and normative v1/F1 sources were reviewed. No Classic/SharedMoments source was consulted.

## Product Design Preflight and Mobile Interaction Contract

**User-facing UI / UX impact: yes.** The complete issue contract in #958 is binding; these are its concrete consumers and implementation decisions.

| Concern | Bounded contract |
| --- | --- |
| Human goal | Capture a shared moment, recognize the saved object, and return without losing the browsing context. |
| Proof A | Global Quick Create → existing Memory capture → canonical returned Memory detail → originating context. Test text/media, cancel, pending, failures, delayed response and direct entry. |
| Proof B | Timeline with visible non-default year/type → older Memory detail → same tab/scope, loaded range and position. Web preserves its existing order filter; native retains its existing newest-first order. The accepted return proof uses newest-first order. |
| Template | Create/Edit and Detail View for capture/result; Story Timeline and Detail View for browsing; short Sheet/Dialog for bounded choice or discard confirmation. |
| Content / action | Authored media/words and selected Memory remain focal; choose a type, then Save, then read the actual result. Task-specific Close/Back replaces competing root navigation while composing. |
| Scope | Keep current capture presentation except the task boundary/feedback needed here. R1 owns the complete composer hierarchy; R2 owns full album/Discover/filter composition and broader Search/Chapter returns. |
| Immediate / disclosed | Task identity, shared audience, completion, exit, pending and failures remain visible. No unsolicited keyboard. Optional enrichment remains within the existing domain surface. |
| Compact / Expanded | A full page for sustained media/text input; short choices in modal surfaces. Same semantics at 320/360/390/430 and Expanded, readable width, 200% text, safe areas/IME and 44 CSS px/48 dp controls. Extra width adds no new required fields. |
| Loading / empty | Stable task and upload progress; retain known Timeline content during refresh. Applied scope remains visible and no-match differs from first-use empty. |
| Filter | The bounded Timeline filter uses draft selections and explicit Apply; Cancel/Close/Back keeps the applied scope. No filter state is copied into sensitive query/history payloads. |
| Error / offline | Retain safe in-session input and attachment state. Offline before submission is unsaved and may be deliberately retried; an ambiguous create response is explicitly uncertain and cannot be blindly repeated. No outbox/durable-draft promise. |
| Partial confirmation | Creation, attachment association, and projection refresh are distinct. Preserve the confirmed Memory identity after binding failure; resume only association against that object after checking current version/state. Refresh failure cannot turn a confirmed save into an unsaved create. |
| Pending / concurrency | Lock duplicate activation synchronously. Freeze the submitted controls and guard session/generation on completion; a stale response cannot clear newer work or navigate another account/Space. Pending exits remain blocked with visible explanation. |
| Success | Open the canonical returned Memory once, with accessible saved feedback. Preserve origin through the result; old create state is replaced so Back cannot accidentally resubmit it. |
| Back / dismiss | Innermost modal consumes dismissal. Dirty task exit offers Keep editing or deliberate Discard; pending exit does not lose the result. Cancel restores trigger focus; destination navigation hands focus to the destination without opening the keyboard. |
| Return / lifetime | Only same-context, allowlisted local origins are valid. Bounded in-memory metadata references existing query/cache state; browser history carries opaque keys only. No origin/reload/stale key uses canonical `/story`. Native reuses its authorized navigation back stack. |
| Privacy | Memory remains shared. No body, sensitive search, credentials, presigned URLs or draft enters return URLs/history/analytics/storage. Account/Space boundary clears transient context and drafts; origin does not grant authorization. |
| Motion | Reuse F1/Material tokenized causal transitions. Reduced motion retains state, focus, result and recovery without movement; no blocking celebration. Warmth remains in personal content, typography and restrained feedback. |
| Evidence | Real production-consumer journeys, not the F1 static proof: Web Compact/Expanded Light/Dark, reflow, large text, keyboard/reduced motion and failure/return assertions; Android emulator actual navigation/IME/System Back/semantics with exact build identity. Record TalkBack evidence honestly and any remaining manual limitation. |

### Concrete consumer boundaries

- Web `QuickCreateMenu.tsx` uses a minimal shared `ShortTaskSheet` backed by the browser modal primitive; compare/reuse the working focus and history behavior from `RelatedPersonEditorSheet`, `PlanningEditorLifecycle` and `useEditorHistoryEntry`. Do not bulk-migrate those editors.
- A context-scoped `TaskOriginProvider` supplies bounded origin capture, validation and return. `StoryProductPage.tsx`/`StoryList.tsx` and `RouteEntryHandoff.tsx` consume it with existing URL filter serializers and TanStack infinite-query ownership. Canonical/legacy route builders stay unchanged.
- Extract existing `MemoryCreatePage` from `App.tsx` only as needed for focused lifecycle testing. Reuse `useAttachmentDrafts`, `AttachmentDraftPicker`, existing generated APIs and `createMemoryWithReadyAttachments`; correct its result boundaries instead of introducing another domain-save path. `MemoryProductPage.tsx` displays result/return; `AppShell.tsx` hides competing root controls for this focused task only.
- Native `reference/MainActivity.kt`, `shell/AppNavigation.kt`, `shell/AppShell.kt`, `QuickCreateFab.kt`, `ReferenceFlowScreen.kt`, `ReferenceViewModel.kt`, `ReferenceFlow.kt`, `StoryScreen.kt`, a focused `MemoryCreateScreen.kt` and existing `MemoryScreen.kt` own the proof. Add a focused capture destination inside current Navigation Compose; keep text/image draft and generation in existing ViewModel memory, route only confirmed identity to the canonical detail, and preserve the existing Story destination/filter/list state beneath it. Reuse Material 3 `ModalBottomSheet`/confirmation and existing planning inset patterns. Native currently exposes only cursor paging: `ReferenceContract.kt`/`OkHttpReferenceApi.kt` may add year/type arguments to the existing backend Timeline API, with actual Apply/Cancel semantics and no new backend contract. Preserve scoped loaded pages on ordinary return; do not label unfiltered persistent cache as filtered content. Scoped native reads remain in memory for this slice.

## Reuse selection (2026-09-16)

Installed: React/DOM 19.1.1, React Router 7.18.2, TanStack Query 5.85.5; Android Compose BOM 2026.08.00, Material 3 1.4.0, Navigation Compose 2.10.0, Activity Compose 1.13.0, Lifecycle ViewModel Compose 2.11.0 and Kotlin 2.3.21.

- **Web platform:** [HTML dialog](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element) supplies top-layer modality and inactive background. [WAI-ARIA dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) defines focus/dismissal outcomes. Select a small React adapter with visible Close and existing product history policy; do not maintain another general focus-trap implementation.
- **Routing/cache:** current `BrowserRouter` is declarative. [React Router blocking](https://reactrouter.com/api/hooks/useBlocker) and [scroll restoration](https://reactrouter.com/api/components/ScrollRestoration) were considered; data-router migration and sessionStorage restoration are outside this bounded/private state contract. Reuse existing editor history plus supported unload protection for the focused page. [TanStack cached query restoration](https://tanstack.com/query/latest/docs/framework/react/guides/scroll-restoration) retains the existing loaded data; add only opaque-origin/position coordination. Custom code is needed for account/Space and domain-confirmed-result meaning that the router cannot infer.
- **Native platform:** keep [Navigation multiple back stacks](https://developer.android.com/guide/navigation/backstack/multi-back-stacks), [Material bottom sheets](https://developer.android.com/develop/ui/compose/components/bottom-sheets) and [Compose inset consumption](https://developer.android.com/develop/ui/compose/system/insets-ui). Existing ViewModel, Photo Picker and authorized media/cache infrastructure supply task lifetime and media; no routing, modal or durable-draft library is needed.
- **OSS/provider alternatives:** React Aria/Radix-style modal packages and a replacement router could provide general infrastructure, but duplicate available native facilities and introduce migration/dependency scope without solving domain result ownership. No external provider solves these local interactions. Existing MIT Web and Apache-2.0 Android framework licenses/provenance remain unchanged; no new commercial terms, attribution, provider data transfer, storage/deletion obligation, cost, quota or normal-user/hoster setup. Cloud and Self-Hosted use the same clients.

## Business/Freemium Model Consistency

**No business/freemium impact:** Memory CRUD/Timeline, search and official clients remain Free/Core; accessibility/privacy/safe recovery remain non-paywallable. Existing attachment storage/quota semantics, couple/Space entitlement ownership, Cloud/Self-Hosted behavior, operating costs, trial/downgrade/restore/export and retained content are unchanged. No new server, provider, derivative, background processing or durable draft storage is introduced.

## Cross-cutting review

- Security/privacy: validate origins and preserve generated API authorization, canonical/legacy paths and safe denial. Clear account/Space context; test stale/foreign/invalid keys and late responses. Transient state never substitutes for permission.
- Accessibility/i18n: localized pending/partial/uncertain states, native modal semantics, visible Close, nested Back/Escape, trigger/destination focus, reflow/targets/IME, actual Light/Dark and reduced motion. No new analytics or content logging.
- Consistency/resilience: submitted snapshot + synchronous pending lock + generation ownership. Known-created partial failure resumes the same object. Unknown create outcome requires explicit uncertainty; no automatic retry or invented idempotency guarantee. Existing backend reconciliation limits must have a traceable follow-up owner before claiming recovery.
- Performance: bounded origin metadata, existing cached pages, no second content cache, release media URLs on actual task end. Do not pin all history indefinitely.
- Contracts/operations: no backend/schema/database/provider change; no new settings. Additive client component APIs and bounded consumers only; other editor migrations remain with their owners.
- Validation: meaningful helper/session/origin regression tests, existing authorization/cache/attachment/legacy cases, browser behavior and emulator evidence, then required CI. Record actual commands/results and limitations after implementation; screenshots alone do not prove continuity.

## Delivery and validation

Backend follow-up [#961](https://github.com/baerenmarke90/eimir/issues/961) owns request identity/reconciliation for a Memory create whose response is lost. F2 must not infer non-creation from a timeout or repeat POST in that state. The follow-up was recorded before depending on recovery; F2's uncertainty handling does not depend on its implementation.

### Delivered ownership

| Boundary | Web | Android |
| --- | --- | --- |
| Short task | `ShortTaskSheet` adapts native `dialog.showModal()` for Compact Quick Create, Timeline filters and discard confirmation. Expanded Quick Create retains its existing non-modal menu. | `ShortTaskSheet` adapts Material 3 `ModalBottomSheet` for Quick Create and Timeline scope. Platform dialogs own discard/pending explanations. |
| Focused capture | `MemoryCreatePage` is keyed by account, Space and route entry. `AppShell` removes competing primary navigation during this task. | `MEMORY_CREATE_ROUTE` is a focused Navigation Compose destination. Existing ViewModel owns the transient `MemoryTask`; system picker and upload ownership remain in the current reference flow. |
| Result | `createMemoryWithReadyAttachments` returns the confirmed object; the existing Memory query is seeded and canonical detail opens once. Projection invalidation is independent. | The same existing domain save path reports creation separately from binding. Confirmed identity replaces the capture destination with canonical detail. |
| Return | `TaskOriginProvider` keeps at most 12 origins for 30 minutes in memory, scoped to account/Space. History stores only opaque keys; existing query pages and selected-item offset restore Timeline. | Existing authorized back stack and Story destination retain scope, loaded items, cursor and list position. Empty/direct back stacks use Story. |
| Filter | Compact edits a draft and applies explicitly; dismissal preserves the applied URL scope. Discover reads its own default scope. A selected year remains visible even with no matches. | In-memory year/type scope uses the existing Timeline endpoint; Apply replaces scope, Cancel retains it. Filtered data is never read from the unfiltered persistent cache. |

Consumers must close a short sheet before navigating. Web `closeForNavigation` removes the sheet's temporary history entry, ends native modality and then performs the destination handoff. Nested Back is owned by the innermost editor marker; the existing planning/person/place/collection/chapter consumers keep their established contract. Native uses the platform modal/back-stack ownership instead of copying the browser mechanism.

A known-created Memory with an unconfirmed photo association offers reconciliation or opening the saved text with an explicit photo warning. Reconciliation first reads the same authorized Memory: exact intended associations count as confirmed; only an unchanged version with no bound photos may be retried. Concurrent changes are not overwritten. A post-save read failure retains the known result; Web presents this fallback read-only, while Android retains its existing capability-gated editing behavior. Authoritative access denial or removal hides retained content on both clients.

Drafts and origins are not durable. Ordinary native rotation/backgrounding uses the existing ViewModel lifetime; process death does not promise recovery. Web unload protection can ask the browser to confirm leaving but cannot guarantee survival after tab closure, reload or process termination. Account/Space teardown invalidates outstanding ownership before late completion can clear or navigate newer work. No automatic offline replay, new synchronization service or server idempotency is implied.

### Review status

The final diff retains the preflight's **No business/freemium impact** result: the same Free/Core content, attachment quota, ownership and Cloud/Self-Hosted behavior apply. No dependencies, backend schema, provider, durable draft store or new normal-user configuration were added. Existing cache authorization is preserved, with scoped native Timeline errors and denial cleanup; no content or return payload logging was added.

### Validation

The [production journey evidence](evidence/f2/README.md) records exact source identities, configuration, assertions, screenshots and limits.

- Web unit suite: 850 passed, with one existing integration-only skip. Token generation, lint, formatting, TypeScript and the production build passed. Build output retains the existing directive/chunk-size warnings.
- Bounded Web proof: 32/32 scenarios passed without retries on `23862d61759558836d5c605e3340e665d57d0e39`. The runtime source remains unchanged after capture.
- Broader browser regression: 279/287 initially passed. Eight existing expectations assumed the previous inline filter, floating navigation during capture, custom focus loop or post-save Story route. They now assert the F2 task contract; the affected cases passed on targeted reruns. The complete suite runs again in CI.
- Product-design gate tests and the scoped English-language audit passed. Native final tests, device/TalkBack evidence and required CI are being completed before merge readiness.

The master program and full reference compositions remain separate owners.

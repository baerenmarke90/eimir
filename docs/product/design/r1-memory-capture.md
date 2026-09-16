# R1 — Neuer Moment: preflight and delivery contract

**Owner:** [#964](https://github.com/baerenmarke90/eimir/issues/964), within the #955 program.
**Authority:** [Product Reference v1](product-reference-v1.md), Interaction/Input philosophy, [R1 reference experience](reference-screens.md#r1--neuer-moment) and [system direction](design-system-direction.md).
**Status:** implementation under review; preflight recorded before runtime implementation on 2026-09-16. This document does not by itself accept the finished composition — that requires Product Owner visual/interaction review of the actual build.

## Fresh baseline and ownership

Branch `feat/964-r1-memory-capture` starts at `6ca1df8ed414bee7a46cc29702377b6bc0153f4a`, freshly fetched `origin/main`. #957 (F1) and #958 (F2) are merged (#960, #962); their visual roles and task-boundary contract are the accepted baseline this issue revalidates rather than replaces.

#955 was re-read completely with comments (its body currently has no comments; the tracker's acceptance checklist remains open pending R1–R5/P1–P3/C1). #964's own body/acceptance criteria were re-read in full. #961 (backend Memory-create reconciliation) is open and unimplemented; R1 keeps F2's existing explicit-uncertainty behavior unchanged and does not attempt reconciliation or blind retry.

Open PRs reviewed: #963 (CI artifact retention), #763/#762/#339/#234/#233/#232/#207/#157/#156/#142/#141/#140/#139/#136/#135/#133/#132 (dependency bumps, not adopted — package versions stay locked), and #317 (draft, targets `feat/298-m5-web-space-context`, touches `App.tsx`/Space context/localization). None of these touch `MemoryCreatePage`, `ReferenceFlowScreen`/`MemoryCreateScreen`, `AttachmentDraftPicker`, `useAttachmentDrafts`, `memoryAttachmentDraft`, `TaskOriginProvider` or `ShortTaskSheet`. No competing capture/Memory/native work is open; no collision found.

## Product Design Preflight and Mobile Interaction Contract

**User-facing UI/UX impact: yes.**

| Concern | Bounded contract |
| --- | --- |
| Human goal / relationship value | Keep a photo, a sentence, a title-only memory, or a mix of these while the moment is still present. Capture must read as keeping a memory, not filling in a record. |
| Screen Template | Create/Edit (capture) and Detail View (result), per [Screen Templates](../../SCREEN-TEMPLATES.md); short Sheet/Dialog for the existing discard confirmation. |
| Primary Compact screen/state | One full-page composer (`MemoryCreatePage` on Web, the capture destination on Android), not a sheet — F2 already established this as a focused task-boundary page; R1 keeps that boundary and rebuilds its internal composition. |
| Dominant action | Save. One filled primary action at the bottom of the composer, with pending/result status; Close/Cancel remain available but visually secondary. |
| Content hierarchy | 1) task header + Close, 2) photo action / selected media, 3) visible labeled narrative field, 4) optional title, 5) visible local-date summary + change action, 6) explicit fixed shared audience, 7) no further optional fields exist in the current domain contract (title/body/date/photos are the complete set — nothing is invented to fill a 7th slot), 8) one dominant Save action. |
| Immediate vs. disclosed | Photo action, narrative, title, date summary and audience are all immediately visible — none is hidden behind a generic "more details" disclosure. Only the date's own editable input is progressively revealed by its own explicit "Ändern" action; this is not the same as hiding narrative/audience, which the reference explicitly forbids. |
| Interaction pattern | Full task page (reused from F2); no new sheet/router/form engine. Photo selection uses the existing native/system file picker via `AttachmentDraftPicker` (Web) / system Photo Picker (Android). Tapping narrative starts typing; no autofocus on neutral entry. |
| Loading / pending | Existing F2 pending lock (fieldset disabled, submit button freezes to the localized `memory.saving` label, synchronous duplicate-submit guard) is retained unchanged. |
| Empty state | Initial empty composition shows the photo action, the narrative field and the optional title immediately — no illustration, no giant empty photo placeholder for text-only capture. |
| Error state | Existing per-attachment failed/retry, definitive rejection (kept editable), and `ProblemState` rendering are retained unchanged; only their position in the page (after the form, before the discard sheet) is unchanged. |
| Offline state | Existing explicit offline-before-submit alert is retained unchanged; no new offline queue. |
| Success state | Existing confirmed-result handoff to `MemoryProductPage`/native `MemoryScreen` via `createMemoryWithReadyAttachments`/`saveMemoryWithPreparedAttachments` is retained unchanged. |
| Privacy / relationship state | Existing fixed shared-audience note (Web `immersive-sharing-note`, Android `VisibilityBadge(isShared = true)`) is retained, repositioned to sit after the date summary and before Save — visible at the point of consequence, never invented as a choice. |
| Large text / narrow viewport | 320 px reflow, 200% text and long localized labels are evidenced at 320/360/390/430 px; the composite date "summary + change" control and the demoted title field both use wrapping flex layouts with no fixed pixel widths. |
| Motion / reduced motion | Reuses existing `eimir-motion-reveal`/F1 tokenized transitions for the card entrance and the details/summary chevron rotation is removed (the disclosure it decorated is removed); no new animation is introduced. Reduced motion continues to retain all state/focus/result information. |
| Expanded/Web adaptation | Same hierarchy at wider viewports; extra width goes to the media/reading column, not to newly-exposed permanent fields — consistent with "no unnecessary permanent fields on wide screens." |
| Conventional pattern justification | The page-as-composer pattern (not a card-wrapped form) is the R1-mandated pattern; no table/list/master-detail is used here. |
| Reused platform patterns | Web: native `<dialog>`-backed `ShortTaskSheet` discard confirmation (unchanged from F2), native `<input type="date">` + `showPicker()` for the date change action (`openNativeDatePicker`, existing helper), native file input via `AttachmentDraftPicker`. Android: system Photo Picker (unchanged), Material 3 `AlertDialog` (unchanged), plain `OutlinedTextField`s. |
| Avoiding unnecessary typing / early keyboard | No field autofocuses on page entry (the page heading receives programmatic focus, not a text field); tapping the narrative or title is the only way to summon the keyboard for those; the date field only becomes an editable text/native-picker control after the explicit "Ändern" tap. |
| Visual acceptance plan | Exact-build screenshots at 320/360/390/430 px Compact and a representative Expanded width, Light/Dark, photo-only/text-only/title-only/mixed content, 200% text, and the existing error/offline/uncertain/partial states — captured against the actual running Web build and an Android emulator build; see `evidence/r1/`. |

### Concrete consumer boundaries

- **Web:** `MemoryCreatePage.tsx` is rewritten in place (same component, same props/route, same F2 task-boundary/session-guard/history logic) — only its internal JSX order and a small number of new pieces of local UI state (`dateEditorOpen`) change. `AttachmentDraftPicker`/`useAttachmentDrafts`/`memoryAttachmentDraft`/`TaskOriginProvider`/`ShortTaskSheet`/`useEditorHistoryEntry` are reused with no API changes. `memory-create-polish.css` (the existing scoped CSS-only polish layer from #855/#881/#888) is extended, not replaced, and a small addition to `dateInput.ts` adds a `formatDateSummary` helper alongside the existing `formatDateInputValue`. `MemoryProductPage.tsx` (result/return) and its edit-mode form are unchanged — R1 is bounded to the create composition; the separate edit-mode form retains its existing field-by-field layout, which is an explicit-form editing context per the Input Philosophy table, not a from-scratch capture moment.
- **Android:** `story/MemoryCreateScreen.kt` and `reference/ReferenceFlowScreen.kt`'s embedded-capture branch are reworked so the capture composition owns its own layout directly (photo → narrative → title → date summary → audience → save) instead of the M2-era `embedded` flag reusing the reference-flow page's field order. `ReferenceViewModel.kt`/`MemoryTask.kt`/`ReferenceFlow.kt` (state machine, upload/bind, uncertain/partial-recovery logic) are reused unchanged — this is a pure Compose-layout rework of `ReferenceFlowScreen`'s embedded branch plus `MemoryCreateScreen`'s wrapper, not a ViewModel change. `design.VisibilityBadge` is reused for the audience indicator. `MemoryScreen.kt` (canonical result) is unchanged.

## Reuse selection (2026-09-16)

No new dependency is introduced on either platform. Web: `formatDateSummary` reuses the existing `Intl.DateTimeFormat` approach already used by `formatDateInputValue` in `dateInput.ts`, just with `dateStyle: 'long'` instead of explicit 2-digit parts — same platform API, no library. The date "summary + change" control reuses the existing native `<input type="date">` and `showPicker()` (`openNativeDatePicker`), just toggled visible/hidden by local state instead of always rendered inside a generic `<details>`. Android reuses `plan/PlanPresentation.kt`'s `formattedDate` pattern (localized `DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG)`) rather than introducing a new formatting utility; because that helper is `internal` to the `plan` package, R1 adds an equivalent small `formattedDate` in the `reference`/`story` package rather than changing `plan`'s visibility (avoids widening an unrelated package's public surface for one caller). No new OSS/provider alternative was evaluated as necessary; this is a reordering and light-enhancement of already-accepted F1/F2/#855 primitives.

## Business/Freemium Model Consistency

**No business/freemium impact.** Memory CRUD and official-client capture remain Free/Core. No new field, storage derivative, managed-compute category, quota semantics or Self-Hosted degradation is introduced. Accessibility, privacy and safe recovery remain non-paywallable and unchanged.

## Cross-cutting review

- **Security/authorization/tenant boundaries:** unchanged — same account/Space-scoped `apis`, same `TaskOriginProvider`/native back-stack ownership, same generated-client calls.
- **Privacy/draft/media lifecycle:** unchanged — no new field enters logs/analytics/history/storage; the composite date control's local `dateEditorOpen` boolean is transient render state, not persisted.
- **i18n/dates/long labels:** date summary uses the existing locale-resolution path (`resolvedLocale()`); new/changed `de.ts` strings (`memory.intro`, `memory.titleLabelOptional`, `memory.dateChangeAction`) are added to the single existing `de` locale, consistent with the app's current de-DE-only i18n surface; `memory.addMoreDetails` is removed as dead (it had exactly one call site, the disclosure being removed).
- **Accessibility/focus/scaling:** the date "summary" element is a real `<button>` with an associated persistent `<span>` label via `aria-labelledby`, so it remains keyboard/TalkBack operable and announces both the current value and the change affordance; the demoted title field gets a visible (not `sr-only`) persistent label for the first time, improving rather than regressing accessibility; no essential control drops below 44 CSS px / 48 dp.
- **Concurrency/stale responses/duplicate submission:** unchanged — F2's `owner` session-guard ref, `pending` lock and generation ownership are untouched.
- **Resilience/offline/retry/uncertain outcome:** unchanged — the existing offline-before-submit, definitive-rejection-retains-input, and uncertain-network-outcome (no blind retry, #961 remains the owner) behaviors are preserved verbatim; only their position in the render tree moves.
- **Observability:** no new logging/analytics of content is added.
- **Performance:** removing the `<details>` wrapper and the hero-title styling is a net reduction in DOM/CSS; the new auto-growing narrative `<textarea>` uses a plain ref-based height adjustment with no new dependency.
- **API/DTO/compatibility/canonical routes:** unchanged — `MEMORY_CREATE_ROUTE`, `MemoryCreate`/`MemoryDetail` generated types and `createMemoryWithReadyAttachments` are untouched.
- **Self-Hosted/upgrade/release impact:** none — client-only composition change.
- **Test levels:** unit (Vitest/RTL for `MemoryCreatePage`, JVM/Robolectric for `ReferenceFlowScreen`/`MemoryCreateScreen`), browser (Playwright, updated for the new DOM order/labels), and native device/emulator evidence (Robolectric `TaskJourneyTest` plus manual/automated emulator capture) are all updated as part of this slice.

## Delivery and validation

Recorded after implementation, with exact commit/build identities, in the same document (see the Validation section added by the follow-up commit) and in `evidence/r1/`.

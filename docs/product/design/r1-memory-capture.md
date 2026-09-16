# R1 — Neuer Moment: preflight and delivery contract

**Owner:** [#964](https://github.com/baerenmarke90/eimir/issues/964), within the #955 program.  
**Authority:** [Product Reference v1](product-reference-v1.md), [R1 reference experience](reference-screens.md#r1--neuer-moment), [system direction](design-system-direction.md), and the accepted F1/F2 contracts.  
**Status:** implementation and exact-build evidence complete; Product Owner visual/interaction review accepted; final required CI remains the merge gate.

## Fresh baseline and ownership

Branch `feat/964-r1-memory-capture` started from fresh `origin/main` at `6ca1df8ed414bee7a46cc29702377b6bc0153f4a`, after F1 #957/#960 and F2 #958/#962 were accepted. #955 and #964 were re-read before runtime implementation and open PRs were checked for capture/Memory/native collisions. No competing R1 implementation was found.

#961 remains the owner of backend reconciliation for a Memory create whose successful response is lost. R1 preserves F2's explicit uncertain-outcome state and does not blindly repeat the create request.

## Product Design Preflight and Mobile Interaction Contract

**User-facing UI/UX impact: yes.**

| Concern | Bounded contract |
| --- | --- |
| Human goal | Keep a photo, a sentence, a title-only Memory, or a mix while the moment is still present. Capture must feel like keeping a memory, not filling in a database record. |
| Screen template | Create/Edit capture task followed by canonical Detail View result; the existing short discard dialog remains the only secondary task boundary. |
| Dominant action | One Save action. Close/Back remain available but secondary and follow the F2 dirty/pending contract. |
| Compact hierarchy | Task header/Close → photo action or selected media → visible narrative → optional title → local-date summary/change → explicit fixed shared audience → Save. |
| Content priority | Selected media becomes the focal content. Text-only capture receives real writing space without an artificial photo placeholder. |
| Progressive disclosure | Narrative, title, date and audience remain visible. Only the date editor itself is revealed by the explicit change action; no generic “more details” container hides core capture content. |
| Entry / keyboard | Quick Create and local capture actions enter the same task. No text field autofocuses on neutral entry. Typing or selecting photos is an explicit user action. |
| Picker / interruption | Picker cancellation, resize/orientation and controlled exits preserve the in-session draft. No cross-session draft or offline outbox is implied. |
| Save lifecycle | Snapshot submitted content/media, prevent duplicate activation, retain work on validation/upload/server failures, and prevent stale completion from clearing newer work. |
| Result / return | Announce success only after confirmed persistence, open the returned canonical Memory, then preserve the valid F2 origin/return context. |
| Unknown create outcome | Remains explicitly uncertain. No blind create retry until #961 supplies a reconciliation contract. |
| Privacy | Memory keeps its fixed shared semantics. No private-Memory toggle is invented. |
| Compact / Expanded | Compact is normative. 320 reflows; 360/390/430 preserve the same hierarchy. Expanded adds useful width rather than extra permanent fields or management chrome. |
| Touch / accessibility | Web targets remain at least 44×44 CSS px and Android at least 48×48 dp. Persistent labels, logical focus/semantics, 200% text and long-label reflow remain operable. |
| Motion | Existing restrained F1/F2 feedback is reused. Reduced motion preserves all state, result and recovery information. |

## Concrete implementation boundaries

### Web

`MemoryCreatePage` is recomposed in place. The route, F2 task ownership, `TaskOriginProvider`, `useEditorHistoryEntry`, `ShortTaskSheet`, attachment draft APIs, canonical result route and save path remain the source of truth.

The finished composition removes the form-card/details-first presentation and makes photo/narrative first-class. Title remains optional. `dateInput.ts` adds only a localized summary helper; the existing native date input and picker behavior remain. `MemoryProductPage` remains the canonical read result and is not replaced by a second result surface.

The task heading keeps its programmatic `tabIndex=-1` focus transfer for assistive technology, while the browser's misleading default focus rectangle around the entire non-interactive header is suppressed. Interactive controls retain their normal focus treatment.

### Android

The affected native capture branch in `ReferenceFlowScreen` / `MemoryCreateScreen` is recomposed as photo → narrative → optional title → date → shared audience → Save. Existing Navigation Compose ownership, system Photo Picker, ViewModel/task state, upload/bind behavior, uncertain/partial recovery and canonical `MemoryScreen` result are retained.

A narrow localized fallback title is supplied only when the visible optional title is blank so image-only and text-only capture remain valid without introducing a new domain API or parallel save path.

## Reuse decision

No new dependency, router, form framework, modal stack, media provider or generalized composer abstraction was introduced.

Web reuses native `<input type="date">`, `showPicker()`, the existing file picker/attachment draft flow, `Intl.DateTimeFormat`, F1/F2 semantic tokens and task primitives. Android reuses Material 3, Navigation Compose, the system Photo Picker, current ViewModel/task lifecycle, `VisibilityBadge` and the existing localized date-formatting pattern.

## Business / Freemium consistency

**No business/freemium impact.** Memory CRUD and official-client capture remain Free/Core. No entitlement, tier boundary, quota, provider, storage derivative, managed-compute category or Self-Hosted behavior changes. Accessibility, privacy and safe recovery remain non-paywallable.

## Cross-cutting review

- **Security / authorization / tenant boundaries:** unchanged; the same account/Space-scoped APIs and canonical capability checks remain.
- **Privacy / draft / media lifecycle:** unchanged; no draft/media payload, token or presigned URL is added to logs, analytics, history or general storage.
- **i18n / dates:** Web uses the existing locale resolution; Android uses the platform localized date formatter. New user-facing strings remain in the established localization resources.
- **Accessibility:** persistent labels, touch targets, focus/semantics, large text and reduced-motion behavior are covered by tests/evidence. No essential gesture-only control is added. The programmatic heading focus remains in place without presenting a false interactive focus frame.
- **Concurrency:** F2 generation/session ownership and duplicate-submit locking remain in place; stale completion cannot clear newer work.
- **Resilience:** offline-before-submit, validation rejection, partial association and uncertain outcome remain distinct states. Unknown create is not blindly retried.
- **Observability / performance:** no content logging or new runtime dependency; the composition reduces wrapper/form chrome rather than adding a new framework.
- **API / DTO / Self-Hosted:** no backend, DTO, database, deployment or configuration change.

## Delivery and validation

### Web

- `npm run typecheck`, `npm run lint`, `npm run format:check` and production build pass on the submitted branch.
- Vitest: **850/850 passed**, with the existing single skip unchanged.
- Focused R1/F2 Playwright validation: **101/101 scenarios passed** before PR CI; the full repository Web Browser QA is also required on the final submitted head.
- The finished composition revalidates F2 dirty/pending/uncertain/partial/duplicate-submit/offline/late-response/origin-return behavior instead of introducing a second lifecycle.
- Final exact-build evidence under `docs/product/design/evidence/r1/` was generated from Web source commit `34c770006bb191b75c099b59e02da3f16ef8021d` and covers 320/360/390/430/1280, Light/Dark, text-only, title-only, photo-only, mixed, date editing, 200% text, reduced motion and confirmed canonical result. The committed `r1-web-source-commit.txt` records the same source revision.
- The final R1 evidence spec completed **19/19** scenarios after the heading-focus visual polish. Representative Compact, Expanded, Dark, 200% text and canonical-result captures were reviewed against Product Reference v1.
- Validation found and fixed an invalid-date `RangeError`, insufficient Dark-mode contrast on the date change action, the missing reduced-motion override for that control, empty-capture submission on Web/Android, and the misleading browser focus rectangle around the programmatically focused non-interactive Web task heading.

### Android

- `./gradlew :app:testDebugUnitTest`: **599/599 passed**, with the existing single skip unchanged.
- `./gradlew :app:lintDebug`: **0 errors**; touched code introduced no new warning.
- `./gradlew :app:assembleDebug`: succeeds.
- Final exact-build emulator evidence is committed under `docs/product/design/evidence/r1/android/` for Android implementation source commit `426ac8b545cda81b38f8ffa7ce965d197305ab3f`; the recorded debug APK SHA-256 is `e98b915a236af897684c15976a7a62b9577cff9eac32166b829ddb54e07224a0`.
- The recorded matrix covers Compact 320/360/390/430 and representative 1280 in Light/Dark, System Back, dirty discard/keep, pending exit, picker open/cancel, IME/insets, rotation/draft retention, confirmed result/Back, offline/rejected/uncertain/refresh-failure states, scoped return, 200% text/reduced animation and 48 dp touch targets.
- `r1-android-behavior-report.json` records the exact capture hashes and behavioral outcomes rather than inferring behavior from screenshots.
- TalkBack was genuinely enabled on the emulator (`TalkBackService` bound, enabled and touch exploration active) and the service/dumpsys/UI evidence is retained. The headless automation does **not** claim a complete spoken linear-navigation transcript; that tooling limitation is explicit and is not being represented as stronger manual accessibility evidence than was actually captured.

## Known limitations / follow-ups

- #961 remains open for server-side Memory-create reconciliation/idempotency. R1 deliberately keeps the accepted explicit-uncertainty behavior from F2.
- The Web evidence spec mocks the attachment/create transport, consistent with the existing F2 browser-evidence convention; it is not a live-backend persistence test. Repository integration/browser gates remain mandatory before merge.
- TalkBack service activation and UI/accessibility state are evidenced on emulator, but a complete spoken linear-navigation transcript was not captured by headless automation. No accessibility behavior is inferred beyond the recorded evidence.

## Acceptance

The submitted Web and Android visual/interaction evidence is accepted against Product Reference v1 for R1. Merge remains blocked until the final human-authored PR head has all required CI green and the Product Owner gives a separate explicit merge authorization.

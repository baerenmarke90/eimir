# Place and Chapter moment selection

Date: 2026-10-29. Owner request: temporarily hide the shared-story statistics and replace the mobile Place relation dropdown with the app's consistent interaction language.

## Product design preflight

Baseline inspected: local `origin/main` at `7d671e2a068f89c9b16ee1e7c74da186a9c9c5d9`, current working branch at `1fd749ce`, including existing uncommitted work. Reviewed `PlaceProductPage`, `ChapterProductPage`, `PlanningRelationManager`, `MomentPlaces`, `ShortTaskSheet`, `StoryList`, the shared media loader, Today and dashboard preferences. Existing place title/edit, authored description, address, technical disclosure, canonical content links and Back behavior remain in scope.

References: Product Reference v1, R2 recognition/content and return rules, R5 predictable utility mechanics, Detail View and Create/Edit templates; shared F2 short-sheet contract. Reuse `ShortTaskSheet`, `MemoryPreview`, `EimirIcon`, existing Story/Search APIs, authenticated thumbnail transport, query keys, semantic theme/spacing/motion tokens and inline problem states. The native long text select is the design gap being retired for both Places and Chapters.

Generated Compact composition: [visual reference](references/place-moment-picker/compact-reference.png), generated with the built-in imagegen tool before UI implementation. Prompt: show the existing Place read screen beside its shared bottom sheet, preserve title/edit/description/address/technical disclosure/navigation, replace the dropdown with recognizable moment previews, wrapping content-type filters, optional search, selection checks and a reachable confirmation footer; existing periwinkle/navy/blue tokens and serif/sans typography. The generated image invents a place hero and milestone photograph; these are expressly excluded from implementation because those media fields do not exist. Existing content uses actual authorized attachments only.

## Mobile interaction contract

- Goal: recognize and attach shared memories, heart moments and milestones to a meaningful place or chapter. One partner can finish alone; the other can read the result without a participation requirement.
- Read screen: content links and one labeled `Moment hinzufügen` entry. Remove/unlink remains a contextual secondary action with owner-correct wording.
- Compact: existing short sheet with title, context, visible Close/drag handle, no early keyboard. Search is optional. Type filters wrap; actual photographs and readable text identify selectable content, with explicit checkbox state. A bottom completion action states the selection count. Selection is staged until confirmed.
- Expanded: the same selection task in the existing centered dialog adaptation, bounded reading width and identical completion/Back behavior. No new navigation model or management pane.
- Loading and paging: local loading state, cursor-based pages and explicit more/retry; repeated cursors terminate. Search uses the existing server search across history, not just the loaded page.
- Empty: distinguish no shared content, no match and already linked content; filters/search remain changeable. Existing linked content remains visible during refresh/failure.
- Error: retain selection and filters; inline retry. After a partial multi-link failure, keep confirmed links and retry only the remaining selection. Never claim transactional batch completion.
- Offline: block writes immediately with existing offline problem semantics; no queued writes or invented sync. Browsing retains authorized query data.
- Success: invalidate relation consumers, show actual linked content, close the sheet and restore its trigger. Cancel changes no relations. Escape, system/browser Back and dismissal use `ShortTaskSheet`; pending writes guard duplicate actions and exits. Unsaved selections follow shared discard protection.
- Privacy: only explicitly shared HeartMoments and shared search results can be selected; private/unknown visibility is excluded. Read APIs remain authoritative; unknown/unreadable linked targets stay opaque. Never issue media reads for private targets. Thumbnails retain sensitive-media concealment and login-scoped media lifecycle.
- Accessibility: native checkboxes and labels, named filter buttons, visible focus, 44+ CSS px targets, locale date/count labels, no horizontal core navigation. At 320/360/390/430 px and 200% text labels wrap and footer/content stay scrollable.
- Motion: existing sheet enter/exit and tokenized press/selection feedback; reduced motion keeps focus/status/selection unchanged.
- Statistics: temporarily suppress `shared_story_summary` on Today and its settings entry while preserving server/catalog keys and saved preferences for later restoration.

## Reuse and commercial review

No new dependency/provider/infrastructure. Native select was considered and rejected for long, content-rich choices on phones; the existing modal, preview, media, search and feedback capabilities provide the correct replacement. No business/freemium impact: Places, Chapters, Story and conventional search keep their current Free/Core or existing Mixed boundaries. No entitlement, quota, storage, retention, export, Cloud/Self-Hosted or billing change; existing content is retained.

## Verification

Targeted component regression coverage for selection/cancel/save/partial errors/pending/offline/privacy/search/pagination and dashboard suppression; TypeScript and production build. Verify actual production components at Compact and Expanded widths, Light/Dark, narrow reflow and reduced motion, including open/select/confirm/result/return. Browser evidence and any unavailable environment checks are recorded after implementation.


## Implementation verification (2026-10-29)

- 167 focused tests pass across the relation manager, Place/Chapter details, Today, dashboard preferences/settings/catalog and shared planning helpers. Coverage includes 21-page cursor navigation, cursor cycles/deduplication, server search, private/unknown visibility, staged selection, type-filter continuity, cancellation, Browser Back/focus, partial success retry, pending duplication and immediate offline rejection.
- TypeScript passes. The complete production build passes, including token identity/product checks and PWA checks, using the bundled Node runtime. The restricted execution stalled inside the existing identity generator; the same unmodified build passed through the approved local execution path.
- Browser review uses the real AppShell, PlaceProductPage, ChapterProductPage, PlanningRelationManager, ShortTaskSheet and authenticated thumbnail loader with disposable in-memory API fixtures. No real couple content was modified. Backend persistence and an installed Pixel APK were not exercised by this fixture.
- Verified open → select two → confirm → actual linked result → canonical content URL → return. Verified cancel with a staged-selection decision and restored trigger focus. Search narrows to its actual matching result. Selection survives viewport changes.
- 320 px reflow: document/dialog width 320 px, completion footer remains within the 740 px viewport. 200% text at 390 px: root 32 px, document/dialog width 390 px, completion remains in the viewport; body scrolls independently.
- Actual Light and Dark themes, 360/390/430 px phone sizes, 320 px reflow and 1280 px Expanded adaptation were inspected. The shared sheet contract tests cover reduced-motion lifecycle; no physical device/IME/TalkBack acceptance is claimed.
- [390 Light selection](references/place-moment-picker/evidence/picker-390-light.jpg), [320 reflow](references/place-moment-picker/evidence/picker-320-light.jpg), [360 Dark](references/place-moment-picker/evidence/picker-360-dark.jpg), [430 saved result](references/place-moment-picker/evidence/place-saved-430-light.jpg), [1280 Dark](references/place-moment-picker/evidence/picker-1280-dark.jpg), [200% text](references/place-moment-picker/evidence/picker-390-dark-large-text.jpg), [same Chapter picker](references/place-moment-picker/evidence/chapter-picker-390-light.jpg). Relevant [source fingerprints](references/place-moment-picker/source-sha256.json) accompany the evidence.

## Coordinated passport follow-up

The PO additionally requested the retired statistics as a deliberately enabled Pro option inside the relationship passport. Before editing that surface, the concurrent cache/planning/passport task (`01a186f9-c5c9-7f90-b06f-665d8503d9d3`) was inspected: it already owns the richer passport and its existing lifetime counts. With explicit human authorization, that chat received ownership of the opt-in and its tests. It reuses the existing `relationship.passport` capability and counters; this slice keeps the old Today module hidden and does not add duplicate statistics. The passport implementation and commercial documentation remain owned by that concurrent work. The choice defaults off and is personal to the current device, server, Account and Space; only a boolean is stored locally.


Final combined verification: 206 tests pass in 12 files, including the coordinated Pro passport opt-in, preference isolation/storage and shared sheet lifecycle. The complete production build and TypeScript checks pass. The 21-page test exceeded its default timeout when all test workers and the build competed for resources; the complete unchanged suite passed with two concurrent workers.

Large-text inspection additionally verified the actual choices after scrolling: at 200% the preview naturally wraps its artwork above the copy instead of squeezing the title into a narrow column. The copy retains 215 px of readable width at a 390 px viewport and the completion footer stays visible. [Selected content at 200%](references/place-moment-picker/evidence/picker-390-dark-large-text-content.jpg). This bounded reflow proof used the production relation manager with disposable fixtures.


## Isolated pull-request boundary

The publication checkout starts from the current Today dependency `5d5d6e1b0a798ad0a96e8704cd6d64c5f887459d` (#1500). Only this request's relation picker, its small owner-name/i18n adapters, Today suppression and evidence are included. The concurrent map picker, Plan media/editor, warm read cache, richer passport and personal Pro statistics opt-in remain with their owning work. The original 206-test combined-workspace result above is historical integration evidence, not a claim that the sibling passport implementation is included here.

The isolated full Web suite passes 2,233 tests with two existing skips. Token/PWA checks, production build, formatting and the required lint checks pass. Native fieldset grouping and deliberate ref-based focus replace the initial generic group/autofocus markup without changing the choice task. The PR-critical production-browser regression verifies actual `/plan/places/:placeId` and `/plan/chapters/:chapterId` navigation, save/detail/return, private-result exclusion and 320px large-text cancellation. Public issue/PR links preserve the generated pre-implementation reference and the source-controlled preflight chronology; no claim is made that the generated reference was posted remotely before the local implementation.


Final isolated production-browser result: all four PR-critical journeys pass, including Place at 390px Light and 1280px Dark, Chapter at 430px Light, and shared-only search/cancellation at 320px with 200% text. Axe reports no violations in the selection states. Each save journey confirms both typed relation requests, the real linked results, canonical Memory detail, return to the actual owner route and restored completion-trigger focus. The large-text journey confirms no horizontal overflow, reachable completion and no write on discard. [Current isolated screenshots](references/place-moment-picker/evidence/isolated/) supersede the earlier shared-workspace captures for final PR acceptance. The test runner is registered in the existing PR-critical inventory. Two early attempts exposed fixture route/response omissions; these were corrected without weakening product assertions or raising timeouts. A separate transient local network-change load failure is preserved in local diagnostics and is not claimed as a product pass.


The retained full-regression inventory now tests the requested retirement instead of requiring the old badge presentation. All five prior viewport/theme/count scenarios assert absence despite an explicit saved visible preference while recent activity and its canonical link remain available. The existing four cross-product reflow journeys remain intact, with only the retired heading expectation updated. All nine browser tests pass locally, including Light/Dark 400% reflow and keyboard reachability; no timeout, skip or inventory reduction was introduced.

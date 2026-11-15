# Discover: readable rediscovery and deliberate renewal

Status: implementation and visual preflight were kept local at the PO's explicit instruction while additional requests were collected. The PO subsequently authorized completing the whole batch, updating #1547 and making it merge-ready. Both generated references below were created before this batch's UI implementation; local preflight replaced early issue publication only. The owning issue remains #1546.

## Baseline and owning design

Main baseline `ef2c412a6c5fbdb253efe746066831faeece1638`; local working base `cb36da9046a4df245b74de02b81d334923c5adc0`. Inspect `StoryProductPage.tsx`, `StoryUnifiedPage.css`, the actual 390px browser rendering and the supplied PO screenshot before implementation. R2 in Product Reference v1 governs natural photo/text/mixed composition, Discover's independent unfiltered scope, canonical source navigation and exact return context. Preserve the Momente heading, map destination, Discover/Diary tabs, featured item, true anniversary, structural browse destinations and existing shell. Diary chronology is unchanged.

The reported failure is a rigid equal-column grid: a long authored thought remains half-width and creates empty space beside shorter neighbors. Card width/height must express the content while preserving canonical DOM and keyboard order.

## Mobile interaction contract

- Human outcome: stumble on a real older shared moment, read it comfortably, open its actual source and return to the same selection/position.
- Primary content: actual photos and authored words. A long note or title gets a full-width reading slot; short notes, photos and milestones keep their own natural height. Grid row spans use measured heights rather than hardcoded card heights or dense visual reordering. 320px and enlarged text may use one readable column.
- Existing colors, Literata/Instrument Sans typography, semantic spacing/radii and Discover viewport reveal are retained. Photo privacy/reveal and author/date semantics remain intact. No new generic cards, badges, score or repeated metadata are added.
- Add one quiet localized discovery introduction and an explicit `Neu entdecken` action. Server generation confirms the new selection before replacing the current one. A failed/offline action preserves the current readable selection and offers retry; no queued mutation or fake success.
- Daily authorized selection remains stable between deliberate refreshes. Regular background checking only announces a newer daily selection; it does not reshuffle visible reading. Entering a fresh visit uses the current server selection. An explicit refresh creates another bounded authorized selection, preferring alternatives to the current references where possible; sparse history may repeat. Returning from a source preserves the current selection and scroll context.
- Loading: keep existing confirmed content while choosing; disable repeated activation. Empty: the existing first-moment invitation. Error/offline: existing content plus localized feedback. Success: short polite status, no mount-wide animation. Reduced motion retains feedback and information.
- Account/Space changes cancel or ignore pending replacement; requests and caches remain caller/Space scoped. Private partner thoughts never enter candidate selection; every returned reference is reauthorized. No text, pictures or locations leave the backend for a new provider.

## Reuse and implementation boundaries

Reuse the canonical bounded Discover candidate pools, existing per-day ephemeral snapshot, shared authorization, PostgreSQL advisory lock, rate-limit helper, OpenAPI/generated client, shared read-cache boundary, TaskOrigin and existing observers. A native ResizeObserver plus CSS Grid row spans adapts the layout without a new masonry dependency; sparse placement preserves DOM order. The generated reference is a composition guide, not shipped imagery or invented content.

Manual renewal is an authenticated POST that updates only the caller's current-day ephemeral Discover snapshot. Serialize that caller/day, cap renewal frequency, choose from authorized descriptor-only pools and prefer alternatives. Keep at most eight references and the existing 48-hour retention, with no additional table, model service or analytics. GET stays a read of the selected edition and reauthorizes every source. The original snapshot remains valid until a replacement is confirmed.

## Business/freemium and quality

No new paywall: basic Discover reads/renewal remain part of Core history, distinct from Pro recap composition and bespoke narrative export. Existing source CRUD/privacy/exports remain available. Cloud and Self-Hosted are identical. Managed cost is bounded database selection only; no inference, new provider, dependency or storage quota. Snapshot deletion continues to cascade with Account/Space and existing pruning applies. Runtime snapshots are not user-authored history or portable preferences.

Verify mixed sparse/dense text, a long quote spanning the reading width, measured layout after image/font/viewport changes, canonical DOM/keyboard order, source/return, sensitive image behavior, daily change notification, explicit renewal, repeated/failed/offline/context-switched requests, rate/admission, current privacy on renewal and a small history with no genuinely new entries. Run canonical API/client checks, targeted unit/integration tests and actual-browser Light/Dark 360/390/430/1280 plus 320px/200% reflow. The PO's final batch instruction authorizes publishing the completed changes and evidence.

## Generated reference and primary reuse sources

[Whole-screen Light/Dark composition](discover-local-reference.webp), generated with the built-in Imagegen tool before UI code. Generation brief: retain the current Momente shell/map/tabs/featured source/browse destinations, use the actual baseline rendering and supplied screenshot as style references, give the long illustrative authored note a full-width natural-height slot, pack short photo/note/milestone cards without empty row space, add quiet daily-rediscovery copy and a deliberate renewal action. All example content/photos are synthetic; the image is not shipped product content.

Primary browser/platform references checked: [CSS Grid sparse placement](https://www.w3.org/TR/css-grid/), [ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver). Native observers and sparse row placement avoid a new dependency and visual/keyboard order divergence.

## Additional local PO requests

[Additional whole-screen composition](batch-local-reference.webp), generated with built-in Imagegen before the new UI changes: optional Memory title first; no date-as-heading in the Diary; larger photo presentation for untitled Diary memories (subsequently explicitly approved by the PO); a primary Vibe share button; the library named Eure Rueckblicke in localized copy; shared list creation from the existing plus sheet. Reuse the existing focus/dirty/draft/return behavior and collection creation sheet. No business/freemium, data or provider change for these refinements. The generated image is not a pixel lock: preserve the actual two-person Vibe state, existing Wir module order, focus-task navigation and the removal of the ready invitation archive action; do not introduce the image's illustrative extra controls or repeated navigation. The PO expressly approved its larger untitled Diary photograph; implement that reading role with the normal date footer and existing sensitive-image controls.


## Navigation cleanup and return safety

Remove redundant page-local destination links above browsing headers in the recap library, years, chapters, shared photos, map, collections, places, settings, private overview/lists and the two completed games. These are the inconsistent extra return labels identified by the PO. Primary shell navigation, native/browser Back, source-reader return and focused capture/editor close controls remain available; editor discard and pending-write guards are retained. Empty/invalid-year recovery actions remain meaningful content actions.

The plus route reuses the existing collection sheet, including draft confirmation and pending-write admission. Successful creation closes the overlay before opening the real new list, replaces the temporary creation route and preserves TaskOrigin. Cancelling returns to the captured source or the list overview on a direct entry. The save transition must not run the cancel return handler. Map source return now retains only the validated existing location-selection query, strips arbitrary text and stays scoped to the account/Space origin store.

## Validation and actual evidence

Actual browser results and screenshots are recorded in the batch evidence links in the owning reference README. Source/client checks, pure selection tests and PostgreSQL renewal acceptance cover preference for alternatives, sparse repetition, stable subsequent GET, private-content exclusion, independent partner selections, newly authored content, authentication and caller-bound rate limiting. No gate, runtime dependency, workflow retry, browser pin or timeout is weakened.

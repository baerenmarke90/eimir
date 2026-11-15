# Places and shared lists: compact product correction

## Preflight — 2026-10-30

User request: implement the reviewed Places and Lists corrections, with a
compact, intuitive composition consistent with Product Reference v1.

Owning issue: [#1529](https://github.com/baerenmarke90/eimir/issues/1529).

Baseline main: `1468e0a6e66eb5bd7b9192bf65ac357d8351b4d0`, freshly fetched.
Reviewed actual overview/detail components, shared planning styles, relation
picker, list mutations/reordering, checklist/pin controls, route helpers,
task lifecycle, Compact shell, tests and the user's four Android screenshots.

![Generated Compact composition reference](references/places-and-lists/compact-reference.png)

The built-in Imagegen tool produced this full-screen reference before UI code.
The [complete generation prompt](references/places-and-lists/reference-prompt.txt)
is retained alongside the unchanged PNG.
SHA-256: `407a3238a609dae082a1eeb763f54c513d842d8de44c2718edd4300e6bff71d0`.
The prompt specifies four complete 390 × 844 views: Places overview/detail and
Lists overview/detail, current periwinkle/ink/blue palette, 20 px gutters,
compact navigation, contextual actions and the current docked navigation.
**Intentional corrections to generated details:** do not implement the invented
park/lake illustrations, alternate navigation icons, decorative input outlines,
or expanded coordinates shown under a closed disclosure. Keep the actual shell
and authorized media pipeline. This is a hierarchy reference, not a pixel lock.

## Mobile Interaction Contract

- **Human outcome:** find shared places and their memories; read, add and check
  shared list entries without accidentally starting an edit.
- **Reference:** Product Reference v1 content → meaning → action → metadata;
  R5 utility/Detail and short Create/Edit, plus content-opening relations and
  readable checklists. Smartphone is normative; no forced imagery or card wall.
- **Compact:** short named Back, compact title/action, then actual content.
  One dominant add action on overviews. List detail leads with readable entries
  and a single horizontal add field/button. Place detail leads with name,
  address/authored description, then moments and their visible add action.
- **Reach/IME:** product-size targets, no automatic keyboard for reading,
  explicit text-edit intent. Short tasks reuse the scrolling ShortTaskSheet;
  Save remains reachable. Long labels wrap without sideways scrolling.
- **Context:** entire overview rows open details with clear chevrons. Existing
  routes, More selection, Back/deep links, pagination and delete-focus behavior
  remain. Confirmed create opens the real created resource.
- **List editing:** read-first plain text; named contextual edit/delete actions;
  explicit Save/Cancel for an entry edit. Sorting is a deliberate toggle with
  drag handles and existing keyboard arrow alternatives. Preserve order on check.
- **Place editing:** preserve manual name/address/description, map selection,
  optional coordinates, source attribution and capability-gated edit/delete.
  Put technical data behind progressive disclosure. No description placeholder.
- **Removal:** unlink/delete is secondary and explicitly confirmed with its
  consequence; do not offer undo without a restore contract.
- **Draft/Back:** dirty dismissal asks before discard; failed saves retain input;
  pending writes block duplicate/ambiguous actions; sheets own focus, dismissal,
  history, inert background and focus restoration through existing primitives.
- **States:** keep Loading, Empty, Error, Offline, Pending, Conflict and confirmed
  Success distinct. Retain valid content on refresh failure. Truthful counts use
  the actual complete CollectionDetail.items, never count a paginated overview
  as an all-history total. Unknown Place relation totals are not invented.
- **Motion:** reuse sheet/feedback/reorder roles, maintain visible save/check
  feedback and existing optimistic rollback; reduced motion retains all meaning.
- **Expanded:** same content and action order with bounded reading width;
  existing top navigation, centered sheets and no extra management columns.
- **Privacy:** existing shared resource capabilities and authorized relation/media
  previews remain authoritative, including concealed/locked media. No persistence
  of new content in browser storage, URLs, logs or analytics.

## Reuse, commercial model and cross-cutting review

Reuse existing PageHeader, ShortTaskSheet, PlanningDiscardConfirmation,
ChecklistToggle, ListEntryIconButton/useListItemReorder, PlaceMapPicker,
PlanningRelationManager, query/invalidation and i18n. Use native buttons/forms,
existing semantic tokens, SVG graphic strokes and shared modal lifecycle.
No dependency, map provider, backend/API change or custom gesture library.

No business/freemium impact: Place CRUD, coordinates and content links remain
the Free side of Mixed; Shared Collections & Checklists remains Free/Core
(feature matrix rows). No new paid boundary, quota, managed resource, tracking
or Cloud/Self-Hosted difference. Existing data and personal pin semantics stay.

Security/privacy: same API/capabilities, tenant scope and media authorization.
Concurrency: preserve versioned writes, conflict handling and checkbox/reorder
rollback. Accessibility: names, focus, semantic controls, large text, contrast,
safe areas and keyboard alternatives. i18n: all added copy in resources.
Resilience: no offline writes/outbox promise; failures keep drafts.
Performance/operations: no new providers, per-row fetches or durable storage.
Validation: targeted existing component/lifecycle/concurrency tests; complete
TypeScript/build and token checks; browser journeys and visual evidence at
360/390/430 px and Expanded, Light/Dark, sparse/dense and reduced motion.

## Delivery evidence

UI source revision: `01b78997ac20d1f7f18b673914180910e676b013`.
The latest main `cc0e23b7d6f4d950f0012660f051be46dd2da3af` (#1526) was
merged before final verification. Its shared title/pencil and Memory preview
refinements remain intact. The composition/reference remains applicable; the
personal pin uses a shorter visible label while its full action name and
pressed state remain accessible.

The [image manifest](references/places-and-lists/evidence/manifest.json) records
28 PNGs and their SHA-256 fingerprints. All images use disposable authorized
fixtures, not private couple data. The UI source is unchanged in the subsequent
evidence-only commit.

| State | Places | Shared Lists |
| --- | --- | --- |
| Compact overview, Light | [430 px](references/places-and-lists/evidence/places-overview-430-light.png) | [430 px](references/places-and-lists/evidence/collections-overview-430-light.png) |
| Compact detail, Light | [360 px](references/places-and-lists/evidence/places-detail-360-light.png) | [360 px](references/places-and-lists/evidence/collections-detail-360-light.png) |
| Compact detail, Dark | [390 px](references/places-and-lists/evidence/places-detail-390-dark.png) | [390 px](references/places-and-lists/evidence/collections-detail-390-dark.png) |
| Expanded, Dark | [1280 px](references/places-and-lists/evidence/places-detail-1280-dark.png) | [1280 px](references/places-and-lists/evidence/collections-detail-1280-dark.png) |
| 200% text, Light | [390 px](references/places-and-lists/evidence/places-detail-390-light-large.png) | [390 px](references/places-and-lists/evidence/collections-detail-390-light-large.png) |
| Dense, Dark | [390 px](references/places-and-lists/evidence/places-detail-390-dark-dense.png) | [24 entries](references/places-and-lists/evidence/collections-detail-390-dark-dense.png) |
| Short tasks / results | [Create](references/places-and-lists/evidence/place-create-390-light.png), [Edit](references/places-and-lists/evidence/place-editor-390-light.png) | [Failed edit retains text](references/places-and-lists/evidence/list-entry-error-390-light.png), [created resource](references/places-and-lists/evidence/list-created-390-light.png) |

The four task/result images were captured directly from the production build.
The six viewport/state compositions additionally verify that the shell stays
visible, add controls share a line, moment actions remain beside content, and
page content does not overflow horizontally. The 200% captures show the initial
viewport; the page remains scrollable with measured bottom-navigation clearance.

### Behavioral and engineering verification

- Production build, token adapters/PWA checks and TypeScript pass on Node
  22.23.2. Targeted Biome formatting/lint, browser inventory and diff checks pass.
- 232 distinct component cases across 10 files are verified, including existing
  private-list consumers, personal pin, modal history/focus, optimistic rollback,
  version conflicts, denied/replaced queries and authorized cached reads.
- 64 distinct Chromium browser cases across the Places/Lists, relation picker,
  Today pinned-list and relevant product-accessibility suites are verified.
  They include seven new design journeys, unchanged shared-history/privacy
  assertions, offline/no-replay, recovery, personal pin, reordering, reduced
  motion, 360/390/430 px, Expanded Light/200% and 390×520 short editor checks.
- The complete production journey passes: open a Place; unlink only its moment
  association and restore focus; edit with dirty Escape protection; create a
  name-only Place and observe it; return to the overview; open a List, add/check
  without reordering, retain an edit after a failed save, save explicitly, sort
  with a keyboard alternative, confirm deletion and focus the next item without
  summoning the keyboard; create a List, observe the actual resource and return.

Local verification adaptations and retries are traceable: older browser checks
were updated from permanent textboxes to readable entry text and explicit sort
activation, keeping their data/authorization/order assertions. A 21-page fixture
exceeded its existing 5 s deadline during a busy combined run; the unchanged
67-case Collection/relation check passed in isolation. One browser editor run
lost local modules with `ERR_NETWORK_CHANGED`; the same editor case passed alone.
The final production-build journey, including dialog screenshots, passed in
3.8 s. No existing test deadline was raised and no GitHub workflow was retried.
Physical Android-device validation is not claimed; no wrapper/native behavior
was changed.

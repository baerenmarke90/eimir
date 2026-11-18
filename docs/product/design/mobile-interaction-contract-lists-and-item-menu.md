# Mobile Interaction Contract: Listen destination and item actions menu

Owner: PR [#2044](https://github.com/baerenmarke90/eimir/pull/2044) (draft).
Contract section: [Partner-App Experience Standard section 10](../../PARTNER-APP-EXPERIENCE-STANDARD.md).
Written against branch `claude/funny-joliot-2dfc25` at `970c2fdad5b7d5092d1cd2f98914e50faf0a1b43`
(merge base with `origin/main`: `0311f09ec00d998cc03bec6287f3a5247b2f42df`). Every statement
below was read from the code at that revision. Where the code does not do something, it is
listed under [Deviations and gaps](#deviations-and-gaps) rather than claimed.

## Scope

1. A fifth primary destination, **Listen** (en: Lists), route ID `shared`, canonical path
   `/more/collections`, whose two peer views, Lists (`/more/collections`) and Notes
   (`/more/notes`), are switched by a **Listen | Notizen** segmented control under the page
   heading **Gemeinsam** (`web/src/client/routes.ts`, `SharedContentTabs.tsx`).
2. Shared list cards on the Lists view (`CollectionsOverviewPage.tsx`).
3. One actions menu for every single-item detail page (`ItemActions.tsx`).
4. The collapsible search used on the Notes view (`CollapsibleSearch.tsx`).

Route and registry decisions: [ADR 0003 amendment](../../decisions/0003-primary-navigation-and-route-model.md)
and [Information Architecture sections 2, 5 and 9](../../INFORMATION-ARCHITECTURE.md).

## Contract items

### 1. User goal / human outcome

Reach the couple's shared lists and notes in one tap from anywhere, tick off a list entry
without opening the list, and edit, act on or delete one item from one predictable place.

### 2. Relationship / emotional value

Lists and notes are things both partners keep together (packing, shopping, things to tell
family). They get a primary place of their own instead of sitting among account settings in
More. Nothing in this change adds relationship microcopy or a delight moment; none is
appropriate for a utility surface.

### 3. Primary Compact screen/state

The Lists view, top to bottom: the heading **Gemeinsam** with the floating add action; the
Listen | Notizen segmented control; the default shopping-list card; the Offen / Erledigt /
Alle status filter; the list cards. The bottom navigation has five equal columns
(`repeat(5, minmax(0, 1fr))` in `shell.css`) in the order `today`, `story`, `plan`, `shared`,
`more` (`PRIMARY_APP_ROUTES`); Games is filtered out. Both views are primary roots, so they
show no Back control (`SubpageNavigation` treats `peerPaths` as roots).

### 4. Single dominant action

Create: the floating icon-only add button (`AddActionButton floating`), localized accessible
name (`m5s3.collection.create` on Lists, `sharedNotes.create` on Notes), icon `listen` or
`notes`. Below 840 px it is `position: fixed`, 60 px (`--touch-target-floating-create`),
above the bottom navigation; it tucks away on the viewer's own downward scroll, returns on
upward scroll or keyboard focus, and is hidden while a modal dialog is open or a text field
has focus (`AddAction.css`). On the Notes view it is omitted while the first-use empty state
shows its own labelled add button. At 840 px and wider the same component renders as the
labelled pill in the page heading.

### 5. Content hierarchy

Human content first: list titles and their entries. A card is heading (list name and a
"n of m" progress line), then up to four entries, then the expand control. Metadata is
limited to that progress line. Notes: pinned section, then recent/all, each a note card.

### 6. Visible immediately vs. progressively disclosed

Visible: heading, switch, filter, each list's first four entries (open entries first, then
done, each group in stored order). Disclosed: further entries (expand control), list detail
(heading tap), list actions (item menu, on the detail page), search (Notes: an icon that
unfolds into a field).

### 7. Interaction patterns

- **Primary navigation:** links in the bottom bar; no gesture of its own beyond the
  existing primary-tab swipe, which now also steps through Listen because it walks
  `PRIMARY_APP_ROUTES`.
- **Peer switch:** `role="tablist"` of two `role="tab"` buttons (see
  [Listen | Notizen switch](#listen--notizen-switch)).
- **List card:** heading link plus native checkboxes (see [List cards](#list-cards)).
- **Item actions:** three-dot trigger, bottom sheet, alert-dialog confirmation (see
  [Item actions menu](#item-actions-menu)).
- **Search:** inline, collapsible (see [Collapsible search](#collapsible-search)).

### 8. Loading state

Lists: `UiState` loading with the shared loading title while the first page loads
(`collections.isLoading`). Notes: a skeleton (`NoteSkeleton`). Further pages load
through `AutoLoadMore`.

### 9. Empty state

Lists: the plain line `m5s3.collection.emptyScope` ("no lists in this selection") when the
active filter has no lists; the page-level add button stays available. Notes: a first-use
`UiState` with a labelled add action, a no-match state for a search (with a Clear action
that returns focus to the field) and a no-pinned state.

### 10. Error state

Lists: `ProblemState` with retry for a failed list read; a failed tick shows a
`ProblemState` above the list (no retry control) after the optimistic change is rolled back.
Notes: `ProblemState` with retry; if data is already loaded the error is shown below it.

### 11. Offline state

Reading uses the warm query cache. The tick calls `assertOnlineWrite()`, so offline it fails,
rolls back and shows the problem state; there is no offline write queue for this action.
The Notes view shows `OverviewCacheNotice` for cached/paused/offline reads; the Lists view
shows no such notice (see gaps).

### 12. Success state

The tick is its own feedback: the circle fills with the shared colour, the label is struck
through and the entry moves into the done group at once (optimistic), then the list queries
are re-read. Creating a list opens the created list. Deleting an item returns to the
overview, restores focus (see item menu) and, for a note, posts a snackbar
(`sharedNotes.toast.deleted`).

### 13. Privacy / relationship state

No change. Lists and Notes remain Space-shared content under the existing capabilities
(`collection.capabilities.canEdit`; the checkbox is disabled when the viewer cannot edit).
Private Area lists and notes are separate and keep their `/more/private` home.

### 14. Large text and narrow viewport

Text wraps (`overflow-wrap: anywhere` on entry labels, segment labels and sheet bodies);
rows use `min-block-size`, never a fixed height; the segment control and the bottom bar
labels wrap instead of truncating (`white-space: normal`, `hyphens: auto`). The sheet is
capped at `100dvh` minus inset and scrolls its body. 200 % text and 320/360/390/430 px
captures are **not** part of this contract's evidence yet (see gaps).

### 15. Motion, feedback and reduced motion

- Sheets: enter/exit animation and backdrop fade; `prefers-reduced-motion: reduce` sets
  `animation: none; transition: none` on the sheet and its backdrop (`ShortTaskSheet.css`).
- Floating add: tuck transition; under reduced motion only an opacity fade remains.
- Search: the icon-to-field unfold and fold animate only under
  `prefers-reduced-motion: no-preference`; with reduced motion the field disappears on
  blur without animation (`CollapsibleSearch.tsx` reads the media query before closing).
- List tick: colour change only; no dedicated animation, so reduced motion changes nothing.
- Pressed feedback on the floating add uses the existing pressed-scale token only under
  no-preference.

### 16. Expanded/Web adaptation

Same destinations, same order, in the horizontal header navigation (`PrimaryNavigationLinks`
renders for both). Content keeps its Compact reading order; the add action becomes the
labelled heading pill; sheets become centered dialogs at 840 px and wider
(`@media (min-width: 840px)` in `ShortTaskSheet.css`). No extra columns or panes are added.

### 17. Why a list is appropriate

Shared lists are the user's task: scanning and ticking comparable entries. The card is a
single surface with a heading and checkboxes, not a table, and entries are not metadata
rows. Notes are cards with a text excerpt. No master-detail pane is introduced.

### 18. Established patterns reused, deviations

Reused: bottom navigation; segmented control; native checkbox; overflow ("three-dot") menu
as a bottom sheet; alert dialog for destructive confirmation; the shared `ShortTaskSheet`
native `<dialog>` with Escape, Back and drag-to-dismiss; `AddActionButton`; `StatusScope`.
Deviation: the segmented control uses tab roles without tab panels (each view is its own
route), see gaps.

### 19. Typing, keyboard and recall

Opening the destination, switching views, ticking and opening the item menu need no typing
and raise no keyboard. The Notes search field takes focus only after the user taps the
search icon (`autoFocus` from that tap). The create-list sheet focuses its name field when
it opens, which raises the keyboard; that is deliberate, because the sheet exists for that
single field.

### 20. Generated visual product reference

**Not satisfied by this document.** The repository rule requires a generated Compact
composition image, with baseline `main` SHA and the represented existing screen/functions,
in the owning issue before UI implementation. This documentation task cannot generate
images, and the implementation had already started. The owning issue/PR must attach the
reference, or record an explicit Product Owner decision that waives it. Implementation
captures (390 px Light/Dark, Lists, Notes search closed/open, note menu, delete
confirmation) exist as untracked files in
`docs/product/design/evidence/2044-lists-tab-and-item-menu/` at the time of writing; they
document the result and do not replace the pre-implementation reference.

### 21. Visual acceptance plan

Compact 360/390/430 px and Expanded, Light and Dark, sparse (one list, no entries) and
dense (more than four entries, expanded), 200 % text, reduced motion. Behavioural journeys:
Open Listen, switch to Notizen and back (history stays one entry), tick an entry, expand and
collapse a card, open a list, open its menu, Edit, Delete with confirmation, return to the
overview with focus restored; search a note, clear, collapse. Screenshots alone do not
establish this (Partner-App Experience Standard section 12).

## Listen | Notizen switch

Facts from `SharedContentTabs.tsx`, `usePrimaryNavigation.ts` and `App.tsx`:

- Markup: one `role="tablist"` with `aria-label` `navigation.sharedViewsAria`; two buttons
  `role="tab"` with ids `shared-tab-lists` / `shared-tab-notes`, `aria-selected`, roving
  `tabIndex` (active 0, other -1). Each is at least 44 px high (`.planen-segment`
  `min-height: 44px`).
- Keyboard: ArrowLeft/ArrowRight (wrapping), Home, End via `handleTabKeyDown`; arrow keys
  select and focus the target in one step (selection follows focus). Modified keys and IME
  composition are ignored.
- Activation: choosing the other view calls `navigate(path, { replace: true })`; choosing
  the active view does nothing. The switch therefore never adds a history entry, and
  Back from either view leaves the destination as for any primary root.
- Each view is its own route and page; the paging scope filter (`?scope=`) is kept per
  view and is not carried across the switch.
- Tapping **Listen** in the bottom bar always opens `/more/collections`
  (`primaryDestination` returns the registered root); the last-used view is not
  remembered. On a root page the link replaces the history entry when the platform is the
  Capacitor app or when it targets the current path.
- Detail pages keep `shared` active: `/more/collections*`, `/more/notes*`,
  `/plan/collections*` (`activeNavigationArea`). `/plan/collections` redirects to
  `/more/collections` (`App.tsx`).
- Return from a detail page: the Notes view restores scroll, the selected card and the
  search text through the task-origin store; the Lists view uses the same task-origin return
  and the delete-focus state (scroll restoration on Lists was not verified). With no stored
  origin the parent falls back to `/more/collections` (`subpageParentPath`).

## List cards

Facts from `CollectionsOverviewPage.tsx` and `SharedContentPages.css`:

- **Structure:** one `<li>` per list. The card heading is a real link
  (`<h2>` list title and the progress line inside a `<Link>`) to
  `/plan/collections/:id`; the entry list is a sibling of that link, so no interactive
  element is nested in the link. Plain left-clicks open the list with a captured task
  origin (selected card id); modified clicks keep native link behaviour.
- **Entries as checkboxes:** each entry is a `<label>` around a native
  `<input type="checkbox">` that is transparent but covers the whole row; the visible
  circle is `aria-hidden`. The row is at least 44 px (`--touch-target-web`). Done entries
  show a filled circle (`--color-shared`), secondary text colour and line-through. The
  checkbox is disabled when the viewer cannot edit or while that entry's write is pending.
  Keyboard focus shows a 3 px outline on the row.
- **Order:** open entries first, then done, each by stored position, recomputed on every
  render, so a ticked entry moves to the done group immediately.
- **Expand/collapse:** four entries are shown (`PREVIEW_ITEM_LIMIT`). If more exist a tertiary
  button (global `button` `min-height: 44px`) toggles all entries, with `aria-expanded` and the
  labels `m5s3.collection.previewMore` (with the hidden count) and `previewLess`. Expanded
  state is component state per list id and is not persisted or restored on return.
- **Save at once, optimistic with rollback:** ticking sends `updateCollectionItem` with
  `completed` flipped and `If-Match` from the entry version (`planningIfMatch`). `onMutate`
  cancels in-flight list queries, snapshots every cached overview page of that Space and
  patches the entry; `onError` restores the snapshots; `onSettled` invalidates the
  collection consumers (`invalidateCollectionConsumers`). A version conflict or offline error therefore
  ends with the entry back in its stored state and a problem message above the list.

## Item actions menu

Facts from `ItemActions.tsx`, `ItemActions.css`, `PageHeader.tsx`,
`CollectionProductPage.tsx` and `SharedNoteReadPage.tsx`. Used by the Chapter, Collection,
Gift idea, Heart moment, Memory, Milestone, Place, Plan, Private collection/notes, Related
people, Shared note and Wish pages.

- **Trigger:** `ItemMenuTrigger`, a round button with the `more` (three dots) icon, localized
  `aria-label` and `title`, `aria-haspopup="dialog"` and `aria-expanded`. It is placed in the
  header's `titleAction` slot: for named-item secondary pages (`itemLabel`) that is the
  third column of `.page-heading-item-row` (`var(--touch-target-web)` wide), on the same line
  as the Back control and the item-type label; for composer headers it takes the page's
  `--detail-control-size`. Size is 44 x 44 px (`--touch-target-web`), pill radius, raised
  surface and normal text colour, i.e. the Back control's styling. It is not rendered while
  the page is in an edit or sort mode (Collection page: `isEditing`/`isSorting`).
- **Sheet:** `ItemMenuSheet` wraps `ShortTaskSheet` (native modal `<dialog>`, `aria-modal`,
  labelled by its title; title is the item's name on the Collection page and
  `sharedNotes.menu.title` on the note page). Rows are `ItemMenuOption` buttons: icon, bold
  title, optional hint, at least 48 px (`--touch-target-comfortable`).
- **Order:** Edit first, page-specific actions in the middle, Delete last. Collection page:
  Edit, Sort, Send to the partner, Pin to / unpin from Wir, Delete. Shared note: Edit, Pin
  to Wir, Show/Hide the title only on Wir, Delete. Rows appear only when the viewer holds
  the capability.
- **Delete:** the row is danger-styled (`data-danger`: error colour on title and icon,
  `trash` icon, the word "Delete"), so danger is not conveyed by colour alone. Choosing it
  closes the menu and opens `ItemDeleteSheet`: `role="alertdialog"`, a consequence text, a
  secondary Cancel and a `danger` confirm button that shows a pending label. While pending
  the sheet cannot be closed (`isCloseBlocked`); errors show inline in the sheet. On success
  the sheet closes for navigation and the page returns to its origin (replace navigation),
  after which the Lists overview moves focus to the focus target computed at delete time (an
  entry link) or, if that is gone, to the add action (`PLANNING_DELETE_FOCUS_STATE_KEY`).
- **Edit modes:** the Collection page opens its title editor from the menu; Delete is only
  reachable from the menu (`setDeleteOpen(true)` occurs once, in the menu row), and the
  delete sheet cannot be open while editing (`open={deleteOpen && !isEditing}`).
- **Dismissal and history:** opening a sheet pushes one history entry
  (`useEditorHistoryEntry`), so Back, Escape, the close button, a backdrop click and
  (Compact) a downward drag of at least 120-180 px all close it through the same path;
  closing is blocked while a write is pending.
- **Focus:** a sheet opens with focus on its close button (the default `initialFocusRef`),
  makes the background inert through the native modal, locks body scroll and, on close,
  returns focus to the menu trigger (`restoreFocusRef`). The delete confirmation also
  returns focus to the trigger unless the page navigates away.
- **Reduced motion:** sheet animation and backdrop transitions are disabled under
  `prefers-reduced-motion: reduce`.
- **Large text:** rows grow with content; the sheet body scrolls within `100dvh`.

## Collapsible search

Facts from `CollapsibleSearch.tsx` and `PlanningReference.css`. Used by Shared Notes (and
Planning); the Lists view has no search.

- Rests as a 44 x 44 px icon button (`.planen-search-toggle`) at the end of the status row
  with the localized label, `aria-label` and `aria-expanded="false"`. Tapping it replaces
  the button with a `<search>` landmark containing a labelled `type="search"` field
  (`enterKeyHint="search"`, placeholder `navigation.searchPrompt`, `maxLength` 200,
  field `min-height: 44px`) and focuses the field because of that tap.
- A non-empty field shows a 44 px-wide clear button; clearing returns focus to the field.
- Blurring an empty field folds it back to the icon (animated, or immediate under reduced
  motion). A field with text stays open; `value` is also kept in task-origin metadata so
  Back from a note restores the query.
- Filtering is client-side over loaded notes; while a query is active the page keeps
  fetching until every page is loaded. The result count has `role="status"`; the results
  region is `aria-live="polite"`.

## Touch targets

| Control | Size | Source |
| --- | --- | --- |
| Bottom-nav destination | at least 56 px high, one fifth of the width | `.mobile-bottom-nav .shell-nav-link` |
| Floating add | 60 x 60 px | `--touch-target-floating-create` |
| Listen \| Notizen segment | at least 44 px high | `.planen-segment` |
| List entry row (checkbox) | at least 44 px high, full card width | `.collection-card-check` |
| Expand/collapse button | at least 44 px high | global `button` |
| List card heading link | at least `--space-16` high plus padding | `.content-overview-row` |
| Item menu trigger | 44 x 44 px | `.item-menu-trigger` |
| Item menu row | at least 48 px high | `.item-menu-option` |
| Sheet close/drag zone | at least 44 x 44 px | `.short-task-sheet-close` |
| Search toggle / clear / field | 44 px | `.planen-search-toggle`, `.planen-search-field` |

The status-scope buttons use the global 44 px button height. The tick circle itself is
20 px; the label row around it is the target.

## Deviations and gaps

Open items found while reading the code. None is claimed as done.

1. **Generated visual reference missing** (item 20).
2. **Focus after a view switch is not restored.** Each view mounts its own
   `SharedContentTabs`, so the focused tab button unmounts on a keyboard switch; no code
   returns focus to the new tab. Not verified in a browser.
3. **Tab semantics without panels.** The switch exposes `role="tab"` and `aria-selected`
   but no `aria-controls`/`role="tabpanel"`; it behaves like navigation between two routes.
4. **Search toggle `aria-expanded` is always `false`.** The button is replaced by the field
   when opened, so the attribute never reports the open state. There is no Escape-to-close.
5. **Lists have no search and no cached/offline notice** (Notes has both); Lists have an
   `assertOnlineWrite` guard for ticks only.
6. **Tick feedback has no motion and no check glyph.** State is conveyed by fill, strike-
   through and the native checkbox state; the entry jumps to the done group without
   animation.
7. **Pending marker follows only the latest tick** (`toggleItem.variables`); a second tick
   on another entry while one is pending lifts the disabled state of the first, so the
   same entry could be toggled again before its write settles.
8. **Tick failures show one list-wide message without retry**, not next to the entry.
9. **The disabled checkbox gives no explanation** when the viewer lacks edit capability.
10. **Alert dialog focus.** `ItemDeleteSheet` does not set an initial focus target, so focus
    starts on the sheet's close button, not on Cancel.
11. **Remembered view.** Listen always opens Lists; the last Notes view is not remembered.
12. **Shell area marker.** `AppShell` still sets `data-area="more"` for every `/more*`
    path, including `/more/collections` and `/more/notes`, although `shared` is active.
    Any style keyed to `data-area` treats these as More.
13. **Notification target.** `COLLECTION_ITEM` notifications resolve to the More overview
    (`m4Product.ts`), not to Listen.
14. **Expanded state of list cards is not restored** after opening a list and returning.
15. **Not yet evidenced:** 200 % text, 320 px, sparse/dense, reduced-motion captures and the
    Pixel/Capacitor check for the five-column bar and the sheets.

## Reuse, business model and cross-cutting review

- **Reuse:** all components are existing or extend existing ones (`ShortTaskSheet`,
  `PageHeader`, `ListEntryIconButton`, `AddActionButton`, `StatusScope`, `UiState`,
  `ProblemState`, task-origin store, React Query). No dependency, provider, backend or
  API change.
- **Business/freemium:** no impact. Shared Collections & Checklists and Shared Notes
  (#1969) stay Free/Core and identical on Cloud and Self-Hosted
  ([matrix](../../FREEMIUM-FEATURE-MATRIX.md)); the change only moves their navigation
  entry. No quota, managed resource or downgrade behaviour changes.
- **Cross-cutting:** accessibility and large text are addressed above; i18n uses
  `navigation.shared`, `navigation.sharedHeading`, `navigation.sharedLists`,
  `navigation.sharedNotes`, `navigation.sharedViewsAria` and the existing `m5s3` and
  `sharedNotes` resources; security and privacy unchanged (same endpoints, capabilities
  and tenant scope); concurrency relies on the existing `If-Match` versioning; no new
  persistent browser storage.
- **Android parity:** the Android app ships this Web UI through the Capacitor wrapper;
  see the [ADR 0003 amendment](../../decisions/0003-primary-navigation-and-route-model.md).
  Native-device acceptance for the five-column bar and the sheets is outstanding.

## Related documents

- [Information Architecture](../../INFORMATION-ARCHITECTURE.md)
- [ADR 0003](../../decisions/0003-primary-navigation-and-route-model.md)
- [Product Reference v1](./product-reference-v1.md)
- [Places and shared lists](./places-and-lists.md)
- [Component Contracts](../../COMPONENT-CONTRACTS.md)

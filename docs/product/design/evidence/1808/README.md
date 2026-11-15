# Shared shopping list #1808: visual product reference

Owning issue: [#1808](https://github.com/baerenmarke90/eimir/issues/1808).
This folder holds the visual product reference required before UI implementation starts. It is a
composition reference, not an implementation and not a pixel lock. Product Reference v1, the
partner-app experience standard, accessibility, privacy, security, the business/freemium model and
later explicit Product Owner decisions remain binding.

## How the images were produced

Both images are screenshots of the real web app at 390 px width in Light mode. They were rendered
with Playwright against the mocked API responses of the existing `today-pinned-collection` browser
test, with prototype markup injected into the real Wir and collection pages. The shell, bottom
navigation, fonts, spacing and the reused components (`checklist-toggle`, `add-action`,
`short-task-sheet`, the pinned collection section) are therefore the real ones.

They are **not** output of an image-generation model. If the generated-image requirement of the
feature template is read strictly, regenerate them from these references.

The prototype uses literal colors for the two partner roles and the cart bar. They are placeholders
for semantic tokens that the implementation must add (decision 4 in the issue).

## Baseline

- Rendered from the tree at `0e80ebdd1`.
- Re-rendered the Wir page with the pinned collection and the collection detail page on `main` at
  `258d6560f` and compared them pixel by pixel: both screens are identical to the render baseline.
  `TodayPage` changed in between (cache-to-live continuity), but not the composition shown here.
- Refresh the reference if `main` changes the Wir composition or the collection page before
  implementation starts.

## Images

### `1808-shopping-list-wir-and-sheet-reference-390-light.png` (approved)

Approved by the Product Owner on 2026-11-13. Five Compact frames:

1. Wir with one shared list: one wide tile (name, large count, two-tone bar, peek of the open items,
   last action, add action).
2. Wir with several shared lists: tiles side by side in a swipeable row; the visible "all lists"
   link is the non-swipe path.
3. A tile was tapped: the list rises over the dimmed Wir.
4. The list as a tall sheet with the handle at the top centre instead of a back arrow, without bottom
   navigation; the cart bar sits at the bottom edge.
5. Back on Wir after closing the sheet: the tile shows the updated count and last action.

### `1808-shopping-list-states-reference-390-light.png` (shown, not separately approved)

Six Compact frames of the shopping list: Wir card, list while shopping, item sheet (free-text
quantity, rename, delete), offline state with a queued change, header menu with sorting, and the end
state of a finished trip. Decisions 6 and 7 of the issue follow from it. Where it still shows a back
arrow or the earlier single-card Wir section, the approved image takes precedence.

## Existing functions represented

Wir: header, couple hero, daily quote card, the pinned collection section with its open-list link
and add action, the global add button and the bottom navigation. Collection page: back control,
title with edit, the "on Wir" pin toggle, add form, item rows with the actions menu and the bottom
navigation.

## Intentional departures and assumptions

- The pinned collection section becomes the "our lists" tiles; the single `pinned_collection`
  module needs several selected lists (see the issue).
- The list opens as a tall sheet with the handle, not as a full-page composer. This applies to lists
  only; the full-page composers keep the back arrow, and the approved #1731 composition is unchanged.
- Sorting moves into the header menu and item actions into the item sheet, replacing the always
  visible sort button and per-row menu.
- The global add button overlaps the section's add action when the section sits low on the screen.
  This already happens on `main` and is not introduced here.

## Not covered

Dark mode, ~360 px and ~430 px, reduced motion, the expanded cart sheet, sparse and dense lists,
large text, and the motion of the rise-up itself. The implementation preflight must add them.

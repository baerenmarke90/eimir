# Wir list tiles (#1808, step D1): visual evidence

Owning issue: [#1808](https://github.com/baerenmarke90/eimir/issues/1808). Step D1 replaces the card of the
pinned list on Wir with "Unsere Listen" tiles and lets several lists be shown there. Opening a list as a tall sheet
with a handle is step D2. The approved reference is in [`../1808`](../1808/README.md).

## How the images were produced

`web/e2e/tests/today-pinned-collection.spec.ts` drives the real web app in Chromium against a stateful mock API.
Each run checks that nothing overflows horizontally and that axe finds no violation.

| View | File |
| --- | --- |
| Wir with one list as a wide tile, Compact 390 px Light | `1808-d1-wir-tile-390-light.png` |
| Wir with one list as a wide tile, Expanded 1280 px Light | `1808-d1-wir-tile-1280-light.png` |

## What the screens show

- **One list, one wide tile.** The section title is `m5s5.today.wirLists.titleOne`; the tile shows the name, the
  number of open entries with the shopping or plain wording of `m5s3.collection.summary`, the two-tone bar of the
  list page, a peek at up to three open entries, the last action of either person and a filled add link
  (`m5s5.today.wirLists.add`). A tile has no checkboxes: it opens the list.
- **Several lists, tiles in a row.** The title becomes `titleMany`; the tiles sit next to each other in a row that snaps
  and can be swiped. The visible link to all lists (`allLists`) is the path that needs no swipe.
- **Opening.** The tile opens the list page and keeps the entry field unfocused, so no keyboard rises. The add
  link opens the same page with the entry field focused (explicit intent).
- **Several lists on Wir.** The pin button on a list page (`m5s3.collection.pinLabel`) adds the list to the ones on Wir or takes it off again; it no
  longer replaces another list. The preference is sent as `selectedCollectionIds`.

## Departures from the approved reference

- **Opening a list.** The reference opens it as a tall sheet with the handle; this step navigates to the list
  page. The sheet is step D2.
- **Several tiles.** The row of tiles is covered by unit tests; the browser evidence shows one list because the mock
  holds one selection. A browser capture with two or more tiles is part of D2.
- **Last action.** It names the person and the entry; a relative time is not shown.
- **Two-tone bar in the tile** uses the same component as the list page.

## Removed behavior

The card checked entries and added entries directly on Wir and showed the shared-achievement celebration. That is
gone on purpose (Product Owner decision, 2026-11-14): entries are checked and added in the list, and the
celebration returns with the end state of a shopping trip (step E).

## Not covered

- Dark at widths other than 1280 px for the tile, reduced motion, a native device check (the Pixel).

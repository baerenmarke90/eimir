# Wir list sheet (#1808, step D2): visual evidence

Owning issue: [#1808](https://github.com/baerenmarke90/eimir/issues/1808). Step D2 opens a list from its Wir tile
as a tall sheet over Wir, with the handle instead of a back arrow. The tiles are step D1, see
[`../1808-d1`](../1808-d1/README.md). The approved reference is in [`../1808`](../1808/README.md), frames 3 to 5.

## How the images were produced

`web/e2e/tests/today-pinned-collection.spec.ts` and `web/e2e/tests/shopping-list-offline.spec.ts` drive the real web
app in Chromium against stateful mock APIs. Each run checks that nothing overflows horizontally and that axe finds no
violation. The shopping capture uses reduced motion so the sheet is at rest when it is measured.

| View | File |
| --- | --- |
| A plain list as a sheet, Compact 390 px Light | `1808-d2-list-sheet-390-light.png` |
| A plain list as a sheet, Expanded 1280 px Light, opened from the add link (entry field focused) | `1808-d2-list-sheet-1280-light.png` |
| A shopping list as a sheet with the cart bar at its bottom edge, Compact 390 px Light | `1808-d2-shopping-sheet-390-light.png` |

## What the screens show

- **A tall sheet.** Tapping a tile (`m5s5.today.wirLists.openAria`) opens the list over Wir. On Compact the sheet
  takes the screen's height; the handle at the top centre is the visible Close control
  (`taskSheets.close`), and a swipe down closes it as for every sheet. There is no back arrow and no bottom
  navigation. The address stays on Wir.
- **The same list.** Inside the sheet are the count, the two-tone bar, the entry field, the entries and, on a shopping
  list, the cart bar. The page's own heading, the pin button and the title edit are not repeated: the sheet owns the
  title and the way out.
- **No keyboard on opening.** Opening from the tile leaves the entry field alone; opening from the add link of the wide
  tile (`m5s5.today.wirLists.add`) focuses it, the explicit intent.
- **Cart bar at the bottom edge.** With no navigation under the sheet, the cart bar sits above the safe area at the
  sheet's bottom edge; the cart opens in a second sheet above the list and closes back to it.
- **Closing.** Closing returns to Wir, gives the focus back to the tile that opened the sheet, and the tile already
  shows the new counts because the sheet and the tiles read the same list.
- **No Save or Discard.** Entries are saved as they are made.

## Departures from the approved reference

- **Several tiles.** The browser captures show one list; a row of tiles opening the right list is covered by unit tests.
- **Expanded.** The reference is Compact only. On Expanded the same sheet is a centered dialog of a readable width.
- The sort toggle of the list page is still in the sheet; the header menu is not part of this step.

## Not covered

- The keyboard together with a tall sheet on a real phone (the Product Owner asked for this check), Dark and 360/430 px
  for the sheet, reduced-motion capture of the slide itself, a native device check (the Pixel).

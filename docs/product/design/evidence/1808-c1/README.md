# Shopping and shared list composition (#1808, step C1): visual evidence

Owning issue: [#1808](https://github.com/baerenmarke90/eimir/issues/1808). Step C1 re-composes the page of a
shared list: a count, a two-tone bar, partner markers, a tray for finished entries and an optional quantity.
The approved visual reference for the whole feature is in [`../1808`](../1808/README.md); the cart bar, the
item sheet and the header menu are step C2.

## How the images were produced

`web/e2e/tests/shopping-list-offline.spec.ts` drives the real web app in Chromium against a stateful mock API.
Anna created the list, Ben added "Milch" and put "Äpfel" into the cart, Anna added "Brot" (quantity `2`). The same
run checks that nothing overflows horizontally and that axe finds no violation.

| View | File |
| --- | --- |
| Compact 390 px Light and Dark | `1808-c1-composition-390-light.png`, `1808-c1-composition-390-dark.png` |
| Compact 360 px and 430 px Light | `1808-c1-composition-360-light.png`, `1808-c1-composition-430-light.png` |
| Expanded 1280 px Light | `1808-c1-composition-1280-light.png` |

## What the screens show

- **Count and bar.** "2 fehlen noch" (shopping list) or "2 offen" (other lists), then a bar whose filled part is
  split by the person who finished the entries. When nothing is missing the line says "Alles im Wagen" (or
  "Alles erledigt"). The same facts are written out below the bar ("Ben: 1 im Wagen"), so the bar is decoration.
- **Partner colours.** The person who created the list is rose, the other person blue, on both phones. The roles
  are `--color-partner-a` and `--color-partner-b` (with `-surface` variants), generated from the existing identity
  rose and sky roles in `design/tokens.json`; no new colour value was added.
- **Markers.** Every entry shows initials on its person's tint: who added it, or, once it is in the tray, who
  finished it. The person is also named in text for assistive technology; colour never carries the meaning alone.
- **Tray.** Finished entries move into "Im Wagen" (shopping lists) or "Erledigt" with their count. Focus follows a
  checked entry to its new place.
- **Quantity.** A shopping list has an optional "Menge" field next to the entry field. A bare number reads `2×`,
  a value with a unit stays as typed (`1 kg`). The entry field stays focused for the next entry.
- **Updates.** An open, visible list asks for its partner's changes every 12 s and once when the app is opened
  again after 10 s. It pauses while the person edits, sorts, or has changes waiting to be sent, and while offline.

## Departures from the approved reference

- The reference puts the count above a larger bar with both partner portraits. This step uses the existing
  initials style and the existing page header; the portraits would need the couple hero component and are not
  part of this slice.
- No floating cart bar yet: the tray is inline. The bar, the item sheet and the header menu are step C2.
- No glide of an entry into the tray: it moves instantly with the bar width animating. The glide needs the cart
  bar as its destination and comes with C2. The bar width transition respects reduced motion through the
  existing motion tokens.

## Not covered

- Dark at widths other than 390 px, reduced-motion capture, no native device check (the Pixel).
- The rose tint of partner A is subtle on the Light page ground; the initials and the text caption carry the
  meaning. A stronger tint would have to pass 4.5:1 for the initials, so it needs a token decision.

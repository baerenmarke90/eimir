# Shopping list cart bar, entry sheet and creation (#1808, step C2): visual evidence

Owning issue: [#1808](https://github.com/baerenmarke90/eimir/issues/1808). Step C2 completes the list page:
the cart bar, the entry sheet and creating a shopping list. The composition above them (count, bar, markers)
is step C1, see [`../1808-c1`](../1808-c1/README.md). The approved reference is in [`../1808`](../1808/README.md).

## How the images were produced

`web/e2e/tests/shopping-list-offline.spec.ts` drives the real web app in Chromium against a stateful mock API.
Each run checks that nothing overflows horizontally and that axe finds no violation.

| View | File |
| --- | --- |
| Compact 390 px Light and Dark: list with the cart bar | `1808-c2-composition-390-light.png`, `1808-c2-composition-390-dark.png` |
| Compact 360 px and 430 px Light | `1808-c2-composition-360-light.png`, `1808-c2-composition-430-light.png` |
| Expanded 1280 px Light: inline cart section | `1808-c2-composition-1280-light.png` |
| Cart opened from the bar (390 px Light) | `1808-c2-cart-sheet-390-light.png` |
| Entry sheet with quantity (390 px Light) | `1808-c2-item-sheet-390-light.png` |
| Creating a list with the type choice (390 px Light) | `1808-c2-create-390-light.png` |

## What the screens show

- **Cart bar (Compact).** A pill above the bottom navigation: a cart icon, the number of entries in the cart
  (`m5s3.collection.cart.bar`), the initials of the people who put entries there and a chevron. It opens the cart
  as a sheet with its entries; the toggle there puts an entry back on the list. It is only present on a shopping
  list with at least one entry in the cart. The list reserves room below its last entry, so the bar never covers it.
- **Expanded.** The same entries are the inline cart section under the open ones and the bar is not shown.
- **Entry sheet.** The entry's name is the opener (accessible name `m5s3.collection.openItem`). The sheet holds the
  title, the optional quantity on a shopping list, Save, Cancel and Delete (with its own confirmation). It replaces
  the separate actions menu: one tap fewer, and the quantity is editable where the entry is.
- **Creating a list.** The sheet that adds a list has a choice for its type (`m5s3.collection.kind`), the existing
  filter control reused. A plain list sends no kind, exactly as before.

## Departures from the approved reference

- **Header menu.** The reference moves sorting into a header menu. This step keeps the existing sort toggle; the
  header menu is not part of it.
- **Cart bar content.** The reference shows the two-tone mini bar inside the cart bar; this step shows the initials.
- No glide of an entry into the cart and no partner portraits at the count (see C1).

## Not covered

- Dark and 360/430 px for the sheets, reduced motion, a native device check (the Pixel), the keyboard together
  with a sheet on a real phone.
- After the last entry is put back from the cart sheet the bar disappears with the sheet; focus then falls back to
  the page instead of the add field.

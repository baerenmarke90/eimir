# People discs and the flight into the cart (#1808, step H)

Owning issue: [#1808](https://github.com/baerenmarke90/eimir/issues/1808). Step H builds two elements of the approved
reference that earlier steps left out. The earlier evidence is in [`../1808-g`](../1808-g/README.md),
[`../1808-f`](../1808-f/README.md) and the folders before them; the approved reference is in [`../1808`](../1808/README.md).

## What changed

- **People discs.** Next to the count ("2 fehlen noch") the list shows two round initials discs, the list's creator in
  rose first and the other person in blue, as in the reference. The same discs sit on the Wir tile. The discs are
  decoration and hidden from assistive technology; who did what stays written out as text under the bar. They show the
  people the list already knows (its creator and anyone who added or completed an entry), so a partner who has not
  touched the list yet appears after their first action. The colour belongs to the person, as before, so both phones
  show the same colours.
- **Flight into the cart.** Checking an entry in a shopping list sends a copy of the entry (a pill in the checking
  person's colour, no outline) from its row toward the cart: the bar on Compact, the cart section on Expanded. The
  first entry of a trip, which makes the cart bar appear, flies too: the flight starts after the render that shows the
  cart. The copy is hidden from assistive technology, takes no pointer events, and removes itself at the end. With
  reduced motion (the motion token is 0 ms, and the system setting is also read) there is no flying copy; the entry
  simply appears in the cart. Putting an entry back keeps the short arrival of step F.

## How the images were produced

`web/e2e/tests/shopping-list-offline.spec.ts` drives the real web app in Chromium against a stateful mock API. The flight
images pause the animation about 100 ms after the tap so the flying copy is visible. Each run checks that nothing
overflows horizontally; the discs views also pass axe.

| View | File |
| --- | --- |
| Flight, Compact 390 px Light | `1808-h-cart-flight-390-light.png` |
| Flight, Compact 360 px Dark | `1808-h-cart-flight-360-dark.png` |
| Flight, Expanded 1280 px Light | `1808-h-cart-flight-1280-light.png` |
| Discs next to the count, Compact 390 px Light | `1808-h-list-people-390-light.png` |
| Discs next to the count, Expanded 1280 px Light | `1808-h-list-people-1280-light.png` |

## Not covered

- Still images show one moment of the flight; the motion itself is checked by the browser tests (copy appears, is
  decorative, ignores the pointer, disappears, is absent with reduced motion), not by the images.
- The discs of a person the list does not know yet (a partner who has not acted) are not shown; the list has no member
  list of its own, and reading the couple's members here would need a further request.
- A native device check (the Pixel).

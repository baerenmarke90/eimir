# Shopping list polish: list menu, glide, banner and remaining evidence (#1808, step F)

Owning issue: [#1808](https://github.com/baerenmarke90/eimir/issues/1808). Step F closes the gaps that the earlier steps
listed: sorting moves into the list menu, a checked entry glides into the cart, the app-wide offline banner is true on
a shopping list, and the evidence now covers Dark, 360 and 430 px, the Expanded view and text enlarged to 200%.
The earlier evidence is in [`../1808-c1`](../1808-c1/README.md), [`../1808-c2`](../1808-c2/README.md),
[`../1808-d1`](../1808-d1/README.md), [`../1808-d2`](../1808-d2/README.md) and [`../1808-e2`](../1808-e2/README.md).

## How the images were produced

`web/e2e/tests/shopping-list-offline.spec.ts` drives the real web app in Chromium against a stateful mock API. Each
run checks that nothing overflows horizontally and that axe finds no violation.

| View | File |
| --- | --- |
| List with suggestions and the cart bar, Compact 390 px Dark | `1808-f-polish-390-dark.png` |
| The same, Compact 360 px Light | `1808-f-polish-360-light.png` |
| The same, Compact 430 px Light | `1808-f-polish-430-light.png` |
| The list with suggestions, the inline cart and the finish action, Expanded 1280 px Light | `1808-f-polish-1280-light.png` |

## What changed

- **List menu.** A menu button next to the pin opens the menu of the list; sorting is its first entry
  (`m5s3.collection.menu.open`, `m5s3.collection.sort`). While sorting the page shows the finish-sorting control as
  before. Without a page heading (the Wir sheet) the menu button sits in the list's toolbar. The menu needs at least two
  entries and is off while changes wait to be sent, as the sort toggle was.
- **Glide.** The entry that was just checked or put back arrives in its new place with a short glide
  (`shared-list-row-arrive`); the other entries do not move. The motion tokens are 0 ms with reduced motion, so the
  entry simply appears there; a browser test asserts the animation and its 0 s duration under reduced motion.
- **Offline banner.** The app-wide banner now says that the last loaded version is shown, that shopping lists keep
  their changes, and that everything else needs a connection (`states.offline.banner`).

## Not covered

- A native device check (the Pixel) and the keyboard together with a tall sheet on a real phone.
- The glide is a short arrival, not a path to the cart bar; a path animation would need the bar as a measured target.
- A short way to a default shopping list (a prompt on the overview when none exists) is not part of this step: whether
  a list exists cannot be told reliably from one page of the overview, so it needs a server-side answer first.

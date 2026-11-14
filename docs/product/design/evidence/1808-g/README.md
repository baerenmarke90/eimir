# Short way to a first shopping list (#1808, step G)

Owning issue: [#1808](https://github.com/baerenmarke90/eimir/issues/1808). Step G gives a couple without a shopping list
a one-tap way to get one. The earlier steps are documented in [`../1808-f`](../1808-f/README.md),
[`../1808-e2`](../1808-e2/README.md) and the folders before them.

## What it does

- On the lists overview ("Listen"), a quiet block above the list filter says "Gemeinsam einkaufen" and offers the filled
  action "Einkaufsliste anlegen". One tap creates a shopping list named "Einkauf" and opens it; the name can be changed
  on the list page, and "Auf Wir" is there as before.
- The block appears only while the couple has **no shopping list at all**. The server answers that question with the new
  `kind=SHOPPING` filter of the list endpoint, so a list whose items are all in the cart still counts, which the default
  overview (scope "Offen") would not show.
- While the answer is unknown (loading, offline, error) nothing is shown: the overview never waits for the block or fails
  because of it.

## How the images were produced

`web/e2e/tests/shopping-list-offline.spec.ts` drives the real web app in Chromium against a stateful mock API. Each run
checks that nothing overflows horizontally and that axe finds no violation.

| View | File |
| --- | --- |
| Compact 390 px, Light | `1808-g-short-way-390-light.png` |
| Compact 360 px, Dark | `1808-g-short-way-360-dark.png` |
| Expanded 1280 px, Light | `1808-g-short-way-1280-light.png` |

## Not covered

- No generated visual reference image exists for this block in the issue; it reuses the filled add action and the page
  composition of the overview. It needs the Product Owner's look.
- The new list is not pinned to Wir automatically; the existing "Auf Wir" control on the list page does that.
- A native device check (the Pixel).

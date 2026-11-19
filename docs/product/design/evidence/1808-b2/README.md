# Shopping list without a connection (#1808, step B2): visual evidence

Owning issue: [#1808](https://github.com/baerenmarke90/eimir/issues/1808). Step B2 keeps changes to a
shopping list on the device while there is no connection and sends them when it is back. The visual
reference for the whole feature is in [`../1808`](../1808/README.md).

## How the images were produced

`web/e2e/tests/shopping-list-offline.spec.ts` drives the real web app in Chromium against a stateful
mock API that honors `Idempotency-Key` like the real endpoint. The network is switched off with
Playwright's offline mode, so the browser really reports no connection. Each width runs the same
journey: open the list, go offline, add an entry and check another one, observe the waiting state.
The same run checks that nothing overflows horizontally and that axe finds no violation.

The files are named `1808-b2-<state>-<view>.png`:

| State | Meaning |
| --- | --- |
| `online` | The list before the connection is lost. |
| `offline-waiting` | Two changes made offline: a new entry and a checked entry, both marked as waiting. |

| View | Files |
| --- | --- |
| Compact 390 px Light and Dark | `*-390-light.png`, `*-390-dark.png` |
| Compact 360 px and 430 px Light | `*-360-light.png`, `*-430-light.png` |
| Expanded 1280 px Light | `*-1280-light.png` |
| 320 px with text enlarged to 200% | `1808-b2-offline-waiting-320-large-text.png` |

## What the screens show

- A quiet status line under the list heading: a crossed-out cloud and "Offline · 2 changes waiting" (German
  copy in the images). Back online the same line says that changes are being sent, and it disappears once
  everything was sent.
- A small clock at every entry that has a change waiting. It has an accessible name, so the state is not
  conveyed by an icon alone.
- An entry the server does not know yet has no actions menu; sorting is unavailable while changes wait.
- Existing list composition, add form, rows and Back stay as on `main` (baseline `31921c10f`). Step C
  re-composes the page (counter, partner markers, cart bar); this step adds only the waiting state.

## Relation to the approved reference

The status line and the clock follow the offline frame of
`../1808/1808-shopping-list-states-reference-390-light.png`, which was shown to the Product Owner but not
approved separately. It is built from existing tokens only (surface-subtle, text, pill radius); no color,
spacing or motion value was added.

## Not covered

- The app-wide offline banner above the page still says that changes need a connection. That is not true on
  a shopping list any more and needs its own decision on the wording.
- The pinned list card on Wir still writes only online; Wir tiles are step D.
- No native device check yet (the Pixel), and no reduced-motion capture: this step adds no animation.
- Dark at widths other than 390 px.

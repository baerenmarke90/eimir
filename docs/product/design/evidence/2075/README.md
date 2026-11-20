# #2075 Shell, overlays and navigation on the motion layer

Captured with Playwright Chromium from `web/e2e/tests/floating-bottom-nav-scroll.spec.ts`, describe block `shell, overlays and navigation on the motion layer (#2075)`, run with `VISUAL_EVIDENCE_DIR`. The API is mocked, and the Verbunden design is used throughout.

## Images

`2075-<width>-<theme>[-200-text]-<n>-<state>.png`

- `1-sheet-entering`: the quick-create sheet (`navigation.quickCreateTitle`) paused at half of its Enter `surface` (`eimir-motion-surface-in`, `--duration-context`, `--easing-enter`). On Compact the whole sheet slides up from below the edge with its opacity at 1; the backdrop fades in (`eimir-motion-backdrop-in`, opacity only). On Expanded it is the centred dialog with a short rise and fade.
- `2-sheet-open`: the same sheet at rest.
- `3-forward-arriving`: Mehr › people (`/more/people`), a forward `navigate`, paused at half. The routed page is a few pixels in from the inline end (the standard easing is about 88 % through at half time), and the content fades from 0.92. The floating create action stays fixed at the viewport corner: only the page's `left` offset moves.
- `4-forward-settled`: the same page at rest.
- Widths 360, 390 and 430 in Light and Dark, 390 with 200 % text, and Expanded 1280 in Light and Dark.
- `2075-390-light-reduced-motion-plan.png`: Planen opened with reduced motion; nothing animated (see below).

## Frame-sampled sheet entrance (390 px, Light)

`getComputedStyle(dialog).translate` sampled each animation frame after the open:

| Frame | translate (y) | opacity |
| --- | --- | --- |
| 0 | `100% + 16px` | 1 |
| 1 | `79.8% + 12.8px` | 1 |
| 3 | `53.7% + 8.6px` | 1 |
| 6 | `28.8% + 4.6px` | 1 |
| 10 | `10.1% + 1.6px` | 1 |
| 14 | `1.5% + 0.2px` | 1 |
| 17 and later | `none` | 1 |

The entrance decelerates monotonically and rests after 17 frames (about 280 ms, `--duration-context`). It leaves no style behind.

## Behaviour checked in the same spec

- **Open → close → return, sheet** (`a sheet enters and exits on the catalogue for Close, Escape and the backdrop, and focus returns`):
  - opening runs `eimir-motion-surface-in` and `eimir-motion-backdrop-in`;
  - Escape, the close control and a press on the backdrop each run the same `eimir-motion-surface-out` exit; the dialog is then gone and the trigger has focus again;
  - a rapid open and Escape converge on closed, with no layer animation left running.
- **Navigation** (`navigation moves by direction, and a kept tab never replays its entrance`):
  - Wir → Planen (a later tab): the page enters from `+32px` and the root-tab entrance (`eimir-motion-root-rise`) plays once;
  - Mehr → Planen (an earlier tab): the page enters from `-32px`, and the kept Planen tab starts no `eimir-motion-root-rise`;
  - Mehr → people (forward): `+32px`; history Back: `-32px`; the kept Mehr tab starts no `eimir-motion-root-rise`.
- **Reduced motion** (`reduced motion shows sheets and destinations at once with the same focus`): the sheet opens with focus inside it and no running animation; Escape closes it at once and focus returns to the trigger; Planen opens with no page offset, no stage attribute and no `eimir-motion-*` animation.
- Unit tests (`useNavigationMotion.test.tsx`) cover the direction mapping, including forward from the inline end, the in-place fade for a tab chosen from a detail page, and right-to-left mirroring.

## Known, not caused by this change

- At 390 px with 200 % text, the longest quick-create entry breaks inside the word. The sheet's text styles are unchanged here; this is a typography follow-up.
- Locally on Windows, `memory-carousel-stability.spec.ts` "native resume preserves photo ownership …" fails intermittently with an unexpected `GET …/memory-map`. It fails the same way on `main` sources (7 of 18 runs with `--repeat-each=2`).

## Outstanding

Pixel device acceptance on an Android test release:
- sheets and the preference dialog open and close smoothly, including System Back;
- tab changes, detail opens and Back move in the expected direction;
- no replay when returning to a kept tab;
- the floating create action never travels with the page.

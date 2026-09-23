# Issue #1225 — owner-reference Phase A exploration

This folder contains a new visual exploration drawn directly from Philipp's three images in [issue comment #5784651622](https://github.com/baerenmarke90/eimir/issues/1225#issuecomment-5784651622) and the current requirements in [issue #1225](https://github.com/baerenmarke90/eimir/issues/1225). It starts from `main` at `a3538312a127a270a6761950da2c215f870135f3` and does not import or modify the earlier Claude exploration. [The comparison image](exports/comparison.png) shows the three structures side by side.

| Board | Owner reference | Structural idea | Preview |
| --- | --- | --- | --- |
| 01 — Überlagerung | Third image | Two **filled** pastel circles and a visibly violet shared area | [PNG](exports/overlap.png) |
| 02 — Wachstum | First image | Two asymmetric warm/cool leaves rooted together, with a small bud | [PNG](exports/growth.png) |
| 03 — e-Geste | Second image | Two overlapping warm/cool circles, a white `e` loop, dark finishing stroke and lower-right dot | [PNG](exports/gesture.png) |

Each board includes a wordmark, light/dark/one-ink mark, 16/24/48 px size samples, the four root navigation destinations and central action, relationship/context icons including Wünsche, four example states, a Lists icon in the Mehr › Gemeinsame Listen context, one same-content Wir screen in light and dark, and Original/Natürlich/Warm color-world previews. The dark marks use explicitly adjusted colors; the one-ink marks are separate vector drawings. The palette previews recolor the marks, rather than only changing the background.

The Wir previews use the current Today screen's Lea & Alex / upcoming Flohmarkt / Frühstück example. The breakfast photo is the existing [`backend/demo_assets/images/breakfast-coffee-croissants.jpg`](../../../../backend/demo_assets/images/breakfast-coffee-croissants.jpg) fixture, also used by [`today-living-home.spec.ts`](../../../../web/e2e/tests/today-living-home.spec.ts). The current screen evidence is [`today-r4-390-light.png`](../../../product/design/evidence/r4/today-r4-390-light.png) and its dark counterpart. These boards are static design compositions, not runnable product screens; the copy and imagery in the previews are demo data.

The marks are editable SVGs in [`marks/`](marks/). `board.html` and `comparison.html` are the editable board sources. `build-variants.py` derives the dark and two alternate palette SVGs from each original SVG. `render.sh` exports the three PNG boards at a fixed 1500 × 2580 viewport and the comparison at 1500 × 850 with Chromium. The marks, fonts, and photo are loaded from this repository; exported PNGs are self-contained. [`SHA256SUMS`](SHA256SUMS) records the delivered exports.

## Review questions

1. Which **form language** is closest to Philipp's intent? The palette can be refined after selecting a form.
2. Does the mark retain identity at 16 and 24 px on light and dark surfaces? The e-Geste is the highest-risk small-size case.
3. Does the icon family feel coherent with the mark and still read in the real four-destination shell?
4. Which color world supports personal photography without overpowering it?

Representative accent-text pairs were checked with the WCAG relative-luminance formula: Überlagerung 5.54:1 light / 8.74:1 dark, Wachstum 5.08:1 / 9.22:1, e-Geste 7.58:1 / 8.69:1. The small palette-preview action text uses darker ink values above 5.3:1 against its surface. These spot checks are not a full contrast or interaction audit.

No candidate is selected. The board is an exploration for Product Owner review. It does not change runtime tokens, UI components, PWA icons, or Android packaging. Before implementing a selected direction, verify contrast of each semantic role, small-size legibility, accessible icon names and states, and platform icon masks against the final chosen palette.

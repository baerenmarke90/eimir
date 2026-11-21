# Wir opening on one clock (#2147)

Evidence for the Wir opening after the Product Owner decisions of 2026-11-21:
late data joins the opening, the opening waits briefly for its hero data, and
Wir is complete about 2.5 s after the first Wir paint, with every element at
rest and nothing animating twice. `WIR_INTRO_PACE` (2.2) is unchanged.

## Baseline

`main` at `1c97f6540730f8da28c8d1a548c8b5791ca3c028`. Screens reviewed: Wir
(Today) in the Verbunden design, the couple hero (portraits, rings, names,
check-in row, heart line, time together, place pill), the daily quote and the
modules below (here the upcoming plans). Their functions, copy, hierarchy and
privacy presentation are unchanged.

## Timeline

One beat is `--duration-sequence-beat` (200 ms) times `WIR_INTRO_PACE` (2.2) =
440 ms. Times are milliseconds after the opening starts unless noted.

### Before (`main`)

| Element | Start | Duration | Token | Waits for / clock |
| --- | --- | --- | --- | --- |
| Portrait columns (`stage-settle`, opacity and scale) | 0 / 176 | 1056 | beat x 2.4 | stage clock |
| Rings (`::before`, fade inside the fading column) | 264 / 440 | 1056 | beat x 2.4 | stage clock |
| Names and check-in badges (rise inside the fading column) | 616 | 880 | beat x 2 | stage clock |
| Badge values (`enter-rise`) | on mount and on every key change | 180 | `--duration-transition` | own clock |
| Heart line arms / heart | 440 / 880 | 528 / 572 | beat x 1.2 / 1.3 | stage clock |
| Ampersand, time, distance slot | 1144 | 792 | beat x 1.8 | stage clock |
| Pin settles, value fades, pin wiggle | 1144 / 1848 / 2024 | 1100 / 880 / 900 | beats + `--duration-gesture-moment` | counted from when the pill mounts (after three chained reads) |
| Root-tab rise of the quote and modules | 0 | 400 to 520 | `--duration-sequence-beat` x 2 + stagger | a second stage beside the Wir opening |
| Quote card shift, quote fade | on mount / on arrival | 180 / 1000 | `--duration-transition` / beat x 5 | own clocks; placeholder swapped in the same commit |
| Photo over the initials | on decode | 180 | `--duration-transition` | own clock, every cold start |
| Modules | after the hero and quote are quiet for 300 ms (cap 2200), then 1210 + 220 per module | 560 to 900 | context x 2/3, gesture moment | own batch clock |
| Partner check-in arrival (Flight) | when the values arrive | about 1200 | flight tokens | own clock, during the opening |

Measured from the first Wir paint until the last animation ended
(`document.getAnimations()`, Chromium, 390 px, the journey below): **3.36 s**
with all data at once, **4.27 s** with the quote, place, check-in and photo at
1 s, **5.05 s** with them at 3 s. At 3 s the modules were already shown and
jumped down twice (quote height, check-in row).

### After (this change)

The opening first waits, unpainted, for its hero data for at most
`motion.stage.dataHold` (400 ms), then plays once on one clock. Its beats are
`WIR_STAGE_BEATS` in `web/src/components/wirStageMotion.ts`.

| Element | Start | Duration | Token | Waits for / clock |
| --- | --- | --- | --- | --- |
| Data hold (nothing painted) | first paint | up to 400 | `motion.stage.dataHold` | Space configuration, profiles and photos, check-in, place, quote |
| Portrait columns: portrait, ring, name and marks as one (opacity only) | 0 / 132 | 704 | beat x 1.6 | stage clock |
| Heart line arms / heart | 308 / 528 | 440 / 484 | beat x 1.0 / 1.1 | stage clock |
| Ampersand, time and place pill (pin and value together) | 792 | 572 | beat x 1.3 | stage clock; the pill joins late |
| Check-in badges | 836 | 528 | beat x 1.2 | stage clock, after the columns; joins late |
| Daily quote card | 968 | 572 | beat x 1.3 | stage clock (page content scope); joins late |
| Pin wiggle (current position only) | 1144 | 900 | `--duration-gesture-moment` | stage clock |
| Modules in view: header / body / plans | 1100 / 1188 / 1188 + 66 per plan, +60 per module | 528 / 616 / 440 | beat x 1.2 / 1.4 / 1.0, `--duration-stagger-item` | stage clock |
| End of the opening | 2072 | | `wirStageDuration()` | hold + opening at most 2472, inside `motion.stage.openingBudget` (2500) |

Late data: a member that arrives before its slot plays on its slot; after its
slot began it plays in the time that is left (at least
`--duration-transition`, ending with the opening); after the opening it is
simply there. The partner's check-in arrival waits until the opening ended.
Deleted: the column scale, the separate ring fade, the separate glyph and value
fades, the badge values' first-appearance rise, the quote's own shift and fade,
the root-tab rise beside the opening, the module settle polling and the
moment caption's separate fade.

Measured the same way, two runs each: **2.33 to 2.58 s** with all data at
once (the higher value when the chained reads ran into the 400 ms hold),
**2.38 to 2.43 s** with the data at 1 s (it joined the opening), **2.17 to
2.19 s** with the data at 3 s (it appeared at rest, nothing started after the
opening). By construction the opening ends at most 2.47 s after its first
paint plus timer latency (hold 400 ms + stage 2072 ms). No element faded twice,
no fade ran inside another fade, at most 12 elements animated at once, and no
painted element moved when the quote, place or check-in arrived.

## Frame sequences

Recorded by `web/e2e/tests/wir-opening-timeline.spec.ts` with
`VISUAL_EVIDENCE_DIR` set (cold start with a stored session, mocked API,
Chromium). Each strip shows the frames nearest to 0, 300, 600, 900, 1200, 1500,
1800, 2100, 2400 and 3000 ms after the first Wir paint.

| File | State |
| --- | --- |
| `before-390-light.webp`, `after-390-light.webp` | Compact 390 px, Light, all data at once |
| `before-390-light-late-1000ms.webp`, `after-390-light-late-1000ms.webp` | data at 1 s |
| `after-360-light.webp`, `after-430-light.webp` | Compact 360 and 430 px |
| `after-390-dark.webp`, `after-390-dark-late-3000ms.webp` | Dark; data at 3 s appears at rest |
| `after-390-light-reduced.webp` | reduced motion: same end state, no movement |
| `after-1280-light.webp` | Expanded |
| `timelines.json` | the measured timelines (before and after) |

## Not covered

A physical device. The Product Owner measures on the Pixel 10 Pro Fold after
the next Android test release (screen recording and `dumpsys gfxinfo`):
first Wir paint to the last element at rest about 2.5 s; no element visibly
fades twice; no empty frame or height jump; pill and text together; janky
frames in the first 4 s not worse than 2.0 %, p99 not worse than 73 ms.

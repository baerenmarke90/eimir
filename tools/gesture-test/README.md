# Gesture test (#2067)

A throwaway comparison harness for the Motion Contract's gesture test
([`docs/product/design/motion-contract.md`](../../docs/product/design/motion-contract.md)
§6.5, on the #2068 branch). It is **not part of the app**: it has its own
`package.json`, is not built by `web/`, and must not be merged into the
product code.

## What it compares

One representative gesture, the bottom-sheet drag-to-dismiss of
`ShortTaskSheet`, built three ways on the same scene: a long feed behind a
60 % sheet at 390 x 844 CSS px.

| Variant | File | Mechanism |
| --- | --- | --- |
| `current` | `src/CurrentSheet.tsx` | `ShortTaskSheet` on `main` (915e97ec8): a custom property drives the drag; the settle is a 180 ms CSS transition; dismissal by distance only; no upward rubber-banding |
| `waapi` | `src/WaapiSheet.tsx`, `src/spring.ts` | thin in-house layer: 1:1 transform writes while dragging, rubber-banding, the release velocity handed to a sampled spring that runs as a Web Animation (compositor), interruption with `commitStyles`-style capture and `cancel` |
| `motion` | `src/MotionSheet.tsx`, `src/motionFeatures.ts` | `motion` 14.14.0 with `LazyMotion` (`domMax` loaded lazily, `strict`), `m.div drag="y"`, elastic top constraint, Motion's `animate` spring with the release velocity, `MotionConfig reducedMotion="user"` |

All three use the same rules (`src/gesture.ts`): 4 px slop, a dismissal
threshold of 22 % of the sheet height clamped to 120–180 px, a 24 px
reversal cancel, and, for `waapi` and `motion`, a fling rule (0.5 px/ms after
at least 32 px) and one critically damped spring (stiffness 380, damping 39).

## How it measures

`measure.mjs` builds the pages, serves them with `vite preview`, and drives
Chromium (Playwright) with **4x CPU throttling** (`Emulation.setCPUThrottlingRate`).

Scenarios:

- `fling`: a short, fast flick below the distance threshold;
- `dismiss`: a deliberate pull past the threshold;
- `cancel`: a slow pull that stops, then lets go, so the sheet returns;
- `interrupt`: the person lets go and grabs the returning sheet again.

Load modes:

- `0`: no extra work;
- `24`: from the release on, 24 ms of busy main-thread work in every frame for 800 ms. This stands in for the React render that closing a sheet causes while the settle runs. It starts at release so that it does not slow down the scripted pointer input.

Reduced motion is emulated with `prefers-reduced-motion: reduce`.

Metrics, median of 5 runs:

- **Frames drawn / expected** and **drawn-frame gap** during the settle: `Display::DrawAndSwap` events in a Chromium trace, between the `release` and `settled` marks. This is what reaches the screen, including compositor-only frames.
- **Main-thread frame p95 / max**: `requestAnimationFrame` intervals during the settle.
- **Style writes during settle**: `style` attribute mutations on the sheet. Per-frame JavaScript animation writes once per frame; a Web Animation or CSS transition writes none.
- **Velocity:**
  - the finger velocity measured from the pointer events in the last 100 ms before `pointerup`;
  - the variant's own estimate;
  - the rendered sheet velocity in the 100 ms before and after release (handoff continuity).
- **Regrab jump:** in `interrupt`, how far the sheet jumps when it is grabbed while it settles: rendered offset change minus pointer travel.
- **Tracking lag p95:** distance between the sheet and the finger one frame after each pointer move.
- **Bundle:** gzip size of the JavaScript each page loads, minus a `baseline` page with a static sheet. Initial and lazy chunks are reported separately.
- **Code size:** non-blank, non-comment lines of each variant's gesture files.

## Results (2026-11-19)

The run used Chromium 151.0.7922.34 (headless, Playwright 1.62.1) with 4x CPU throttling, a 390 x 844 viewport and the median of 5 runs. Full tables:

- [`results/summary.md`](results/summary.md): all scenarios;
- [`results/summary-start-latency.md`](results/summary-start-latency.md): a second run of `fling` and `dismiss` with the start-latency column added later;
- the raw runs: [`results/results.json`](results/results.json) and [`results/results-start-latency.json`](results/results-start-latency.json).

| Criterion | `current` (main) | `waapi` (in-house) | `motion` |
| --- | --- | --- | --- |
| Settle smoothness, no extra load: frames drawn / expected, largest gap (dismiss; fling) | 17/18, 20 ms; 11/12, 20 ms | 30/31, 22 ms; 26/27, 24 ms | 27/27, 20 ms; 28/30, 20 ms |
| **Settle smoothness with 24 ms/frame main-thread load** | 17/20, 29 ms; 12/14, 27 ms | **30/32, 28 ms; 31/34, 29 ms** | **15/28, 31 ms; 16/31, 33 ms**: about every second frame |
| Main-thread style writes during the settle | 0–1 | 1 (the final position) | 23–29 without load, 13–18 with load (one per main-thread frame) |
| Release velocity handoff (sheet speed in the 100 ms after release, dismiss / fling) | none: fixed 180 ms curve, no fling rule | 1.70 / 2.71 px/ms, continues into the spring | 1.62 / 2.45 px/ms, continues into the spring |
| Velocity estimate vs measured finger (fling, no load) | not estimated | 1.03 vs 0.84 px/ms (about 20 % high) | 0.75 vs 0.75 px/ms (accurate) |
| First visible movement after release under load | 91 ms | 92 ms | 95–111 ms |
| **Interruption** (jump when grabbing the settling sheet) | 11.7 px (the drag restarts from 0) | **0 px** | 3.2–4.5 px |
| Tracking lag while dragging (p95, one frame after each move) | 0 px | 0 px | 0 px |
| Reduced motion: settle after release | 2 ms (instant), drag tracks | 1 ms (instant), drag tracks | 1 ms (instant), drag tracks |
| Bundle delta, gzip (vs a static sheet) | +0.8 kB | **+1.2 kB** | **+33.8 kB initial + 21.3 kB lazy (`domMax`) = +55.1 kB** |
| Gesture code (non-blank, non-comment lines, without the 52 shared rule lines) | 67 | 145 (109 sheet + 36 spring) | 72 |

Reading the results:

1. **Under render load, which is the case that broke Wir, the WAAPI settle keeps its frames and Motion's does not.** Motion drives `y` from JavaScript on every main-thread frame, so a busy main thread halves its frame rate. The WAAPI settle and the current CSS transition run on the compositor. Without load the two are equal.
2. **Both hand the release velocity into the spring.** Motion's velocity estimator matched the measured finger velocity exactly. The in-house tracker read about 20 % high after one correction. The first naive version underestimated flicks by about half, and the in-house layer would need tuning and tests here.
3. **Interruption:** WAAPI captured the running position without a jump. Motion jumped 3 to 4.5 px. The current sheet jumps about 12 px because its drag restarts from 0.
4. **Reduced motion** works in all three: the drag still tracks, and the settle is instant.
5. **Cost:** Motion adds about 55 kB gzip (34 kB on first load). The in-house version adds about 1.2 kB, but needs twice the gesture code (145 vs 72 lines). The spring helper is 36 lines, well under the 150-line limit the contract set for "a small spring helper".

## Run

```sh
cd tools/gesture-test
npm ci
npm run measure        # REPEAT=5 by default; results/summary.md and results/results.json
```

## On-device build (local only)

The branch adds an Android build type `gesturetest`. It produces a separate app with the package `de.eimir.app.gesturetest` and the label "eimir Gestentest", installed beside the real app.

- **Its own manifest** replaces the launcher activity without intent filters. The test app never claims eimir. links, the custom URL scheme or the audio share target.
- **Its web content** is this harness, not the eimir. web app. It runs in the real Capacitor WebView with no account and no server.
- **It opens on a German overview page** (`index.html`) for the three variants. On every variant page you can:
  - reset the sheet;
  - switch "Mit Last" (24 ms of main-thread work per frame for 800 ms from release);
  - see the last gesture's values.
- **The values are also logged** as one JSON line per gesture: `adb logcat -s Capacitor/Console | findstr gesture-test`.

It is never published: no release, tag or workflow. Build and install it with:

```sh
cd tools/gesture-test && npm ci && npx vite build
cd ../../web && npm ci --ignore-scripts && rm -rf dist && cp -r ../tools/gesture-test/dist dist && npx cap sync android
cd ../android && ./gradlew --no-daemon assembleGesturetest   # JAVA_HOME = JDK 21, local.properties sdk.dir
adb -s <serial> install app/build/outputs/apk/gesturetest/app-gesturetest.apk
```

Remove it on the phone (long-press "eimir Gestentest", then Uninstall), or with `adb -s <serial> uninstall de.eimir.app.gesturetest`.

## Limits

- Headless desktop Chromium with CPU throttling approximates a mid-range Android phone; it is not one. GPU raster, the Android WebView compositor, touch input latency and thermal throttling are not covered. **An on-device check needs an Android test build**, which this test did not start.
- Input comes from CDP mouse events, so pointer delivery itself is slowed by the throttled renderer. Tracking frame gaps during the drag therefore reflect the input script's cadence as much as the engine, and are the same for all variants.
- The scripted fling's real speed varies between runs: the measured finger velocity was 0.23–0.84 px/ms for the same script. So the dismissal rate of a fling, especially under load, reflects input delivery more than the engines, and is not used as a criterion. The velocity comparison above uses runs in which both variants received comparable finger velocities.
- One gesture only. The tab pager, pull to refresh and reorder share the mechanics but were not built twice.

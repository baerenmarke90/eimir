# Memory-map photo stacks and place motion (#1707)

Issue: [#1707](https://github.com/baerenmarke90/eimir/issues/1707).
The Mobile Interaction Contract, reuse/business/cross-cutting review and
[generated reference](../../references/1707-map-stacks/README.md) preceded the UI
implementation. Baseline: `main@ec309e23c86f3a7e6c79b81d2eb5422bfeb93db2`.

## Actual UI evidence

Captured on 2026-11-09 using Playwright 1.62.1 and its pinned Chrome for Testing
151.0.7922.34 headless shell. These are actual rendered product screens, using
authorized repository demo images and deterministic API/map-tile fixtures. The
fixtures replace tile pixels; Leaflet camera movement, marker geometry, native
scroll snap, sheet/history ownership and touch input run in the browser.

| Viewport / state | Selected place | Fullscreen / source return |
| --- | --- | --- |
| Compact 360px, Light, reduced motion | [Overview](planning-map-stacks-360-light.webp) | [Fullscreen](planning-map-stacks-fullscreen-360-light.webp) |
| Compact 390px, Dark, normal motion | [Overview](planning-map-stacks-390-dark.webp) | [Fullscreen](planning-map-stacks-fullscreen-390-dark.webp) |
| Compact 430px, Light, normal motion | [Overview](planning-map-stacks-430-light.webp) | [Fullscreen](planning-map-stacks-fullscreen-430-light.webp) |
| Expanded 1280px, Dark, normal motion | [Overview](planning-map-stacks-1280-dark.webp) | [Fullscreen](planning-map-stacks-fullscreen-1280-dark.webp) |
| Compact 320px, Dark, 200% text | [Protected source and reflow](planning-map-stacks-320-dark-large-sensitive.webp) | Same finite collection, all five sources reachable |

[390px native browser recording: select, browse, fullscreen, source return and
clear scope](compact-motion-and-return.webm).

Visual review checked photo priority, bounded fanning, readable localized titles
and dates, visible filter/zoom controls, first/last card reachability, Light/Dark,
large text, protected-media covers and focus restoration. Compact uses the
existing operable sheet grab handle; Expanded also has the established close
button. Selecting a place inside fullscreen keeps that surface open.

## Validation

| Check | Result |
| --- | --- |
| Full Web unit suite | 2,793 passed, 2 skipped; 311 files passed, 2 skipped |
| Final affected component/resource/task-origin/swipe tests | 80 passed in 5 files |
| New browser journeys | All 5 viewport/motion/reflow cases passed; the preceding matrix also passed twice (10 executions) |
| Existing memory-map/couple-game and Photo Places browser regressions | 35 passed in a serialized run |
| Browser impact planner tests | 17 passed |
| Browser inventory | 104 spec files; 1,171 tests collected by Playwright |
| Web lint / formatting / types / build / token, legal, locale and PWA checks | Passed; lint reports existing repository warnings/information |
| Product Design review body and diff whitespace checks | Passed |

The retained screenshots and recording come from the final five-case run.
[Source hashes](source-files.sha256) identify the tested implementation and test
files without requiring a circular commit reference. GitHub checks on the actual
PR head are the authoritative final integration result.

Behavioral assertions cover distinct-memory counts, at most three stack layers,
retained marker identity, normal/reduced camera motion, native touch and button
browsing, no duplicate image reads on slide changes, nested place-filter scope,
source-detail return with the same memory/camera, Escape/focus restoration,
reset, protected media and no document overflow at 320px/200% text. Axe scans
cover the focused fullscreen surface. Unit tests cover cancellation/superseding
camera movement, both CSS time units (`ms` and minified `s`), late measurable
layout, scoped metadata privacy/invalidation and existing entitlement states.

The touch test awaits native `scrollend` before beginning the next independent
button action. The large-text screenshot captures the actual viewport: Chromium's
full-page screenshot operation changed this nested scroll-snap position during
QA. Assertions before and after the viewport capture verify the same protected
source remains selected and centered. No product delay, snap workaround or
weakened assertion was added for either automation behavior.

Real-device Product Owner acceptance and live map-provider availability remain
separate from this browser/visual evidence. This Web change adds no native
Android UI, APK, deployment, provider, dependency or entitlement change.

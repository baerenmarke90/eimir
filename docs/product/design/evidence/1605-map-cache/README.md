# Fullscreen map and media-cache repair (#1605)

## Source and scope

Inspected on 2026-11-02 for PR #1606. Runtime baseline:
`ba485a1b5a0473c4e840213cedf11a405e12c4cb`, plus the fullscreen minimum-height
repair included with this evidence. [Source fingerprints](source-files.sha256)
identify the exact production files captured; verify them from the repository
root with `sha256sum -c docs/product/design/evidence/1605-map-cache/source-files.sha256`.
The final PR checks remain authoritative. No native-wrapper source changed.

This repairs the existing R2/R4/R5 composition and the generated
[journal/map reference](../../references/journal-map-polish/README.md), rather
than introducing a new screen or interaction. The map remains Pro; ordinary
media/read continuity remains Core. No entitlement or server quota changes.

## Inspected evidence

| View | Capture |
| --- | --- |
| Compact, 360 Light | [Fullscreen](planning-map-fullscreen-360-light.png) |
| Compact, 390 Dark | [Fullscreen](planning-map-fullscreen-390-dark.png), [selected source](memory-map-390-dark.png) |
| Compact, 430 Light, ordinary motion | [Fullscreen after actual sheet entry](planning-map-fullscreen-430-light.png) |
| Expanded, 1280 Dark | [Fullscreen](planning-map-fullscreen-1280-dark.png) |
| 320 Dark, 200% text, unavailable tiles | [Scrollable fullscreen with reachable map controls and dismissal](planning-map-fullscreen-320-dark-large.png) |
| Wir, 390, available thumbnails | [Light](today-r4-390-light.png), [Dark](today-r4-390-dark.png) |

The original repository demo photographs are used without introducing assets
of unknown provenance. Map tiles are a deterministic one-pixel fixture: the
green fill is test data, not a proposed map style. Real Leaflet layout, markers,
controls, attribution and requested tile zoom are exercised. This does not
assert availability or visual cartography of the external OSM service.

At 200% text, the named header and dismissal remain visible while the body
scrolls; the map has a minimum usable height instead of collapsing underneath
the tile-error explanation. No horizontal overflow is permitted.

## Behavioral acceptance

The five map journeys passed without application retries: 360/390/430/1280,
plus 320 with 200% text and failed tiles. They cover open, fullscreen, named
dismissal, Escape, browser Back, reopen, select a marker, open the canonical
Memory and return to the selected place. They require one live Leaflet
instance, initial overview tile zoom at most 12, a visible marker, scoped
thumbnail selection, no new thumbnail download after confirmed readiness,
horizontal reflow and the existing Axe checks. Sheet entry is observed through
its actual position, without a fixed sleep. Geometry/layout and preservation of
deliberate pan/zoom also have component regressions.

The four existing media-continuity journeys passed: thumbnail return at
390 Light and 1280 Dark, a ninety-second Diary detail visit, and an original
gallery image across Wir/Moments navigation with fresh parent authorization.
An additional real-Wir consumer check verified no repeated thumbnail bytes on
root return. The existing rich Wir composition journey passed in Light/Dark
with server-declared thumbnail availability and an assertion that all media
read requests select the thumbnail variant. Its fixture-only adaptation is
preserved as [a reproducible patch](wir-thumbnail-fixture.patch); it changes
no production component. Captures wait for the three strip photos to decode.

The final application runtime passed all 2,555 Web tests (two existing skips),
100 focused Wir tests, 11 Place/OpenAPI tests and nine Dashboard unit/contract
tests. Build, typecheck, formatting, lint, tokens, PWA and Capacitor foundation
checks passed locally. Hosted PostgreSQL, canonical generated-client and broad
browser results belong to the final PR revision, not an earlier success.

## Reproduction and diagnostic limits

Use the repository-pinned Playwright dependencies and its existing mock suites:

```sh
cd web/e2e
npx playwright test tests/memory-map-and-couple-games.spec.ts \
  --grep 'saved memory map|failed map tiles'
npx playwright test tests/media-url-continuity.spec.ts
```

For the Wir screenshot fixture, apply `wir-thumbnail-fixture.patch` with `git apply --unidiff-zero` in an
isolated checkout, then run `today-living-home.spec.ts` with
`--grep 'composes the full eligible hierarchy'`. The patch adds current server
thumbnail metadata, checks the selected variant and waits for real image
readiness; the original route, consumers, composition and assertions remain.

The ordinary Chrome launcher could not create its singleton socket in this
executor. The already installed Chromium 153 headless runtime works through
pipes with `--no-zygote --single-process`. Because that runtime closes on
context teardown, the final cases used isolated Playwright invocations rather
than reusing a browser across cases. A launch/context failure is not counted as
application acceptance. Hosted CI uses its normal pinned Chromium launcher.

An initial 430px diagnostic counted two HTTP starts before the first ready
map: one initial fetch was cancelled before its response body arrived. The
regression now measures repeated downloads from confirmed readiness, preserving
the return-continuity assertion. It does not keep abandoned transports alive,
add a delay/retry, or relax authorization. No hosted workflow was manually
retried; new runtime/test corrections receive fresh checks, and configured
concurrency cancels superseded runs.

The user's screenshot identifies renderer loss, but provides no crash/OOM log.
These changes remove concrete original-image, duplicate-map and cache-scanning
pressure paths. They do not establish a physical Pixel crash reproduction or
eliminate every Android/WebView/vendor failure. Native recovery remains
deliberate and never automatically replays a write.

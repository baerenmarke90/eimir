# Vector basemap for the saved-memory map and place picker

## Source and scope

Captured on 2026-11-12 from the `feat/vector-map` branch on top of `main`
(`origin/main` at branch creation). The change replaces the basemap
engine and tiles only: Leaflet with OpenStreetMap raster tiles becomes
MapLibre GL with OpenFreeMap vector tiles. The surrounding composition (Moments
header, Map tab, filter and fullscreen controls, photo markers, place list) is
unchanged and is shown here exactly as it exists on `main`. No entitlement,
screen template or copy changes apart from the map privacy notice, which now
names the actual tile provider.

The captures use the repository's API-mocked Playwright fixtures with real
OpenFreeMap tiles over the network, two demo locations in Berlin, and reduced
motion enabled for a stable image.

## Captures

| View | Capture |
| --- | --- |
| Compact, 390 px, Light | [Overview](map-overview-390-light.png) |
| Compact, 390 px, Dark | [Overview](map-overview-390-dark.png) |
| Expanded, 1280 px, Light | [Overview](map-overview-1280-light.png) |
| Expanded, 1280 px, Dark | [Overview](map-overview-1280-dark.png) |
| Compact, 390 px, basemap unreachable | [Error state with retry](map-unavailable-390-light.png) |

Dark mode inverts the map canvas with the existing `--map-dark-tile-filter`
token; markers, controls and attribution keep their authored colors.

## Behavioral acceptance

Open, fullscreen, named dismissal, marker selection, source navigation and
return, place filtering with an animated camera, pinch zoom on a touch
emulation, failed basemap with retry at 320 px and 200% text are covered by the
existing journeys, which now run against real WebGL in Chromium (see the PR
validation section). The zoom buttons, double tap and pinch are animated;
`prefers-reduced-motion` snaps the camera instead.

## Not verified here

No physical Android device or iOS Safari run. The native wrapper relies on its
WebView HTTP cache; the persistent service-worker tile cache applies to the
production Web/PWA only. No pre-implementation generated reference image
exists for this change.

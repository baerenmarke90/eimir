# #2078 Map motion on the contract (MapLibre domain)

Captured with Playwright Chromium on Windows against the mocked API and the e2e map tile mock, which serves its attribution through TileJSON since #2070 and draws the basemap as a flat colour. The images come from a temporary capture spec run on this branch. It used the `map-place-stacks.spec.ts` fixture, with the Places Bostalsee (two memories) and Trier (one). The permanent regression is the new `map-place-stacks.spec.ts` test "a kept map returns without a camera journey and rests" (no-preference and reduce, 390 px).

The composition of every map is unchanged. This step changes map motion only. The images show the settled result; the motion itself is measured below. A real device has not been tested; see "Open".

## Open → select a Place → close → leave → return

Per view:
- `2078-open-<view>.png`: Momente › Karte after opening;
- `2078-selected-<view>.png`: after selecting Bostalsee in the Place list;
- `2078-return-<view>.png`: after "Alle Orte ansehen", Wir, and back through Momente › Karte.

Views:
- Compact 360 px Light, 390 px Dark and 430 px Light;
- 390 px Light with reduced motion;
- Expanded 1280 px in Light and Dark.

## Measured in each view

| View | Camera moves on open | Selection journey | Camera moves on return | Same frame on return | Idle after open | Idle after return |
| --- | --- | --- | --- | --- | --- | --- |
| 360 Light | 0 | flies | 0 | yes | 0 frames, 0 animations | 0 frames, 0 animations |
| 390 Dark | 0 | flies | 0 | yes | 0 frames, 0 animations | 0 frames, 0 animations |
| 430 Light | 0 | flies | 0 | yes | 0 frames, 0 animations | 0 frames, 0 animations |
| 390 Light, reduced motion | 0 | jumps | 0 | yes | 0 frames, 0 animations | 0 frames, 0 animations |
| 1280 Light | 0 | flies | 0 | yes | 0 frames, 0 animations | 0 frames, 0 animations |
| 1280 Dark | 0 | flies | 0 | yes | 0 frames, 0 animations | 0 frames, 0 animations |

How each column is measured:
- **Camera moves:** changes of `data-map-moving` on the map, which is `true` only while a camera journey runs.
- **Selection journey:** a journey was seen after selecting Bostalsee ("flies"), or none ("jumps").
- **Same frame:** the map size and the markers' screen positions are identical before leaving and after returning.
- **Idle:** `requestAnimationFrame` calls in 3 s of rest (MapLibre schedules every map frame through it), counted by an init script, and running animations in `document.getAnimations()`. An idle map renders nothing.

## Checked elsewhere

- **Unit tests** (`PlaceMapCanvas.test.tsx`):
  - pan inertia off with reduced motion, following a runtime change;
  - the zoom buttons with `--duration-transition`, jumping with reduced motion;
  - a kept-tab hide and show, and a fold-width resize, without a camera move;
  - "show us" stopped by a press and snapped with reduced motion;
  - a locale change at the viewer's camera.
- **Connection** (`placeMapConnection.test.ts`): it resumes where it paused instead of replaying. `partner-distance-wir.spec.ts` asserts the glow on `eimir-motion-map-connection-travel`: three trips, then rest.
- **Zoom buttons and photo stack** (`map-place-stacks.spec.ts`): the keyboard zoom in the fullscreen map, and the stack settling with no running animation afterwards.

## Open

- **Pixel 10 Pro Fold acceptance:** opening, the return, a Place and "show us" flying in 1100 ms, a finger stopping a flight, reduced motion, light/dark and fold/unfold.
- **Returning to the selection:** the Karte segment opens `/story/map` without the selected Place (route behaviour in `StoryProductPage.tsx`). Returning through Momente › Karte while a Place is selected therefore clears the selection, and the camera flies to the overview. The journey above closes the selection first.

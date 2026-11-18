# Animated map connection between the partner avatars (#1907 H1)

## Generated visual reference (before implementation)

Composed on the real `/today/where-we-are` route of `main` `40eca3333`
(e2e harness with mocked API, reached from the Wir distance line; the
proposed connection is a DOM-only sketch drawn over the real MapLibre map,
nothing saved). The basemap uses the production OpenFreeMap tiles so that the
connection is reviewed against real map density; the viewer position is the
fixture position (Cologne) and the partner area is a fixture area.

Existing screen reviewed and kept unchanged: page header with the shell Back
control and `partnerLocation.mapTitle`, the map with the partner's approximate
area (circle plus avatar), the viewer's own avatar, the "show us" map tool
(`partnerLocation.mapShowUs`), zoom controls, attribution, and the sheet below
with the distance sentence, the two person rows and the settings link
(`partnerLocation.mapAdjust`).

The connection depends on the server distance band:

| Band | Proposed connection |
| --- | --- |
| `NEARBY` (< 2 km) | No line. The heart glyph already used by the Wir distance line sits above the two avatars and beats gently twice on open. |
| `RANGE` (2–50 km) | A solid soft arc from avatar to avatar, below the avatar markers. A small glow point travels along it and back. |
| `APPROXIMATE` (≥ 50 km) | A dotted, more strongly bowed arc. The glow point travels more slowly: the longer the way, the longer the journey. |
| Partner snapshot older than 2 h | The same arc muted (secondary text tone), no glow point, no motion. |

Images (`390` Light/Dark, `360` with 200 % root font size):

- `near-*.jpg`, `regional-*.jpg`, `far-*.jpg`, `earlier-*.jpg`
- `*-motion.jpg`: three frames of the motion for each band plus the
  reduced-motion result (static arc without the glow point; static heart).
- `*-animation.gif`: the motion at real speed (20 fps, 390 Light; far also
  Dark). Lines draw in from the viewer to the partner on open, then the glow
  point travels there and back once (the product plays three round trips,
  then rests). Near: the heart appears and beats twice.
- `one-way-390-light.jpg`: the viewer does not share; the page stays exactly
  as today, with no connection and no hint.

At 200 % text the existing map tools and avatars grow with the root font size
and crowd the map; that is the current behavior of the page and is not
changed by this slice.

## Product Owner approval

Approved on 2026-11-15 ("Passt, umsetzen") after the motion recordings,
including the draw-in on open, the glow point instead of a travelling heart and
three round trips, then rest.

## Implementation evidence

Captured from the implementation branch in the e2e harness (mocked API; the
`2x` images use the flat fixture basemap, the `30-*` recordings the production
basemap):

- `20-impl-far-390-light.jpg`, `21-impl-regional-390-light.jpg`,
  `22-impl-near-390-light.jpg`: the three tiers after the motion (reduced
  motion), with the text alternative `partnerLocation.mapConnectionLine` or
  `partnerLocation.mapConnectionNear`.
- `23-impl-earlier-390-dark.jpg`: an earlier snapshot, muted, no motion.
- `24-impl-far-360-light.jpg`, `25-impl-far-430-light.jpg`,
  `26-impl-far-390-dark.jpg`, `27-impl-far-390-light-large.jpg` (200 % text),
  `28-impl-far-1280-light.jpg`, `29-impl-far-1280-dark.jpg`: full page.
- `30-impl-near-animation.gif`, `30-impl-regional-animation.gif`,
  `30-impl-far-animation.gif`: the shipped CSS animation, sought frame by frame
  at 20 fps (draw-in and the first round trip).

## Follow-up: clearer motion (Product Owner, 2026-11-16)

The Product Owner did not perceive the motion on a device. Findings: the arc
drew in while the basemap was still loading, the 11 px glow was easy to miss
and hid under the avatars at both ends. Decision: make it clearer while keeping it
self-ending after three round trips (no permanent loop).

- The connection appears and starts only once the basemap has drawn
  (MapLibre `idle`, with a 2.5 s fallback for a slow or failing basemap).
- A 16 px glow with a soft halo and a two-point tail
  (`--duration-feedback` steps behind it).
- The glow turns 30 px before each avatar (per arc), so it stays visible.
- An earlier snapshot stays muted and still (privacy contract).

Evidence, recorded from the real app build at real speed:
`40-impl-clearer-far-animation.gif`, `40-impl-clearer-r25-animation.gif`.

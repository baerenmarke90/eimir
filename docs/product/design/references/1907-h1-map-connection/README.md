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
- `one-way-390-light.jpg`: the viewer does not share; the page stays exactly
  as today, with no connection and no hint.

At 200 % text the existing map tools and avatars grow with the root font size
and crowd the map; that is the current behavior of the page and is not
changed by this slice.

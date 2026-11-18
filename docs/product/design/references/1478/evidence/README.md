# #1478 runtime evidence

Product source: `6ff1151c197e8eaf7ffb30ffc039c8a50315f054` plus the reviewed
pin sizing and semantic link-color correction in this evidence commit
(`MomentPlaces.css` Git blob `e884141aeb0d9d87088842a7460c004b11e8d569`).
No attachment/media-rendering source changed. The browser fixture additionally
declares its synthetic photo unmarked for compatibility with parallel #1477.

## Actual browser journeys

The full `photo-places.spec.ts` run passed all **12 Chromium journeys** on an
isolated Vite port (4188), with two workers and reduced motion. This includes:

- direct visible address → map pinned to original coordinates → retained Memory;
- pending generic photo Place → server-confirmed name/address, with no upload;
- secondary correction → explicit save → original saved Memory;
- confirmed unlink preserving the canonical Place;
- 360/390/430/1280 px in Light and Dark, no horizontal overflow and no axe findings;
- 320 px with 200% body text and retained actions.

Screenshots are actual rendered app components and the existing licensed demo
photo, with fictional accounts/content and intercepted APIs. No private location
or photo was used. The map-navigation test intercepts the external destination;
it verifies navigation, not real Google Maps service availability. OSM attribution
is visible only for resolved source-tagged Places.

For full-page capture the Places section is scrolled into view and its heading
is deliberately focused; the visible keyboard focus outline is expected. The
floating navigation therefore appears at the current viewport position within
the full-page capture. The generated preflight image is separate from this proof.

## Rendered states

| State | Light | Dark |
| --- | --- | --- |
| 360 px saved Memory | [Light](1478-moment-360-light.webp) | [Dark](1478-moment-360-dark.webp) |
| 390 px saved Memory | [Light](1478-moment-390-light.webp) | [Dark](1478-moment-390-dark.webp) |
| 430 px saved Memory | [Light](1478-moment-430-light.webp) | [Dark](1478-moment-430-dark.webp) |
| 1280 px saved Memory | [Light](1478-moment-1280-light.webp) | [Dark](1478-moment-1280-dark.webp) |
| Secondary actions | [Light](1478-actions-light.webp) | [Dark](1478-actions-dark.webp) |

[320 px / 200% text](1478-large-text-320-dark.webp),
[Compact setting/disclosure](1478-settings-360-light.webp),
[Dark setting/disclosure](1478-settings-390-dark.webp),
[Expanded setting/disclosure](1478-settings-1280-dark.webp).

## Other verification and limits

- Backend unit suite: 970 passed initially; the sole failed pre-existing S3
  construction test passed when rerun without this host's SOCKS proxy environment.
  This verifies 971 unit cases across the full run and isolated environment repair.
  The 28 new adapter cases are included in that total.
- All seven touched backend source modules pass strict mypy and Ruff; runtime
  OpenAPI and the pinned generator match. Hosted CI also confirms Backend and
  API Clients on source `6ff1151`.
- All four hosted PostgreSQL integration shards and their aggregate gate pass on
  `6ff1151`, including the 13 new enrichment/repair/privacy/consent/concurrency
  cases; the backend source is unchanged by this evidence commit.
- Focused Place/client tests: 16 passed; Web typecheck, token/PWA checks, production
  build and lint pass (pre-existing warnings/info remain).

Current-head hosted checks remain required. This evidence does not certify live
provider accuracy/availability, a deployed worker, commercial service readiness,
physical-device acceptance, Android packaging or an application publication.

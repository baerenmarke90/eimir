# #1796 evidence: overlaid controls fade out and in smoothly

Each sheet shows three frames left to right: controls visible, controls stepped aside mid-gesture, controls returned after the rest.

- `carousel-compact-visible-aside-returned.webp`, `carousel-expanded-visible-aside-returned.webp`: memory photo carousel at 390 x 844 and 1280 x 900.
- `map-compact-visible-aside-returned.webp`, `map-expanded-visible-aside-returned.webp`: Karte tab at 390 x 844 and 1280 x 900.

## Measured opacity timeline

Measured in headless Chromium with the API-mocked specs of `memory-carousel-stability` and `memory-map-and-couple-games`, sampling the computed opacity of the overlaid controls every animation frame during a wheel swipe (carousel) or a pointer drag (map), with motion enabled (not reduced).

| Surface | Fade out (1 to 0) | Hold hidden | Fade in (0 to 1) | Largest opacity step per frame |
| --- | --- | --- | --- | --- |
| Carousel, Compact | 233 ms | 1436 ms | 398 ms | 0.21 |
| Carousel, Expanded | 232 ms | 1438 ms | 396 ms | 0.21 |
| Map, Compact | 233 ms | 1683 ms | 401 ms | 0.21 |
| Map, Expanded | 233 ms | 1717 ms | 400 ms | 0.21 |

The 1 to 0 and 0 to 1 spans are the visible part of the 280 ms exit and 480 ms return, which are eased at both ends. A step of about 0.21 per frame is the peak of the easing curve; there is no jump. Not covered: a recording on the Pixel and the Product Owner's judgement of the feel.

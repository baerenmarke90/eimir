# #509 Heart Moment context tags — Web evidence

The screenshots show the actual Web create and detail routes, not the generated product reference. They were captured by the hosted Chromium browser suite against the feature branch. [Product preflight](../../../../product/design/509-heart-moment-tags-preflight.md) defines the intended composition and domain boundary.

| View | Evidence |
| --- | --- |
| Compact create at 390, Light/Dark | `shell-heart-moment-create-reference-390-light.png`, `shell-heart-moment-create-reference-390-dark.png` |
| Selected context at 390 | `shell-heart-tags-selected-390.png` |
| Confirmed textless result at 390 | `shell-heart-tags-detail-390.png` |
| Narrow and larger text | `shell-heart-moment-create-reference-320.png`, `shell-heart-moment-create-reference-large-text.png` |
| Short viewport and Expanded | `shell-heart-moment-create-reference-small-height.png`, `shell-heart-moment-create-reference-expanded.png` |

All eight captures come from [Web Browser QA run 36587192760](https://github.com/baerenmarke90/eimir/actions/runs/36587192760) ([artifact](https://github.com/baerenmarke90/eimir/actions/runs/36587192760/artifacts/11042252596)), head `6e6c56ee686c5987c9570dfc2b71c07b5c2fa4ef`. The browser test verifies tag-only POST, canonical detail, the loaded comments state and no horizontal overflow. Unit and PostgreSQL tests cover rejection, idempotency, editing, privacy and transfer. The large-text capture shows an existing wrap in the longest feeling label; content and controls remain readable and reachable. Native device acceptance is outside this Web slice.

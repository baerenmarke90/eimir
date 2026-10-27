# Photo-place implementation evidence (#1459)

Web rendering source: [90cc051bf50d2de0100ee0c12d7e53cbb5486074](https://github.com/baerenmarke90/eimir/commit/90cc051bf50d2de0100ee0c12d7e53cbb5486074).
Backend lifecycle source: [fb55e858a7a7a3062c5c9e7550299e66dda8e408](https://github.com/baerenmarke90/eimir/commit/fb55e858a7a7a3062c5c9e7550299e66dda8e408). Its capture/deletion barriers and immediate metadata cleanup preserve these Web assets. The evidence commit adds documentation and provenance only. These are actual React/Vite browser renders, not generated concepts.

## Product journey and scope

The production Settings index opens Memories; the immediate switch loads the authoritative account value, confirms an OFF write and retains the future-only/history-preserving explanation. The saved shared Memory retains title, date, photograph, words, edit action, comments, provenance and current shell. Places remain secondary. Actions open the shared short-task sheet with canonical correction, explicit external Maps navigation and deliberate unlink confirmation. No Maps request occurs on view.

The canonical Place correction journey edits the name, saves, returns to the originating Memory and reads the corrected name. This caught and fixed a real stale-cache issue: moment Places now share the existing canonical Place invalidation root. The 320 px case checks Settings and moment reflow with 200% body text. Empty GPS remains absent; no invented map/address appears.

The photo-places.spec.ts suite has ten independent journeys: eight viewport/theme cases, one 320 px/large-text case and one correction/save/return case. Each viewport has its own test lifecycle; no shared matrix timeout or retries. Main matrix includes axe with no violations, no horizontal overflow, no unexpected API calls, no Google requests and exactly the intended preference/unlink writes. Unit tests separately cover offline non-replay, authoritative confirmation, conflict refresh and invalid map coordinates. PostgreSQL tests cover extraction/binding, private/shared, OFF→ON, retries, partner reads, manual precedence and sanitized media.

## Renders

| Surface | Compact Light | Compact Dark | Expanded |
| --- | --- | --- | --- |
| Personal setting | [390 px](1459-settings-390-light.png) | [390 px](1459-settings-390-dark.png) | [1280 Light](1459-settings-1280-light.png), [1280 Dark](1459-settings-1280-dark.png) |
| Saved shared moment | [390 px](1459-moment-390-light.png) | [390 px](1459-moment-390-dark.png) | [1280 Light](1459-moment-1280-light.png), [1280 Dark](1459-moment-1280-dark.png) |
| Contextual action task | [Light](1459-actions-light.png) | [Dark](1459-actions-dark.png) | Same bounded task, centered by ShortTaskSheet |
| Reflow / large text | — | [320 px, 200% body text](1459-large-text-320-dark.png) | — |

The same complete Settings and saved-Memory renders are also committed at 360 and 430 px in both themes. Full-page screenshots include below-fold content; a modal backdrop covers the actual viewport. No native platform behavior is changed by these Web additions.

## Environment and limits

Local Chromium 153, actual application routes, strict synthetic account/Space/API fixtures, Light/Dark system theme and reduced motion. Pinned hosted Playwright/browser and real PostgreSQL gates remain mandatory before merge. These results do not claim real-provider consent, physical Android acceptance, Google verification, active server credentials, final Product Owner acceptance or a live deployment. Device/provider acceptance stays in the running installation per the owner's instruction.

The initial automatic Place name is localized product resource content; it is editable canonical content, not a geographic inference. Google Maps receives the selected coordinate only after explicit link activation.

## Provenance

UI screenshots are eimir. project assets with no separate public license grant. Account/content fixtures are synthetic. The embedded cabin/lake photograph is the existing Darkmoon_Art/Pixabay 3374201 fixture under CC0 1.0 Universal, recorded in backend/demo_assets/manifest.json. The adjacent generated preflight and its original prompt remain separate design guidance.

# Product acceptance: upcoming Plans and capture polish (#1589 / #1591)

Implementation source: `df921ada6fd54ce0825f9593bc4c9bc1121acdfc`, based on main `cb3354f076cdb99855cba9c3b5f4f195a5a7df02` after #1588 merged.

These are actual pinned-Chromium screenshots from [Web Browser QA](https://github.com/baerenmarke90/eimir/actions/runs/41462630216), not generated references. This evidence branch adds no runtime changes and keeps the source revision fixed. The [generated integrated preflight](https://github.com/baerenmarke90/eimir/blob/4f740a8f621dbfce18968386fce3b625db5d940d/docs/product/design/references/1589-upcoming-plans/README.md) was recorded in the owning issue before implementation.

## Visual review

- Plans retain one primary next Plan, with subsequent authored title/date/photo/description previews before Wish selection. Text-only Plans reserve no empty photo column. Compact 360/390/430 and Expanded 1280 preserve the hierarchy in Light/Dark and reduced motion.
- The Memory map opens as a full-viewport native dialog with a reachable Close action. The original source selection survives closing, opening a Memory, and returning. Light/Dark and 320px/200% text are included.
- Pro uses the existing product claims and semantic theme tokens. Feature icons remain secondary to the lead Pro mark, and the text composition wraps at 320px/200% text; it introduces no price, subscription state, or purchase action.
- Plan and private HeartMoment drafts accept selected provider photos through the existing upload lifecycle, then show the saved canonical result. HeartMoment remains single-photo and its meaningful private/shared choice remains.

## Behavioral acceptance

The browser cases cover Open → interact → save/complete → observe result → return, including:
- Plan ordering, Wish conversion and restored originating segment;
- native fullscreen Escape, browser Back, focus restoration, selecting a marker after modal-history cleanup, Memory detail and return;
- Immich selection → draft → Plan/private HeartMoment save → result → originating section, including single-photo/20-photo limits and attachment-parent authorization;
- existing Diary/Google/Immich selection, order, processing, failure and draft ownership;
- complete Plan images, authorized thumbnail/original variants, sensitive concealment, edit cancellation and return;
- timed anticipation/agenda formatting and calendar-only dates; localized times include “Uhr”.

Accessibility, horizontal-overflow, reduced-motion, contrast and relevant large-text assertions remain enabled. Browser route fixtures emulate content and provider responses; screenshots establish the rendered UI, not live third-party service availability. Native-device/release acceptance is not claimed.

## Validation

All final-source technical checks passed. The 727 PR-critical browser cases passed on their first attempts, with no current-head retries. All 33 additional changed-spec cases also passed. Web: 2,500 passed (two existing skips); backend unit: 1,213 passed (24 existing skips); PostgreSQL integration: 3,159 passed. Locked lint/format/mypy/OpenAPI, audit, CodeQL, token/PWA/Capacitor, production build and the real API/worker Web flow passed. Web S8 runs the complete unit/component/source-contract suite, lint, formatting, token/PWA checks and production build. CI runs locked backend lint/format/mypy/OpenAPI, unit tests and all PostgreSQL integration shards, including historical-backfill, local-calendar-day and same-day bounded-selection regressions. Required checks must pass before merge.


## Reviewable captures

The WebP files are lossless exports of the native CI PNGs. Decoded RGBA pixels were compared byte-for-byte; [manifest.json](manifest.json) records the original PNG SHA-256, exported SHA-256, Git blob SHA, dimensions and original artifact path. No retouching, compositing, cropping or generated replacement was used. Full-page captures retain fixed navigation at the capture viewport; normal scrolling exposes the content behind it. Map tiles and provider responses are fixture data.

| Surface | Compact / Light and Dark | Expanded / large text |
| --- | --- | --- |
| Upcoming Plans | [390 Light](planning-overview-dense-390-light.webp), [360 Dark](planning-overview-360-dark.webp), [430 reduced motion](planning-overview-430-reduced-motion.webp) | [1280](planning-overview-1280-expanded.webp), [320 Dark / 200%](planning-overview-320-dark-large-text.webp) |
| Fullscreen map | [360 Light](planning-map-fullscreen-360-light.webp), [390 Dark](planning-map-fullscreen-390-dark.webp) | [1280 Dark](planning-map-fullscreen-1280-dark.webp), [320 Dark / 200% tile error](planning-map-fullscreen-320-dark-large.webp) |
| Pro information | [360 Light](planning-pro-360-light.webp), [390 Dark](planning-pro-390-dark.webp) | [1280 Dark](planning-pro-1280-dark.webp), [320 Dark / 200%](planning-pro-320-dark-large.webp) |
| Source to Plan | [Draft](planning-source-plan.webp), [saved canonical Plan](planning-source-plan-result.webp) | Two ordered photos; return to Planen asserted |
| Source to private HeartMoment | [Draft](planning-source-heart.webp), [saved private HeartMoment](planning-source-heart-result.webp) | Single-photo capacity, private visibility and return asserted |
| Timed anticipation | [390 Light](today-clarity-390-light.webp), [390 Dark](today-clarity-390-dark.webp) | Entered time includes localized “Uhr”; date-only values retain no fabricated time |

## Check provenance

- [Web S8](https://github.com/baerenmarke90/eimir/actions/runs/41462630102)
- [Backend and PostgreSQL CI](https://github.com/baerenmarke90/eimir/actions/runs/41462630138)
- [Browser QA: all four groups, changed specs and aggregate](https://github.com/baerenmarke90/eimir/actions/runs/41462630216)
- [Real Web/API/worker flow](https://github.com/baerenmarke90/eimir/actions/runs/41462630113)

Actions checked out PR merge tree `e6df811b51bae2b977dc2a519c81bfa12fa1cef7` with source head `df921ada6fd54ce0825f9593bc4c9bc1121acdfc` and main `cb3354f076cdb99855cba9c3b5f4f195a5a7df02`. No manual workflow/job reruns, empty commits, changed timeout/retry settings or weakened assertions were used. Earlier failed fixture/selector assumptions were fixed in source and checked on fresh revisions. An earlier revision's unchanged Wir design-order case needed its existing automatic retry after a `page.reload` load-event timeout; the final revision passed every browser case on its first attempt.

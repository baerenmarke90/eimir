# Bounded detail-gallery original loading

Owner: #1387. Runtime source: `d4ccf61fce045b40ec00abcc079fd455df083e8e`,
based on the updated media-cache PR head
`de750fc51e400cf90016dc41964f8a77b8a1d0ec`. Evidence additions do not change the
runtime source below. This is a shared React resource-lifetime correction under
Product Reference v1 R2, not a new composition or native capability.

## Observed journey

The production Memory detail renders six authorized synthetic image attachments.
Initially only positions 0, 1 and 5 request original bytes. Advancing the carousel
loads position 2; opening fullscreen and advancing loads position 3. Escape
returns to carousel position 1 without another binary request for positions 0,
1 or 2. The existing byte owner still reauthorizes before delivery.

The two new browser cases assert the exact set of binary requests and reject
unexpected API requests. They cover 390 px Dark with ordinary swipe motion and
1280 px Light with reduced motion. The screenshots show the preserved detail
surface after returning from fullscreen:

- [Compact, Dark](story-gallery-window-390-dark.png)
- [Expanded, Light](story-gallery-window-1280-light.png)

## Verification

- Four component regressions prove initial bounded loading, forward/backward
  wraparound, fullscreen navigation/return, cancellation, late URL disposal,
  empty/short galleries and video exclusion. Existing custom-preview tests
  continue to prove that a closed Photos viewer loads no originals.
- All eight gallery component tests pass.
- The full Web suite passes: 1,993 active tests, one existing skipped test.
- Lint, TypeScript/build, token/PWA checks and browser inventory pass.
- All 12 carousel and Photos Chromium scenarios pass. Existing scenarios also
  exercise 320 px, 200% text, touch dragging, keyboard/focus, geometry stability,
  looping, ordinary/reduced motion, Light/Dark, denied access, pagination and
  explicit offline/error states.
- Browser checks use Chromium 153 through a local executable-path override;
  the repository Playwright configuration is unchanged.

## Scope and limits

The existing `MediaGallery`, scroll-snap tracks, localized controls, modal and
Object URL owners supply the interaction and rendering. Only original-request
eligibility changes: the viewer index wins while open; otherwise a normal
carousel uses its current index and a custom thumbnail surface loads none.
The active position and adjacent item positions are retained, including
wraparound; videos never issue image requests. Moving outside the window
releases view URLs and cancels obsolete consumers. The shared authorized byte
cache controls reuse when returning.

No persistent media cache, offline writes, API/schema migration, new provider,
commercial boundary or wrapper capability is introduced. Physical-device
acceptance and production latency/memory measurements are not claimed.

# Free composer runtime evidence

Owner: [#1715](https://github.com/baerenmarke90/eimir/issues/1715).
The [approved composition and preserved-function contract](../../references/free-composer/README.md)
records the Product Owner decision. The generated reference there is separate
from these actual browser captures.

## Capture provenance

The screenshots use synthetic fixture content and the repository's bundled
demo photograph. No private account, couple content, external stock image or
production service was used. The local fixture application ran in Chromium
153.0.8010.0 through Playwright 1.62.1, with the actual Web components, styles,
native scrolling and browser input. This temporary Chromium is distinct from
the browser provisioned by hosted CI.

- Creation and R1/R3 captures: integrated source `67c2e89a9`, based on main
  `559c0f46bcc3757a44ce06c99a21e72091840ccd` and #1714 at `9220c7b22`.
  Those empty-composer surfaces are unchanged in the final source.
- Dense media crops and the secondary reading captures: final runtime source
  `b4ee3e0f8c60acf0bcf7ed239978fca355b09156`, including #1714 at
  `bcbf8f23e8811ef15ec1ca878f9f2af7d4cfb3bc`.
  The media images capture the gallery element while it is in view; the
  browser journeys also assert native slide alignment after reordering.

Before delivery, main at `ea84d611e21a29132d11865f0ca8da8383f27444`
(merged #1714) was integrated. That merge left the tested source tree unchanged.

The PR records the final delivery revision, completed checks and current
dependency/CI state. These captures are visual evidence, not a separate status
source or physical-device acceptance.

## Representative views

| Product contract | Actual captures |
| --- | --- |
| Memory: compact date, authored title/prose before media, real tag input | [390 Light](shell-memory-create-390-light.png), [Expanded Dark](shell-memory-create-expanded-dark.png) |
| HeartMoment: framed thought, compact feeling, media/voice and existing audience | [390 Light](shell-heart-moment-create-reference-390-light.png), [390 Dark](shell-heart-moment-create-reference-390-dark.png), [large text](shell-heart-moment-create-reference-large-text.png), [Expanded](shell-heart-moment-create-reference-expanded.png) |
| Memory reflow and reading result | [320 Light](r1-empty-320-light.png), [360 Light](r1-empty-360-light.png), [430 Dark](r1-empty-430-dark.png), [reduced motion](r1-reduced-motion-390-light.png), [confirmed result](r1-confirmed-result-390-light.png) |
| Plan: schedule, title and visible note before media and shared Lists | [320 Light](r3-create-plan-320-light.png), [390 Dark](r3-create-plan-390-dark.png), [Expanded](r3-create-plan-expanded.png), [200% text](r3-create-plan-200pct-expanded.png) |
| Wish: existing intention and tag composition | [390 Light](r3-create-wish-390-light.png) |
| Dense media: meaningful preview, stable sensitivity, explicit cover and ordered thumbnails | [390 Dark crop](shell-composer-media-390-dark.png), [1280 Light crop](shell-composer-media-1280-light.png) |
| Secondary surfaces and continuous reading | [shared List](collections-detail-390-dark-dense.png), [Chapter](story-chapter-390-dark-detail.png), [one-time audio message](once-voice-390-light.png) |

## Behavioral owners

Existing complete reference journeys cover open, author, save, read, edit and
return, including draft restoration, failed writes, deliberate retry, partial
association saves, source context, permissions, shared/private scope, native
media selection and voice. Theme, reduced motion, narrow reflow, large text,
keyboard focus and axe checks remain in their feature suites.

The two added `media-planning-corrections.spec.ts` journeys select two actual
files, choose an explicit cover independently of order, toggle sensitivity
without moving its target, open fullscreen, double-tap in/out, swipe, directly
sort with touch or mouse, use the existing accessible arrange task and save.
They verify the exact persisted order and explicit cover, intact prose, a
legible privacy label, settled native preview alignment and no axe violations.
Shared pinch/pan behavior remains covered by the existing complete mobile
media suite; no second gesture implementation was added.

The compact feeling component test reads the actual form data after collapse
and checks native form reset. Existing admission, cancellation, upload/error,
bounded object-URL and authorized playback owners remain authoritative.

These browser fixtures do not prove server deployment, physical-phone media
quality or #1714's native HDR acceptance. The independent dependency retains
its own validation and merge requirements.

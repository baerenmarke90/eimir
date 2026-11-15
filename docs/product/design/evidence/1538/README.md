# Wir interaction and utility clarity — #1538

Baseline: main `51fad502a8c89656365bbe8b327e0f54456fd6df`.
The owning issue contains the repository-aware visual preflight and Mobile
Interaction Contract, posted before UI implementation. The
[generated reference](generated-reference.webp) guides the composition.
Product Reference v1 R4/R5 and the existing domain/privacy contracts govern it.

## Result and interaction contracts

- Quote and statistics use the canonical Account/Space Dashboard order. Quote
  preferences and the device-local statistics opt-in/Pro grant remain their
  independent visibility authorities. A complete older catalog order accepts
  the new quote key beside the hero without resetting existing positions.
- The held sortable row follows the pointer, independently of sibling settling
  animations. Geometry is scoped to its own list. Keyed DOM movement restores
  pointer capture after layout; drop retains the preview until the authoritative
  order changes. Cancellation, keyboard arrows, auto-scroll, and reduced motion
  remain available through the shared primitive.
- Primary root swipes use direct finger travel and settle from the remaining
  incoming distance instead of restarting a small unrelated entry animation.
  Short deliberate flicks and aborted drags have explicit outcomes. Ordinary
  buttons and vertical-only scrollers do not form dead zones. Forms with focused
  text, dirty tasks, system edges, overlays, switches, sliders and horizontal
  media surfaces retain ownership. Detail routes retain their Back semantics.
- Warm uses an editorial full-width keepsake and open typography; Modern uses
  a compact horizontal couple masthead and panoramic image; Classic retains
  the generous centered portrait composition. A personal module order applies
  to all three, including sparse spaces.
- Notifications expose two groups and available channels. Existing mixed
  choices are described without writes on opening. Individual controls remain
  under disclosure. Group writes use the existing per-event endpoints, honor
  configurability and availability, preserve confirmed partial results, and
  stop if their authorized Query owner disappears. Quiet hours and important
  dates are disclosed separately, with confirmed quiet-hours state visible.
- Photo settings retain a concise off-switch consequence and disclose data
  flow/metadata details. The private hub has one privacy statement and three
  concise destinations. Profile puts personal content before passport/Pro
  utilities and discloses the partner area and Pro explanation.

## Visual evidence

All screenshots use synthetic identities/content and repository-approved demo
photography. They contain no user account data. Full-page captures include the
actual fixed navigation at the viewport boundary.

| Surface | Evidence |
| --- | --- |
| Warm, Compact | [360 Light](wir-warm-360-light.webp) |
| Modern, Compact | [360 Light](wir-modern-360-light.webp) |
| Classic, Compact | [360 Light](wir-classic-360-light.webp) |
| Modern, Expanded | [1280 Dark](wir-modern-1280-dark.webp) |
| Large text | [390 Dark, 200%](wir-modern-390-dark-large.webp) |
| Module order | [390 Light](settings-order-390-light.webp) |
| Notifications | [390 Light](notifications-390-light.webp), [1280 Dark](notifications-1280-dark.webp) |
| Profile | [390 Light](profile-390-light.webp), [1280 Dark](profile-1280-dark.webp) |
| Private hub | [390 Light](private-390-light.webp) |
| Photo-place disclosure | [390 Light](photo-settings-390-light.webp) |

## Validation and limits

- Web unit suite after the main implementation: 2,336 passed, two skipped,
  zero failed. Later affected-component checks cover the final disclosure,
  pointer-capture and swipe corrections, including 36 swipe ownership cases.
- Ten browser journeys: three designs with save/return/reload at 320, 360,
  390 Dark, 430, 1280 Dark and 200% text; quote/statistics pointer/keyboard
  reorder and reload; two Compact/Expanded utility journeys; an existing
  private-list pointer reorder with an active title draft. All passed.
- Five existing primary touch-navigation journeys passed, including restored
  Timeline scroll, Planning segment, bounded history and fresh-content reuse.
- Browser accessibility scans and reflow checks are part of those journeys.
  Production build, TypeScript, token/PWA checks, English engineering/document
  audits, browser inventory, backend syntax and AST catalog parity passed.
- Backend pytest/PostgreSQL integration tests could not run in this executor:
  pytest is absent and the installed uv does not match the repository's pinned
  version. The added legacy-order persistence regression and existing backend
  checks must pass in hosted CI before merge. Syntax/AST checks do not replace
  database integration tests.
- No physical-device frame-time measurement, TalkBack session, release or
  deployment is claimed. Browser gesture evidence is distinct from subjective
  Product Owner acceptance on the installed Android app. No wrapper/native
  capability is changed.

No new dependency/provider, media store, draft persistence or API shape is
introduced. Free/Core reliability, existing Pro grants, notification consent,
Cloud/Self-Hosted parity and non-destructive downgrade behavior remain intact.

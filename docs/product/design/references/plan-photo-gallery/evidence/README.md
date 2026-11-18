# Plan gallery acceptance evidence — #1514

These are actual production-route Playwright captures with synthetic image fixtures,
not generated design references. Colored corners expose cropping; portrait,
landscape and square source geometry is checked in the existing cover-fit journey.
No private couple media is included. WebP is a compact image encoding of the captures.

| State | Compact | Expanded / reflow |
| --- | --- | --- |
| Multi-file editor, all uploads READY | [360 Light](plan-gallery-editor-360-light.webp), [390 Dark](plan-gallery-editor-390-dark.webp), [430 Light](plan-gallery-editor-430-light.webp) | [1280 Dark](plan-gallery-editor-1280-dark.webp), [320 at 200%](plan-gallery-editor-320-light.webp) |
| Reading after full-screen Back | [390 Dark](plan-gallery-reading-390-dark.webp), [360 Light](plan-gallery-reading-360-light.webp) | [1280 Dark](plan-gallery-reading-1280-dark.webp) |
| Full-screen after navigation | [390 Dark](plan-gallery-viewer-390-dark.webp) | [1280 Dark](plan-gallery-viewer-1280-dark.webp), [320 at 200%](plan-gallery-viewer-320-light.webp) |

## Behavioral result

`web/e2e/tests/plan-cover-layout.spec.ts`: all six existing full-image cases pass.
Five new complete gallery journeys pass at 360/390/430/1280 and 320 px with 200%
text, Light/Dark and reduced motion. Each selects three files, fails one upload,
blocks Save, retries without creating a Plan, saves once, reloads the gallery,
performs real touch swiping on Compact, opens full-screen, navigates by keyboard,
uses browser Back to close only the viewer, stages mixed reorder/classification/
removal, discards with zero Plan writes, repeats/saves, and reloads the confirmed
ordered/classified result. Axe checks the mixed-upload editor; existing reading
cases also check axe, bounded uncropped images and no horizontal overflow.

`relationship-reflections.spec.ts`: both existing unified Plan editor journeys
(map selection, image, countdown and one atomic Save) pass with the gallery.
The existing Memory gallery/queue tests plus the new mixed-draft hook test pass
(22 tests). Typecheck, production bundle and token/PWA checks pass.

Backend: Ruff and mypy pass (311 source files); 1,039 unit tests passed in the
full local run, and the remaining storage-factory test passed after installing
an environment-only SOCKS proxy dependency (no project dependency change).
The 15 new input/archive-boundary cases pass. PostgreSQL-backed tests and actual
migration/metadata parity are deliberately delegated to the mandatory CI jobs,
since this workspace has no PostgreSQL. New integration cases cover partner
reorder/authorization, forbidden unowned media, duplicate binding rollback,
legacy cover removal retaining supplemental photos, stale versions, cleanup,
create receipt replay/order conflicts, transfer and uploader offboarding.

The native wrapper ships this same UI. Required Android CI and immutable-source
release gates remain mandatory; these browser captures do not claim installation
or manual acceptance on a physical phone.

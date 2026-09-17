# R4 — Wir / Today exact-build evidence

This directory records deterministic real-application Playwright rendering for R4. The fixtures use the existing Web application, Dashboard/Activity contracts, AppShell, authorized repository demo photographs, and localized product copy; they are not standalone mock HTML.

## Provenance

- Product-source commit: `793b2240181f3eb58e8df75aaaf1787b851f0f90`
- Integrated source baseline: `origin/main` at `3243c06322807dc63782b3f35726e89092375a25`
- Generated: 2026-09-17
- Browser: the repository-pinned Playwright Chromium runtime
- Normative client: Web / Mobile Web; Android is outside R4 scope
- Evidence-only commit: the commit adding this directory; it contains no product-source changes

## Reproduce

From the repository root, with the locked Web and browser-QA dependencies installed:

```bash
cd web/e2e
SCREENSHOT_EXPORT_DIR=../../docs/product/design/evidence/r4 npx playwright test tests/today-living-home.spec.ts tests/today-keepsake-precedence.spec.ts tests/shared-story-summary-visual.spec.ts
cd ../..
shasum -a 256 docs/product/design/evidence/r4/README.md docs/product/design/evidence/r4/*.png
```

The capture command completed with 34/34 passing browser scenarios from the exact product-source commit above. `SHA256SUMS` contains 25 entries: this README plus 24 PNG captures.

## Coverage map

| Contract / state | Evidence |
| --- | --- |
| 320 CSS px reflow | `today-r4-320-reflow.png`; `today-r4-signal-before-keepsake-320-reflow.png` |
| Compact 360 / 390 / 430 | `today-r4-360-light.png`; `today-r4-390-light.png`; `today-r4-390-dark.png`; `today-r4-430-light.png` |
| Light / Dark | Compact pair above; `today-r4-1440-light.png`; `today-r4-1440-dark.png` |
| Reduced motion | `today-r4-reduced-motion-390.png` |
| Empty / new relationship | `today-r4-empty-new-relationship-390-light.png` |
| Sparse single real item | `today-r4-keepsake-only-390-light.png`; `today-r4-retrospective-before-planning-390-dark.png` |
| Dense relationship home | `today-r4-390-light.png`; `today-r4-390-dark.png` |
| No eligible photo / text-first focal item | `today-r4-text-first-no-photo-390-light.png` |
| Current Plan/context state | `today-r4-390-light.png`; `today-r4-signal-before-keepsake-390-light.png` |
| Relationship signal present | `today-r4-390-light.png`; `today-r4-signal-before-keepsake-390-light.png` |
| Relationship signal absent | `today-r4-text-first-no-photo-390-light.png`; `today-r4-empty-new-relationship-390-light.png` |
| Real monthly imagery and two-image carousel | `today-r4-390-light.png`; `today-r4-monthly-carousel-two-390.png` |
| Small-height Compact | `today-r4-small-height-390x640.png` |
| 200% layout zoom | `today-r4-1280-zoom-200.png` |
| Expanded 1440 Light/Dark | `today-r4-1440-light.png`; `today-r4-1440-dark.png`; `today-r4-signal-before-keepsake-1440-expanded.png` |
| Expanded 1920 dead-space sanity | `today-r4-1920-light.png` |
| Quiet story closing reflection | `story-summary-390-3metrics-light.png`; `story-summary-390-3metrics-dark.png`; `story-summary-390-2metrics-light.png`; `story-summary-320-3metrics-light.png`; `story-summary-320-2metrics-light.png` |

## Behavioral evidence outside screenshots

The screenshots are supplemented by committed browser/component tests for canonical Memory and Plan destinations, F2 Today origin/return, Thinking-of-You pending/confirmed/error/cooldown behavior, local Activity failure with retained safe content and retry, OWNER_ONLY/private exclusion at the authoritative Dashboard boundary, duplicate suppression, keyboard order/focus, axe, #976 persistent Today navigation, and global Quick Create. Full validation results are recorded in [`r4-today.md`](../../r4-today.md).

Product Owner acceptance is not implied by this evidence.

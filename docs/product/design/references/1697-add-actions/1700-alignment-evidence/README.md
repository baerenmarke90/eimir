# Lists and Places action placement — PR #1700

## Exact source and custody

- Product source: `3092f971cf178b6e9c8f08bf2d211116f95b77cc`, tree `3abbcbe6c9e2ffecd4589c3402256006f6caa492`.
- Baseline main: `04d625cc68bc960c92b990fa6c3a75fe534f32d6`; tested PR merge: `52cbdc7664248799cf44a6dc76ca7808fbdd3a7d`.
- [Successful Browser QA 42497972028](https://github.com/baerenmarke90/eimir/actions/runs/42497972028).
- Original artifact: `web-product-visual-evidence-pr-2-52cbdc7664248799cf44a6dc76ca7808fbdd3a7d-attempt-1`, ID **13624441559**.
- Artifact ZIP SHA-256: `edc8ad8b7661e7af37971907a2134a33c42bbba5f487757b8f0b068b0bcb6b93`.
- [Manifest](manifest.json) preserves original artifact paths and individual SHA-256 hashes. All twelve PNGs are unchanged hosted screenshots, not mockups or reconstructions.
- Synthetic repository fixtures only. The Product Owner's private screenshots are not uploaded.
- This evidence-only branch preserves the validated product head unchanged.

## Visual acceptance

The add action aligns with the left edge of the title and sits below it in both
overviews. Places keeps its lifecycle scope below the action; Lists keeps its
content below the action. The established blue pill, plus and visible localized
label remain. Compact bottom navigation and Expanded top navigation remain in
their existing shell. At 200% text the label may wrap without horizontal
overflow. Detail headings retain their existing layout.

| State | Lists | Places |
| --- | --- | --- |
| 360 px Light | [Capture](planning-collections-overview-360-light.png) | [Capture](planning-places-overview-360-light.png) |
| 390 px Dark | [Capture](planning-collections-overview-390-dark.png) | [Capture](planning-places-overview-390-dark.png) |
| 430 px Light | [Capture](planning-collections-overview-430-light.png) | [Capture](planning-places-overview-430-light.png) |
| 1280 px Expanded Dark | [Capture](planning-collections-overview-1280-dark.png) | [Capture](planning-places-overview-1280-dark.png) |
| 390 px Light, 200% text | [Capture](planning-collections-overview-390-light-large.png) | [Capture](planning-places-overview-390-light-large.png) |
| 390 px Dark, dense fixture | [Capture](planning-collections-overview-390-dark-dense.png) | [Capture](planning-places-overview-390-dark-dense.png) |

Representative Compact, Expanded, Light/Dark, dense and large-text captures
were visually inspected. Places has the same overview data in the sparse/dense
fixture, so those two Dark PNGs intentionally have the same hash.

## Behavioral and engineering acceptance

- Final-source Browser QA: **208 passed** — 197 PR-critical cases across four
  isolated shards (50/49/49/49), plus 11 selected additional cases. The existing
  core-plus-impact plan selected 14 critical specs and one additional spec.
  No browser failure or manual retry on this source.
- The existing Places/Lists owner spec passed all six viewport/theme/text
  scenarios and both complete interaction journeys. It checks actual add-action
  geometry, native actionability, creation/result/return, edit failure recovery,
  ordering, delete focus, archive/restore, retained scope, overflow and axe.
- Every Places detail scenario explicitly hovers its linked moment before the
  unchanged axe assertion. This verifies the scoped readable-link token
  correction exposed by the overview's new pointer/navigation geometry.
- [Web S8 42497972179](https://github.com/baerenmarke90/eimir/actions/runs/42497972179):
  **2,771 passed**, two pre-existing skips; TypeScript, lint, format, generated
  token/legal/i18n/PWA checks, Capacitor foundation and production build passed.
- Local production build, strict changed-spec TypeScript, touched-file Biome,
  browser inventory and 52 focused existing component cases passed. Local
  Chromium installation/launch was attempted but unavailable; browser evidence
  above is hosted, exact-source evidence.
- Existing security, provenance, reuse and CodeQL checks passed. Final PR metadata
  acceptance is maintained in the PR; source checks are not replaced by this index.

The first source `5f259672ae2a5f01264036dafd26f227eeeb8353` exposed a real
pre-existing Dark detail-hover contrast mismatch (1.88:1) in
[Browser QA 42497397112](https://github.com/baerenmarke90/eimir/actions/runs/42497397112).
Inspect its retained failure artifact **13624187592** and job **128782755771**.
The correction uses the existing readable `--color-link-text` token only within
shared-content consumers. Tests explicitly cover hover; no assertion, case,
inventory, workflow, timeout, retry policy or protection was weakened.

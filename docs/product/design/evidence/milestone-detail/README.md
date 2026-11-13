# Milestone detail visual evidence

Baseline: `main` at `ee71994ee`, branch `feat/milestone-detail-composer`.

The Milestone detail page (`/story/milestones/:id`) now follows the Memory
detail pattern:

- shared composer-detail header with the back button, the short "Milestone"
  title and a written-out Edit action;
- hero with the star marker, date and relative time, and the milestone title;
- milestone text on a keepsake surface;
- the shared comment panel with the inline composer, as on Memory details;
- left-aligned provenance without a divider.

Captured from the Playwright timeline fixture with the milestone text set to
a sample chat message:

| File | Viewport | Theme |
| --- | --- | --- |
| `milestone-detail-390-light.png` | Compact 390 | Light |
| `milestone-detail-390-dark.png` | Compact 390 | Dark |
| `milestone-detail-1280-light.png` | Expanded 1280 | Light |
| `milestone-detail-1280-dark.png` | Expanded 1280 | Dark |

Not covered by this evidence: a native device or emulator, large-text reflow
and reduced motion (the keepsake surface has no animation).

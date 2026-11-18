# #1467 typed items and video import: reference and evidence

Baseline: `main@874fb8a5e` (2026-11-14). Destination reviewed: the diary composer
(`/story/memories/new`) and its shared photo source sheet, as they exist on that
baseline: device media intake, the sheet's source choices, the draft gallery with
its cover/sensitivity controls and the single Save. Nothing of that composition is
replaced; the only addition is what the sheet shows after Google returns.

## Mobile Interaction Contract

- **Focal point:** the person's own selection. Primary action: the one plain
  "Try again" (only while something failed); otherwise Close.
- **Hierarchy:** the sheet title, then one calm row per chosen item in Google's order.
  A row is icon (photo or video), number and one short result. No technical terms.
- **Compact first (360/390/430):** full-width rows inside the existing bottom sheet; the
  footer keeps Close and Try again side by side. **Expanded:** the same rows in the
  existing centered dialog.
- **States:** waiting, adding, added, a short reason for a transient failure (retryable) or
  a final reason (format, videos not allowed here, too long, too large). Loading is the
  row's own "Adding …"; Offline keeps the existing message; Success closes the sheet
  only when every item was added, otherwise the sheet stays so nothing is hidden.
- **Motion:** none added; no reduced-motion difference. Focus returns to the existing
  trigger through the shared sheet.
- **Privacy:** rows show only a number and a type, never provider names or URLs.
  Imported videos are authorized attachment references in `memory-only-v1`; no
  provider-derived bytes reach a durable device cache.
- **Reuse:** `ShortTaskSheet`, shared footer buttons, `EimirIcon` (`foto`, `video`),
  `--font-supporting-copy`, `--color-surface-subtle`, `--radius-medium`, spacing
  tokens. No new design-system component or token.

## Visual reference

No image-generation tool was available in this session. The composition reference is
therefore the real current UI: the existing sheet and draft screens on the baseline
(unchanged, visible behind the sheet in the captures below), with the new rows composed
from existing tokens. The captures are the implemented result of that composition; if a
pixel-level generated reference is still required by the Product Owner, it must be
created from these captures.

## Evidence (Playwright, mocked API)

Journey: `web/e2e/tests/media-planning-corrections.spec.ts`, "Google photos and videos
report one result per item". Photo, working video, video that fails once, unsupported format.

| State | Compact Light | Compact Dark | Expanded Light |
| --- | --- | --- | --- |
| Results with one failure | `google-typed-results-390-light.png` | `google-typed-results-390-dark.png` | `google-typed-results-1280-light.png` |
| After the single retry | `google-typed-retried-390-light.png` | `google-typed-retried-390-dark.png` | `google-typed-retried-1280-light.png` |
| Draft with photo and two videos | `google-typed-draft-390-light.png` | `google-typed-draft-390-dark.png` | `google-typed-draft-1280-light.png` |

All captures are synthetic fixtures. They are not live Google, real device or load evidence.

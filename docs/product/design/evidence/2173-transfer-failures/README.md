# Named Transfer failures (#2173, slice A)

Evidence for Settings › Data (the data and portability section) after the Product Owner
approved the wording and the mock-up on 2026-11-22. A failed Transfer export or
import now names its cause in the existing error callout; the technical code
never reaches the screen.

## Baseline

`main` at `1ebb920db`. Screen reviewed: More › Settings › Data (`TransferPanel`
and `TransferImportSection`). A failed export showed the same sentence twice
(status label and generic text) with the "24 hours" hint beside it, an expired
export showed the failure text, and `errorCode` was never read. The import
already had an error callout but one text for every cause. Scope choice, create,
download, import preview and recovery are unchanged.

## Screens

All screenshots come from `web/e2e/tests/transfer-import-storage.spec.ts` with
the API mocked, in German, captured with Playwright 1.62.1 Chromium on Windows
(`VISUAL_EVIDENCE_DIR`, one worker, only this spec).

| File | State |
| --- | --- |
| `2173-export-too-large-360-light.png`, `-390-light`, `-430-light` | Export too large (Compact) |
| `2173-export-too-large-390-dark-reduced.png` | The same in Dark with reduced motion |
| `2173-export-too-large-1280-light.png` | The same, Expanded (two columns) |
| `2173-export-failed-*`, `2173-export-generic-*`, `2173-export-expired-*` | Export failed, unknown or missing code (generic), and expired, with the same set of widths and themes |
| `2173-import-damaged-390-light.png`, `-390-dark-reduced` | Import, damaged or incomplete file (the shared text of the four file errors) |
| `2173-import-version-390-light.png`, `-390-dark-reduced` | Import, file from another version |
| `2173-import-expired-390-light.png`, `-390-dark-reduced` | Import, checked file expired |
| `2173-import-too-large-390-light.png` | Import, file refused as too large while it is chosen |

## Journeys

The spec checks open → interact → observe the named result:

- Opening Settings › Data and creating an export shows the named failure (or
  the expired text) and no status row, no "24 hours" hint and no technical code.
- A staged import in a failed or expired state shows its text on opening.
- Choosing a file the server refuses shows the text instead of the shared
  problem state.
- At 360, 390 and 430 px, at 320 px with 200 % text and at 1280 px nothing
  scrolls horizontally; axe reports no violations in Light and in Dark with
  reduced motion.

The callout appears like the other import states and has no motion of its own,
so reduced motion needs no variant.

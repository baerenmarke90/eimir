# Import without videos and recovering skipped videos (#2141 B2+N2)

Evidence for Settings › Data after the Product Owner approved the #2141 UI
preflight on 2026-11-21: the rendered mock-up and the Mobile Interaction
Contract, with open points P1–P7 decided as recommended. This PR implements
states 5–11 and 13. The storage section and the upload refusal (states 1–4
and 12) follow in Q5.

## Baseline

`main` at `d477e9c46`. Screen reviewed: More › Settings › Data
(`TransferPanel`) with its export and import columns. Export keeps its
function and gets plainer copy (P5). The import preview no longer shows a
table ("Umfang", "Quellpersonen", "Datensätze", "Medien"); it describes the
file in sentences. The server decides what fits and what needs Pro; the
client presents its live preview.

## Screens

All screenshots come from `web/e2e/tests/transfer-import-storage.spec.ts`
with the API mocked, in German.

| File | State |
| --- | --- |
| `2141-import-videos-need-pro-360-light.png`, `-390-light`, `-430-light` | Videos need Pro: import without videos, quiet Pro link (state 6) |
| `2141-import-videos-need-pro-390-dark-reduced.png` | The same in Dark with reduced motion |
| `2141-import-completed-430-light.png` | Result with skipped videos and the way to the moments (state 9) |
| `2141-import-no-room-390-light.png`, `-390-dark.png` | Not enough room: Pro or view photos and videos, no import action (state 7) |
| `2141-import-no-room-320-light-200-text.png` | The same at 320 px with 200 % text: reflows without horizontal scrolling |
| `2141-import-fits-without-videos-1280-light.png` | Fits only without videos, Expanded (state 8) |
| `2141-skipped-videos-pro-390-light.png` | Skipped videos leading the page, with Pro (state 10) |
| `2141-recover-preview-390-light.png` | The same file again: "6 Videos nachholen" (state 10) |
| `2141-skipped-dismiss-sheet-390-light.png` | Hiding the note asks once (state 11) |

## Journeys

The spec checks open → interact → complete → observe result → return:

- Import without videos sends `mode: WITHOUT_VIDEOS`, shows the result with the
  skipped count, follows "Zu euren Momenten" and returns with Back.
- No room offers Pro (`/more/pro?context=storage`) and the media overview, and
  applies nothing.
- Fits only without videos imports the rest.
- With Pro, the skipped videos are recovered from the same file
  (`mode: VIDEOS_ONLY`), and hiding the note asks first and then removes it.

axe (WCAG 2.1 AA) passes on the import area in Light and Dark. No horizontal
overflow occurs at 320, 360, 390 and 430 px.

## Limits

- The API is mocked; the server behavior is covered by the #2141 server PRs.
- The screenshots come from Chromium on Windows. The Android app ships the same
  UI through Capacitor, and no device run was made.
- Offline and failure states are covered by Vitest
  (`TransferImportSection.test.tsx`), not by screenshots.

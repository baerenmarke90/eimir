# Support reports: report a problem, send feedback, read the reply (#2189)

Visual evidence for the Web client of support reports: the quiet "Problem
melden" action in the error state, the "Hilfe & Feedback" row in More, the
report sheet, and the operator's reply as a notification. The design is
[`docs/product/support-reports-core-design.md`](../../../support-reports-core-design.md);
the rendered sketch is
[`references/support-reports/mockup.html`](../../references/support-reports/mockup.html).
The captures below are real renders of the running app, not the sketch.

## Baseline

Implementation revision `8ddd6402e` (branch `claude/laughing-thompson-4d209c`),
on top of `main` `28ebc7080`, the baseline the design reviewed. Screens
reviewed: the shared `ProblemState`, More, and the notification list.

## How the captures were produced

From `web/e2e`, after `npm ci` in `web` and `web/e2e` and with Playwright's
Chromium installed:

```bash
VISUAL_EVIDENCE_DIR="$(pwd)/../../docs/product/design/evidence/2189" \
  npx playwright test tests/support-report.spec.ts --workers=1 --trace off
```

The captures come from the last test of `web/e2e/tests/support-report.spec.ts`
(device scale factor 2, German, API mocked, Chromium on Windows). It only
writes images when `VISUAL_EVIDENCE_DIR` is set. The same test asserts no
horizontal overflow at 360/390/430/1280 px and runs axe (WCAG 2.1 AA) on the
open sheet in Light and Dark. The failing screen is the notification list,
whose read answers 500.

## Files

Names sort by state. `-light` and `-dark` are the same state in both themes,
Compact 390 px unless the name says otherwise.

| File | State |
| --- | --- |
| `01-error-state-390-{light,dark}.png` | Error state with "Erneut versuchen" and the quiet "Problem melden" |
| `02-more-row-390-{light,dark}.png` | More, "Hilfe & Feedback" row in "App und Konto" |
| `03-problem-sheet-390-{light,dark}.png` | Problem sheet, idle, with the failure line ("Fehler-Code") |
| `03-problem-sheet-360-light.png`, `-430-light.png` | The same at 360 and 430 px |
| `03-problem-sheet-390-light-reduced-motion.png` | The same with reduced motion emulated |
| `03-problem-sheet-1280-light.png` | Expanded: the sheet as a centered dialog, no Close icon |
| `04-feedback-sheet-empty-390-{light,dark}.png` | Feedback from More, empty: "Senden" disabled, hint, no failure line |
| `05-queued-offline-390-{light,dark}.png` | Offline: note kept, "Du bist offline", "Jetzt senden" |
| `06-success-390-{light,dark}.png` | Success: calm "Danke, angekommen.", no promise of an answer |
| `07-reply-notification-390-{light,dark}.png` | Reply in the notification list as plain text (the reply is `<b>hi</b> ...` and shows literally) |

## Journeys

`web/e2e/tests/support-report.spec.ts` covers open, interact, complete,
observe the result and return:

- `report_a_problem_from_error_state_and_receive_reply`: failing screen,
  sheet, send once with exactly the allowed fields and the failure shown
  there, success, Done returns to the same screen, no draft left, then the
  reply notification with plain text.
- `feedback_from_more_requires_text`: the row exists only when
  `supportReportsAvailable` is true; feedback is preselected, needs text and
  attaches no failure; offline keeps the note; it is delivered once after
  reconnect.

## Not captured

- Failed send ("Das hat nicht geklappt") and rate-limited states: covered by
  Vitest (`SupportReportSheet.test.tsx`), not by screenshots.
- Expanded for the other states, 360/430 px in Dark, and 200 % text: the sheet
  reflows without horizontal scrolling at 360/390/430/1280 px (asserted), but
  only the files above exist.
- The screenshots come from Chromium on Windows. The Android app ships the
  same UI through Capacitor; no device run was made.

## Findings from reviewing the captures

Not fixed here; they belong to the product code.

1. The failure line breaks mid-token at narrow and medium widths
   (`...notifications:50` / `0:E2E_...` at 390, `...:we` / `b` at 1280,
   `...:E2E` / `_UNAVAILABLE` at 430). A break at `:` or `/` reads better.
2. The two actions in the error state ("Erneut versuchen", "Problem melden")
   sit indented from the text's left edge and look alike; the report action
   is not clearly the quieter one.
3. When the offline message appears it is inserted above the choice, which
   moves the form down (compare `04-...` and `05-...`).
4. The success state mixes a left-aligned title with a centered check and
   centered body text.
5. The reply text and its timestamp (`23.11.2026, 10:30`) have the same
   weight and almost no spacing between them.
6. The note field shows the browser's native resize grip.

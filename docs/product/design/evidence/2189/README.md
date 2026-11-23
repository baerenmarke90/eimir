# Support reports: report a problem, send feedback, read the reply (#2189)

Visual evidence for the Web client of support reports: the quiet "Problem
melden" action in the error state, the "Hilfe & Feedback" row in More, the
report sheet, and the operator's reply as a notification. The design is
[`docs/product/support-reports-core-design.md`](../../../support-reports-core-design.md);
the rendered sketch is
[`references/support-reports/mockup.html`](../../references/support-reports/mockup.html).
The captures below are real renders of the running app, not the sketch.

## Baseline

Re-captured with the app code at `6a70c5157` (branch
`claude/laughing-thompson-4d209c`: the shell-level sheet host `e2e465cc1`
and the polish `6a70c5157`) and the spec at `c9598c633`, on top of `main`
`28ebc7080`, the baseline the design reviewed. The later host fix (the sheet
is imported statically by the host) changes no pixels. The first captures were taken on `8ddd6402e`. Screens
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
| `01-error-state-390-{light,dark}.png` | Error state with the shared secondary "Erneut versuchen" and the smaller tertiary "Problem melden" |
| `02-more-row-390-{light,dark}.png` | More, "Hilfe & Feedback" row in "App und Konto" |
| `03-problem-sheet-390-{light,dark}.png` | Problem sheet, idle: "Fehler-Code" label above the raw reference, filled note field without resize grip |
| `03-problem-sheet-360-light.png`, `-430-light.png` | The same at 360 and 430 px |
| `03-problem-sheet-390-light-reduced-motion.png` | The same with reduced motion emulated |
| `03-problem-sheet-1280-light.png` | Expanded: the sheet as a centered dialog, no Close icon |
| `04-feedback-sheet-empty-390-{light,dark}.png` | Feedback from More, empty: "Senden" disabled, hint, no failure line |
| `05-feedback-filled-390-{light,dark}.png` | Feedback with text, online, just before going offline (compare with the next row) |
| `05-queued-offline-390-{light,dark}.png` | Offline: note kept, "Du bist offline" below the note, "Jetzt senden"; choice and field keep their place in the sheet |
| `06-success-390-{light,dark}.png` | Success: one centered column (check, "Danke, angekommen.", body), no promise of an answer |
| `07-reply-notification-390-{light,dark}.png` | Reply in the notification list as plain text (the reply is `<b>hi</b> ...` and shows literally); the timestamp is smaller, muted and set apart |

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
- `sheet_survives_problem_state_replacement`: with the sheet open and a
  note typed, a reconnect refetches the failed list, which recovers and
  replaces the error state; the sheet stays open with the note and the
  failure it was opened with.

## Not captured

- Failed send ("Das hat nicht geklappt") and rate-limited states: covered by
  Vitest (`SupportReportSheet.test.tsx`), not by screenshots.
- Expanded for the other states, 360/430 px in Dark, and 200 % text: the sheet
  reflows without horizontal scrolling at 360/390/430/1280 px (asserted), but
  only the files above exist.
- The screenshots come from Chromium on Windows. The Android app ships the
  same UI through Capacitor; no device run was made.

## Findings from reviewing the captures

The six findings of the first captures (`8ddd6402e`) are addressed in
`e2e465cc1`/`6a70c5157` and visible in the files above: the failure
reference breaks anywhere under its own "Fehler-Code" label; "Problem
melden" is the smaller, lighter tertiary action; the offline message sits
below the note; success is one centered column; the reply's timestamp is
smaller, muted and set apart; the note field has no resize grip (and now
uses the shared filled field surface, so it stays visible when unfocused).

Remaining deviations from the mock-up:

1. The error-state actions stay left-aligned and indented by the shared
   secondary button's own padding (the design has no visible button border,
   `--border-surface-width: 0px`); every `ProblemState` shows the retry this
   way. The mock-up centers the whole state and both actions.
2. The Compact sheet grows from the bottom: when the offline message appears
   the sheet's top edge rises by the message height, carrying the title,
   choice and field with it. Inside the sheet nothing moves; only reserving
   the message space in the idle state would keep the edge still.
3. Action colour is the active design's plum/pink, not the mock-up's blue
   (anticipated by the design doc); the success title uses the sheet heading
   style instead of the mock-up's serif.
4. The raw failure reference is shown as sent; its wording is parked for the
   Product Owner.

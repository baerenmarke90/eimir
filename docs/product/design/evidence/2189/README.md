# Support reports: report a problem, send feedback, read the reply (#2189)

Visual evidence for the Web client of support reports: the quiet "Problem
melden" action in the error state, the "Hilfe & Feedback" row in More, the
report sheet, and the operator's reply as a notification. The design is
[`docs/product/support-reports-core-design.md`](../../../support-reports-core-design.md);
the rendered sketch is
[`references/support-reports/mockup.html`](../../references/support-reports/mockup.html).
The captures below are real renders of the running app, not the sketch.

## Baseline

The current captures were produced with the app code at `6a70c5157` (branch
`claude/laughing-thompson-4d209c`: the shell-level sheet host `e2e465cc1` and
the polish `6a70c5157`) and the spec at `c9598c633`, on top of `main`
`28ebc7080`, the baseline the design reviewed. The first captures were taken
on `8ddd6402e`. Screens reviewed: the shared `ProblemState`, More, and the
notification list.

Later commits and what they mean for the captures:

- `b7346f8bd` (the host imports the sheet statically instead of lazily)
  changes no pixels.
- `f210a8612` renamed the test fixtures to English. The captures
  `05-feedback-filled-390-*`, `05-queued-offline-390-*` and
  `07-reply-notification-390-*` still show the German fixture notes typed
  before that rename. The app UI is German in all captures; this is intended
  evidence, not a defect.
- The review follow-ups after `f210a8612` reworded two strings: the device
  line of the "what we send" list now names system, browser, app or web,
  theme and online status, and the offline message no longer promises
  automatic sending. The captures `03-*`, `04-*` and `05-queued-offline-*`
  show the earlier wording; layout and hierarchy are unchanged.
- The follow-up that shows a short error code instead of the API route
  (open point (a) of the design) changes the failure line: the label reads
  "Error code and affected feature" (German string
  `supportReport.items.failureLabel`) and the line below shows a short code
  such as `GET · 500 · E2E_UNAVAILABLE · web` instead of the route template.
  The captures `03-*`, `04-*` and `05-*` still show the earlier label
  (error code only) and, where a failure is attached, the raw reference line; they
  were deliberately not re-captured. The report still sends the full reference.

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
| `02-more-row-390-{light,dark}.png` | More, the help-and-feedback row in the app-and-account group |
| `03-problem-sheet-390-{light,dark}.png` | Problem sheet, idle: error-code label above the raw reference (now a short code, see Baseline), filled note field without resize grip |
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

- Failed send (the failed-send message) and rate-limited states: covered by
  Vitest (`SupportReportSheet.test.tsx`), not by screenshots.
- Expanded for the other states and 360/430 px in Dark: the sheet reflows
  without horizontal scrolling at 360/390/430/1280 px (asserted), but only
  the files above exist. 200 % text is covered in "Large text and reflow"
  below.
- The screenshots come from Chromium on Windows. The Android app ships the
  same UI through Capacitor; no device run was made.

## Findings from reviewing the captures

The six findings of the first captures (`8ddd6402e`) are addressed in
`e2e465cc1`/`6a70c5157` and visible in the files above: the failure
reference breaks anywhere under its own error-code label; "Problem
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
4. The sheet now shows a short error code (method, status or transport
   outcome, problem code, app or web) under the label "Error code and affected
   feature" (German UI) instead of the raw reference; the full reference is
   still sent (Product Owner decision, design open point (a)). The captures
   predate this change.

## Large text and reflow

Method, following `docs/ACCESSIBILITY-QA-MATRIX.md` (text scaling, sections
3 and 6) and the neighbouring specs: the root font size is set to 200 %
(`document.documentElement.style.fontSize = '200%'`), so every rem-based size
doubles, at Compact 360 px (and 390 px for the sheet and success). At every
state the browser test `large_text_keeps_the_support_sheet_usable` in
`web/e2e/tests/support-report.spec.ts` asserts: no horizontal scrolling and
no visible element past the viewport edge; the sheet's action (Send, Retry,
Send now, Done) scrolls fully into view above the fixed footer edge and is at
least 44 × 44 CSS px; the sheet body scrolls; the dialog keeps its accessible
name and the focus lands on the note (or on Done after sending); the error
state action, the More row and both "mark as read" actions stay at least
44 px tall. It also asserts that the two report kinds still sit next to each other
at 100 % text. A one-off exploration additionally checked 320 px at 100 %
text (WCAG 1.4.10) for the same states: no horizontal scrolling, nothing
clipped, every target at least 44 px.

Captured with app code `c4d86fe7f` (Chromium on Windows, device scale factor
2, Light, German) by running only that test:

```bash
VISUAL_EVIDENCE_DIR="$(pwd)/../../docs/product/design/evidence/2189" \
  npx playwright test tests/support-report.spec.ts -g large_text --workers=1 --trace off
```

| File | State at 200 % text |
| --- | --- |
| `08-large-text-error-state-360-light.png` | Error state: retry and the quiet "Problem melden" wrap, centered |
| `09-large-text-problem-sheet-360-light.png`, `-390-light.png` | Problem sheet, idle: the kinds stacked, "Senden" in the footer |
| `10-large-text-failed-360-light.png` | Failed send: the message below the note, "Erneut versuchen" wraps inside the button |
| `10-large-text-rate-limited-360-light.png` | Rate limited: the message below the note |
| `11-large-text-success-360-light.png`, `-390-light.png` | Success: the centered column scrolls above "Fertig" |
| `12-large-text-reply-360-light.png` | Notification list with the reply: the "mark all as read" action wraps below the count |
| `12-large-text-reply-end-360-light.png` | The end of a 500-character reply, its timestamp and the "mark as read" action |
| `13-large-text-more-row-360-light.png` | More, the help-and-feedback row |
| `14-large-text-feedback-long-360-light.png` | Feedback with a long note: the field scrolls inside its maximum height |
| `14-large-text-queued-offline-360-light.png` | Offline: the message below the note, "Jetzt senden" |

Defects found and fixed in `c4d86fe7f`:

1. The two report kinds stayed next to each other and broke words mid-word
   ("funkti-oniert", "Feedb-ack"). They now use the shared
   `repeat(auto-fit, minmax(min(100%, 8rem), 1fr))` reflow pattern and stack
   when larger text would break a word.
2. The notification list scrolled horizontally by up to 240 px at 360 px when
   a notification was unread (the reply's state): the "mark all as read"
   action and the card's "mark as read" action did not shrink. The bar
   now wraps and both actions wrap their labels on their own line. This is a
   defect of the shared notification list, not only of the reply.

Both fixes change nothing at 100 % text (asserted for the kinds; the bar and
the card fit on one line as before), so the earlier captures `01-*` to `07-*`
stay current for what these fixes touch.

Observed but not changed (shared surfaces outside this feature): the bottom
navigation breaks "Momente" as "Mo-ment e", the page heading hyphenates
"Benach-richtigun-gen", and other More rows break "Einstellungen" and
"Aktivitäten" mid-word. The stacked kinds keep the pill shape of the
segmented control, which rounds strongly at two rows.

Not covered: real Android font and display size scaling (no device run; the
root font size only approximates it), browser zoom at 200 % (which changes the
CSS viewport instead and is covered by the 360/390 px checks), Dark at 200 %,
and Expanded at 200 %.

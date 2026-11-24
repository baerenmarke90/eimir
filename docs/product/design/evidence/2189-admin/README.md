# Support reports: the operator's Reports section (#2189, operator plugin)

Visual and behavioural evidence for the **Reports** section of the ServerAdmin
area: the triage list, a report with its note, the state switcher, the one-time
reply, the ticket dialog and the uncertain ticket state. The design is
[`docs/superpowers/specs/2026-11-24-support-reports-admin-plugin-design.md`](../../../../superpowers/specs/2026-11-24-support-reports-admin-plugin-design.md)
(sections 5.5, 5.6); the operator contract is
[ServerAdmin, Support reports](../../../../SERVER-ADMIN.md#support-reports). The
captures are real renders of the running Web app with the plugin routes mocked,
not a sketch. The UI in the captures is German; this README quotes the
English strings of the same keys.

This is an administration surface (operator only). AGENTS.md allows a denser
information design here; it never reaches couple-facing screens.

## Baseline review

- Baseline `main`: `80ee59450` (PR A #2254 and PR B #2257 merged).
- Reviewed screen: `/server-admin` (`ServerAdminPage`): top bar with back link,
  brand and sign-out; heading row with Refresh; the section navigation (a
  sticky side list on wide screens, a horizontal scroller below 64rem); the
  panels Overview, Accounts, Spaces, Jobs, Storage, Security, Settings and
  Activity; the shared `UiState` / `ProblemState`, the step-up dialog
  `ServerAdminRecentAuthModal`, `window.confirm` confirmations, the
  `server-admin-*` panel, badge, count and metric classes, and the privacy
  footer. Existing functions stay unchanged; Reports is one more navigation
  entry, shown only while `supportReportsOperatorAvailable` is true, and the
  overview warning `support_reports_unread` links into it.
- App code of the captures: `fb9ebbacf`; spec
  `web/e2e/tests/server-admin-support-reports.spec.ts` at `0fab04ce5`, which
  switched the fixtures to English and retook the captures (the note and reply
  shown are English while the UI is German). The later `bd0e770e4` adds the
  draft guard for row and section switches and the deleted-report handling;
  it changes no pixel of these states, and the spec still passes on it.

## Mobile Interaction Contract

From the Task 8 design note, composed from Compact (360 to 430 px) outward.

- **Goal:** the operator works through new reports, answers once, or hands a
  technical ticket to the tracker, without exposing the person's text.
- **Focal point:** the report queue; in an open report, the person's note.
- **Primary action:** in the list, opening a report (the whole row is the
  target, no separate "Open" button). In the detail, "Send reply once"
  is the only filled button of the reply form and "Create ticket" is filled
  only when a tracker is configured. State switching is secondary (outlined
  segments, pressed state by bold text and a bottom bar, not colour alone).
- **Compact:** one column; filter segments wrap; rows full width with 44 px
  targets; an open report replaces the list with a back control on top; the
  ticket dialog is a bottom-anchored sheet (the step-up dialog's styles) and its
  buttons stack full width below 40rem; technical facts one per row below
  40rem.
- **Expanded:** from 80rem the list stays beside the open report (2fr/3fr); the
  selected row is marked by `aria-current`, a border and an inset bar.
- **States:** Loading (`UiState`, polite), Empty per filter with "Show all
  reports", Error with retry, Offline (list `UiState`; in the detail a notice and
  all writes disabled), Success as inline `role=status` messages per section,
  errors as `role=alert` next to the affected section.
- **Motion:** success messages use the motion layer's disclosure with token
  durations and 0 ms under reduced motion; query results mount without motion;
  no new keyframes.
- **Privacy:** note and reply render as text nodes only, never in the list; the
  detail says the note stays out of tickets, logs and analytics; the ticket
  dialog says the operator writes the text; the reporter shows as an opaque
  account id only. The page footer now names Reports as the one place where
  the operator reads notes people sent.

## Open, interact, complete, observe, return

Covered by `web/e2e/tests/server-admin-support-reports.spec.ts` (Chromium,
German, API mocked with the live contract):

- `operator_triages_a_report_replies_once_and_creates_a_ticket` (390 px):
  open Reports from the ServerAdmin navigation; the queue starts at "New" with
  the count and never shows the note; open the report (heading focused, list
  replaced); change the state, which first answers
  `RECENT_AUTHENTICATION_REQUIRED`, so the step-up dialog asks for the password
  and the same write is retried once (two identical PUTs, one step-up); send the
  one reply (counter, read-only afterwards, form gone); create a ticket: title
  prefilled, server footer shown read-only, the request carries exactly the
  typed title and body and neither the note nor the reply; observe the focused
  tracker link with `target=_blank` and `rel="noopener noreferrer"`; return to
  the list: the report left the "New" filter, so focus lands on the section
  heading; "All" shows the row with "Replied" and "Ticket".
- `uncertain_pending_ticket_is_cleared_only_after_confirmation`: a `PENDING`
  ticket older than five minutes shows "Uncertain whether the ticket was created";
  dismissing the duplicate warning sends nothing; confirming sends one DELETE
  and offers "Create ticket" again.
- `reports section reflows in Compact and Expanded, Light, Dark and reduced
  motion with axe`: axe (WCAG 2.1 AA) on the section in Light and Dark for the
  list, the detail, Expanded and the uncertain state, and on the ticket dialog;
  no horizontal page overflow and no element past the viewport at 360, 390 and
  430 px; Expanded places the report right of the list.
- `large_text_keeps_the_reports_section_usable`: see below.

All four tests pass locally (also with `--repeat-each=2`).

## Files

Device scale factor 2. `-light` and `-dark` are the same state in both themes.

| File | State |
| --- | --- |
| `01-list-390-{light,dark}.png` | Compact list: count pill, filter segments ("New" pressed), one row without note text, privacy footer |
| `01-list-360-light.png`, `01-list-430-light.png` | The same at 360 and 430 px |
| `02-detail-390-{light,dark}.png` | Compact report: back control, heading, state badge, the note with the privacy sentence |
| `02-detail-360-light.png` | The same at 360 px |
| `02-detail-390-light-reduced-motion.png` | The same with reduced motion emulated |
| `03-ticket-dialog-390-{light,dark}.png` | Ticket dialog as a bottom sheet: intro, prefilled title, empty body, read-only server footer, full-width submit |
| `04-expanded-1440-{light,dark}.png` | Expanded: the list with the selected row beside the open report |
| `05-uncertain-1440-{light,dark}.png` | Expanded: an uncertain `PENDING` ticket with "Remove ticket link" |
| `05-uncertain-390-{light,dark}.png` | The same on Compact |
| `06-large-text-list-390-light.png` | 200 % text: the list |
| `07-large-text-detail-390-light.png`, `-360-light.png` | 200 % text: the reply form with "Send reply once" wrapping inside the button |
| `08-large-text-ticket-dialog-360-light.png` | 200 % text: the ticket dialog scrolled to its submit button |

Reproduce from `web/e2e` (after `npm ci` in `web` and `web/e2e`, Chromium
installed):

```bash
VISUAL_EVIDENCE_DIR="$(pwd)/../../docs/product/design/evidence/2189-admin" \
  npx playwright test tests/server-admin-support-reports.spec.ts --workers=1 --trace off
```

## Large text and reflow

Method as in [`../2189/README.md`](../2189/README.md): the root font size at
200 %, Compact 390 and 360 px. The test asserts no horizontal scrolling and no
visible element past the viewport edge (links inside the horizontally scrolling
section navigation excepted, the scroller itself included), list rows at least
44 px tall, the reply button fully in view and at least 44 px tall, and the
ticket dialog's submit button reachable.

Defects found by these checks and fixed with this evidence (`e453c0054`, count pill `fb9ebbacf`):

1. The visually hidden filter legend took the full width
   (`legend { width: 100% }` beat `.sr-only`), so the page scrolled
   horizontally by 35 px at 360 px even at 100 % text.
2. The Compact workspace track was `1fr`, so the scrolling section navigation
   could widen the page; it is now `minmax(0, 1fr)`.
3. At 200 % text the page heading, intro, privacy footer, report detail and
   technical facts overflowed on long German compounds (`Serververwaltung`,
   `Bearbeitungsstand`, `Betriebssystem`). They now hyphenate or break, and the
   facts stack one per row below 40rem.
4. The "New: N" count stretched to a full-width bar on Compact; it stays a pill.

## Not captured or verified here

- Dark at 200 % text, 430 px Dark, and Expanded at other widths: asserted only
  where listed above.
- Loading, empty, error and offline states: covered by Vitest
  (`ServerAdminSupportReportsPanel.test.tsx`, `ServerAdminSupportReportDetail.test.tsx`),
  not captured.
- Real Android font scaling and the Capacitor WebView (`target=_blank` tracker
  links): no device run. The captures come from Chromium on Windows.
- The live plugin routes (recent-authentication grant, 409/502 bodies) are
  mocked here; the backend tests cover them.

## Observations not changed

- On Expanded, a long report leaves the list column empty below the single
  row; the list does not stick while the report scrolls.
- The section navigation shows "Spa…" cut at the Compact edge; it is a
  horizontal scroller by design (existing ServerAdmin behaviour).

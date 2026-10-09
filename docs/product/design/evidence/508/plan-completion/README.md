# Plan completion pending feedback — actual Web evidence

Owning issue: #508, eighth bounded interaction slice. The
[generated whole-screen reference and Mobile Interaction Contract](../../../references/508/plan-completion-preflight.md)
([generation record](../../../references/508/plan-completion-generation.md)) were
committed and linked to #508 before runtime implementation.
Baseline: `main@4aa0806523a55dfafbee94d4479c6ffe06825303`.

Completion has no reopen operation and the server decides the shared
achievement, so this slice never shows a completed Plan before the response. It
adds one polite pending status, a synchronous single-request guard, locked
competing writes and scoped recovery.

The captures are unretouched full-page Chromium screenshots of the canonical Web
app with authorized synthetic API fixtures (the completion response is held by
the test). German product copy comes from the existing i18n resources. Fixed
navigation stays attached to the viewport in full-page captures; this is not a
proposed placement in document flow.

## Screens and journey

| Capture | State |
| --- | --- |
| [390 px Light](plan-completion-pending-390-light.png) | Completion held: the status "Abschluss für den 11.09.2026 wird gespeichert …" sits in the summary, the Plan still reads "Noch ohne Termin", competing actions and the entered day are locked. |
| [390 px Dark](plan-completion-pending-390-dark.png) | Same state, Dark. |
| [320 px Dark, 200 % text, reduced motion](plan-completion-pending-320-dark-200pct.png) | Status and locked form wrap in normal flow without horizontal overflow. |
| [1280 px Light](plan-completion-pending-1280-light.png) | Expanded keeps the bounded detail and the same status. |
| [Confirmed 390 px Light](plan-completion-confirmed-390-light.png) | Server response applied: pending status gone, confirmed Plan result visible. |
| [Confirmed 320 px Dark, 200 % text](plan-completion-confirmed-320-dark-200pct.png) | Confirmed state at the narrowest reflow case. |
| [Confirmed 1280 px Light](plan-completion-confirmed-1280-light.png) | Confirmed state in Expanded. |
| [Failure](plan-completion-failure-390-light.png) | 500 after the hold: status removed, entered day kept, existing inline error, action enabled and focused. |
| [Conflict recovered](plan-completion-conflict-recovered-390-light.png) | 409 because another member completed it: fresh read shows the confirmed result, no celebration, no replayed write. |

The four pending viewport cases run Open Plan → open actions → choose day →
two activations in one task (held `POST`) → one request, one `role=status`, the
submitted day in the status, locked controls (day read-only, reschedule,
unschedule, Edit, schedule fields, action `aria-disabled` and still focused),
no completed title, achievement or continuation → release → server-confirmed
achievement and Memory/Milestone/Later continuation, status gone. They check no
horizontal overflow, Axe WCAG 2.2 A/AA (390 Light and Dark pending) and, for
the 320 px case, reduced motion (`animation-name: none`).

Additional browser cases cover failure followed by a deliberate retry (exactly
two requests; the retry celebrates once), a 409 conflict that refetches the Plan
(one completion request only) and keyboard activation (`Enter`, `Enter`,
`Space` → one request; focus stays on the action while pending and moves to the
confirmed heading). The existing continuation, "Später", Memory capture,
disabled-achievement and visual cases remain in the same spec (19 cases).

## Initial component and build verification

Nine production-component cases in `PlanCompletionFeedback.test.tsx` cover:
synchronous duplicate suppression and the exact request (`If-Match`, day), the
pending status and locked controls, nothing claimed before the response,
authoritative confirmation with and without the achievement header, background
reads, failure with retained day and deliberate retry, conflict recovery from a
fresh read without replay, pending state across a remount, a late response for
an unmounted page, and Space isolation (pending state does not cross into
another Space and a late response does not recreate the cleared Space's cache).

The full Web suite (195 files, 1374 tests, one existing skip), `tsc -b`, format,
changed-file lint (no diagnostics; existing repository warnings unchanged) and
`npm run build` pass.

The PR-critical browser group ran 235 cases: 228 passed and 7 timed out or
failed under four parallel workers; all seven passed when rerun serially. The
retained full-regression `product-reflow` cases and the 390 px Light axe
contrast case of the existing continuation visuals fail identically on
unmodified `origin/main`, so they are not caused by this slice.

## October 9 review follow-up

The focused production-component suite now passes 13 cases. Four added
regressions hold the conflict-recovery read open, dispatch completion and
scheduling in the same task in both orders, and replace the initiating query
after a cache clear without changing Space. A failed completion removes the
saving status immediately, but further writes remain locked until its recovery
read settles. The next explicit completion uses the refreshed version. The
synchronous mutation-cache guard prevents competing writes before React
rerenders; a response for a replaced query cannot claim a celebration.

The full Web run passed 1,375 cases, with one existing skip and three 5-second
timeouts under concurrent validation. All 41 cases in those three unchanged
test files passed on an isolated serial rerun. Typecheck, changed-file lint,
format, production build and the engineering/documentation language audits
pass. The language-audit regression proves that only exact localized product
quotes in these three evidence/reference records are allowed; surrounding
engineering prose and the same quote in another document remain audited.

Dependency audit failures already present on the base are repaired separately
in PR #1298; the existing audit policies are retained.

All 19 browser cases passed again, including the held request, deliberate retry,
conflict, keyboard/focus, Light/Dark, Expanded, reduced motion and 320 px/200 %
text cases. The nine completion captures above were refreshed from that run.
Local QA used Chromium 153 because the pinned Playwright Chromium download
returned an empty archive. An external temporary config allowed 120 seconds
per case on this slower environment; repository timeouts and assertions were
unchanged. Hosted QA remains responsible for the pinned browser and normal
repository limits.

## Fix found while capturing evidence

At 320 px with 200 % text the existing Plan detail overflowed horizontally
(shared-visibility note and the lifecycle form, 395 px document width), also
without this feature. The grid tracks now shrink to their card (`min-width: 0`,
`minmax(0, 1fr)`, wrapping of the shared note), so the reflow acceptance
criterion holds for the completion journey.

## Scope and limits

Plan lifecycle stays Free/Core, identical on Cloud and Self-Hosted. No API,
schema, dependency, provider, entitlement, quota, telemetry, durable draft,
offline queue or native wrapper change. Late responses only reconcile the
initiating Account/Space/Plan query; they never recreate a cleared cache and
never show status or celebration elsewhere. #508 remains open.

# Perspective-game handoff test synchronization

Owning issue: [#1328](https://github.com/baerenmarke90/eimir/issues/1328).
Baseline main: `46872a4cee53f96c3a95f453506d664477456ae5`.
[Implementation preflight](https://github.com/baerenmarke90/eimir/issues/1328#issuecomment-6231717124).
The [manifest](verification.json) binds the tested sources, production bundle and
captures by SHA-256. The containing Git tree identifies the final test sources.

## Diagnosis

The historical StrictMode failure asserted that `choosePrompt` disappeared
immediately after `fireEvent.click`. The local store changes synchronously, but
the first committed answer buttons can precede React's passive
`useSyncExternalStore` subscription. A DOM query finding the buttons does not
establish that this subscription has already run.

A diagnostic used the real Games consumer, Query participant loader and local
session factory. A MutationObserver dispatched the same first-answer
`fireEvent.click` at the initial answer-button commit. Factory instrumentation
recorded disposal, subscription count and the actual post-dispatch snapshot:

| Rendering | Replay session | Live session immediately after the click | Immediate DOM |
| --- | --- | --- | --- |
| Normal | None | Not disposed; zero subscribers; `handoff` | Question prompt still present |
| StrictMode | First session disposed, zero subscribers | Replacement not disposed; zero subscribers; `handoff` | Question prompt still present |

With the historical immediate-DOM assumption imposed at that boundary, both
diagnostic cases failed; the four existing controls passed. With an awaited
accessible handoff confirmation, both cases passed without another answer input.
The dispatch reaches the active session, and React's existing subscription
reconciles the changed snapshot. This establishes the subscription-boundary
mechanism, not the exact scheduler interleaving of the two historical full-suite
failures. Earlier passing instrumented runs alone did not establish this result.

The correction awaits `findByRole` for the explicit handoff button before retaining
the question-absence and handoff assertions. It changes no timeout, retry, skip or
production source. The retained normal/StrictMode MutationObserver regressions
exercise earliest-commit input, inspect the real session, check concealed content,
confirm the second answer/reveal and verify replay/unmount disposal. The final
regressions use Testing Library's async wrapper while waiting for the observer;
the intentionally immediate diagnostic's act warnings are not final-test output.

## Validation

- Focused component/session tests: **11 passed**.
- Complete Web suite: **1,681 passed, one existing skip**, 204 files, 47.53 s.
  This run overlapped the production build; no retry or test configuration change.
- Production build/typecheck, token/PWA, Capacitor foundation and engineering
  language audit pass. Changed-file lint and format are clean. Full lint retains
  25 existing warnings and 13 informational diagnostics. The high-severity audit
  gate passes with three existing moderate transitive Capacitor/xcode/uuid findings.
- Production browser: **5/5 passed**, no retries, 18.9 s. Each case completes all
  eight rounds, alternating responders and same/different outcomes, then restarts,
  exits, re-enters and verifies fresh round/count/concealment state.
- Widths: 320 Light, 360 Dark with 200-percent text, 390 Light with normal motion,
  430 Dark and 1280 Dark. Other cases use reduced motion. Every handoff removes
  question text, answer choices and reveal content; the second answer also keeps
  the first answer concealed. Only the two-answer reveal displays both answers.
- Scoped WCAG Axe checks on first handoff and different-result reveal, overflow
  checks, unexpected-request checks and page-error checks pass. No answer/session
  writes occur. Synthetic authentication and authorized couple-name API fixtures
  are used; this is production-frontend verification, not live-backend acceptance.
- Local tooling: Node 24.19.0, Vitest 5.0.4, Playwright 1.62.1 and isolated Chromium
  153.0.8010.0 outside product dependencies. Canonical hosted Chromium/PR checks are
  separate gates recorded in the PR before regular merge.

## Product and evidence review

No runtime, style, copy, gesture, token, entitlement, API, persistence, telemetry,
dependency or native change. Product Reference v1's Games-under-More placement,
ADR 0009/0010, existing Compact-first game composition and explicit concealed
handoff remain unchanged. No new/material feature or generated composition is
introduced. The path classifier also covers component test files; the PR therefore
records the full design review of the existing journey despite its test-only scope.
No business/freemium impact: Games remains couple-scoped Premium via games.couple,
with unchanged Cloud/Self-Hosted, cost, quota, retention and data semantics.

All four fresh captures were inspected. They demonstrate concealment and reveal,
but are not a blanket visual acceptance of the existing Games UI. Inspection found
an independent baseline defect: in Compact Light, the Back button's label and
background both compute to `rgb(48, 85, 184)` (1:1 contrast). Its accessible name
and click behavior still work; scoped Axe did not flag it. A separate production
diagnostic confirmed that result; its temporary logging was removed and final
browser source restored byte-for-byte. [#1329](https://github.com/baerenmarke90/eimir/issues/1329)
owns the bounded visual correction. Do not interpret zero Axe violations as
complete contrast acceptance. This test repair does not activate final audit #946.

| State | Compact Light | Expanded Dark |
| --- | --- | --- |
| Concealed first answer | [390 px](perspective-handoff-390-light.png) | [1280 px](perspective-handoff-1280-dark.png) |
| Two-answer reveal | [390 px](perspective-reveal-390-light.png) | [1280 px](perspective-reveal-1280-dark.png) |

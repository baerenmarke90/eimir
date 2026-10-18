# Perspective-game Back contrast repair

Owning issue: [#1329](https://github.com/baerenmarke90/eimir/issues/1329).
Baseline main: `cacc2522d2ab81db3d2b60fffbcce7909e587172`.
[Pre-implementation product/Mobile Interaction review](https://github.com/baerenmarke90/eimir/issues/1329#issuecomment-6233538494).
The [verification manifest](verification.json) binds the actual source files,
production bundle and captures by SHA-256. The containing Git tree identifies
the final implementation and tests.

## Cause and bounded change

`PageHeader` renders its `before` slot as a preceding sibling. The two selectors
under `.who-of-us-heading` could never reach the actual Back button. Global
button fill and Back-link color both resolved to Light brand-strong. The
[new actual-control regression failed at 1:1](baseline-regression.txt) against
the unchanged main production styles; [baseline identity](baseline-identity.json)
and [320px failure capture](baseline-back-320-light.png) are retained.

Retarget both existing reset/focus rules to the direct Back child of
`.who-of-us-game`. Preserve the shared PageHeader contract and native button.
No global link/button, color token, copy, interaction or gameplay is replaced.
The intended transparent text control now inherits the existing foreground;
its existing 44px minimum target and themed focus outline remain available.

The required 360px/200-percent question check additionally exposed intrinsic
width overflow from long localized words. The existing game card now permits
emergency wrapping. The retained eight-question journeys assert reflow before
every answer as well as at handoff/reveal, so shuffled order cannot conceal the
long-word case. No assertion, timeout, retry or concealed-answer rule is weakened.

The existing rendered-contrast helper is moved unchanged from the foundation
spec into shared browser support, and both consumers import that single helper.
It alpha-composes ancestor background colors and supports focus-color checks.

## Product review

Product Reference v1's Game/return contract, ADR 0009/0010 and Screen Template 11
remain the references. The question and two people lead; Back is a supporting
text action. Games remains under More, with the same title/intro, local session,
concealed handoff, neutral reveal, finish/restart and fresh exit/re-entry.
No new/material feature or composition is introduced, so no new generated design
is required. Existing loading, missing-partner/empty and error/retry branches use
the same game container and available Back control. No new typing, modal,
persistence, request, telemetry or offline promise is introduced.

Compact and Expanded retain the same game. Default, focus and large-text captures
were inspected in both themes. Existing press/hover and reduced-motion feedback
remain; the new matrix exercises Enter and Space return plus fresh re-entry.
Warmth/playfulness belongs to the unchanged question/person/reveal content; this
navigation repair needs no extra relationship copy or decorative treatment.

No business/freemium impact: relationship-scoped Premium `games.couple`, backend
authorization, private/Core content, Cloud/Self-Hosted behavior, quotas, retention,
export and operating cost remain unchanged. Reuse is CSS/native controls plus an
existing test helper; there is no new dependency/provider or native/API surface.

## Validation

- Complete Web suite: **1,681 passed, one existing skip**, 204 files.
- Production-browser game suite: **7/7 passed**, no retries. Five existing complete
  eight-round journeys preserve first-answer concealment, alternating responders,
  same/different results, finish/restart and exit/re-entry. Two new matrices cover
  320/360/390/430/1280px in both themes, 200-percent text at 360px, actual normal,
  hover and focused text contrast, visible keyboard outline, 44px target geometry,
  reflow and Enter/Space activation.
- Shared-helper foundation fixtures: **11/11 passed**, using their required Vite
  development transform. These HTML/TypeScript fixtures are separate from the
  production game bundle.
- Browser inventory and planner regressions: **20/20 passed**, perspective entry
  remains PR-critical and its count is updated from five to seven.
- Typecheck, build, tokens/PWA, Capacitor foundation, formatting, scoped English
  audit and changed-file Biome checks pass. Full lint retains 25 existing warnings
  and 13 informational diagnostics; no new changed-file diagnostics.
- Scoped Axe, every-question/handoff/reveal overflow, unexpected requests, no
  answer/session writes and page-error assertions pass in the game journeys.

| Actual control pair | Before | After Light | After Dark |
| --- | ---: | ---: | ---: |
| Normal/focused/hover text, minimum required 4.5:1 | 1:1 in Light | 13.05:1 | 15.93:1 |
| Focus outline, minimum required 3:1 | selector did not match | 4.95:1 | 10.31:1 |

The [Light](perspective-back-light.json) and [Dark](perspective-back-dark.json)
records include each width and target bounds. Bounds measured before focus may
be above the viewport after an ordinary scroll; keyboard focus brings the control
into view through browser behavior, with no synthetic scroll or delay.

## Representative captures

- Default: [390 Light](perspective-back-390-light.png),
  [390 Dark](perspective-back-390-dark.png),
  [1280 Light](perspective-back-1280-light.png),
  [1280 Dark](perspective-back-1280-dark.png).
- Keyboard focus: [390 Light](perspective-back-focus-390-light.png),
  [390 Dark](perspective-back-focus-390-dark.png).
- 200-percent text: [360 Light](perspective-back-focus-360-light.png),
  [360 Dark](perspective-back-focus-360-dark.png).
- Concealed handoff: [390 Light](perspective-handoff-390-light.png),
  [1280 Dark](perspective-handoff-1280-dark.png).
- Neutral reveal: [390 Light](perspective-reveal-390-light.png),
  [1280 Dark](perspective-reveal-1280-dark.png).

## Limits and separate finding

Local browser checks use Playwright 1.62.1 with the existing isolated Chromium
153.0.8010.0. Downloading the Playwright-pinned Chromium 151 locally produced a
truncated archive; current-head hosted CI remains the canonical-browser gate.
Authentication and authorized couple APIs are synthetic fixtures. This is not a
live-backend, device, Push, Store or final #946 acceptance claim.

The shared contrast helper handles solid/alpha background colors, not images,
gradients, filters or overlap. The repaired Back control has a flat transparent
page pair, and screenshots supplement its numerical measurements. Full-page
large-text captures show the existing fixed navigation at its viewport position.

Expanded card contents still have an unrelated inset defect: the existing
padding expression references undefined `--space-7`. It is separately recorded
as [#1333](https://github.com/baerenmarke90/eimir/issues/1333); these captures do not
certify the entire Games composition. No native/device-gated PR is incorporated.

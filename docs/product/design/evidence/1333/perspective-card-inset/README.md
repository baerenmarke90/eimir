# Perspective-game card inset repair

Owner: [#1333](https://github.com/baerenmarke90/eimir/issues/1333).
Fresh main baseline: `cacc2522d2ab81db3d2b60fffbcce7909e587172`.
[Product and Mobile Interaction preflight](https://github.com/baerenmarke90/eimir/issues/1333#issuecomment-6235685233).

## Cause and bounded implementation

The existing card padding referenced undefined `--space-7`, invalidating the
entire declaration at computed-value time. Below 600px a separate Compact rule
masked the defect. The new actual-control geometry assertion
[fails on original main CSS](baseline-regression.txt): 0px instead of at least
20px at 1280px Light. The [baseline capture](baseline-question-1280-light.png)
and [bundle/source identity](baseline-identity.json) preserve that observation.

Replace only the invalid upper bound with existing `--space-8`. This is the exact
spacing expression already used by the sibling Wish Detective game. Both roles
exist in `design/tokens.json` and the Web adapter. No new alias, component,
dependency, global CSS rule, text, game behavior or composition is introduced.

The stronger child-inset assertion also detects the existing 360px/200%-text
overflow already repaired in #1334. This follow-up is therefore stacked on its
green head `9b30f4bea6870ab90efc812d2e4ac26107304db3`, rather than duplicating
that repair or weakening the assertion. Merge #1334 first, then retarget this
follow-up to main. No merge or self-approval is part of this delivery.

## Product and cross-cutting review

Product Reference v1's Game invitation/session/result/return, ADR 0009/0010 and
Screen Template 11 remain the references. The question and people lead; the
same shell, heading, concealed handoff, neutral reveal, finish/restart and Back
remain in their existing order. Compact keeps its existing inset; larger windows
gain the intended breathing room. Existing button, focus, touch and motion roles
remain intact, including reduced motion. No typing, early keyboard activation,
new panel/table, relationship decoration or copy is needed. Existing personal
questions and results provide the relationship character.

This is a rendering repair inside the existing composition, not a new or
materially changed feature, so no generated product composition is introduced.
Loading, missing partner, error/retry and offline semantics remain unchanged;
the repaired selector applies only to the existing session cards. No new
request, persisted answer, draft, telemetry, migration or native surface exists.

No business/freemium impact: the existing Space-scoped Premium `games.couple`,
backend authorization/content eligibility, Core/private data, Cloud/Self-Hosted,
quotas, retention, downgrade/export and operating cost remain unchanged.

The repository-wide token check found two unrelated undefined-token consumers
in Private Area and Vibe cleanup. They are recorded in
[#1335](https://github.com/baerenmarke90/eimir/issues/1335), not changed here.

## Validation and measured geometry

The existing browser journeys now check all four computed padding edges and
actual direct-child distances from the card border in every question, handoff,
second answer, reveal and finish. These assertions protect rendered spacing,
not a CSS string. Ten complete eight-round journeys include Compact,
599/600px, Expanded, both themes and 200% text. The two 599px journeys also resize
the current question to 600px and back, verifying its identity and inset without
resetting the session. Existing privacy, no-write, unexpected-request, Axe,
every-question reflow, finish/restart and fresh exit/re-entry assertions remain.
The inherited two Back contrast/focus/keyboard matrices are retained.

| Viewport/text | Actual inset on every edge |
| --- | ---: |
| 320/390/430/599px, default text | 20px |
| 599 → 600px resize, default text, both themes | 20 → 32px |
| 360px, 200% text | 40px |
| 600px, 200% text, both themes | 40px |
| 1280px, default text, both themes | 32px |

[Geometry records](geometry.json) include the observed padding, borders, token
bounds and minimum child inset on each edge. At 200% text the existing rem-based
minimum becomes 40px; no font shrinking is used. The [verification manifest](verification.json)
binds the source, production assets and captures by SHA-256. The containing Git
tree identifies the implementation and test source.

- Production-browser suite: **12 passed**, no retries.
- Complete Web suite: **1,681 passed, one existing skip**, 204 files.
- Build/typecheck, token/PWA checks, Capacitor foundation, formatting, lint,
  scoped engineering-language audit and browser inventory pass. Full lint has
  only the existing warnings/informational diagnostics.
- Browser planner regressions: **20 passed**; the spec remains PR-critical with
  its inventory increased from seven to twelve.

The first hosted Secret Scan identified the public `design/tokens.json` SHA-256
as a generic API key because the manifest used the path as a hash-valued key.
The checksum matches that source file. The manifest now separates paths and
digests into records. Following the existing `.gitleaksignore` pattern, only the
exact historical commit/path/rule/line fingerprint is ignored; credential
detection remains enabled for every other location and commit. No history is
rewritten, and no broad path, rule or checksum-pattern exclusion is added.

## Representative captures

- Compact: [390 Light](perspective-question-390-light.png),
  [430 Dark](perspective-question-430-dark.png).
- Breakpoint: [599 Light](perspective-question-599-light.png),
  [599 Dark](perspective-question-599-dark.png),
  [600 Light](perspective-question-600-light-default.png),
  [600 Dark](perspective-question-600-dark-default.png).
- 200% text: [600 Light](perspective-question-600-light.png),
  [600 Dark](perspective-question-600-dark.png).
- Expanded: [1280 Light](perspective-question-1280-light.png),
  [1280 Dark](perspective-question-1280-dark.png).
- Concealed handoff: [Compact](perspective-handoff-390-light.png),
  [Expanded](perspective-handoff-1280-dark.png).
- Neutral reveal: [Compact](perspective-reveal-390-light.png),
  [Expanded](perspective-reveal-1280-dark.png).
- Finish: [Light](perspective-finish-1280-light.png),
  [Dark](perspective-finish-1280-dark.png).

## Limits

The production bundle uses synthetic authorized API fixtures and isolated Chrome
Headless Shell 153.0.8010.0 with Playwright 1.62.1. The locally pinned Chromium
151 download returns a truncated HTML response; hosted current-head CI remains
the pinned-browser gate. Large-text full-page captures retain actual fixed
navigation and any focused skip control at their viewport positions. They are
not a claim of complete shell, device, live-backend, Push, Store or #946 product
acceptance. The original main baseline still shows #1329's separate Back defect;
the final stacked result includes its repair.

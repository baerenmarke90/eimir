# App composition and continuity — #1517

Baseline: `44cd3d59bd33a47472b320025efd6bc9ab22a26d`. The adjacent source manifest
binds the final reviewed source and evidence. All content is synthetic fixture
data or existing repository demo images. The generated pre-implementation
references remain under `../../references/` and in the owning issue.

## Representative results

- [More, Compact Light](more-360-light.png), [sign-out and brand, Dark](more-footer-390-dark.png), [Expanded](more-1280-light.png).
- [Modern Wir, Compact Light](wir-modern-360-light.png), [Dark](wir-modern-390-dark.png), [large text](wir-modern-390-dark-large.png), [Expanded](wir-modern-1280-dark.png).
- [Monthly highlights, Light](monthly-highlights-390-light.png) and [Dark](monthly-highlights-390-dark.png): visible captions/dates and distinct text/Milestone links, without invented totals or duplicates.
- [Quote preferences in More, Light](today-daily-quote-preferences-390-light.png) and [Dark](borderless-preferences-390-dark.png).
- [Diary, Light](01-momente-timeline-390-light.png) and [Dark](02-momente-timeline-390-dark.png). These two existing fixture captures were retained from the initial composition verification; subsequent Light/Dark axe journeys pass on the final source.

## Behavioral acceptance

Across the selected runs, 43 distinct browser journeys pass: the full 18-case
quote collection; 13 location journeys; three More journeys; six design
save/return/reload journeys; two Diary accessibility journeys; and persisted
media reuse after reload with a new authorization check. These are selected
feature collections, not the complete repository browser suite.

Quote journeys retain caller isolation, ETag, hide/restore, entitlement loss
and return, no-quote/error/retry, focus restoration, forced colors and 320px
large-text behavior in all three designs. Existing component tests additionally
cover offline writes and preference conflicts. The Modern avatar size is bounded
by the same viewport limit used by the shared hero, fixing the 320px/200% overflow.

Read mode shows a linked address with no Add/overflow controls. Management opens
from the Memory editor, never offers Add for an existing Place, corrects the
canonical Place and returns to that editor. A dirty text/media editor requires
explicit discard before this navigation; keeping the editor preserves its input.
Late callbacks retain the existing task/session and authorized-query fences.

The full Web unit/component suite passes 2,275 tests, with two existing skips.
It ran with external fetch disabled through a verification-only setup; existing
per-test transport doubles remain authoritative. Production build, token/PWA,
changed-file formatting/lint, language audits and whitespace checks pass. Lint
retains nonblocking existing fragment/test-style notices. Absolute runtime
paths, temporary configs, traces and execution logs are excluded from delivery.

The production authorization contract remains unchanged: cached bytes avoid a
second binary transfer, never a fresh access check. Durable storage is disposable,
bounded and cleared on session/Space transitions. This is neither encrypted
storage nor offline media authorization. No physical Android-device or production
latency acceptance is claimed. Final-head GitHub checks are required before merge;
this PR does not merge or publish a release.


## PR-critical follow-up

The full PR-critical CI run found two remaining regressions outside the original
selected collection. Removing the metric arrow left a positional last-child CSS
rule on the statistics label, preventing shrink/wrap at 200% text. An explicit
metric-label class replaces that obsolete rule; existing full-width and large-text
assertions remain unchanged. [The corrected large-text profile](passport-pro-390-dark-large-text.png)
retains the complete count and label without horizontal overflow.

The root-heading journey now explicitly expects the approved Instrument Sans
utility typography for More and Literata for Moments/Planning. Size, weight,
line-height, section rhythm and no-overflow comparisons remain intact. Both
Compact and Expanded pass. All six Plan → Wir → detail → return → passport
journeys pass, including 320px and 390px/200% text. The 21 related component/client
tests and production build pass. No browser budgets, tolerances or assertions
were weakened. The owning request now authorizes merging after successful
final-head GitHub checks; no release was requested.


## Monthly selection fixture correction

The expanded monthly highlights intentionally claim current-month text once.
Two older trace-layout fixtures still placed their trace-only examples in that
same month. Those examples now use a date-only value from the previous month,
including the January/year boundary. Tile counts, focus, geometry, no-overflow,
chronology and no-duplication assertions are unchanged; the quote collection
continues to prove current-month prose/Milestone inclusion. All 112 existing
Today composition and component tests pass, along with changed-spec formatting
and lint. The complete pinned GitHub browser run remains required before merge.

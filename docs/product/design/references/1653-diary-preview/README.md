# Diary happiness markers and concealed sensitive previews

## Scope and preflight

Product Owner follow-up [#1653](https://github.com/baerenmarke90/eimir/issues/1653),
based on open [#1652](https://github.com/baerenmarke90/eimir/pull/1652) at
`6b38c03f82b5b8666d3c3486ecff86fc37a2f293`.
Verified main: `0a65ac8f83384285b855c440280201dc398e23b7`.

The issue records acceptance, component reuse, the Mobile Interaction Contract,
business and privacy review before implementation. This is a small correction to
the existing Diary composition. Reuse the repository-grounded
[generated reference and preflight from #1652](../app-continuity-polish/README.md);
the explicit PO corrections supersede only the happiness node/duplicate label
and the Diary reveal action. Product Reference v1 R2, Story Timeline and Detail
View remain the design authority. No new composition or navigation is introduced.

## Result and component contract

- `StoryList` puts the existing `EimirIcon highlights` glyph on the chronology
  for a happiness Memory. Both authored answer blocks and the date remain focal.
- `ExperienceAnswers.showLabel` defaults to true. Only happiness Diary cards
  suppress the repeated icon/label; their real detail link retains the localized
  shared-happiness identity in its accessible name. Detail, history, Discover and
  time-travel consumers retain their existing label.
- `StoryList` no longer opts into `MemoryPreview.allowReveal`. Sensitive Memory
  and HeartMoment media remain blurred and carry the existing accessible privacy
  label. All Diary cards now use the normal whole-content link: no nested or
  independent reveal button is needed there.
- Both ordinary and year-scoped Diary routes use this same renderer. Existing
  media authorization, cached bytes, classification and detail reveal ownership
  remain independent. Returning after revealing a detail never reveals its Diary
  preview. Wir and Discover retain their existing deliberate controls.

Reuse the adopted glyph, semantic color/spacing roles, existing conceal default,
normal links and Task Origin. No new dependency, service, persistence, telemetry,
API, entitlement, cost or Cloud/Self-Hosted difference. Retained source reading
remains Core; new experience creation keeps its existing Pro admission. Media
privacy remains non-paywallable.

## Validation

Tested implementation: `6fef862ddd99aee3136f119c991c085292ff6b79`.
The following commit adds only these captured images and this evidence index.

- The three new consumer regressions reproduce the original failures before
  runtime changes: missing happiness chronology identity and an unwanted reveal
  button on sensitive Memory/HeartMoment previews.
- All 39 focused component tests pass. The full Web unit suite passes 2,685
  tests, with two existing skips. TypeScript, production build, format/lint,
  token/PWA checks, 38 browser-planning regressions and inventory validation pass.
- All ten direct browser journeys pass across 360 Light, 390 Dark, 430 Light,
  1280 Dark and 320 Dark with 200% text. They cover both answer authors, the
  chronology glyph, no duplicate label, capability-authorized edit/save/result/
  return, comment chronology, preserved detail labels, axe and horizontal reflow.
  Privacy cases retain the independent Wir Show/Hide behavior and verify Diary
  concealment, keyboard detail opening, deliberate detail reveal and concealed
  return. Additional complete-spec regression results are recorded in the PR.
- Both affected specs retain their reviewed feature ownership in
  `test-groups.json` and `test-impact.json`: Story/Memory/Today roots already
  transitively own the changed consumers and their cross-surface continuations.
  The 320/200% happiness case remains feature-scoped. No always-run-core change,
  removed case, relaxed timeout/assertion or speculative hosted rerun.

Local browser evidence uses Chromium 153 through the existing Playwright tests.
The normal pinned Chromium download returned HTML instead of an archive, so a
temporary external harness uses a packaged Chromium with the system fontconfig
and normal multiple-process contexts. The harness and package are outside the
repository; production dependencies and hosted browser configuration do not
change. Initial local failures were diagnosed as missing fallback fonts, the
serverless binary's single-process context lifecycle, and an incorrectly scoped
new test locator for the existing detail control. They were corrected without
changing product assertions, timeouts or existing test behavior. Hosted CI remains
required on the final PR head. No native device or release acceptance is claimed.

## Visual evidence

All content is synthetic. Captures show the real application with reduced motion.
The same content and chronology remain available in both themes and on Expanded.

| State | Happiness chronology | Sensitive Diary preview |
| --- | --- | --- |
| Compact Light, 360 px | [Answers and glyph](shared-answers-journal-360-light.png) | [Concealed without Show](diary-sensitive-360-light-concealed.png) |
| Compact Dark, 390 px | [Answers and glyph](shared-answers-journal-390-dark.png) | [Concealed without Show](diary-sensitive-390-dark-concealed.png) |
| Expanded Dark, 1280 px | [Same composition](shared-answers-journal-1280-dark.png) | [Concealed without Show](diary-sensitive-1280-dark-concealed.png) |
| Narrow Dark, 320 px / 200% text | [Wrapping and glyph](shared-answers-journal-320-dark.png) | [Concealed and navigable](diary-sensitive-320-dark-concealed.png) |

[Canonical detail retains its shared-happiness label](shared-answers-detail-390-dark.png).

# Private Area and Vibe section-spacing repair

Owner: [#1335](https://github.com/baerenmarke90/eimir/issues/1335).
Baseline: fresh main `155c7e7173e2b35c5c5f877185a52ed6196b7715`.
[Product/Mobile preflight](https://github.com/baerenmarke90/eimir/issues/1335#issuecomment-6237401646)
and [rendered diagnosis/reflow scope](https://github.com/baerenmarke90/eimir/issues/1335#issuecomment-6237451455).

## Cause and implementation

Two declarations referenced undefined `--space-7`. The Private Area overview
therefore computed `row-gap: normal` above 480px, leaving no separation between
the privacy notice and destinations. Its <=480px override masked the problem.
Vibe cleanup's entire three-value margin became invalid, losing both the intended
negative top adjustment and the separation from the following Today module.

The [baseline regressions](baseline-regression.txt), [geometry](baseline-geometry.json)
and [bundle/source identity](baseline-identity.json) preserve these failures in
both themes, Compact/Expanded and large text. The same 360px/200%-text review
also found a pre-existing private destination title overflow: an unbreakable
localized title expanded the document to 412px at a 360px viewport.

Three local corrections reuse the existing vocabulary:

- Private overview: use `--space-8` for the fluid gap maximum; keep its existing
  Compact minimum and media rule.
- Vibe cleanup: use `--space-section`, already used by the normal Vibe module
  and adjacent Today sections, for bottom separation. Keep the negative
  `--space-3` top adjustment.
- Private destination title: apply the description's existing
  `overflow-wrap: anywhere` policy to the title. No text or font is reduced.

No global alias, new token/component/dependency, API, query, persistence,
localization, module-policy or native behavior changes.

## Product and cross-cutting review

Product Reference v1, the Utility/Private Area reference and Today's
relationship-first composition remain authoritative. This is a rendering repair
within existing templates, not a new or materially changed feature requiring a
new generated composition. The existing Back, owner-only notice and three
destinations remain in order. Today retains the couple, explicit own-Vibe
removal action, Energy, quote and upcoming content. Existing warmth, privacy
copy and progressive disclosure remain; no new decoration, table, panel, typing
or relationship copy is appropriate for this repair.

Compact leads, with the same content and actions in Expanded. Touch targets,
keyboard/focus, localization, reduced motion and current loading/empty/error/
offline semantics remain. No sensitive content is added to logs or evidence;
all browser data is synthetic. Security, ownership, concurrency, retry,
performance, compatibility and operations retain their existing contracts.

No business/freemium impact: Private/Core and Vibe Mixed classification,
entitlements, Space module policy, backend authorization, Cloud/Self-Hosted,
managed resources/cost, quotas, retention, downgrade/export and existing data
remain unchanged. The authoritative matrix needs no update.

## Rendered validation

| State, both themes | Baseline | Repaired |
| --- | --- | --- |
| Private <=480px, default text | 20px grid gap | 20px |
| Private 481px | normal / 0px privacy-to-destinations gap | 24.05px |
| Private 1440px | normal / 0px privacy-to-destinations gap | 32px |
| Private 360px, 200% text | 40px gap; title overflows viewport | 40px; no horizontal overflow |
| Vibe default text | 0px top/bottom margins; next section 12px away | -12px top, 32px bottom/next gap |
| Vibe 320px, 200% text | 0px top/bottom margins; next section 24px away | -24px top, 64px bottom/next gap |

[Geometry records](geometry.json) measure actual computed values and visible
DOM distances. Private Back retains its existing additional bottom margin;
the assertions explicitly account for it instead of confusing that margin
with grid spacing. A resize journey checks 481 → 480 → 481 → 480px without
leaving the overview, then 360/390/430px, Expanded and 200% text. It opens the
actual empty Notes list, returns to the owner-only overview, then More.

The cleanup fixture represents a daily projection reflecting a Vibe disable
before cached configuration updates. With `vibe: null` in that projection and
an existing own value, the actual cleanup component renders. The journey returns
through More, removes only Vibe, checks the exact `{ vibe: null }` PATCH, retains
Energy at 60, and confirms a second return does not resurrect Vibe. Partner Vibe
stays absent and unexpected API requests fail the test. Configuration-disabled
query/render behavior retains its existing unit coverage.

- Both complete production-browser suites passed: **91 cases**, no retries,
  including existing private drafts, edits/deletes, late responses, denied reads,
  failure/retry, Energy/Vibe ownership and interruption journeys. The final
  extra resize checkpoint was also rechecked in both themes.
- Complete Web suite: **1,681 passed, one existing skip**, 204 files.
- Build/typecheck, token/PWA/Capacitor checks, format, inventory, engineering and
  documentation language audits pass. Changed files have no lint diagnostics;
  full lint retains the existing 25 warnings and 13 informational diagnostics.
- Browser planner regressions: **20 passed**. Both specs remain PR-critical.
  Inventory records 72 Private Area cases (70 existing plus two new; correcting
  its stale count) and 19 Vibe cases (17 existing plus two new).

The [verification manifest](verification.json) binds source, production assets,
geometry and captures by SHA-256. The containing Git tree identifies the exact
implementation and browser tests. Hosted pinned-browser CI remains a separate
required gate before merge.

## Representative captures

| Surface | Before | After |
| --- | --- | --- |
| Private 481px Light | [baseline](baseline-private-spacing-481-light.png) | [result](private-spacing-481-light.png) |
| Private Expanded Dark | [baseline](baseline-private-spacing-1440-dark.png) | [result](private-spacing-1440-dark.png) |
| Private 360px / 200% Light | [baseline](baseline-private-spacing-360-light-large.png) | [result](private-spacing-360-light-large.png) |
| Vibe 390px Light | [baseline](baseline-vibe-cleanup-390-light.png) | [result](vibe-cleanup-390-light.png) |
| Vibe Expanded Dark | [baseline](baseline-vibe-cleanup-1440-dark.png) | [result](vibe-cleanup-1440-dark.png) |
| Vibe 320px / 200% Dark | [baseline](baseline-vibe-cleanup-320-dark-large.png) | [result](vibe-cleanup-320-dark-large.png) |

Additional results: Private [360 Light](private-spacing-360-light.png),
[390 Light](private-spacing-390-light.png), [430 Dark](private-spacing-430-dark.png),
[480 Light](private-spacing-480-light.png), [Expanded Light](private-spacing-1440-light.png),
[200% Dark](private-spacing-360-dark-large.png); Vibe [430 Dark](vibe-cleanup-430-dark.png),
[Expanded Light](vibe-cleanup-1440-light.png), [200% Light](vibe-cleanup-320-light-large.png)
and [completed removal](vibe-cleaned-390-light.png).

## Limits

Production rendering uses Chrome Headless Shell 153.0.8010.0 and Playwright
1.62.1; the locally pinned Chromium 151 download returns truncated HTML.
Large-text full-page captures retain the real fixed navigation at its viewport
position. The scope is these rendering repairs and relevant journeys, not
complete shell, live-backend, native-device, Store or overall product acceptance.

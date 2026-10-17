# Current-main integration acceptance — 2026-10-17

This follows the [original deletion evidence](README.md), without relabeling its
historical source, bundle or counterfactual results. Original reviewed PR head:
`552dc86564943dca3aba0df840973f3b0cb592bb`. Current main baseline:
`d0f79055fc56114a323946e42986e1f76b26cce9` (includes #1326/#1327).
[Integration preflight](https://github.com/baerenmarke90/eimir/pull/1325#issuecomment-6231343768).

## Scope and review

Merge current main normally into the existing #1325 branch. Preserve the complete
private deletion contract, submitted resource identity, exact authorized detail
and list recovery, editor activation and mutually exclusive Save/Delete behavior.
Remove the now-unused collection ID binding and replace two test non-null
assertions with the existing explicit form type convention. These three lint
cleanups do not change product behavior or test assertions. No Games change or
diagnostic instrumentation is included.

The existing Product Reference v1 R5, private Detail/Create-Edit composition and
Mobile Interaction Contract remain applicable. No feature, composition, copy,
gesture, styling or token is added. Existing ShortTaskSheet/editor history,
private navigation, precise destructive confirmation, disabled pending controls,
keyboard/focus, reflow, Light/Dark and reduced motion remain. No new generated
composition is needed for this integration and bounded cleanup.

No business/freemium impact: private content remains Free/Core, owner isolation
non-paywallable, and Cloud/Self-Hosted behavior identical. No entitlement,
relationship ownership, cost, quota, retention, downgrade, export/restore,
provider/dependency, API/schema/migration, persistence, telemetry, deployment or
native change. Reuse and cross-cutting decisions in the original preflight are
retained; exact query identity and backend authorization are not weakened.

## Exact-source verification

The [integration manifest](integration-2026-10-17.json) records SHA-256 source
identities, complete production-bundle fingerprints and capture identities. The
containing Git tree binds the final source without a circular commit reference.
Local tooling remains Node 24.19.0, Playwright 1.62.1 and isolated Chromium
153.0.8010.0, outside product dependencies. This is production-bundle acceptance
with synthetic authenticated API fixtures. Canonical hosted Chromium and exact
head CI are separate gates; this is not a native-device, live-backend or final
#946 product audit.

Final integration results:

- Complete Web: **1,679 passed, one existing skip**. The 60-case production-delete
  matrix and 53 Today component cases are retained. A clean run uses the original
  uninstrumented game test and unchanged test configuration.
- TypeScript/production build, full lint/format, token/PWA, Capacitor foundation,
  language audits and the unchanged high-severity dependency-audit gate pass.
  Changed-file lint has zero diagnostics; the full tree retains 25 existing
  warnings and 13 informational diagnostics. Three existing moderate transitive
  dependency findings remain visible.
- **70/70** complete private production-browser cases pass at the final bundle,
  including all twelve deletion journeys, full-page Axe and overflow checks.
  No retries, timeout increases, exclusions or weakened assertions are used.
  The suite retains create/edit/delete ownership, sign-out, offline item/reorder
  behavior, 320/360/390/430 px, 200-percent text, sparse/dense content, Light/Dark
  and reduced motion.
- Against independently built current main, the final component matrix fails
  **46/60** cases and passes **14** controls. The unchanged final browser cases
  fail **10/12** and pass **two** normal collection-delete controls. Eight
  note/gift cases fail first at the new Save-disabled-during-DELETE assertion;
  the two abandoned collection cases fail at unwanted navigation. Do not claim
  all ten failures demonstrate late navigation, or that all six final normal
  delete cases pass baseline. The original six navigation counterfactuals used
  the earlier browser source before the Save-disabled extension and remain
  attributed to that source in the original evidence.

## Separate intermittent test finding

Two initial full runs failed the unchanged StrictMode perspective-game handoff
case while its isolated four-case file passed. Temporary diagnostic tracing and
awaiting the transition also passed, but did not reproduce or establish a root
cause; that instrumented result is excluded from clean acceptance. The subsequent
unmodified complete run without concurrent workspace build/browser load passed
1,679 cases. This does not establish load as the cause or erase the earlier
failures. [#1328](https://github.com/baerenmarke90/eimir/issues/1328) preserves the
observations and focused investigation separately. No Games runtime/test change,
retry, timeout, skip or assertion relaxation is included in #1325.

## Fresh visual acceptance

All six full-screen pending/result/independent-destination captures were inspected.
Fresh final-bundle capture bytes match the existing committed images exactly;
the manifest records this comparison, so the unchanged images need no duplicate
copies. This is a new run with a new bundle identity, not a relabeling of the old
run. The original image checksums remain valid.

| State | Compact Light | Expanded Dark |
| --- | --- | --- |
| Pending, conflicting Save disabled | [390 px](private-delete-pending-390-light.png) | [1280 px](private-delete-pending-1280-dark.png) |
| Confirmed canonical result | [390 px](private-delete-confirmed-390-light.png) | [1280 px](private-delete-confirmed-1280-dark.png) |
| Independent destination retained | [390 px](private-delete-other-task-390-light.png) | [1280 px](private-delete-other-task-1280-dark.png) |

The journey remains Open → Edit → confirm Delete → held response → normal result
or deliberate private-tab navigation → old completion → observe → return. Verify
one submitted DELETE with If-Match, actual removed content, preserved independent
destination, reachable controls, owner-only context, semantics and strict Axe.

Broader #503/#508 stay open. #946 is not activated and Draft #1271 keeps its
independent physical-device gates. Hosted results and the final published head
are recorded in the PR conversation before regular merge.

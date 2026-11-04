# Browser impact selection

## Decision and scope

The Product Owner authorized narrowing the per-PR browser selection on
2026-11-04. Four independent runners remain. No browser case, assertion,
timeout, retry, accessibility contract or branch-protection context is removed.
The full retained suite still runs on every `main` push and manual execution.
This continues #1042 and the path-scoped CI work in #490.

The problem was selection growth: almost all retained feature coverage became
mandatory for every unrelated Web change. In run
[41805355131](https://github.com/baerenmarke90/eimir/actions/runs/41805355131),
two PR shards spent 23.9 and 28.2 minutes executing tests after approximately
one minute of preparation. Dependency-install caching is not the primary fix.

## Reuse review

Reviewed the existing inventory, paginated GitHub planner, native Playwright
[file selection](https://playwright.dev/docs/test-cli) and
[sharding](https://playwright.dev/docs/test-sharding), and the already locked
Rolldown parser. Playwright `--only-changed` alone cannot infer product modules
loaded through `page.goto`; the production application is not imported by those
specs. Static filename/feature-name guesses would miss shared consumers.

Keep native Playwright execution/sharding and the existing GitHub pagination and
inventory validation. A small repository-specific ownership map supplies product
entry roots; Rolldown follows their actual module dependencies. No new package,
service, credential, runtime dependency or provider is introduced. Rolldown is
already adopted and licensed in the dependency inventory; its parser is used
only by developer/CI tooling. CI reads repository source and PR metadata, with
no couple content, telemetry or product data. Cloud and Self-Hosted behavior,
entitlements, resource quotas and user configuration are unaffected.

## Selection contract

`web/e2e/test-groups.json` remains the execution-group inventory.
`web/e2e/test-impact.json` supplies the complementary ownership contract:

- every current spec has existing production entry roots;
- ten critical spec files always run: session reload/retention, task boundaries,
  navigation, quick-create handoff, media continuity, deletion ownership,
  file-input interaction, accessible names and representative product axe/reflow;
- every changed surviving spec runs in full, including newly classified specs;
- actual relative imports, type imports, re-exports, literal dynamic imports and
  imported styles are followed transitively, with cycles handled explicitly;
- test/support static imports also participate. Browser-evaluated test callbacks
  may receive module URLs as arguments; their production consumers are covered
  by the declared roots rather than treating test callback arguments as product
  dynamic imports;
- every affected spec is selected, including retained reference/theme/viewport
  suites outside the PR-critical group;
- selected critical and additional groups are disjoint; no case runs twice just
  because its file changed;
- shared application/session/API/navigation/cache foundations, global styles,
  tokens, dependency/build/workflow changes and unknown paths select the full
  retained regression;
- both old and new source names are considered for renames; absent/removed
  dependencies and unsupported/ambiguous product imports fall back to full;
- invalid inventory, unsafe paths/statuses, incomplete API pagination or a PR
  head different from the event fail planning, never publish a partial plan;
- empty or malformed execution plans fail rather than silently selecting zero
  tests or expanding an empty argument list to the whole suite.

The dependency walk is deliberately conservative. Broad route roots can select
more consumers than a narrow behavioral change requires. Unknown/new code stays
broad until its ownership is reviewed. This is a reviewable dependency/ownership
contract, not a claim that imports prove all possible browser interactions.
Shared shell and cross-surface core coverage remain important, and a feature PR
still needs relevant Product Acceptance beyond a green automated selection.

The existing job/context names, four one-worker PR shards, four full-regression
shards, independent retries, `fail-fast: false`, diagnostic paths and artifact
names remain. The stable `Playwright + axe` aggregate additionally rejects a
skipped additional job when the plan required it.

## Measured collection, 2026-11-04

Playwright `--list`, not the historical `baselineTests` fields, produced these
counts on main `b9046626ace5678b2629d4fa196a775b1cae0f10` plus this change:

| Example change | Selected spec files | Collected browser tests |
| --- | ---: | ---: |
| Previous unconditional PR selection | 68 | 789 |
| Always-run core (documentation/unit-only change) | 10 | 128 |
| `PrivateNotesPage.tsx` | 16 | 243 |
| `AppIconSettingsPanel.tsx` | 31 | 381 |
| `MemoryProductPage.tsx` | 43 | 502 |
| Shared shell or unknown dependency | 87 | 999 |
| Complete retained regression | 87 | 999 |

The core distributes into 32/32/32/32 collected cases across the four native
shards, without overlap or missing cases. These are measured selection counts,
not measured hosted execution speedups. Runner load and the selected journeys
determine wall-clock time. This workflow/selection change itself deliberately
selects the full regression for its initial CI validation.

## Validation and maintenance

The dependency-free GitHub pagination/path regressions remain, complemented by
planner/runner/aggregate safety tests using the existing locked Web parser:

```bash
node --test web/e2e/scripts/*.test.mjs
cd web/e2e
npm run test:inventory
```

Audit a saved GitHub PR Files response locally:

```bash
node web/e2e/scripts/pr-browser-plan.mjs --files /tmp/pr-files.json
```

CI publishes the exact selection and reasons in its planning job summary. It
passes classified filenames as validated JSON through `EIMIR_BROWSER_SPECS`;
the runner passes exact escaped file filters to Playwright, without shell word
splitting or a second test definition. Without this variable, local `test:pr`
retains the complete critical group and `test:full` retains every spec.

New specs must update both inventories and declare all relevant production
entry roots, including cross-surface continuations. The ownership regressions explicitly protect private HeartMoment contrast, Plan/Wish-to-Memory capture, map-to-Memory return, insights, relation pickers and retained-source navigation. Review root ownership again
when a journey starts using another feature. Shared paths and new unsupported
dependency mechanisms must remain conservative. Reclassifying/removing the core
or deleting a browser case requires concrete coverage/contract evidence, not a
runtime budget. No browser tests were deleted or migrated in this change:
there was no demonstrated equivalent lower-level replacement to justify it.

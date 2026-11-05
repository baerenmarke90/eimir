# Web Browser QA

## Purpose

Web Browser QA verifies the canonical React/Vite client in real Chromium with Playwright and axe. It complements, rather than replaces, the Web Vitest/type/lint/build gate and the separate G2 real-stack integration flow.

The browser suite is deliberately split into a fast pull-request gate and a complete retained regression. This prevents historical Product Acceptance evidence from becoming mandatory serial work on every unrelated Web change.

## Dependencies

Browser QA uses the separately locked `web/e2e` package:

| Dependency | Version | Purpose | License |
|---|---:|---|---|
| `@playwright/test` | 1.62.1 | Chromium navigation, interaction, viewport and history assertions | Apache-2.0 |
| `@axe-core/playwright` | 4.13.0 | automated WCAG-oriented accessibility analysis | MPL-2.0 |

No browser-testing dependency is shipped in the production Web bundle.

## Application runtime

Playwright builds the application once per job with the dedicated
`web/e2e/vite.config.ts` and serves `web/e2e/dist` through Vite preview. It does
not reuse an existing server or the release `web/dist` directory. This avoids
loading the development module graph on every document navigation: Playwright
API routing disables the HTTP cache, and journeys deliberately reload or enter
deep links multiple times.

The test build extends the application Vite configuration. It also builds the
existing foundation-proof HTML, three browser module entry facades used by
the diary storage/session tests and the real codec-worker fixture. Strict entry signatures preserve those exports;
one bundle graph preserves the application's actual session, draft and media
singletons. The normal release build contains none of these test-only entries.
API-mocked contexts explicitly block service workers, including manually created
contexts, so all reads and writes continue to reach their owning mock handlers.
This matches the previous development server's lack of service-worker control;
the existing PWA foundation and unit checks remain separate.

Issue [#1641](https://github.com/baerenmarke90/eimir/issues/1641) tracks the
runtime correction. In the reported
[PR shard](https://github.com/baerenmarke90/eimir/actions/runs/41853058065/job/126654687053),
the unbundled suite took 37.1 minutes and the five gentle-prompt variants each
approached the default 30-second deadline. The 320px Dark/200% text case timed
out on its first attempt. The slow-file warning was accumulated execution time,
not evidence that `fullyParallel` was missing. Compare hosted timings on the
same selection and browser before attributing any measured improvement; a
successful bundle build or test collection alone does not establish a speedup.

## Test inventory and execution groups

`web/e2e/test-groups.json` is the authoritative browser-test inventory.

The current per-PR selection contract is [Browser impact selection](BROWSER-IMPACT-SELECTION.md).
An always-run core plus actual transitive dependencies selects affected feature
and reference coverage. Shared/unknown changes run every retained spec. The four
PR shard names and full-regression topology remain; historical counts below are
not current Playwright collection counts.

Every `web/e2e/tests/*.spec.ts` file must be classified. The inventory runner fails closed when a spec exists without a classification or when the inventory references a removed file.

Historical #1042 state:

- 46 spec files
- original full-regression baseline: **351** browser tests
- Phase B Slice 1 retained full regression: **319** browser tests
- Phase B Slice 2 retained full regression: **314** browser tests
- #961 adds two retained tests to `f2-task-boundaries.spec.ts` (unknown-create verification and its photo continuation), so the full regression is **316** tests
- PR-critical group: **152** browser tests
- Current topology: **4 PR shards** / **4 full-regression shards**, one Playwright worker per shard

Phase A did not delete browser coverage; it moved broad acceptance/reference matrices out of the per-PR path while retaining them in the full regression.

Phase B reduces test-case overhead without dropping checked states. Three dense matrix suites now execute their existing widths/themes inside fewer Playwright test cases:

- `product-gutters.spec.ts`: 20 -> 4 tests, while retaining all viewport/container widths, Expanded centering and 400% zoom coverage;
- `product-reference-foundations.spec.ts`: 19 -> 11 tests, while retaining every 320/360/390/430/1280 Light/Dark assertion, screenshot, contrast measurement and axe scan;
- `r1-memory-capture-evidence.spec.ts`: 19 -> 11 tests, while retaining all initial-empty Light/Dark viewport evidence plus every focused capture/reflow/motion/save scenario.

The earlier `LOWER_LEVEL` candidates were also re-audited. Product reflow, private-state axe contrast and forced-colors behavior all depend on real browser layout/media/computed-style behavior and therefore remain browser regression coverage rather than being forced into a weaker unit-test substitute.

Phase B Slice 2 removes only three R2 presentation-evidence cases whose contracts are already covered more strongly by later retained suites:

- 320px Timeline reflow: retained in `momente-timeline-reference.spec.ts` plus the integrated 320/200% collision checks in `r2-timeline-card-hierarchy.spec.ts`;
- 390px Dark Timeline presentation: retained in the Momente Product Reference plus the dark sticky-heading/integrated-shell regression;
- 1280px Expanded month-heading presentation: retained by the two explicit 1280 hierarchy/pinning tests.

The unique R2 contracts remain: month ordering, oldest-first filter behavior, filtered-detail Back restoration, Search return/deep-link behavior and reduced-motion month grouping. Heart Moment/Milestone Back restoration and the two Search flows now share one signed-in test session per contract family instead of duplicating full setup.

### PR-critical group

Run locally with:

```bash
cd web/e2e
npm run test:pr
```

Without a CI plan this command conservatively runs the complete critical group.
CI selects the always-run cross-surface core and complete affected spec files
through the shared ownership/dependency plan.

### Full regression

Run locally with:

```bash
cd web/e2e
npm run test:full
```

The full regression includes every retained browser spec, including Product Reference, evidence, broad viewport/theme/reflow and lower-level migration candidates.

## CI topology

`.github/workflows/web-browser-qa.yml` uses the same pinned Node container and Chromium runtime for every browser shard. Pull requests use **four isolated runners**, each with **one Playwright worker**. This divides the PR-critical workload across runners without browser processes competing with each other and the Vite server on the same runner. Playwright assigns cases in native shard order; a slow file can span a shard boundary, but the configuration does not guarantee that every file appears on multiple runners.

For a `pull_request` touching `web/**` or the workflow itself:

1. a planning job validates both inventories, proves the planner with deterministic tests and resolves the complete GitHub PR Files response, bound to the event's head SHA;
2. four PR-critical jobs run `npm run test:pr -- --shard=1/4` through `--shard=4/4` against the validated core-plus-impact selection;
3. one additional isolated job runs affected or changed non-critical specs completely when required; critical files are already covered by step 2 and are not executed twice;
4. each browser job writes to its own Playwright output directory and uploads its own short-lived evidence artifact;
5. a stable `Playwright + axe` aggregate job fails if any required shard or targeted verification fails.

For every push to `main`, and for manual execution, four isolated jobs run the complete retained regression as `--shard=1/4` through `--shard=4/4`. The aggregate `Playwright + axe` result remains the stable workflow-level browser-QA status.

Native Playwright sharding uses the existing `fullyParallel: true` configuration to distribute individual tests, including cases within the same file. Every retained test is assigned to exactly one shard. Each shard preserves the established one-worker execution model and all assertions, test selection, retries, timeouts and diagnostics.

This follows [Playwright's CI worker guidance](https://playwright.dev/docs/ci#workers) and [native sharding](https://playwright.dev/docs/test-sharding). A two-worker trial produced repeated deadlines in existing journeys; the final configuration provides concurrency across isolated runners. The existing test corrections are retained; assertions, timeouts, coverage and production behavior remain unchanged. There is no user-facing UI/UX or business/freemium impact: changes are limited to CI scheduling, test journeys and engineering documentation.

With one worker per runner, Playwright can still report a slow file's accumulated time within that shard. Check all four shard results and the complete job duration when evaluating performance. The warnings remain enabled and should be interpreted alongside the shard allocation and total job duration.

Successful curated Product Reference evidence artifacts are retained for **1 day** and failed-run evidence for **3 days**, preserving the storage-reduction intent of #963. Artifact names include the group, shard where applicable, commit SHA and `github.run_attempt`. Reports from separate attempts therefore have distinct names, and retrying a failed job does not overwrite earlier diagnostic evidence.

Every browser job also attempts a **3-day** diagnostic upload of `trace.zip`,
`error-context.md` and automatic `test-failed-*.png` screenshots, using the existing
attempt-specific diagnostic artifact names. These files only exist for failed
attempts with the current `trace: retain-on-failure` / `screenshot:
only-on-failure` settings. A passing retry therefore retains its first failure's
evidence; a clean run has no matching files and creates no diagnostic artifact.
Failed or cancelled jobs retain the complete output directory as before,
including any additional test attachments.
Successful curated visual evidence remains a separate upload with its existing
retention and filenames.

### Targeted retries

PR shards collect all test failures instead of stopping at the first failed
case. Before pushing corrections, inspect every failed job and run the complete
affected groups locally where supported. Fix the collected causes together;
do not start another hosted attempt after each individual test correction.
Assertions, test timeouts, required coverage and failure propagation remain
unchanged.

After inspecting a failure, use **Re-run jobs → Re-run failed jobs** for a
transient failure on the same revision, or `gh run rerun RUN_ID --failed --repo
baerenmarke90/eimir`. GitHub reruns failed jobs and their dependent jobs,
including the `Playwright + axe` aggregate. Other successful jobs, including
independent shards and changed-spec verification, stay completed. Both browser matrices use `fail-fast:
false`, so one failed shard does not cancel its siblings. Each retried job runs
all its own steps again; steps are not independently resumable.

The failed aggregate's summary includes this retry instruction. Code/test fixes
require a new commit; rerunning an old workflow does not validate new code.
Keep required checks bound to the revision they actually tested. Reuse native
[GitHub reruns](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)
instead of copying successful statuses between commits or adding automatic
retry loops that could hide deterministic failures.

### Coverage and planning guarantees

The full regression therefore remains automatic after merge while ordinary pull requests no longer execute the complete historical acceptance suite serially. Test-maintenance pull requests prove every changed surviving browser spec across the critical and additional groups. Removed files are omitted; renamed destinations are checked against the current validated inventory. The additional run uses a separate Playwright output directory so it cannot erase PR-gate screenshots before artifact upload.

The runner and changed-spec planner share `web/e2e/scripts/test-inventory.mjs`.
Unknown dispositions, unclassified/current-missing specs, unsafe filenames,
malformed API responses and pagination failures stop planning. A partial API
result never becomes a successful empty plan. The planner checks the complete
unique file list against the PR metadata's `changed_files` count, including the
[GitHub Files API's 3000-file limit](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests-files).
Unknown statuses, unsafe current/previous paths and duplicate or oversized pages
also fail planning. Transport/JSON errors use fixed diagnostics, and CLI error
output redacts the API token. Even when the additional group is
empty, the aggregate still requires all four critical shards and the planning job
to succeed. No browser assertion, classification, retry/timeout policy or
post-merge coverage is removed.

The #490 deduplication slice was measured against PR #1309: 35 of its 52 changed
spec files were already in the critical group; the additional group needs only
the remaining 17. The 224 duplicated inventory-baseline cases are historical
declared counts, not a current exact Playwright count or a measured time saving.
The reviewed critical shards actually passed 125 cases each in 8.5/10.0 minutes.
The optimization avoids the repeated files; hosted duration still depends on
the remaining cases and runner/setup time.

### Local shard reproduction

A CI shard can be reproduced locally without changing package scripts:

```bash
cd web/e2e
npm run test:pr -- --shard=1/4
npm run test:full -- --shard=3/4
```

Sharding reduces wall-clock latency, not the number of retained product contracts. It can consume slightly more aggregate runner/setup minutes because dependency and Chromium setup occur independently on each runner; that tradeoff is intentional and should be monitored against actual CI duration.

## Maintenance rule

A new browser spec must be classified in both inventories when it is added,
with all relevant production entry roots. Shared and unclassified dependencies
must remain conservative; see the current selection contract linked above.

Use `PR_CRITICAL` for critical behavior executed in the PR shards when affected,
and explicitly declare cross-surface core files as always-run. `FULL_REGRESSION`
retains broader acceptance/reference coverage; it also runs when its dependencies
or spec change, and always in the complete regression.

`LOWER_LEVEL` is a migration state, not permission to weaken coverage. Before deleting such a browser case, commit equivalent lower-level coverage and document the overlap in #1042 or its follow-up. If an audit shows that the contract depends materially on real layout, media emulation, focus, routing or computed browser styles, classify it back as browser regression coverage instead of manufacturing a lower-level replacement.

The long-term cleanup should prefer:

- representative browser coverage for Compact, Expanded, Light, Dark, reflow, reduced motion and accessibility;
- deterministic lower-level checks for dense token/breakpoint/layout invariants where a real browser journey adds little signal;
- full browser coverage for real navigation, focus, session, media, retry, privacy and cross-surface behavior.

## Local setup

From the repository root:

```bash
cd web
npm ci
cd e2e
npm ci
./node_modules/.bin/playwright install chromium
npm run test:inventory
npm run test:pr
```

Automated axe checks do not prove complete accessibility. Manual keyboard, screen-reader, zoom/text-scaling and platform acceptance remain separate Product Acceptance work.

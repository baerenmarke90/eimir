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

## Test inventory and execution groups

`web/e2e/test-groups.json` is the authoritative browser-test inventory.

Every `web/e2e/tests/*.spec.ts` file must be classified. The inventory runner fails closed when a spec exists without a classification or when the inventory references a removed file.

Current #1042 state:

- 46 spec files
- original full-regression baseline: **351** browser tests
- Phase B Slice 1 retained full regression: **319** browser tests
- Phase B Slice 2 retained full regression: **314** browser tests
- #961 adds two retained tests to `f2-task-boundaries.spec.ts` (unknown-create verification and its photo continuation), so the full regression is **316** tests
- PR-critical group: **152** browser tests
- Phase C topology: **2 PR shards** / **4 full-regression shards**, one Playwright worker per shard

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

This group keeps product-critical create/save/retry/navigation/session/privacy/accessibility and focused Today/Momente/Planning behavior in every Web pull request.

### Full regression

Run locally with:

```bash
cd web/e2e
npm run test:full
```

The full regression includes every retained browser spec, including Product Reference, evidence, broad viewport/theme/reflow and lower-level migration candidates.

## CI topology

`.github/workflows/web-browser-qa.yml` uses the same pinned Node container and Chromium runtime for every browser shard. Each shard still uses Playwright's CI setting of **one worker**; parallelism comes from isolated GitHub Actions runners rather than multiple browsers sharing one runner.

For a `pull_request` touching `web/**` or the workflow itself:

1. a lightweight planning job resolves changed browser-spec files through the GitHub PR Files API;
2. two PR-critical jobs run `npm run test:pr -- --shard=1/2` and `--shard=2/2` in parallel;
3. if browser specs changed, one additional isolated job runs those changed specs completely;
4. each browser job writes to its own Playwright output directory and uploads its own short-lived evidence artifact;
5. a stable `Playwright + axe` aggregate job fails if any required shard or targeted verification fails.

For a push to `main` touching the same surfaces, and for manual execution, four isolated jobs run the complete retained regression as `--shard=1/4` through `--shard=4/4`. The aggregate `Playwright + axe` result remains the stable workflow-level browser-QA status.

Native Playwright sharding is safe here because `fullyParallel: true` is already enabled. Every retained test is assigned to exactly one shard while each shard preserves the existing one-worker execution model.

Successful curated Product Reference evidence artifacts are retained for **1 day** and failed-run evidence for **3 days**, preserving the storage-reduction intent of #963. Artifact names are shard-specific because `upload-artifact@v4` does not allow multiple jobs to append to the same artifact.

If a Playwright shard fails, the workflow additionally uploads that shard's complete Playwright output directory for **3 days**. This preserves `trace.zip`, automatic failure screenshots and related diagnostics generated by the existing `trace: retain-on-failure` / `screenshot: only-on-failure` configuration.

The full regression therefore remains automatic after merge while ordinary pull requests no longer execute the complete historical acceptance suite serially. Test-maintenance pull requests still prove changed browser specs explicitly, and their targeted run uses a separate Playwright output directory so it cannot erase PR-gate screenshots before artifact upload.

### Local shard reproduction

A CI shard can be reproduced locally without changing package scripts:

```bash
cd web/e2e
npm run test:pr -- --shard=1/2
npm run test:full -- --shard=3/4
```

Sharding reduces wall-clock latency, not the number of retained product contracts. It can consume slightly more aggregate runner/setup minutes because dependency and Chromium setup occur independently on each runner; that tradeoff is intentional and should be monitored against actual CI duration.

## Maintenance rule

A new browser spec must be classified when it is added.

Use `PR_CRITICAL` when failure would represent a material regression that should block every Web change. Use `FULL_REGRESSION` for broader acceptance/reference coverage that is valuable after merge but does not need to gate every unrelated pull request.

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

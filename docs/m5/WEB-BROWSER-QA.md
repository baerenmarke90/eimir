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

Current baseline for #1042:

- 46 spec files
- 351 browser tests in the full retained regression
- 150 browser tests in the initial PR-critical group

The initial split intentionally does not delete tests. It moves broad acceptance/reference matrices out of the per-PR path while retaining them in the full regression. Explicit `LOWER_LEVEL` candidates also remain in the full regression until replacement coverage is proven.

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

`.github/workflows/web-browser-qa.yml` uses the same pinned Node container and Chromium runtime for both groups.

For a `pull_request` touching `web/**` or the workflow itself:

1. install locked Web dependencies;
2. install and audit locked browser-QA dependencies;
3. typecheck internal visual proof fixtures;
4. install the Playwright-pinned Chromium runtime;
5. validate the test inventory;
6. run `npm run test:pr`;
7. upload the established product visual evidence.

For a push to `main` touching the same surfaces, and for manual execution, the workflow runs `npm run test:full` instead.

The full regression therefore remains automatic after merge while ordinary pull requests no longer execute the complete historical acceptance suite.

## Maintenance rule

A new browser spec must be classified when it is added.

Use `PR_CRITICAL` when failure would represent a material regression that should block every Web change. Use `FULL_REGRESSION` for broader acceptance/reference coverage that is valuable after merge but does not need to gate every unrelated pull request.

`LOWER_LEVEL` is a migration state, not permission to weaken coverage. Before deleting such a browser case, commit equivalent lower-level coverage and document the overlap in #1042 or its follow-up.

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

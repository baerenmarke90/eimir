# Web browser QA

This package contains Playwright browser E2E and axe accessibility checks for the canonical Web client.

The suite has two execution groups:

- `npm run test:pr`: the fast pull-request gate. It runs the browser tests classified as `PR_CRITICAL`.
- `npm run test:full` or `npm test`: the complete retained browser regression.

The classification lives in `test-groups.json`. Every `tests/*.spec.ts` file must be present there exactly once. `npm run test:inventory` fails when a spec is added or removed without updating the inventory.

From this directory, after `npm ci`:

```bash
./node_modules/.bin/playwright install chromium
npm run test:inventory
npm run test:pr
```

Use the full regression when reproducing release/main behavior:

```bash
npm run test:full
```

CI shards these same commands without changing the suite semantics:

```bash
npm run test:pr -- --shard=1/4
npm run test:full -- --shard=3/4
```

Pull requests run four isolated CI shards with one Playwright worker each.
With `fullyParallel: true`, Playwright assigns individual cases across the
four runners while each browser has dedicated runner resources. A file can
span a shard boundary, but not every file is split across multiple shards. Main and
manual full-regression runs keep their existing four-shard topology. Local
runs keep Playwright's default worker count.

On a pull request, changed `FULL_REGRESSION` and `LOWER_LEVEL` files additionally
run in full. Changed `PR_CRITICAL` files are already included in all critical
shards' combined coverage and do not run again. The same validated inventory
owns both selections; removed specs are omitted and renamed destinations must
exist in the current inventory. API/inventory failures fail planning. The unique
file count must match PR metadata; truncated success responses (including the
3000-file API cap), invalid statuses and unsafe current/previous paths fail closed.
CLI failures publish no file output and redact the API token.

Run the dependency-free planning regressions from this directory with:

```bash
node --test scripts/changed-specs.test.mjs
```

A visible full run is available through:

```bash
npm run test:headed
```

The Playwright configuration starts the existing Web Vite server from the parent directory. See `docs/m5/WEB-BROWSER-QA.md` for the CI split and maintenance rules.

## Classification rules

- `PR_CRITICAL`: product-critical browser behavior that should block every Web pull request.
- `FULL_REGRESSION`: retained acceptance/reference coverage that runs after merge or by manual full execution.
- `LOWER_LEVEL`: a browser case that remains in the full regression until equivalent deterministic lower-level coverage is committed and its browser duplication can be removed.

Do not classify a test as `LOWER_LEVEL` merely to reduce CI time. The replacement coverage must preserve the same product contract before the browser case is deleted.

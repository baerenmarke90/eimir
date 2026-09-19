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

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  resolveChangedSpecs,
  selectAdditionalChangedSpecs,
} from './changed-specs.mjs';
import { readTestInventory } from './test-inventory.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'changed-specs.mjs');
const run = promisify(execFile);
const environment = {
  GITHUB_REPOSITORY: 'fixture/repository',
  PR_NUMBER: '42',
  GITHUB_TOKEN: 'fixture-token',
};
const specs = {
  'critical.spec.ts': { disposition: 'PR_CRITICAL', baselineTests: 2 },
  'full.spec.ts': { disposition: 'FULL_REGRESSION', baselineTests: 3 },
  'lower.spec.ts': { disposition: 'LOWER_LEVEL', baselineTests: 4 },
};

function fixture(t, entries = specs, filenames = Object.keys(entries)) {
  const root = mkdtempSync(join(tmpdir(), 'eimir-browser-plan-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'tests'));
  for (const name of filenames) writeFileSync(join(root, 'tests', name), '');
  writeFileSync(
    join(root, 'test-groups.json'),
    JSON.stringify({ version: 1, specs: entries }),
  );
  return root;
}

function file(name, status = 'modified') {
  return { filename: `web/e2e/tests/${name}`, status };
}

test('additional plan plus PR group covers every changed surviving spec exactly once', (t) => {
  const inventory = readTestInventory(fixture(t));
  const changed = Object.keys(specs).map((name) => file(name));
  const additional = selectAdditionalChangedSpecs(changed, inventory);
  const critical = inventory.prSpecs.map((name) => `tests/${name}`);
  assert.deepEqual(additional, ['tests/full.spec.ts', 'tests/lower.spec.ts']);
  assert.equal(additional.filter((name) => critical.includes(name)).length, 0);
  assert.deepEqual(
    [...critical, ...additional].sort(),
    Object.keys(specs)
      .map((name) => `tests/${name}`)
      .sort(),
  );
});

test('the current repository inventory preserves complete disjoint PR coverage', () => {
  const inventory = readTestInventory(resolve(here, '..'));
  const critical = inventory.prSpecs.map((name) => `tests/${name}`);
  const additional = selectAdditionalChangedSpecs(
    inventory.actualSpecs.map((name) => file(name)),
    inventory,
  );
  assert.equal(
    additional.some((name) => critical.includes(name)),
    false,
  );
  assert.deepEqual(
    [...critical, ...additional].sort(),
    inventory.actualSpecs.map((name) => `tests/${name}`).sort(),
  );
});

test('critical-only and non-browser changes need no additional browser job', (t) => {
  const inventory = readTestInventory(fixture(t));
  assert.deepEqual(
    selectAdditionalChangedSpecs(
      [
        file('critical.spec.ts', 'added'),
        { filename: 'web/src/App.tsx', status: 'modified' },
      ],
      inventory,
    ),
    [],
  );
});

test('removed specs are omitted and a renamed destination still runs', (t) => {
  const inventory = readTestInventory(fixture(t));
  assert.deepEqual(
    selectAdditionalChangedSpecs(
      [
        file('deleted.spec.ts', 'removed'),
        {
          ...file('full.spec.ts', 'renamed'),
          previous_filename: 'web/e2e/tests/old.spec.ts',
        },
        file('full.spec.ts'),
      ],
      inventory,
    ),
    ['tests/full.spec.ts'],
  );
});

test('changed absent or nested specs fail instead of silently disappearing', (t) => {
  const inventory = readTestInventory(fixture(t));
  for (const name of ['unknown.spec.ts', 'nested/full.spec.ts']) {
    assert.throws(
      () => selectAdditionalChangedSpecs([file(name)], inventory),
      /absent or unclassified/,
    );
  }
});

for (const [name, entries, filenames, message] of [
  [
    'unclassified current spec',
    specs,
    [...Object.keys(specs), 'new.spec.ts'],
    /Unclassified browser specs/,
  ],
  [
    'stale inventory entry',
    specs,
    ['critical.spec.ts', 'full.spec.ts'],
    /without a spec file/,
  ],
  [
    'unknown disposition',
    { 'bad.spec.ts': { disposition: 'SKIP' } },
    ['bad.spec.ts'],
    /Invalid browser-test/,
  ],
  [
    'unsafe shell filename',
    { 'full space.spec.ts': { disposition: 'FULL_REGRESSION' } },
    ['full space.spec.ts'],
    /Invalid browser-test/,
  ],
  [
    'null classification',
    { 'bad.spec.ts': null },
    ['bad.spec.ts'],
    /Invalid browser-test/,
  ],
]) {
  test(`both planner and runner reject ${name} through the same inventory`, async (t) => {
    const inventoryRoot = fixture(t, entries, filenames);
    assert.throws(() => readTestInventory(inventoryRoot), message);
    let fetched = false;
    await assert.rejects(
      resolveChangedSpecs({
        environment,
        inventoryRoot,
        fetchImpl: async () => {
          fetched = true;
          throw new Error('Unexpected fetch');
        },
      }),
      message,
    );
    assert.equal(fetched, false);
  });
}

test('all paginated files are considered, including a non-critical spec on page two', async (t) => {
  const inventoryRoot = fixture(t);
  const urls = [];
  const firstPage = [
    file('critical.spec.ts'),
    ...Array.from({ length: 99 }, (_, index) => ({
      filename: `docs/fixture-${index}.md`,
      status: 'modified',
    })),
  ];
  const result = await resolveChangedSpecs({
    environment: {
      ...environment,
      GITHUB_API_URL: 'https://api.fixture.invalid',
    },
    inventoryRoot,
    fetchImpl: async (url, options) => {
      urls.push(url);
      assert.equal(options.headers.Authorization, 'Bearer fixture-token');
      return {
        ok: true,
        json: async () =>
          urls.length === 1 ? firstPage : [file('lower.spec.ts')],
      };
    },
  });
  assert.deepEqual(result, ['tests/lower.spec.ts']);
  assert.deepEqual(
    urls,
    [1, 2].map(
      (page) =>
        `https://api.fixture.invalid/repos/fixture/repository/pulls/42/files?per_page=100&page=${page}`,
    ),
  );
});

test('a failed second API page cannot publish a partial success plan', async (t) => {
  let page = 0;
  await assert.rejects(
    resolveChangedSpecs({
      environment,
      inventoryRoot: fixture(t),
      fetchImpl: async () => {
        page += 1;
        return page === 1
          ? {
              ok: true,
              json: async () =>
                Array.from({ length: 100 }, () => file('full.spec.ts')),
            }
          : { ok: false, status: 503, statusText: 'Unavailable' };
      },
    }),
    /GitHub PR files request failed: 503/,
  );
  assert.equal(page, 2);
});

test('malformed response and records fail closed', async (t) => {
  const inventoryRoot = fixture(t);
  for (const payload of [{ files: [] }, [null], [{ filename: 'docs/a.md' }]]) {
    await assert.rejects(
      resolveChangedSpecs({
        environment,
        inventoryRoot,
        fetchImpl: async () => ({ ok: true, json: async () => payload }),
      }),
      /response must be an array|entry must contain/,
    );
  }
});

test('missing configuration fails before querying GitHub', async () => {
  await assert.rejects(
    resolveChangedSpecs({ environment: {} }),
    /are required/,
  );
});

test('CLI emits only safe additional paths and returns failure without partial stdout', async (t) => {
  const inventory = readTestInventory(resolve(here, '..'));
  const extra = inventory.actualSpecs.find(
    (name) => !inventory.prSpecs.includes(name),
  );
  let failed = false;
  const server = createServer((_request, response) => {
    if (failed) {
      response.writeHead(503);
      response.end();
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify([file(inventory.prSpecs[0]), file(extra)]));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => server.close());
  const env = {
    ...process.env,
    ...environment,
    GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
  };
  const result = await run(process.execPath, [script], { env });
  assert.equal(result.stdout, `tests/${extra}`);
  assert.equal(result.stderr, '');
  failed = true;
  await assert.rejects(run(process.execPath, [script], { env }), (error) => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, '');
    assert.match(error.stderr, /GitHub PR files request failed: 503/);
    assert.equal(error.stderr.includes(environment.GITHUB_TOKEN), false);
    return true;
  });
});

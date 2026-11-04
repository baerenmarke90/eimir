import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createDependencyReader,
  readBrowserImpact,
  selectBrowserImpact,
  validatePlannedSpecs,
} from './browser-impact.mjs';
import { planBrowserTests } from './pr-browser-plan.mjs';
import { readTestInventory } from './test-inventory.mjs';
import { verifyBrowserQa } from './verify-browser-qa.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const inventory = readTestInventory(join(root, 'web/e2e'));
const entries = readBrowserImpact(root, inventory);
const dependencies = createDependencyReader(root);
const plan = (files) =>
  selectBrowserImpact(files, inventory, entries, dependencies);
const changed = (filename, status = 'modified') => ({ filename, status });
const combined = (value) => [...value.critical, ...value.additional];

function fixture(t, files) {
  const directory = mkdtempSync(join(tmpdir(), 'eimir-browser-impact-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), source);
  }
  return directory;
}

test('every retained spec has existing product roots and a complete resolvable import graph', () => {
  assert.deepEqual(Object.keys(entries).sort(), inventory.inventoriedSpecs);
  for (const [name, entry] of Object.entries(entries)) {
    const paths = dependencies([...entry.roots, `web/e2e/tests/${name}`]);
    for (const path of entry.roots)
      assert.ok(paths.has(path), `${name}: ${path}`);
  }
});

test('a private-note change protects the complete private suite without unrelated capture matrices', () => {
  const result = plan([changed('web/src/components/PrivateNotesPage.tsx')]);
  assert.equal(result.full, false);
  assert.ok(result.critical.includes('private-area-reference.spec.ts'));
  assert.ok(!combined(result).includes('memory-create-defaults.spec.ts'));
  assert.ok(combined(result).length < inventory.inventoriedSpecs.length / 2);
  for (const [name, entry] of Object.entries(entries)) {
    if (entry.always) assert.ok(result.critical.includes(name));
  }
});

test('actual transitive media consumers and retained reference suites run with their dependency', () => {
  const result = plan([changed('web/src/components/CommentsPanel.tsx')]);
  for (const name of [
    'comments-create-ownership.spec.ts',
    'plan-comments-links.spec.ts',
    'heart-moment-reading.spec.ts',
  ]) {
    assert.ok(combined(result).includes(name), name);
  }
  assert.equal(new Set(combined(result)).size, combined(result).length);
});

test('changed critical, reference and newly added specs run completely exactly once', () => {
  const result = plan([
    changed('web/e2e/tests/app-icon-selection.spec.ts', 'added'),
    changed('web/e2e/tests/today-living-home.spec.ts'),
  ]);
  assert.ok(result.critical.includes('app-icon-selection.spec.ts'));
  assert.deepEqual(result.additional, ['today-living-home.spec.ts']);
  assert.equal(new Set(combined(result)).size, combined(result).length);
});

test('removed specs are omitted and renamed surviving reference specs remain selected', () => {
  const result = plan([
    changed('web/e2e/tests/removed.spec.ts', 'removed'),
    {
      ...changed('web/e2e/tests/today-living-home.spec.ts', 'renamed'),
      previous_filename: 'web/e2e/tests/old.spec.ts',
    },
  ]);
  assert.ok(result.additional.includes('today-living-home.spec.ts'));
  assert.ok(!combined(result).includes('removed.spec.ts'));
});

test('unit-only and documentation changes retain exactly the global core', () => {
  const result = plan([
    changed('web/src/client/privateArea.test.ts'),
    changed('docs/m5/WEB-BROWSER-QA.md'),
  ]);
  assert.deepEqual(
    result.critical,
    inventory.prSpecs.filter((name) => entries[name].always),
  );
  assert.deepEqual(result.additional, []);
});

test('shared foundations, dependencies, workflow and unknown paths require every retained browser spec', () => {
  for (const path of [
    'web/src/App.tsx',
    'web/src/components/AppShell.tsx',
    'web/src/styles.css',
    'web/src/client/sessionPersistence.ts',
    'web/src/client/routes.ts',
    'web/src/api/generated/runtime.ts',
    'web/package-lock.json',
    '.github/workflows/web-browser-qa.yml',
    'web/src/client/new-unknown.ts',
    'web/e2e/fixtures/unknown.png',
  ]) {
    const result = plan([changed(path)]);
    assert.equal(result.full, true, path);
    assert.deepEqual(combined(result).sort(), inventory.inventoriedSpecs, path);
  }
});

test('deleted and renamed source paths cannot disappear from current-only dependency analysis', () => {
  for (const file of [
    changed('web/src/components/Retired.tsx', 'removed'),
    {
      ...changed('web/src/components/PrivateNotesPage.tsx', 'renamed'),
      previous_filename: 'web/src/components/Retired.tsx',
    },
  ])
    assert.equal(plan([file]).full, true);
});

test('invalid paths, unknown statuses and unclassified specs fail before selection', () => {
  for (const file of [
    changed('../source.ts'),
    changed('web/src/new\n.ts'),
    changed('web/src/App.tsx', 'unknown'),
    changed('web/e2e/tests/new.spec.ts'),
  ])
    assert.throws(() => plan([file]), /unsafe path|absent or unclassified/);
});

test('dependency traversal preserves cycles, type imports, re-exports, literal dynamic imports and CSS', (t) => {
  const directory = fixture(t, {
    'entry.tsx':
      "import type { T } from './types'; import './style.css'; export * from './other'; const lazy = import('./lazy');",
    'types.ts': "import './other'; export type T = string;",
    'other.ts': "import './entry'; export const value = 1;",
    'lazy/index.ts': 'export default 1;',
    'style.css': 'body {}',
  });
  const read = createDependencyReader(directory);
  const all = [
    'entry.tsx',
    'lazy/index.ts',
    'other.ts',
    'style.css',
    'types.ts',
  ];
  assert.deepEqual([...read(['entry.tsx'])].sort(), all);
  assert.deepEqual([...read(['other.ts'])].sort(), all);
});

test('unsupported or incomplete product imports fall back to full coverage', (t) => {
  for (const source of [
    "import('./missing')",
    'import(variable)',
    "import.meta.glob('./*.tsx')",
    "import '@/unknown'",
    'export const =',
  ]) {
    const directory = fixture(t, { 'entry.tsx': source });
    const read = createDependencyReader(directory);
    assert.throws(() => read(['entry.tsx']));
    assert.throws(() => read(['entry.tsx']));
  }
  const result = selectBrowserImpact(
    [changed('web/src/components/PrivateNotesPage.tsx')],
    inventory,
    entries,
    () => {
      throw new Error('Incomplete graph');
    },
  );
  assert.equal(result.full, true);
  assert.deepEqual(combined(result).sort(), inventory.inventoriedSpecs);
});

test('missing/stale ownership and an empty global core cannot silently exclude a test', (t) => {
  for (const config of [
    { version: 1, specs: {} },
    { version: 2, specs: entries },
    {
      version: 1,
      specs: Object.fromEntries(
        Object.entries(entries).map(([name, entry]) => [
          name,
          { ...entry, always: false },
        ]),
      ),
    },
  ]) {
    const directory = fixture(t, {
      'web/e2e/test-impact.json': JSON.stringify(config),
    });
    assert.throws(() => readBrowserImpact(directory, inventory));
  }
});

test('a runner never interprets an empty, invalid or incomplete plan as run everything or successful omission', () => {
  const core = inventory.prSpecs.filter((name) => entries[name].always);
  for (const value of [
    '',
    '{}',
    '[]',
    '["unknown.spec.ts"]',
    JSON.stringify([...core, core[0]]),
    JSON.stringify(core.slice(1)),
  ]) {
    assert.throws(() => validatePlannedSpecs(value, 'pr', inventory, entries));
  }
  assert.deepEqual(
    validatePlannedSpecs(JSON.stringify(core), 'pr', inventory, entries),
    core,
  );
});

test('CLI emits an auditable selection and failure cannot publish partial GitHub outputs', (t) => {
  const directory = fixture(t, {
    'files.json': JSON.stringify([
      changed('web/src/components/PrivateNotesPage.tsx'),
    ]),
    output: '',
  });
  const output = join(directory, 'output');
  const cli = join(root, 'web/e2e/scripts/pr-browser-plan.mjs');
  const env = {
    ...process.env,
    GITHUB_OUTPUT: output,
    GITHUB_STEP_SUMMARY: join(directory, 'summary'),
  };
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [cli, '--files', join(directory, 'files.json')],
      { env, encoding: 'utf8' },
    ),
  );
  assert.equal(result.full, false);
  assert.match(readFileSync(output, 'utf8'), /critical-specs=\[/);
  writeFileSync(output, '');
  writeFileSync(
    join(directory, 'files.json'),
    JSON.stringify([changed('web/e2e/tests/unknown.spec.ts')]),
  );
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [cli, '--files', join(directory, 'files.json')],
        { env, encoding: 'utf8', stdio: 'pipe' },
      ),
    (error) => {
      assert.equal(error.stdout, '');
      assert.equal(readFileSync(output, 'utf8'), '');
      return true;
    },
  );
});

test('aggregate rejects failed, cancelled and unexpectedly skipped required work', () => {
  const success = {
    EVENT_NAME: 'pull_request',
    HAS_SPECS: 'true',
    PR_RESULT: 'success',
    PLAN_RESULT: 'success',
    CHANGED_RESULT: 'success',
    FULL_RESULT: 'skipped',
  };
  assert.doesNotThrow(() => verifyBrowserQa(success));
  assert.doesNotThrow(() =>
    verifyBrowserQa({
      ...success,
      HAS_SPECS: 'false',
      CHANGED_RESULT: 'skipped',
    }),
  );
  for (const key of ['PR_RESULT', 'PLAN_RESULT', 'CHANGED_RESULT']) {
    for (const result of ['failure', 'cancelled', 'skipped'])
      assert.throws(() => verifyBrowserQa({ ...success, [key]: result }));
  }
  assert.throws(() => verifyBrowserQa({ ...success, HAS_SPECS: '' }));
  const main = {
    EVENT_NAME: 'push',
    PR_RESULT: 'skipped',
    PLAN_RESULT: 'skipped',
    CHANGED_RESULT: 'skipped',
    FULL_RESULT: 'success',
  };
  assert.doesNotThrow(() => verifyBrowserQa(main));
  for (const result of ['failure', 'cancelled', 'skipped'])
    assert.throws(() => verifyBrowserQa({ ...main, FULL_RESULT: result }));
});

test('public planning entry point uses the same validated repository inventory', () => {
  assert.deepEqual(
    planBrowserTests([changed('web/src/components/PrivateNotesPage.tsx')]),
    plan([changed('web/src/components/PrivateNotesPage.tsx')]),
  );
});

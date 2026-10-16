import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const validDispositions = new Set([
  'PR_CRITICAL',
  'FULL_REGRESSION',
  'LOWER_LEVEL',
]);
const safeSpecName = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.spec\.ts$/;

/** The runner and changed-spec planner share one fail-closed inventory. */
export function readTestInventory(root) {
  const inventory = JSON.parse(
    readFileSync(join(root, 'test-groups.json'), 'utf8'),
  );
  if (
    !inventory?.specs ||
    typeof inventory.specs !== 'object' ||
    Array.isArray(inventory.specs)
  ) {
    throw new Error('Browser test inventory must contain a specs object.');
  }

  const actualSpecs = readdirSync(join(root, 'tests'))
    .filter((name) => name.endsWith('.spec.ts'))
    .sort();
  const inventoriedSpecs = Object.keys(inventory.specs).sort();
  const actual = new Set(actualSpecs);
  const problems = [];
  const missing = actualSpecs.filter((name) => !inventory.specs[name]);
  const stale = inventoriedSpecs.filter((name) => !actual.has(name));
  const invalid = inventoriedSpecs.filter(
    (name) =>
      !safeSpecName.test(name) ||
      !validDispositions.has(inventory.specs[name]?.disposition),
  );
  if (missing.length) {
    problems.push(`Unclassified browser specs: ${missing.join(', ')}`);
  }
  if (stale.length) {
    problems.push(`Inventory entries without a spec file: ${stale.join(', ')}`);
  }
  if (invalid.length) {
    problems.push(
      `Invalid browser-test dispositions or names: ${invalid.join(', ')}`,
    );
  }
  if (problems.length) throw new Error(problems.join('\n'));

  const prSpecs = inventoriedSpecs.filter(
    (name) => inventory.specs[name].disposition === 'PR_CRITICAL',
  );
  const count = (names) =>
    names.reduce(
      (sum, name) => sum + (inventory.specs[name].baselineTests ?? 0),
      0,
    );
  return {
    actualSpecs,
    inventoriedSpecs,
    prSpecs,
    declaredFullCount: count(inventoriedSpecs),
    declaredPrCount: count(prSpecs),
  };
}

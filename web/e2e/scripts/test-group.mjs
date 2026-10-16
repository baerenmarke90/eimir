import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTestInventory } from './test-inventory.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
let validated;
try {
  validated = readTestInventory(root);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const {
  actualSpecs,
  inventoriedSpecs,
  prSpecs,
  declaredFullCount,
  declaredPrCount,
} = validated;

const mode = process.argv[2] ?? 'check';
if (mode === 'check') {
  console.log(
    `Browser test inventory: ${actualSpecs.length} specs, baseline ${declaredFullCount} tests; PR-critical baseline ${declaredPrCount} tests.`,
  );
  process.exit(0);
}

if (mode !== 'pr' && mode !== 'full') {
  console.error(
    'Usage: node scripts/test-group.mjs <check|pr|full> [playwright args...]',
  );
  process.exit(2);
}

const forwarded = process.argv.slice(3);
const selected = mode === 'pr' ? prSpecs : [];
const executable = join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'playwright.cmd' : 'playwright',
);

console.log(
  `Running browser group "${mode}": ${mode === 'pr' ? selected.length : inventoriedSpecs.length} spec files (baseline ${mode === 'pr' ? declaredPrCount : declaredFullCount} tests).`,
);

const result = spawnSync(
  executable,
  ['test', ...selected.map((name) => `tests/${name}`), ...forwarded],
  {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);

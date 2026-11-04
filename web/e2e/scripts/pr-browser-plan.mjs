import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDependencyReader,
  readBrowserImpact,
  selectBrowserImpact,
} from './browser-impact.mjs';
import { readPullRequestFiles } from './changed-specs.mjs';
import { readTestInventory } from './test-inventory.mjs';

const script = fileURLToPath(import.meta.url);
const root = resolve(dirname(script), '../../..');

export function planBrowserTests(files, repositoryRoot = root) {
  const inventory = readTestInventory(resolve(repositoryRoot, 'web/e2e'));
  const entries = readBrowserImpact(repositoryRoot, inventory);
  return selectBrowserImpact(
    files,
    inventory,
    entries,
    createDependencyReader(repositoryRoot),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === script) {
  try {
    if (
      process.argv.length > 2 &&
      (process.argv[2] !== '--files' || process.argv.length !== 4)
    ) {
      throw new Error(
        'Usage: node pr-browser-plan.mjs [--files <PR-files.json>]',
      );
    }
    const files = process.argv[2]
      ? JSON.parse(readFileSync(process.argv[3], 'utf8'))
      : await readPullRequestFiles();
    const plan = planBrowserTests(files);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        [
          `critical-specs=${JSON.stringify(plan.critical)}`,
          `additional-specs=${JSON.stringify(plan.additional)}`,
          `has-specs=${plan.additional.length > 0}`,
          '',
        ].join('\n'),
      );
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        [
          '### Browser test selection',
          '',
          `Mode: ${plan.full ? 'full regression (conservative fallback)' : 'always-run core + affected dependencies'}.`,
          `PR shard files: **${plan.critical.length}**; additional files: **${plan.additional.length}**.`,
          '',
          '```json',
          JSON.stringify(plan, null, 2),
          '```',
          '',
        ].join('\n'),
      );
    }
    console.log(JSON.stringify(plan, null, 2));
  } catch (error) {
    console.error(
      String(error.message)
        .split(process.env.GITHUB_TOKEN || '\0')
        .join('[REDACTED]'),
    );
    process.exitCode = 1;
  }
}

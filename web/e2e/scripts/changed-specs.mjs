import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTestInventory } from './test-inventory.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');

export function selectAdditionalChangedSpecs(files, { actualSpecs, prSpecs }) {
  if (!Array.isArray(files))
    throw new Error('GitHub PR files response must be an array.');
  const actual = new Set(actualSpecs);
  const covered = new Set(prSpecs);
  const additional = new Set();
  for (const file of files) {
    if (
      !file ||
      typeof file.filename !== 'string' ||
      typeof file.status !== 'string'
    ) {
      throw new Error('GitHub PR file entry must contain filename and status.');
    }
    if (
      file.status === 'removed' ||
      !file.filename.startsWith('web/e2e/tests/') ||
      !file.filename.endsWith('.spec.ts')
    )
      continue;

    const name = file.filename.slice('web/e2e/tests/'.length);
    if (!actual.has(name)) {
      throw new Error(
        `Changed browser spec is absent or unclassified: ${file.filename}`,
      );
    }
    // Both PR shards already run every case in a PR-critical file. The
    // aggregate requires their success even when this targeted set is empty.
    if (!covered.has(name)) additional.add(`tests/${name}`);
  }
  return [...additional].sort();
}

export async function resolveChangedSpecs({
  environment = process.env,
  inventoryRoot = root,
  fetchImpl = fetch,
} = {}) {
  const {
    GITHUB_REPOSITORY: repository,
    PR_NUMBER: pullRequest,
    GITHUB_TOKEN: token,
  } = environment;
  const apiUrl = environment.GITHUB_API_URL || 'https://api.github.com';
  if (!repository || !pullRequest || !token) {
    throw new Error(
      'GITHUB_REPOSITORY, PR_NUMBER and GITHUB_TOKEN are required.',
    );
  }
  const inventory = readTestInventory(inventoryRoot);
  const files = [];
  for (let page = 1; ; page += 1) {
    const response = await fetchImpl(
      `${apiUrl}/repos/${repository}/pulls/${pullRequest}/files?per_page=100&page=${page}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    if (!response.ok) {
      throw new Error(
        `GitHub PR files request failed: ${response.status} ${response.statusText}`,
      );
    }
    const pageFiles = await response.json();
    if (!Array.isArray(pageFiles))
      throw new Error('GitHub PR files response must be an array.');
    files.push(...pageFiles);
    if (pageFiles.length < 100) break;
  }
  return selectAdditionalChangedSpecs(files, inventory);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    process.stdout.write((await resolveChangedSpecs()).join('\n'));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

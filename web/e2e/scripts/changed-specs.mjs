import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTestInventory } from './test-inventory.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');
const validStatuses = new Set([
  'added',
  'removed',
  'modified',
  'renamed',
  'copied',
  'changed',
  'unchanged',
]);

function safeRepositoryPath(path) {
  return (
    typeof path === 'string' &&
    !path.includes('\\') &&
    [...path].every(
      (character) =>
        character.codePointAt(0) >= 32 && character.codePointAt(0) !== 127,
    ) &&
    path.split('/').every((part) => part && part !== '.' && part !== '..')
  );
}

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
      !validStatuses.has(file.status) ||
      !safeRepositoryPath(file.filename) ||
      (file.status === 'renamed' && !safeRepositoryPath(file.previous_filename))
    ) {
      throw new Error(
        'GitHub PR file entry contains an unsafe path or invalid status.',
      );
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
  const endpoint = `${apiUrl}/repos/${repository}/pulls/${pullRequest}`;
  async function request(url) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    } catch {
      throw new Error('GitHub PR files request failed: transport error.');
    }
    if (!response.ok) {
      throw new Error(`GitHub PR files request failed: ${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error('GitHub PR files response contains invalid JSON.');
    }
  }
  for (let page = 1; ; page += 1) {
    const pageFiles = await request(
      `${endpoint}/files?per_page=100&page=${page}`,
    );
    if (!Array.isArray(pageFiles))
      throw new Error('GitHub PR files response must be an array.');
    if (pageFiles.length > 100 || files.length + pageFiles.length > 3000) {
      throw new Error('GitHub PR files pagination exceeds the API limit.');
    }
    files.push(...pageFiles);
    if (pageFiles.length < 100) break;
  }
  const additional = selectAdditionalChangedSpecs(files, inventory);
  const metadata = await request(endpoint);
  // GitHub's Files API is capped at 3000 entries. A successful short page is
  // insufficient evidence of completeness without the PR's total file count.
  if (
    !Number.isSafeInteger(metadata?.changed_files) ||
    metadata.changed_files < 0
  ) {
    throw new Error(
      'GitHub PR metadata must contain a valid changed_files count.',
    );
  }
  if (
    files.length !== metadata.changed_files ||
    new Set(files.map((file) => file.filename)).size !== files.length
  ) {
    throw new Error(
      'GitHub PR files response is partial or contains duplicate entries.',
    );
  }
  return additional;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    process.stdout.write((await resolveChangedSpecs()).join('\n'));
  } catch (error) {
    console.error(
      String(error.message)
        .split(process.env.GITHUB_TOKEN || '\0')
        .join('[REDACTED]'),
    );
    process.exitCode = 1;
  }
}

const repository = process.env.GITHUB_REPOSITORY;
const pullRequest = process.env.PR_NUMBER;
const token = process.env.GITHUB_TOKEN;
const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';

if (!repository || !pullRequest || !token) {
  console.error('GITHUB_REPOSITORY, PR_NUMBER and GITHUB_TOKEN are required.');
  process.exit(2);
}

const changedSpecs = [];
for (let page = 1; ; page += 1) {
  const response = await fetch(
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
    console.error(
      `GitHub PR files request failed: ${response.status} ${response.statusText}`,
    );
    process.exit(1);
  }

  const files = await response.json();
  for (const file of files) {
    if (
      typeof file.filename === 'string' &&
      file.filename.startsWith('web/e2e/tests/') &&
      file.filename.endsWith('.spec.ts')
    ) {
      changedSpecs.push(file.filename.replace(/^web\/e2e\//, ''));
    }
  }

  if (files.length < 100) break;
}

process.stdout.write([...new Set(changedSpecs)].sort().join('\n'));

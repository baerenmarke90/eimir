import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLegalMarkdown } from './legal-markdown.mjs';

// The canonical text lives outside `web/` so Backend, Web and reviewers share
// one source. The supported Web-only build context consumes this checked-in
// module; drift is validated by the monorepo test and build scripts.
const documents = [
  {
    source: new URL('../../legal/de/terms-of-use.md', import.meta.url),
    output: new URL(
      '../src/i18n/locales/legalDocuments/termsOfUse.de.generated.ts',
      import.meta.url,
    ),
    exportName: 'termsOfUseDe',
  },
  {
    source: new URL('../../legal/de/privacy-policy.md', import.meta.url),
    output: new URL(
      '../src/i18n/locales/legalDocuments/privacyPolicy.de.generated.ts',
      import.meta.url,
    ),
    exportName: 'privacyPolicyDe',
  },
];

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  throw new Error('Usage: node scripts/generate-legal-documents.mjs [--check]');
}
const check = args[0] === '--check';
const require = createRequire(import.meta.url);
const biome = require.resolve('@biomejs/biome/bin/biome');
const relativeTo = (root, file) =>
  relative(fileURLToPath(new URL(root, import.meta.url)), fileURLToPath(file))
    .split(sep)
    .join('/');

for (const { source, output, exportName } of documents) {
  const parsed = parseLegalMarkdown(readFileSync(source, 'utf8'));
  const sourceName = relativeTo('../../legal/', source);
  const raw = [
    `// Generated from legal/${sourceName} by scripts/generate-legal-documents.mjs. Do not edit.`,
    "import type { LegalDocument } from '../../../legal/legalDocument';",
    '',
    `export const ${exportName}: LegalDocument = ${JSON.stringify(parsed)};`,
    '',
  ].join('\n');
  const formatted = execFileSync(
    process.execPath,
    [
      biome,
      'format',
      '--vcs-enabled=false',
      `--stdin-file-path=${relativeTo('../', output)}`,
    ],
    { input: raw, encoding: 'utf8' },
  );
  if (check) {
    if (readFileSync(output, 'utf8') !== formatted) {
      throw new Error(
        `${fileURLToPath(output)} is stale. Run npm run legal:generate.`,
      );
    }
    console.log(`Legal document matches legal/${sourceName}.`);
  } else {
    writeFileSync(output, formatted);
    console.log(`Generated ${fileURLToPath(output)}.`);
  }
}

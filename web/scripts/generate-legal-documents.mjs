import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
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
const biome = fileURLToPath(
  new URL('../node_modules/.bin/biome', import.meta.url),
);

for (const { source, output, exportName } of documents) {
  const parsed = parseLegalMarkdown(readFileSync(source, 'utf8'));
  const sourceName = fileURLToPath(source).split('/legal/').at(-1);
  const raw = [
    `// Generated from legal/${sourceName} by scripts/generate-legal-documents.mjs. Do not edit.`,
    "import type { LegalDocument } from '../../../legal/legalDocument';",
    '',
    `export const ${exportName}: LegalDocument = ${JSON.stringify(parsed)};`,
    '',
  ].join('\n');
  const formatted = execFileSync(
    biome,
    [
      'format',
      '--vcs-enabled=false',
      `--stdin-file-path=${fileURLToPath(output).split('/web/').at(-1)}`,
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

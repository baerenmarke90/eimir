import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildAppDesigns } from './app-designs.mjs';
import { formatWithBiome } from './identity-palette.mjs';

const tokens = JSON.parse(
  readFileSync(new URL('../../design/tokens.json', import.meta.url), 'utf8'),
);
const designDirectory = new URL('../../design/designs/', import.meta.url);
const designs = Object.fromEntries(
  readdirSync(designDirectory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => [
      name.slice(0, -'.json'.length),
      JSON.parse(readFileSync(new URL(name, designDirectory), 'utf8')),
    ]),
);
const { css, registry } = buildAppDesigns(tokens, designs);
const outputs = [
  [
    new URL('../src/design/app-designs.css', import.meta.url),
    formatWithBiome(css, 'src/design/app-designs.css'),
  ],
  [
    new URL('../src/design/appDesigns.generated.ts', import.meta.url),
    formatWithBiome(registry, 'src/design/appDesigns.generated.ts'),
  ],
];

const check = process.argv[2] === '--check';
if (process.argv.length > (check ? 3 : 2))
  throw new Error('Usage: node scripts/generate-app-designs.mjs [--check]');
if (check) {
  for (const [url, output] of outputs)
    if (readFileSync(url, 'utf8') !== output)
      throw new Error('App designs are stale. Run npm run tokens:generate.');
  console.log('App designs match design/designs.');
} else {
  for (const [url, output] of outputs) {
    writeFileSync(url, output);
    console.log(`Generated ${fileURLToPath(url)}.`);
  }
}

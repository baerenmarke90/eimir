import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatWithBiome, paletteDeclarations } from './identity-palette.mjs';

const tokenUrl = new URL('../../design/tokens.json', import.meta.url);
const outputUrl = new URL('../src/design/identity-roles.css', import.meta.url);
const personOutputUrl = new URL(
  '../src/design/person-colors.css',
  import.meta.url,
);
const { identity } = JSON.parse(readFileSync(tokenUrl, 'utf8'));
function declarations(world, mode) {
  return paletteDeclarations(
    identity.colorWorlds[world][mode],
    identity.semanticStatus[mode],
    mode,
  )
    .map((line) => `  ${line}`)
    .join('\n');
}
const worldNames = Object.keys(identity.colorWorlds);
const css = [
  `/* Generated from design/tokens.json identity. Do not edit. */`,
  `:root {\n${declarations(identity.defaultWorld, 'light')}\n}`,
  `:root[data-theme="dark"] {\n${declarations(identity.defaultWorld, 'dark')}\n}`,
  `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {\n${declarations(identity.defaultWorld, 'dark')}\n  }\n}`,
];
for (const world of worldNames.filter(
  (name) => name !== identity.defaultWorld,
)) {
  css.push(
    `[data-color-world="${world}"] {\n${declarations(world, 'light')}\n}`,
  );
  css.push(
    `:root[data-theme="dark"] [data-color-world="${world}"] {\n${declarations(world, 'dark')}\n}`,
  );
  css.push(
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) [data-color-world="${world}"] {\n${declarations(world, 'dark')}\n  }\n}`,
  );
}
css.push(
  `.eimir-icon { fill: none; stroke: currentColor; stroke-width: var(--icon-stroke-width, ${identity.icon.strokePx}); stroke-linecap: round; stroke-linejoin: round; }`,
);
// #1907 C3: icons drawn inline in components share the registry stroke.
css.push(
  `.inline-icon { stroke-width: var(--icon-stroke-width, ${identity.icon.strokePx}); }`,
);
css.push('.eimir-icon .accent { stroke: var(--identity-icon-accent); }');
css.push('.eimir-icon .cool { stroke: var(--identity-icon-cool); }');
css.push(
  '.eimir-icon .icon-fill-accent { fill: var(--identity-icon-accent); stroke: none; }',
);
css.push('.eimir-icon-filled, .eimir-icon-duotone { stroke: currentColor; }');
const rawOutput = `${css.join('\n\n')}\n`;
const output = formatWithBiome(rawOutput, 'src/design/identity-roles.css');
function personColorCss() {
  const { tones, defaultPair } = identity.personColors;
  const names = Object.keys(tones);
  const declare = (mode, indent) =>
    names
      .flatMap((tone) => [
        `${indent}--color-person-${tone}: ${tones[tone][mode].accent};`,
        `${indent}--color-person-${tone}-surface: ${tones[tone][mode].surface};`,
      ])
      .join('\n');
  const defaults = [
    `  --person-own-accent: var(--color-person-${defaultPair.own});`,
    `  --person-own-surface: var(--color-person-${defaultPair.own}-surface);`,
    `  --person-partner-accent: var(--color-person-${defaultPair.partner});`,
    `  --person-partner-surface: var(--color-person-${defaultPair.partner}-surface);`,
  ].join('\n');
  const roles = ['own', 'partner']
    .map(
      (role) =>
        `.person-role-${role} {\n  --person-accent: var(--person-${role}-accent);\n  --person-surface: var(--person-${role}-surface);\n}`,
    )
    .join('\n\n');
  return [
    '/* Generated from design/tokens.json identity.personColors. Do not edit. */',
    `:root {\n${declare('light', '  ')}\n${defaults}\n}`,
    `:root[data-theme="dark"] {\n${declare('dark', '  ')}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {\n${declare('dark', '    ')}\n  }\n}`,
    roles,
  ].join('\n\n');
}
const personOutput = formatWithBiome(
  `${personColorCss()}
`,
  'src/design/person-colors.css',
);
const check = process.argv[2] === '--check';
if (process.argv.length > (check ? 3 : 2))
  throw new Error('Unexpected arguments');
if (check) {
  if (
    readFileSync(outputUrl, 'utf8') !== output ||
    readFileSync(personOutputUrl, 'utf8') !== personOutput
  )
    throw new Error('Identity roles are stale. Run npm run tokens:generate.');
  console.log('Identity roles match design/tokens.json.');
} else {
  writeFileSync(outputUrl, output);
  writeFileSync(personOutputUrl, personOutput);
  console.log(`Generated ${fileURLToPath(outputUrl)}.`);
}

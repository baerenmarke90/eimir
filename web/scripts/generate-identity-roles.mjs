import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const tokenUrl = new URL('../../design/tokens.json', import.meta.url);
const outputUrl = new URL('../src/design/identity-roles.css', import.meta.url);
const { identity } = JSON.parse(readFileSync(tokenUrl, 'utf8'));
const roles = {
  page: ['color-background', 'color-header-surface'],
  surface: ['color-surface', 'color-surface-panel', 'color-surface-overlay'],
  elevated: ['color-surface-raised'],
  text: ['color-text', 'color-brand-ocean'],
  mutedText: ['color-text-secondary', 'color-text-muted'],
  border: ['color-border', 'color-border-subtle', 'color-header-border'],
  action: ['color-brand-text', 'color-link-text'],
  actionFill: ['color-brand'],
  onAction: ['color-on-accent'],
  accentRose: [
    'identity-icon-accent',
    'identity-icon-warm-fill',
    'color-private',
  ],
  accentSky: [
    'identity-icon-cool',
    'identity-icon-cool-fill',
    'color-shared-accent',
  ],
  softRose: [
    'identity-surface-warm',
    'color-brand-surface',
    'color-page-tint-brand',
  ],
  softBlue: [
    'identity-surface-cool',
    'color-surface-subtle',
    'color-surface-panel-tint',
    'color-shared-surface',
    'color-page-tint-shared',
  ],
  focus: ['color-focus'],
  pressed: [],
  hover: ['identity-hover'],
};
function declarations(world, mode) {
  const palette = identity.colorWorlds[world][mode];
  const status = identity.semanticStatus[mode];
  const lines = [];
  for (const [role, aliases] of Object.entries(roles)) {
    for (const alias of aliases) lines.push(`  --${alias}: ${palette[role]};`);
  }
  lines.push(
    `  --color-brand-strong: ${mode === 'light' ? palette.action : palette.pressed};`,
  );
  lines.push(`  --color-shared: ${palette.action};`);
  lines.push(`  --color-brand-glow: ${palette.softRose};`);
  lines.push(`  --color-shadow-brand: ${palette.softRose};`);
  for (const [role, aliases] of Object.entries({
    success: ['color-success'],
    warning: ['color-warning', 'color-discovery'],
    error: ['color-error'],
    info: ['color-technical'],
    premium: ['identity-premium'],
  })) {
    for (const alias of aliases)
      lines.push(`  --${alias}: ${status[role].text};`);
    lines.push(
      `  --${role === 'info' ? 'color-technical' : role === 'warning' ? 'color-discovery' : role === 'premium' ? 'identity-premium' : `color-${role}`}-surface: ${status[role].surface};`,
    );
  }
  return lines.join('\n');
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
}
css.push(
  `.eimir-icon { fill: none; stroke: currentColor; stroke-width: ${identity.icon.strokePx}; stroke-linecap: round; stroke-linejoin: round; }`,
);
css.push('.eimir-icon .accent { stroke: var(--identity-icon-accent); }');
css.push('.eimir-icon .cool { stroke: var(--identity-icon-cool); }');
css.push('.eimir-icon-filled, .eimir-icon-duotone { stroke: currentColor; }');
const rawOutput = `${css.join('\n\n')}\n`;
const biome = fileURLToPath(
  new URL('../node_modules/.bin/biome', import.meta.url),
);
const output = execFileSync(
  biome,
  ['format', '--stdin-file-path=src/design/identity-roles.css'],
  {
    input: rawOutput,
    encoding: 'utf8',
  },
);
const check = process.argv[2] === '--check';
if (process.argv.length > (check ? 3 : 2))
  throw new Error('Unexpected arguments');
if (check) {
  if (readFileSync(outputUrl, 'utf8') !== output)
    throw new Error('Identity roles are stale. Run npm run tokens:generate.');
  console.log('Identity roles match design/tokens.json.');
} else {
  writeFileSync(outputUrl, output);
  console.log(`Generated ${fileURLToPath(outputUrl)}.`);
}

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Shared by the identity and app-design generators: one colour world (the
 * 16 palette roles in design/tokens.json identity.colorWorlds) becomes the
 * same set of semantic custom properties wherever it is applied.
 */
export const paletteRoles = {
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

/** Declarations for one palette in one scheme, without indentation. */
export function paletteDeclarations(palette, status, mode) {
  const lines = [];
  for (const [role, aliases] of Object.entries(paletteRoles)) {
    for (const alias of aliases) lines.push(`--${alias}: ${palette[role]};`);
  }
  lines.push(
    `--color-brand-strong: ${mode === 'light' ? palette.action : palette.pressed};`,
  );
  lines.push(`--color-shared: ${palette.action};`);
  lines.push(`--color-brand-glow: ${palette.softRose};`);
  lines.push(`--color-shadow-brand: ${palette.softRose};`);
  for (const [role, aliases] of Object.entries({
    success: ['color-success'],
    warning: ['color-warning', 'color-discovery'],
    error: ['color-error'],
    info: ['color-technical'],
    premium: ['identity-premium'],
  })) {
    for (const alias of aliases)
      lines.push(`--${alias}: ${status[role].text};`);
    lines.push(
      `--${role === 'info' ? 'color-technical' : role === 'warning' ? 'color-discovery' : role === 'premium' ? 'identity-premium' : `color-${role}`}-surface: ${status[role].surface};`,
    );
  }
  return lines;
}

/** Formats generated CSS with the repository's Biome binary. */
export function formatWithBiome(source, stdinFilePath) {
  const binary =
    process.platform === 'win32'
      ? '../node_modules/@biomejs/cli-win32-x64/biome.exe'
      : '../node_modules/.bin/biome';
  return execFileSync(
    fileURLToPath(new URL(binary, import.meta.url)),
    ['format', '--vcs-enabled=false', `--stdin-file-path=${stdinFilePath}`],
    { input: source, encoding: 'utf8' },
  );
}

import { paletteDeclarations, paletteRoles } from './identity-palette.mjs';

/**
 * App designs (#1907 C1): one file per design in design/designs/ selects a
 * palette and bounded presets; this module validates the file and turns it
 * into semantic custom properties. See docs/DESIGN-TOKEN-SETS.md.
 *
 * Designs currently apply to Wir only. The approved delivery switches the
 * scope to the whole app in a separate step, by changing APP_DESIGN_SCOPE.
 */
export const APP_DESIGN_SCOPE = '.today-page';

const FIELDS = [
  '$description',
  'id',
  'tier',
  'layout',
  'color',
  'shape',
  'type',
  'icon',
  'motion',
  'surface',
];
const TIERS = ['free', 'pro'];
const HEADINGS = ['display', 'ui'];
const ICON_ACCENTS = ['duotone', 'mono'];
const BACKDROPS = ['glow', 'flat'];
const ELEVATIONS = ['none', 'soft', 'standard'];
const EDGES = ['none', 'hairline'];
const MOTION_ROLES = {
  'duration-feedback': 'fast',
  'duration-transition': 'standard',
  'duration-context': 'emphasized',
};
const SCHEMES = ['light', 'dark'];

export class AppDesignError extends Error {}

function fail(id, message) {
  throw new AppDesignError(`Design "${id}": ${message}`);
}

function oneOf(id, field, value, allowed) {
  if (!allowed.includes(value))
    fail(id, `${field} must be one of ${allowed.join(', ')}.`);
}

function exactKeys(id, field, value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(id, `${field} must be an object.`);
  const actual = Object.keys(value).sort();
  if (actual.join() !== [...keys].sort().join())
    fail(id, `${field} must contain exactly ${keys.join(', ')}.`);
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.replace('#', '');
  const [red, green, blue] = [0, 2, 4].map((start) =>
    Number.parseInt(value.slice(start, start + 2), 16),
  );
  return (
    0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
  );
}

export function contrastRatio(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function palettes(id, color, identity) {
  if (color && typeof color === 'object' && 'world' in color) {
    exactKeys(id, 'color', color, ['world']);
    const world = identity.colorWorlds[color.world];
    if (!world) fail(id, `color.world "${color.world}" is not a colour world.`);
    return { light: world.light, dark: world.dark, world: color.world };
  }
  exactKeys(id, 'color', color, SCHEMES);
  for (const scheme of SCHEMES) {
    exactKeys(id, `color.${scheme}`, color[scheme], Object.keys(paletteRoles));
    for (const [role, value] of Object.entries(color[scheme]))
      if (!HEX.test(value))
        fail(id, `color.${scheme}.${role} must be a #RRGGBB colour.`);
  }
  return { light: color.light, dark: color.dark, world: null };
}

const TEXT_PAIRS = [
  ['text', 'page'],
  ['text', 'surface'],
  ['mutedText', 'page'],
  ['mutedText', 'surface'],
  ['action', 'page'],
  ['action', 'surface'],
  ['onAction', 'actionFill'],
];
const NON_TEXT_PAIRS = [
  ['focus', 'page'],
  ['focus', 'surface'],
];

function checkContrast(id, scheme, palette, minimums) {
  for (const [pairs, minimum] of [
    [TEXT_PAIRS, minimums.text],
    [NON_TEXT_PAIRS, minimums.nonText],
  ]) {
    for (const [foreground, background] of pairs) {
      const ratio = contrastRatio(palette[foreground], palette[background]);
      if (ratio < minimum)
        fail(
          id,
          `${scheme} ${foreground} on ${background} is ${ratio.toFixed(2)}:1, below ${minimum}:1.`,
        );
    }
  }
}

/** Validates one design file and returns its normalized form. */
export function validateDesign(design, tokens) {
  const { designPresets: presets, identity } = tokens;
  const id = design?.id;
  if (typeof id !== 'string' || !/^[a-z][a-z_]*$/.test(id))
    throw new AppDesignError('Every design needs a lowercase snake_case id.');
  for (const key of Object.keys(design))
    if (!FIELDS.includes(key)) fail(id, `unknown field "${key}".`);
  for (const key of FIELDS.slice(1))
    if (!(key in design)) fail(id, `missing field "${key}".`);
  oneOf(id, 'tier', design.tier, TIERS);
  oneOf(id, 'layout', design.layout, presets.layouts);
  oneOf(id, 'shape', design.shape, [
    'standard',
    ...Object.keys(presets.shape).filter((key) => !key.startsWith('$')),
  ]);
  oneOf(id, 'motion', design.motion, [
    'standard',
    ...Object.keys(presets.motion).filter((key) => !key.startsWith('$')),
  ]);
  exactKeys(id, 'type', design.type, ['display', 'headings']);
  oneOf(
    id,
    'type.display',
    design.type.display,
    Object.keys(presets.displayFamilies).filter((key) => !key.startsWith('$')),
  );
  oneOf(id, 'type.headings', design.type.headings, HEADINGS);
  exactKeys(id, 'icon', design.icon, ['stroke', 'accent']);
  if (
    typeof design.icon.stroke !== 'number' ||
    design.icon.stroke < presets.iconStroke.min ||
    design.icon.stroke > presets.iconStroke.max
  )
    fail(
      id,
      `icon.stroke must be between ${presets.iconStroke.min} and ${presets.iconStroke.max}.`,
    );
  oneOf(id, 'icon.accent', design.icon.accent, ICON_ACCENTS);
  exactKeys(id, 'surface', design.surface, ['backdrop', 'elevation', 'edges']);
  oneOf(id, 'surface.backdrop', design.surface.backdrop, BACKDROPS);
  oneOf(id, 'surface.elevation', design.surface.elevation, ELEVATIONS);
  oneOf(id, 'surface.edges', design.surface.edges, EDGES);
  const palette = palettes(id, design.color, identity);
  for (const scheme of SCHEMES)
    checkContrast(id, scheme, palette[scheme], presets.contrast);
  return { ...design, palette };
}

function milliseconds(value) {
  const match = /^(\d+)ms$/.exec(value);
  if (!match) throw new AppDesignError(`Unsupported duration ${value}.`);
  return Number(match[1]);
}

/** Scheme-independent declarations a design adds on top of its palette. */
function presetDeclarations(design, tokens) {
  const { designPresets: presets, identity } = tokens;
  const lines = [
    `--font-heading-family: var(${design.type.headings === 'display' ? '--font-display' : '--font-ui'});`,
    `--design-backdrop-glow: ${design.surface.backdrop === 'glow' ? 'var(--color-brand-glow)' : 'transparent'};`,
  ];
  if (design.type.display !== 'literata')
    lines.push(
      `--font-display: ${presets.displayFamilies[design.type.display]};`,
    );
  if (design.shape !== 'standard')
    for (const [size, value] of Object.entries(presets.shape[design.shape]))
      lines.push(`--radius-${size}: ${value};`);
  if (design.surface.elevation === 'none')
    lines.push('--shadow-card: none;', '--shadow-soft: none;');
  if (design.surface.elevation === 'soft')
    lines.push('--shadow-card: var(--shadow-soft);');
  if (design.surface.edges === 'hairline')
    lines.push(`--border-surface-width: ${tokens.border.hairline.$value};`);
  if (design.icon.stroke !== identity.icon.strokePx)
    lines.push(`--icon-stroke-width: ${design.icon.stroke};`);
  if (design.icon.accent === 'mono')
    lines.push(
      '--identity-icon-accent: currentColor;',
      '--identity-icon-cool: currentColor;',
    );
  return lines;
}

function motionDeclarations(design, tokens) {
  if (design.motion === 'standard') return [];
  const factor = tokens.designPresets.motion[design.motion];
  return Object.entries(MOTION_ROLES).map(
    ([property, duration]) =>
      `--${property}: ${Math.round(milliseconds(tokens.motion.duration[duration].$value) * factor)}ms;`,
  );
}

function block(selector, lines, indent = '') {
  const body = lines.map((line) => `${indent}  ${line}`).join('\n');
  return `${indent}${selector} {\n${body}\n${indent}}`;
}

function schemeBlocks(scoped, darkScoped, systemScoped, lightLines, darkLines) {
  return [
    block(scoped, lightLines),
    block(darkScoped, darkLines),
    `@media (prefers-color-scheme: dark) {\n${block(systemScoped, darkLines, '  ')}\n}`,
  ];
}

/**
 * Builds the CSS and the typed registry for every design. `designs` is the
 * parsed content of design/designs/*.json keyed by file name without
 * extension.
 */
export function buildAppDesigns(tokens, designs) {
  const { designPresets: presets, identity } = tokens;
  const validated = Object.entries(designs)
    .map(([name, design]) => {
      const result = validateDesign(design, tokens);
      if (name !== result.id)
        fail(result.id, `must live in design/designs/${result.id}.json.`);
      return result;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const fallback = validated.find(
    (design) => design.id === presets.defaultDesign,
  );
  if (!fallback)
    throw new AppDesignError(
      `The default design "${presets.defaultDesign}" has no file.`,
    );
  if (
    fallback.palette.world !== identity.defaultWorld ||
    fallback.shape !== 'standard' ||
    fallback.motion !== 'standard' ||
    fallback.surface.elevation !== 'standard' ||
    fallback.surface.edges !== 'none' ||
    fallback.icon.accent !== 'duotone' ||
    fallback.icon.stroke !== identity.icon.strokePx ||
    fallback.type.display !== 'literata'
  )
    fail(
      fallback.id,
      'the default design must use the root tokens (default colour world and standard presets).',
    );

  const css = [
    '/* Generated from design/designs/*.json by scripts/generate-app-designs.mjs. Do not edit. */',
    block(':root', presetDeclarations(fallback, tokens)),
  ];
  const status = identity.semanticStatus;
  // Preview tiles show each design's own palette wherever they render; designs
  // sharing a palette share one block.
  const previews = new Map();
  for (const design of validated) {
    const key = JSON.stringify(design.palette);
    previews.set(key, [...(previews.get(key) ?? []), design]);
  }
  for (const group of previews.values()) {
    const selectors = (prefix) =>
      group
        .map((design) => `${prefix}[data-design-preview="${design.id}"]`)
        .join(',\n');
    const { palette } = group[0];
    css.push(
      ...schemeBlocks(
        selectors(''),
        selectors(':root[data-theme="dark"] '),
        selectors(':root:not([data-theme]) '),
        paletteDeclarations(palette.light, status.light, 'light'),
        paletteDeclarations(palette.dark, status.dark, 'dark'),
      ),
    );
  }
  for (const design of validated) {
    if (design.id === fallback.id) continue;
    const root = `[data-app-design="${design.id}"]`;
    const extra = presetDeclarations(design, tokens);
    // A design on the default colour world inherits the root palette.
    if (design.palette.world === identity.defaultWorld)
      css.push(block(`:root${root} ${APP_DESIGN_SCOPE}`, extra));
    else
      css.push(
        ...schemeBlocks(
          `:root${root} ${APP_DESIGN_SCOPE}`,
          `:root[data-theme="dark"]${root} ${APP_DESIGN_SCOPE}`,
          `:root:not([data-theme])${root} ${APP_DESIGN_SCOPE}`,
          [
            ...paletteDeclarations(design.palette.light, status.light, 'light'),
            ...extra,
          ],
          [
            ...paletteDeclarations(design.palette.dark, status.dark, 'dark'),
            ...extra,
          ],
        ),
      );
    const motion = motionDeclarations(design, tokens);
    if (motion.length)
      css.push(
        `@media (prefers-reduced-motion: no-preference) {\n${block(`:root${root} ${APP_DESIGN_SCOPE}`, motion, '  ')}\n}`,
      );
  }

  const entries = validated
    .map(
      (design) =>
        `  ${design.id}: { tier: '${design.tier}', layout: '${design.layout}' },`,
    )
    .join('\n');
  const registry = [
    '/* Generated from design/designs/*.json by scripts/generate-app-designs.mjs. Do not edit. */',
    `export type AppDesignLayout = ${presets.layouts.map((layout) => `'${layout}'`).join(' | ')};`,
    "export type AppDesignTier = 'free' | 'pro';",
    `export const DEFAULT_APP_DESIGN = '${fallback.id}';`,
    `export const APP_DESIGNS: Readonly<Record<string, { readonly tier: AppDesignTier; readonly layout: AppDesignLayout }>> = {\n${entries}\n};`,
  ].join('\n\n');
  return { css: `${css.join('\n\n')}\n`, registry: `${registry}\n` };
}

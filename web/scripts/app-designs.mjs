import { paletteDeclarations, paletteRoles } from './identity-palette.mjs';

/**
 * App designs (#1907 C1): one file per design in design/designs/ selects a
 * palette and bounded presets; this module validates the file and turns it
 * into semantic custom properties. See docs/DESIGN-TOKEN-SETS.md.
 *
 * The root applies design presets and palette colours separately. A custom
 * palette also replaces contextual colour worlds (`data-color-world`).
 * The original palette keeps those contextual worlds.
 */

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
/**
 * Optional fine roles (Product Owner amendment 2026-11-16): a design may set
 * these besides the 16 mandatory roles; omitted ones keep the value the 16
 * roles derive. Decoration roles exist only where a design sets them.
 */
export const FINE_ROLES = {
  borderSubtle: ['color-border-subtle', 'color-header-border'],
  mutedTextSoft: ['color-text-muted'],
  surfaceSubtle: ['color-surface-subtle', 'color-surface-panel-tint'],
  surfaceOverlay: ['color-surface-overlay'],
  actionStrong: ['color-brand-strong'],
  sharedFill: ['color-shared'],
  glow: ['color-brand-glow'],
  tintBrand: ['color-page-tint-brand'],
  tintShared: ['color-page-tint-shared'],
  decoration: ['design-decoration'],
  onDecoration: ['design-on-decoration'],
  onDecorationMuted: ['design-on-decoration-muted'],
  highlight: ['design-highlight'],
  onHighlight: ['design-on-highlight'],
  decorationIcon: ['design-decoration-icon'],
  actionPrimary: ['color-action-primary'],
  onActionPrimary: ['color-on-action-primary'],
};

/**
 * The design's action colour (Product Owner decision 2026-11-17): the filled
 * create/add actions and primary links use it. Without an explicit
 * `actionPrimary` it is the palette's strong action, the same rule that gives
 * Verbunden its canonical blue; the label uses `onActionPrimary` or `onAction`.
 */
export function actionColours(palette, mode) {
  return {
    fill:
      palette.actionPrimary ??
      palette.actionStrong ??
      (mode === 'light' ? palette.action : palette.pressed),
    onFill: palette.onActionPrimary ?? palette.onAction,
  };
}

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
    // A colour world, optionally with single roles replaced per scheme.
    for (const key of Object.keys(color))
      if (!['world', ...SCHEMES].includes(key))
        fail(id, `color.${key} is not allowed with color.world.`);
    const world = identity.colorWorlds[color.world];
    if (!world) fail(id, `color.world "${color.world}" is not a colour world.`);
    const overrides = SCHEMES.filter((scheme) => scheme in color);
    for (const scheme of overrides)
      for (const [role, value] of Object.entries(color[scheme])) {
        if (!(role in paletteRoles) && !(role in FINE_ROLES))
          fail(id, `color.${scheme}.${role} is not a colour role.`);
        if (!HEX.test(value))
          fail(id, `color.${scheme}.${role} must be a #RRGGBB colour.`);
      }
    return {
      light: { ...world.light, ...color.light },
      dark: { ...world.dark, ...color.dark },
      // An adjusted world is the design's own palette, not the shared one.
      world: overrides.length ? `${color.world}+${id}` : color.world,
    };
  }
  exactKeys(id, 'color', color, SCHEMES);
  for (const scheme of SCHEMES) {
    const roles = color[scheme];
    if (!roles || typeof roles !== 'object' || Array.isArray(roles))
      fail(id, `color.${scheme} must be an object.`);
    for (const role of Object.keys(paletteRoles))
      if (!(role in roles)) fail(id, `color.${scheme} is missing "${role}".`);
    for (const role of Object.keys(roles))
      if (!(role in paletteRoles) && !(role in FINE_ROLES))
        fail(id, `color.${scheme}.${role} is not a colour role.`);
    for (const [role, value] of Object.entries(roles))
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
  // Supporting text also sits on the soft tinted surfaces.
  ['mutedText', 'softRose'],
  ['mutedText', 'softBlue'],
  ['action', 'page'],
  ['action', 'surface'],
  ['onAction', 'actionFill'],
];
/** Checked only when the design sets the fine role. */
const FINE_TEXT_PAIRS = [
  ['mutedTextSoft', 'page'],
  ['mutedTextSoft', 'surface'],
  ['onDecoration', 'decoration'],
  ['onDecorationMuted', 'decoration'],
  ['onHighlight', 'highlight'],
  ['onActionPrimary', 'actionPrimary'],
];
const NON_TEXT_PAIRS = [
  ['focus', 'page'],
  ['focus', 'surface'],
  // The filled action shape stands out from the ground it sits on.
  ['actionPrimary', 'page'],
  ['actionPrimary', 'surface'],
];

function checkContrast(
  id,
  scheme,
  palette,
  minimums,
  { actionShape = true } = {},
) {
  const { fill, onFill } = actionColours(palette, scheme);
  palette = { ...palette, actionPrimary: fill, onActionPrimary: onFill };
  const fine = FINE_TEXT_PAIRS.filter(
    ([foreground, background]) =>
      foreground in palette && background in palette,
  );
  for (const [pairs, minimum] of [
    [[...TEXT_PAIRS, ...fine], minimums.text],
    [
      NON_TEXT_PAIRS.filter(
        ([foreground]) => actionShape || foreground !== 'actionPrimary',
      ),
      minimums.nonText,
    ],
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
  // "standard" follows the app's icon stroke (identity.icon.strokePx).
  if (
    design.icon.stroke !== 'standard' &&
    (typeof design.icon.stroke !== 'number' ||
      design.icon.stroke < presets.iconStroke.min ||
      design.icon.stroke > presets.iconStroke.max)
  )
    fail(
      id,
      `icon.stroke must be "standard" or between ${presets.iconStroke.min} and ${presets.iconStroke.max}.`,
    );
  oneOf(id, 'icon.accent', design.icon.accent, ICON_ACCENTS);
  exactKeys(id, 'surface', design.surface, ['backdrop', 'elevation', 'edges']);
  oneOf(id, 'surface.backdrop', design.surface.backdrop, BACKDROPS);
  oneOf(id, 'surface.elevation', design.surface.elevation, ELEVATIONS);
  oneOf(id, 'surface.edges', design.surface.edges, EDGES);
  const palette = palettes(id, design.color, identity);
  for (const scheme of SCHEMES)
    checkContrast(id, scheme, palette[scheme], presets.contrast, {
      // Product Owner decision (2026-11-17): the default blue in Dark
      // (#354778 on #171B2F, 1.88:1) predates this rule and stays as it is.
      actionShape: palette.world !== identity.defaultWorld,
    });
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
  if (
    design.icon.stroke !== 'standard' &&
    design.icon.stroke !== identity.icon.strokePx
  )
    lines.push(`--icon-stroke-width: ${design.icon.stroke};`);
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

/**
 * The 16-role declarations followed by the fine roles the palette sets.
 * With `emphasis` the emphasised controls (checked list marks, composer save
 * and selected tag chips) take the same action colour, so a chosen palette
 * leaves no canonical blue behind.
 */
function designPalette(palette, status, mode, { emphasis = false } = {}) {
  const lines = paletteDeclarations(palette, status, mode);
  const { fill, onFill } = actionColours(palette, mode);
  lines.push(
    `--color-action-primary: ${fill};`,
    `--color-on-action-primary: ${onFill};`,
  );
  if (emphasis)
    lines.push(
      `--color-action-emphasis: ${fill};`,
      `--color-on-action-emphasis: ${onFill};`,
    );
  for (const [role, aliases] of Object.entries(FINE_ROLES))
    if (role in palette)
      for (const alias of aliases) lines.push(`--${alias}: ${palette[role]};`);
  return lines;
}

/** Keeps the last declaration of each property, at its first position. */
function uniqueDeclarations(lines) {
  const byProperty = new Map();
  for (const line of lines) byProperty.set(line.split(':')[0], line);
  return [...byProperty.values()];
}

function block(selector, lines, indent = '') {
  const body = uniqueDeclarations(lines)
    .map((line) => `${indent}  ${line}`)
    .join('\n');
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
    ![identity.icon.strokePx, 'standard'].includes(fallback.icon.stroke) ||
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
  const paletteIds = [];
  for (const group of previews.values()) {
    const representative =
      group.find((design) => design.id === fallback.id) ??
      group.find((design) => design.tier === 'free') ??
      group[0];
    paletteIds.push(JSON.stringify(representative.id));
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
        designPalette(palette.light, status.light, 'light'),
        designPalette(palette.dark, status.dark, 'dark'),
      ),
    );
  }
  for (const design of validated) {
    if (design.palette.world === identity.defaultWorld) continue;
    const palette = `[data-app-palette="${design.id}"]`;
    const scoped = (prefix) =>
      `${prefix}${palette},\n${prefix}${palette} [data-color-world]`;
    css.push(
      ...schemeBlocks(
        scoped(':root'),
        scoped(':root[data-theme="dark"]'),
        scoped(':root:not([data-theme])'),
        designPalette(design.palette.light, status.light, 'light', {
          emphasis: true,
        }),
        designPalette(design.palette.dark, status.dark, 'dark', {
          emphasis: true,
        }),
      ),
    );
  }
  for (const design of validated) {
    if (design.id === fallback.id) continue;
    const root = `:root[data-app-design="${design.id}"]`;
    css.push(block(root, presetDeclarations(design, tokens)));
    if (design.icon.accent === 'mono') {
      // Match the palette's highest specificity, including contextual colour worlds.
      const mono = `${root}[data-app-palette]`;
      css.push(
        block(`${mono},\n${mono} [data-color-world]`, [
          '--identity-icon-accent: currentColor;',
          '--identity-icon-cool: currentColor;',
        ]),
      );
    }
    const motion = motionDeclarations(design, tokens);
    if (motion.length)
      css.push(
        `@media (prefers-reduced-motion: no-preference) {\n${block(root, motion, '  ')}\n}`,
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
    `export const APP_PALETTE_IDS = [${paletteIds.join(', ')}] as const;`,
    `export const APP_DESIGNS: Readonly<Record<string, { readonly tier: AppDesignTier; readonly layout: AppDesignLayout }>> = {\n${entries}\n};`,
  ].join('\n\n');
  return { css: `${css.join('\n\n')}\n`, registry: `${registry}\n` };
}

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A bounded adapter for Product Reference v1, not a second token vocabulary.
// Existing Web aliases stay compatible until their consumers migrate.
const tokensUrl = new URL('../../design/tokens.json', import.meta.url);
const outputUrl = new URL('../src/design/product-roles.css', import.meta.url);
const tokens = JSON.parse(readFileSync(tokensUrl, 'utf8'));

function value(path, visited = new Set()) {
  if (visited.has(path)) throw new Error(`Circular token alias: ${path}`);
  const node = path.split('.').reduce((current, key) => current?.[key], tokens);
  if (!node || !Object.hasOwn(node, '$value')) {
    throw new Error(`Missing token value: ${path}`);
  }
  const raw = node.$value;
  if (typeof raw === 'string' && /^\{[^}]+\}$/.test(raw)) {
    return value(raw.slice(1, -1), new Set([...visited, path]));
  }
  return raw;
}

function px(path) {
  const raw = value(path);
  if (typeof raw !== 'string' || !/^\d+(\.\d+)?px$/.test(raw)) {
    throw new Error(`Expected a pixel dimension: ${path}`);
  }
  return Number.parseFloat(raw);
}

function rem(path) {
  return `${px(path) / 16}rem`;
}

function family(path) {
  return value(path)
    .map((name) =>
      /^(serif|sans-serif|system-ui)$/.test(name) ? name : `"${name}"`,
    )
    .join(', ');
}

const declarations = [];
function declare(name, entry) {
  const declaration = `  --${name}: ${entry};`;
  declarations.push(
    declaration.length > 80 ? `  --${name}:\n    ${entry};` : declaration,
  );
}

function typography(name, source, familyName = 'ui', weight) {
  const type = value(`typography.${source}`);
  const size = Number.parseFloat(type.fontSize) / 16;
  declare(
    `font-${name}`,
    `${weight ?? type.fontWeight} ${size}rem / ${type.lineHeight} ${family(`font.family.${familyName}`)}`,
  );
  declare(`tracking-${name}`, type.letterSpacing);
}

typography('page-heading', 'heading1', 'display');
typography(
  'personal-heading',
  'heading2',
  'display',
  value('font.weight.semibold'),
);
typography('content-heading', 'heading3', 'display');
typography('utility-heading', 'heading2', 'ui', value('font.weight.semibold'));
typography('memory-detail-heading', 'memoryDetailHeading');
typography('section-heading', 'heading3');
typography('reading-body', 'body');
typography('supporting-copy', 'bodySmall');
typography('navigation-label', 'meta', 'ui', value('font.weight.semibold'));
typography('action-label', 'body', 'ui', value('font.weight.semibold'));

for (const role of [
  'surface',
  'surfaceHover',
  'edge',
  'foreground',
  'backdropBlur',
]) {
  const name = role.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  declare(`media-overlay-${name}`, value(`mediaOverlay.${role}`).toLowerCase());
}

declare(
  'navigation-surface-opacity',
  `${value('navigationGlass.surfaceOpacity') * 100}%`,
);
declare('navigation-backdrop-blur', value('navigationGlass.backdropBlur'));
// CSS function lists wrap between functions, matching the repository formatter.
const mapFilterLines = ['  --map-dark-tile-filter:'];
for (const part of value('mapAppearance.darkTileFilter').split(' ')) {
  const last = mapFilterLines.length - 1;
  if (`${mapFilterLines[last]} ${part};`.length > 80) {
    mapFilterLines.push(`    ${part}`);
  } else mapFilterLines[last] += ` ${part}`;
}
declarations.push(`${mapFilterLines.join('\n')};`);

declare('sensitive-media-blur', value('mediaPrivacy.concealmentBlur'));
declare('radius-media', rem('radius.large'));
declare('radius-content', rem('radius.card'));
declare('radius-sheet-top', rem('radius.sheet'));
declare('border-surface-width', value('border.surfaceFrame'));
declare('border-control-width', value('border.controlFrame'));
declare('touch-target-web', value('size.touchTarget.webMinimum'));
declare('space-content-group', rem('spacing.3'));
declare('space-section', rem('spacing.8'));
declare('page-gutter-narrow', value('layout.mobileGutterNarrow'));
declare('page-gutter-comfortable', value('layout.mobileGutter'));
declare('page-gutter', 'var(--page-gutter-narrow)');
declare('duration-feedback', value('motion.duration.fast'));
declare('duration-transition', value('motion.duration.standard'));
declare('duration-context', value('motion.duration.emphasized'));
for (const role of ['standard', 'enter', 'exit', 'playback']) {
  declare(
    `easing-${role}`,
    `cubic-bezier(${value(`motion.easing.${role}`).join(', ')})`,
  );
}

const overlay = value('shadow.overlay');
declare(
  'elevation-overlay',
  `${overlay.offsetX} ${overlay.offsetY} ${overlay.blur} ${overlay.spread} var(--color-shadow-overlay)`,
);

const comfortableMin = px('layout.breakpoint.compactComfortableMin');
const lightLink = value('color.scheme.light.link').toLowerCase();
const darkLink = value('color.scheme.dark.link').toLowerCase();
declare('color-link-text', lightLink);
declare(
  'color-action-primary',
  value('color.scheme.light.brandStrong').toLowerCase(),
);
declare(
  'color-on-action-primary',
  value('color.scheme.light.onAccent').toLowerCase(),
);
declare(
  'memory-detail-background',
  value('color.scheme.light.memoryDetailBackground').toLowerCase(),
);

const css = `/* Generated by scripts/generate-product-roles.mjs from design/tokens.json.
 * Do not edit. Run npm run tokens:generate after changing the source.
 * Import after theme.css. Canonical motion roles are consumed directly by production styles.
 */
:root {
${declarations.join('\n')}
}

:root[data-theme="dark"] {
  --color-link-text: ${darkLink};
  --color-action-primary: ${value('color.scheme.dark.brandStrong').toLowerCase()};
  --color-on-action-primary: ${value('color.scheme.dark.onAccent').toLowerCase()};
  --memory-detail-background: ${value('color.scheme.dark.memoryDetailBackground').toLowerCase()};
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --color-link-text: ${darkLink};
    --color-action-primary: ${value('color.scheme.dark.brandStrong').toLowerCase()};
    --color-on-action-primary: ${value('color.scheme.dark.onAccent').toLowerCase()};
    --memory-detail-background: ${value('color.scheme.dark.memoryDetailBackground').toLowerCase()};
  }
}

@media (min-width: ${comfortableMin}px) {
  :root {
    --page-gutter: var(--page-gutter-comfortable);
  }
}

/* Browser text/zoom may narrow the shell without changing viewport queries.
 * Keep the actual product content on the same D7 boundary in that case.
 */
@container product-shell (width < ${comfortableMin}px) {
  .product-main {
    --page-gutter: var(--page-gutter-narrow);
  }
}

@container product-shell (width >= ${comfortableMin}px) {
  .product-main {
    --page-gutter: var(--page-gutter-comfortable);
  }
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-feedback: ${value('motion.duration.instant')};
    --duration-transition: ${value('motion.duration.instant')};
    --duration-context: ${value('motion.duration.instant')};
  }
}

@media (forced-colors: active) {
  :root {
    --border-surface-width: ${value('border.hairline')};
    --border-control-width: ${value('border.hairline')};
  }
}
`;

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  throw new Error('Usage: node scripts/generate-product-roles.mjs [--check]');
}
if (args[0] === '--check') {
  if (readFileSync(outputUrl, 'utf8') !== css) {
    throw new Error(
      'Product role adapter is stale. Run npm run tokens:generate.',
    );
  }
  console.log('Product role adapter matches design/tokens.json.');
} else {
  mkdirSync(new URL('../src/design/', import.meta.url), { recursive: true });
  writeFileSync(outputUrl, css);
  console.log(`Generated ${fileURLToPath(outputUrl)}.`);
}

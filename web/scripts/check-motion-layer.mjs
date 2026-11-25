#!/usr/bin/env node
/**
 * Motion layer guard (Motion Contract M1, M6, M8, M14; #2073, closed in
 * #2080).
 *
 * Ad-hoc motion lives only in `src/motion/`. Outside it, every one of these
 * fails the check:
 *
 * - `keyframes`: `@keyframes` rules (CSS) and `@keyframes` text (TS);
 * - `animate`: `Element.animate()` calls (`.animate(`);
 * - `infinite`: `infinite` in animation declarations, and `iterations:
 *   Infinity` (TS);
 * - `layout-keyframes`: layout properties declared inside `@keyframes`;
 * - `animation-literal`: `cubic-bezier(` or a non-zero literal duration in an
 *   animation declaration (CSS), or `cubic-bezier(` in TypeScript;
 * - `layout-transition`: a layout property (or `all`) in a CSS `transition`
 *   or `transition-property` declaration;
 * - `pointer-tracking`: a `pointermove`, `touchmove` or `mousemove` listener
 *   (`addEventListener` or a React `on…Move` handler).
 *
 * Three rules have reviewed registrations with an exact count per file:
 * `infinite` (`REGISTERED_LOOPS`, the bounded domains' loops),
 * `layout-transition` (`REGISTERED_LAYOUT_TRANSITIONS`, the sanctioned
 * `disclose` uses of Motion Contract 4.2) and `pointer-tracking`
 * (`REGISTERED_POINTER_TRACKING`, the gesture owners of 4.6 and pointer
 * input that moves nothing). A registered file must have exactly its count,
 * so a new use needs a reviewed registration and a removed one must be
 * unregistered.
 *
 * The guard also rejects animation-library dependencies
 * (`BLOCKED_ANIMATION_LIBRARIES`) in `package.json`, `package-lock.json` and
 * imports anywhere in `src/` (Motion Contract 6.6).
 *
 * The ratchet allowlist of the migration (#2073 to #2079) is gone: there is
 * no file that may keep ad-hoc motion.
 *
 *   node scripts/check-motion-layer.mjs     check (npm test / build)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RULES = Object.freeze([
  'keyframes',
  'animate',
  'infinite',
  'layout-keyframes',
  'animation-literal',
  'layout-transition',
  'pointer-tracking',
]);

/** The motion layer itself, relative to `web/`. */
export const LAYER_DIR = 'src/motion/';

/**
 * The registered loops of the bounded domains (Motion Contract 4.8, M8;
 * #2079). Outside the layer, `infinite` is allowed only here: the Scenes
 * domain's playfields, whose loops run only while the scene controller
 * (`src/motion/scene.ts`, `data-motion-scene`) reports the scene seen and in
 * use, and are absent with reduced motion. The Loading domain loops inside
 * the layer (`src/motion/utilities.css`) and needs no entry.
 */
export const REGISTERED_LOOPS = Object.freeze({
  'src/components/GardenAmbience.css': { use: 'scenes', count: 4 },
  'src/components/GardenGamePage.css': { use: 'scenes', count: 7 },
  'src/components/GardenGrowth.css': { use: 'scenes', count: 11 },
  'src/components/GardenRareVisitors.css': { use: 'scenes', count: 2 },
  'src/components/GardenSeasonArt.css': { use: 'scenes', count: 1 },
  'src/components/RemoteCoupleGames.css': { use: 'scenes', count: 1 },
});

/**
 * The sanctioned layout transitions: Replace `disclose` option 3 (Motion
 * Contract 4.2), each listed and checked there. M6 forbids every other
 * transition of a layout property.
 */
export const REGISTERED_LAYOUT_TRANSITIONS = Object.freeze({
  // The monthly recap lead closes as one row (#2079).
  'src/components/CoupleExperiences.css': { use: 'disclose', count: 1 },
  // The search row makes room above the status row (#2077, #2080).
  'src/components/PlanningReference.css': { use: 'disclose', count: 1 },
  // The editor's area, stage and crop frame follow the photo (#2077).
  'src/components/PhotoEditTask.css': { use: 'disclose', count: 3 },
  // The quiet hint folds away (#2074).
  'src/components/QuietHint.css': { use: 'disclose', count: 1 },
  // The overview cache notice closes its slot (#2077).
  'src/styles.css': { use: 'disclose', count: 1 },
});

/**
 * Pointer tracking outside the layer (Motion Contract M14, 4.6). `gesture`:
 * an owner that follows the finger with the Gesture follow rules from
 * `src/motion/gesture/` or a wrapped library. `input`: pointer input that
 * moves nothing by itself (a press that is cancelled, a long-press slop,
 * scroll intent, a drawn stroke, a scrubbed selection, the editor's handles).
 */
export const REGISTERED_POINTER_TRACKING = Object.freeze({
  'src/client/useControlPressFeedback.ts': { use: 'input', count: 1 },
  'src/client/useFloatingCreateScrollTuck.ts': { use: 'input', count: 1 },
  'src/components/ListEntryActions.tsx': { use: 'gesture', count: 1 },
  'src/components/MediaGallery.tsx': { use: 'input', count: 2 },
  // The memory worlds (#2283): the Stapel's sideways swipe of the top print,
  // the Plattenkiste's crate flip, record scratch, tonearm and lyric scrub,
  // the Momentwolke's cloud pan / bubble fling and card swipe-to-close, the
  // Fotoautomat's coin drag and the waving of the wet strip, the
  // Kühlschranktür's note and letter drag with its touch scroll-or-drag
  // decision, the Fotobuch's page that follows the finger around the
  // spine and the Rubbellos' won ticket torn off sideways (gesture, not yet
  // on the building block; Motion Contract 4.6), and the Rubbellos' scratch
  // strokes on its foils (input: a drawn stroke that moves nothing).
  'src/components/memoryWorlds/FridgeDoorWorld.tsx': {
    use: 'gesture',
    count: 2,
  },
  'src/components/memoryWorlds/MomentCloudWorld.tsx': {
    use: 'gesture',
    count: 2,
  },
  'src/components/memoryWorlds/PhotoAlbumWorld.tsx': {
    use: 'gesture',
    count: 1,
  },
  'src/components/memoryWorlds/PhotoBoothWorld.tsx': {
    use: 'gesture',
    count: 2,
  },
  'src/components/memoryWorlds/RecordCrateWorld.tsx': {
    use: 'gesture',
    count: 4,
  },
  'src/components/memoryWorlds/ScratchCardWorld.tsx': {
    use: 'gesture',
    count: 1,
  },
  'src/components/memoryWorlds/ScratchFoil.tsx': { use: 'input', count: 1 },
  'src/components/memoryWorlds/StackWorld.tsx': { use: 'gesture', count: 1 },
  'src/components/PhotoEditTask.tsx': { use: 'input', count: 4 },
  'src/components/PicturePingPongPage.tsx': { use: 'input', count: 1 },
  // The Momente timeline scrub (input) and the lifeline preview card swipe
  // (gesture, not yet on the building block; Motion Contract 4.6).
  'src/components/SharedStorySummary.tsx': { use: 'gesture', count: 2 },
  'src/components/ShortTaskSheet.tsx': { use: 'gesture', count: 2 },
  'src/components/useNavigationMotion.ts': { use: 'gesture', count: 1 },
  'src/components/usePullToRefresh.ts': { use: 'gesture', count: 1 },
  'src/components/ZoomablePhoto.tsx': { use: 'gesture', count: 1 },
});

/** The registrations by rule. */
export const REGISTRATIONS = Object.freeze({
  infinite: REGISTERED_LOOPS,
  'layout-transition': REGISTERED_LAYOUT_TRANSITIONS,
  'pointer-tracking': REGISTERED_POINTER_TRACKING,
});

/**
 * Animation libraries that need a new decision in the Motion Contract before
 * they may be added (6.6; Product Owner decision 2026-11-19). A name ending
 * in `*` matches its prefix.
 */
export const BLOCKED_ANIMATION_LIBRARIES = Object.freeze([
  'motion',
  'framer-motion',
  'motion-plus*',
  'gsap',
  'animejs',
]);

const LAYOUT_PROPERTIES = new Set([
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'block-size',
  'inline-size',
  'min-block-size',
  'min-inline-size',
  'max-block-size',
  'max-inline-size',
  'top',
  'left',
  'right',
  'bottom',
  'inset',
  'inset-block',
  'inset-inline',
  'inset-block-start',
  'inset-block-end',
  'inset-inline-start',
  'inset-inline-end',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'margin-block',
  'margin-inline',
  'margin-block-start',
  'margin-block-end',
  'margin-inline-start',
  'margin-inline-end',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'padding-block',
  'padding-inline',
  'padding-block-start',
  'padding-block-end',
  'padding-inline-start',
  'padding-inline-end',
  'gap',
  'row-gap',
  'column-gap',
  'font-size',
  'line-height',
  'border-width',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'grid-template-rows',
  'grid-template-columns',
  'flex-basis',
]);

function emptyCounts() {
  return Object.fromEntries(RULES.map((rule) => [rule, 0]));
}

/** Replace comments with spaces so offsets and line breaks stay intact. */
function blankCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, ' '),
  );
}

function blankTsComments(text) {
  // Good enough for a guard: block comments, and line comments that are not
  // part of a URL (`https://`).
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:\\'"`])\/\/[^\n]*/g,
      (match, lead) => lead + ' '.repeat(match.length - lead.length),
    );
}

/** The `{ … }` block that starts at `open` (index of `{`). */
function blockEnd(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return text.length;
}

const ANIMATION_DECLARATION =
  /(^|[;{\s])(animation(?:-duration|-delay|-timing-function|-iteration-count)?)\s*:\s*([^;{}]+)/g;
/** A literal, non-zero time such as `2s`, `120ms` or `.4s`. */
const LITERAL_TIME = /(^|[^\w.-])(\d*\.?\d+)(m?s)\b/g;

function literalDurations(value) {
  let count = 0;
  for (const match of value.matchAll(LITERAL_TIME))
    if (Number.parseFloat(match[2]) !== 0) count += 1;
  return count;
}

/** A `transition` or `transition-property` declaration. */
const TRANSITION_DECLARATION =
  /(^|[;{\s])(transition(?:-property)?)\s*:\s*([^;{}]+)/g;

/**
 * Whether a transition declaration moves a layout property (or `all`). One
 * declaration counts once, however many layout properties it lists: a
 * sanctioned `disclose` is one transition on one container.
 */
function transitionsLayout(value) {
  return value.split(',').some((part) => {
    const name = part.trim().split(/\s+/)[0];
    return name === 'all' || LAYOUT_PROPERTIES.has(name);
  });
}

export function scanCss(text) {
  const counts = emptyCounts();
  const source = blankCssComments(text);
  for (const match of source.matchAll(/@(?:-webkit-)?keyframes\s+[^{]+\{/g)) {
    counts.keyframes += 1;
    const open = match.index + match[0].length - 1;
    const body = source.slice(open + 1, blockEnd(source, open));
    for (const declaration of body.matchAll(/([a-z-]+)\s*:/g))
      if (LAYOUT_PROPERTIES.has(declaration[1]))
        counts['layout-keyframes'] += 1;
  }
  for (const match of source.matchAll(ANIMATION_DECLARATION)) {
    const [, , property, value] = match;
    if (/\binfinite\b/.test(value)) counts.infinite += 1;
    if (property === 'animation-iteration-count') continue;
    counts['animation-literal'] += (
      value.match(/cubic-bezier\(/g) ?? []
    ).length;
    if (property !== 'animation-timing-function')
      counts['animation-literal'] += literalDurations(value);
  }
  for (const match of source.matchAll(TRANSITION_DECLARATION))
    if (transitionsLayout(match[3])) counts['layout-transition'] += 1;
  return counts;
}

const POINTER_LISTENER =
  /addEventListener\(\s*['"`](?:pointermove|touchmove|mousemove)['"`]/g;
const POINTER_HANDLER =
  /\bon(?:Pointer|Touch|Mouse)Move(?:Capture)?(?:=\{|\s*:)/g;

export function scanTs(text) {
  const counts = emptyCounts();
  const source = blankTsComments(text);
  counts.keyframes = (source.match(/@keyframes\b/g) ?? []).length;
  counts.animate = (source.match(/\.animate\s*\(/g) ?? []).length;
  counts['animation-literal'] = (source.match(/cubic-bezier\(/g) ?? []).length;
  counts.infinite = (
    source.match(/iterations\s*:\s*(?:Number\.POSITIVE_)?Infinity\b/g) ?? []
  ).length;
  counts['pointer-tracking'] =
    (source.match(POINTER_LISTENER) ?? []).length +
    (source.match(POINTER_HANDLER) ?? []).length;
  return counts;
}

export function isScanned(path) {
  if (!path.startsWith('src/')) return false;
  if (path.startsWith(LAYER_DIR)) return false;
  if (/\.(test|spec|e2e\.test)\.[cm]?[jt]sx?$/.test(path)) return false;
  if (path.includes('/__tests__/') || path.includes('/test/')) return false;
  return /\.(css|[cm]?[jt]sx?)$/.test(path) && !path.endsWith('.d.ts');
}

export function scanFile(path, text) {
  return path.endsWith('.css') ? scanCss(text) : scanTs(text);
}

function total(counts) {
  return RULES.reduce((sum, rule) => sum + (counts[rule] ?? 0), 0);
}

const RULE_HELP = Object.freeze({
  infinite:
    'Update REGISTERED_LOOPS only with a reviewed domain loop (Motion Contract 4.8).',
  'layout-transition':
    'Update REGISTERED_LAYOUT_TRANSITIONS only with a reviewed `disclose` use listed in Motion Contract 4.2.',
  'pointer-tracking':
    'Update REGISTERED_POINTER_TRACKING only with a reviewed gesture owner or pointer input (Motion Contract 4.6, M14).',
});

/**
 * Compare observed counts with the registrations. Outside them every count
 * must be zero; a registered file must have exactly its registered count.
 * @param {Map<string, Record<string, number>>} observed counts per file
 * @param {Record<string, Record<string, {use: string, count: number}>>} registrations
 * @returns {string[]} violations
 */
export function compare(observed, registrations = REGISTRATIONS) {
  const errors = [];
  for (const [rule, registry] of Object.entries(registrations))
    for (const [path, entry] of Object.entries(registry)) {
      const have = observed.get(path)?.[rule] ?? 0;
      if (have !== entry.count)
        errors.push(
          `${path}: ${have} ${rule}, but ${entry.count} are registered (${entry.use}). ${RULE_HELP[rule]}`,
        );
    }
  for (const [path, counts] of observed)
    for (const rule of RULES) {
      if (registrations[rule]?.[path]) continue;
      const have = counts[rule] ?? 0;
      if (have > 0)
        errors.push(
          `${path}: ${rule} ${have}. Ad-hoc motion is not allowed outside src/motion/ (Motion Contract M14); use the motion layer.`,
        );
    }
  return errors;
}

function blockedName(name) {
  return BLOCKED_ANIMATION_LIBRARIES.some((blocked) =>
    blocked.endsWith('*')
      ? name.startsWith(blocked.slice(0, -1))
      : name === blocked || name.startsWith(`${blocked}/`),
  );
}

/** Blocked animation libraries in a `package.json` document. */
export function blockedManifestDependencies(manifest) {
  const names = new Set();
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ])
    for (const name of Object.keys(manifest[field] ?? {}))
      if (blockedName(name)) names.add(name);
  return [...names].sort();
}

/** Blocked animation libraries anywhere in a `package-lock.json` (v2/v3). */
export function blockedLockfilePackages(lockfile) {
  const names = new Set();
  for (const key of Object.keys(lockfile.packages ?? {})) {
    const at = key.lastIndexOf('node_modules/');
    if (at < 0) continue;
    const name = key.slice(at + 'node_modules/'.length);
    if (blockedName(name)) names.add(name);
  }
  return [...names].sort();
}

const IMPORT_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"`]([^'"`]+)['"`]/g;

/** Blocked animation libraries imported by a source text. */
export function blockedImports(text) {
  const names = new Set();
  for (const match of blankTsComments(text).matchAll(IMPORT_SPECIFIER)) {
    const specifier = match[1];
    if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
    if (blockedName(specifier)) names.add(specifier);
  }
  return [...names].sort();
}

function walk(directory, root, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, root, files);
    } else {
      files.push(relative(root, full).split(sep).join('/'));
    }
  }
  return files;
}

export function scanTree(root) {
  const observed = new Map();
  for (const path of walk(join(root, 'src'), root)) {
    if (!isScanned(path)) continue;
    const counts = scanFile(path, readFileSync(join(root, path), 'utf8'));
    if (total(counts) > 0) observed.set(path, counts);
  }
  return observed;
}

/** Violations of the animation-library rule in `root` (`web/`). */
export function checkDependencies(root) {
  const errors = [];
  const help =
    'Animation libraries need a new decision in the Motion Contract (6.6).';
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const name of blockedManifestDependencies(manifest))
    errors.push(`package.json: depends on ${name}. ${help}`);
  const lockPath = join(root, 'package-lock.json');
  if (existsSync(lockPath))
    for (const name of blockedLockfilePackages(
      JSON.parse(readFileSync(lockPath, 'utf8')),
    ))
      errors.push(`package-lock.json: installs ${name}. ${help}`);
  for (const path of walk(join(root, 'src'), root)) {
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    for (const name of blockedImports(readFileSync(join(root, path), 'utf8')))
      errors.push(`${path}: imports ${name}. ${help}`);
  }
  return errors;
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const errors = [...compare(scanTree(root)), ...checkDependencies(root)];
  if (errors.length > 0) {
    console.error(`Motion layer guard failed (${errors.length}):`);
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }
  const registered = Object.values(REGISTRATIONS).reduce(
    (sum, registry) => sum + Object.keys(registry).length,
    0,
  );
  console.log(
    `Motion layer guard passed: no ad-hoc motion outside src/motion/ (${registered} reviewed registrations).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main();

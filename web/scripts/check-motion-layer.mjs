#!/usr/bin/env node
/**
 * Motion layer guard (Motion Contract M1, M6, M8, M14; #2073).
 *
 * Ad-hoc motion lives only in `src/motion/`. Outside it, this check counts:
 *
 * - `keyframes`: `@keyframes` rules (CSS) and `@keyframes` text (TS);
 * - `animate`: `Element.animate()` calls (`.animate(`);
 * - `infinite`: `infinite` in animation declarations;
 * - `layout-keyframes`: layout properties declared inside `@keyframes`;
 * - `animation-literal`: `cubic-bezier(` or a non-zero literal duration in an
 *   animation declaration (CSS), or `cubic-bezier(` in TypeScript.
 *
 * `infinite` is also allowed in the registered loops of the bounded domains
 * (`REGISTERED_LOOPS`, #2079), with an exact count per file.
 *
 * Files that had such motion when the layer landed are listed in
 * `motion-layer-allowlist.json` with their counts. That allowlist is a ratchet:
 * a count may fall but never rise, a file that reaches zero must leave the
 * list, and the number of listed files may never exceed the baseline below.
 * Any other file with a count above zero fails the check.
 *
 *   node scripts/check-motion-layer.mjs           check (npm test / build)
 *   node scripts/check-motion-layer.mjs --shrink  lower the allowlist to the
 *                                                 current counts (never raises)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RULES = Object.freeze([
  'keyframes',
  'animate',
  'infinite',
  'layout-keyframes',
  'animation-literal',
]);

/**
 * The allowlist baseline when the guard landed (#2073). It may only shrink;
 * raising it needs a new version of the Motion Contract.
 */
export const BASELINE_FILE_LIMIT = Object.freeze({ css: 66, ts: 8 });

/** The motion layer itself, relative to `web/`. */
export const LAYER_DIR = 'src/motion/';

/**
 * The registered loops of the bounded domains (Motion Contract 4.8, M8;
 * #2079). Outside the layer, `infinite` is allowed only here: the Scenes
 * domain's playfields, whose loops run only while the scene controller
 * (`src/motion/scene.ts`, `data-motion-scene`) reports the scene seen and in
 * use, and are absent with reduced motion. Each file names its domain and
 * its exact number of loops, so a new loop needs a reviewed registration and
 * a removed one must be unregistered. The Loading domain loops inside the
 * layer (`src/motion/utilities.css`) and needs no entry.
 */
export const REGISTERED_LOOPS = Object.freeze({
  'src/components/GardenAmbience.css': { domain: 'scenes', infinite: 4 },
  'src/components/GardenGamePage.css': { domain: 'scenes', infinite: 7 },
  'src/components/GardenGrowth.css': { domain: 'scenes', infinite: 11 },
  'src/components/GardenRareVisitors.css': { domain: 'scenes', infinite: 2 },
  'src/components/GardenSeasonArt.css': { domain: 'scenes', infinite: 1 },
  'src/components/RemoteCoupleGames.css': { domain: 'scenes', infinite: 1 },
});

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
  return counts;
}

export function scanTs(text) {
  const counts = emptyCounts();
  const source = blankTsComments(text);
  counts.keyframes = (source.match(/@keyframes\b/g) ?? []).length;
  counts.animate = (source.match(/\.animate\s*\(/g) ?? []).length;
  counts['animation-literal'] = (source.match(/cubic-bezier\(/g) ?? []).length;
  counts.infinite = (
    source.match(/iterations\s*:\s*(?:Number\.POSITIVE_)?Infinity\b/g) ?? []
  ).length;
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

function kind(path) {
  return path.endsWith('.css') ? 'css' : 'ts';
}

/**
 * Compare observed counts with the allowlist.
 * @param {Map<string, Record<string, number>>} observed counts per file
 * @param {Record<string, Record<string, number>>} allowlist
 * @returns {string[]} violations
 */
export function compare(observed, allowlist, loops = REGISTERED_LOOPS) {
  const errors = [];
  for (const [path, loop] of Object.entries(loops)) {
    const have = observed.get(path)?.infinite ?? 0;
    if (have !== loop.infinite)
      errors.push(
        `${path}: ${have} infinite loops, but ${loop.infinite} are registered for the ${loop.domain} domain. Update REGISTERED_LOOPS only with a reviewed domain loop (Motion Contract 4.8).`,
      );
  }
  const listed = Object.keys(allowlist);
  for (const type of ['css', 'ts']) {
    const count = listed.filter((path) => kind(path) === type).length;
    if (count > BASELINE_FILE_LIMIT[type])
      errors.push(
        `allowlist: ${count} ${type} files exceed the baseline of ${BASELINE_FILE_LIMIT[type]}; the allowlist may only shrink`,
      );
  }
  for (const [path, counts] of observed) {
    const allowed = allowlist[path] ?? {};
    for (const rule of RULES) {
      // Registered domain loops are checked exactly above.
      const have =
        rule === 'infinite' && loops[path]
          ? Math.max(0, (counts[rule] ?? 0) - loops[path].infinite)
          : (counts[rule] ?? 0);
      const limit = allowed[rule] ?? 0;
      if (have > limit)
        errors.push(
          allowlist[path]
            ? `${path}: ${rule} ${have} > allowlisted ${limit}. Use the motion layer (src/motion/) instead of adding ad-hoc motion.`
            : `${path}: ${rule} ${have}. Ad-hoc motion is not allowed outside src/motion/ (Motion Contract M14); use the motion layer.`,
        );
    }
  }
  for (const path of listed) {
    const counts = observed.get(path) ?? emptyCounts();
    for (const rule of RULES) {
      const have =
        rule === 'infinite' && loops[path]
          ? Math.max(0, (counts[rule] ?? 0) - loops[path].infinite)
          : (counts[rule] ?? 0);
      const limit = allowlist[path][rule] ?? 0;
      if (have < limit)
        errors.push(
          `${path}: ${rule} fell to ${have} (allowlisted ${limit}). Lower the allowlist: node scripts/check-motion-layer.mjs --shrink`,
        );
    }
  }
  return errors;
}

/** The allowlist lowered to the observed counts; it never raises a count. */
export function shrink(observed, allowlist, loops = REGISTERED_LOOPS) {
  const next = {};
  for (const path of Object.keys(allowlist).sort()) {
    const counts = observed.get(path) ?? emptyCounts();
    const entry = {};
    for (const rule of RULES) {
      const seen =
        rule === 'infinite' && loops[path]
          ? Math.max(0, (counts[rule] ?? 0) - loops[path].infinite)
          : (counts[rule] ?? 0);
      const value = Math.min(seen, allowlist[path][rule] ?? 0);
      if (value > 0) entry[rule] = value;
    }
    if (Object.keys(entry).length > 0) next[path] = entry;
  }
  return next;
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

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const allowlistPath = join(root, 'scripts', 'motion-layer-allowlist.json');
  const document = JSON.parse(readFileSync(allowlistPath, 'utf8'));
  const observed = scanTree(root);
  if (process.argv.includes('--shrink')) {
    document.files = shrink(observed, document.files);
    writeFileSync(allowlistPath, `${JSON.stringify(document, null, 2)}\n`);
  }
  const errors = compare(observed, document.files);
  if (errors.length > 0) {
    console.error(`Motion layer guard failed (${errors.length}):`);
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }
  const listed = Object.keys(document.files);
  console.log(
    `Motion layer guard passed: ${listed.filter((p) => kind(p) === 'css').length} CSS and ${listed.filter((p) => kind(p) === 'ts').length} TS files remain on the ratchet allowlist.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main();

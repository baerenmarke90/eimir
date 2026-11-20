import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BASELINE_FILE_LIMIT,
  compare,
  isScanned,
  REGISTERED_LOOPS,
  scanCss,
  scanTree,
  scanTs,
  shrink,
} from './check-motion-layer.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const allowlist = JSON.parse(
  readFileSync(join(root, 'scripts', 'motion-layer-allowlist.json'), 'utf8'),
).files;

function observed(entries) {
  return new Map(entries);
}

describe('motion layer guard', () => {
  it('passes on the current tree with the ratchet allowlist', () => {
    expect(compare(scanTree(root), allowlist)).toEqual([]);
  });

  it('rejects a new ad-hoc @keyframes in a feature stylesheet', () => {
    const counts = scanCss(
      '.wir-new { animation: wir-new-pop var(--duration-context) var(--easing-enter); }\n@keyframes wir-new-pop { from { opacity: 0; } }',
    );
    expect(counts.keyframes).toBe(1);
    const errors = compare(
      observed([['src/components/WirNewThing.css', counts]]),
      allowlist,
    );
    expect(errors.join('\n')).toMatch(
      /WirNewThing\.css: keyframes 1\. Ad-hoc motion is not allowed/,
    );
  });

  it('rejects a new Element.animate() call in a feature module', () => {
    const counts = scanTs(
      'export function pop(node: HTMLElement) {\n  node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 });\n}',
    );
    expect(counts.animate).toBe(1);
    const errors = compare(
      observed([['src/components/newPop.ts', counts]]),
      allowlist,
    ).filter((error) => error.startsWith('src/components/newPop.ts'));
    expect(errors).toEqual([
      'src/components/newPop.ts: animate 1. Ad-hoc motion is not allowed outside src/motion/ (Motion Contract M14); use the motion layer.',
    ]);
  });

  it('has an empty allowlist once the bounded domains moved (#2079)', () => {
    expect(allowlist).toEqual({});
  });

  it('rejects one more animation in an allowlisted file', () => {
    const path = 'src/components/Listed.css';
    const entry = { keyframes: 2 };
    const counts = { ...entry, keyframes: entry.keyframes + 1 };
    const errors = compare(observed([[path, counts]]), { [path]: entry }, {});
    expect(errors[0]).toMatch(/> allowlisted/);
  });

  it('requires the allowlist to shrink when a file loses motion', () => {
    const path = 'src/components/Shrinking.css';
    const errors = compare(
      observed([[path, { keyframes: 1 }]]),
      { [path]: { keyframes: 2 } },
      {},
    );
    expect(errors[0]).toMatch(/fell to 1 .*--shrink/);
    expect(shrink(observed([]), { [path]: { keyframes: 2 } })).toEqual({});
    expect(
      shrink(observed([[path, { keyframes: 3 }]]), {
        [path]: { keyframes: 2 },
      }),
    ).toEqual({ [path]: { keyframes: 2 } });
  });

  it('never lets the allowlist grow past the baseline', () => {
    const grown = { ...allowlist };
    for (let index = 0; index <= BASELINE_FILE_LIMIT.ts; index += 1)
      grown[`src/components/extra${index}.ts`] = { animate: 1 };
    expect(compare(observed([]), grown).join('\n')).toMatch(
      /exceed the baseline/,
    );
  });

  it('counts infinite loops, layout keyframes and literal timing in animations', () => {
    const counts = scanCss(`
      /* @keyframes in a comment does not count */
      .a { animation: spin 1.6s cubic-bezier(0.2, 0, 0, 1) infinite; }
      .b { animation-duration: var(--duration-context); animation-delay: 0ms; }
      @keyframes grow { from { max-height: 0; opacity: 0; } to { max-height: 20rem; } }
    `);
    expect(counts).toMatchObject({
      keyframes: 1,
      infinite: 1,
      'layout-keyframes': 2,
      'animation-literal': 2,
    });
  });

  it('allows infinite loops only as registered domain loops, counted exactly', () => {
    const [path, loop] = Object.entries(REGISTERED_LOOPS)[0];
    expect(loop.domain).toBe('scenes');
    expect(
      compare(
        observed([[path, { infinite: loop.infinite }]]),
        {},
        {
          [path]: loop,
        },
      ),
    ).toEqual([]);
    expect(
      compare(
        observed([[path, { infinite: loop.infinite + 1 }]]),
        {},
        {
          [path]: loop,
        },
      ).join(' | '),
    ).toMatch(/infinite loops, but .* registered for the scenes domain/);
    expect(
      compare(
        observed([[path, { infinite: loop.infinite - 1 }]]),
        {},
        {
          [path]: loop,
        },
      ).join(' | '),
    ).toMatch(/registered for the scenes domain/);
    expect(
      compare(
        observed([['src/components/NewLoop.css', { infinite: 1 }]]),
        {},
        { [path]: loop },
      ).join(' | '),
    ).toMatch(/NewLoop\.css: infinite 1\. Ad-hoc motion is not allowed/);
  });

  it('exempts the motion layer and tests', () => {
    expect(isScanned('src/motion/motion.css')).toBe(false);
    expect(isScanned('src/motion/run.ts')).toBe(false);
    expect(isScanned('src/components/Foo.test.tsx')).toBe(false);
    expect(isScanned('src/components/Foo.css')).toBe(true);
    expect(isScanned('src/components/foo.ts')).toBe(true);
  });
});

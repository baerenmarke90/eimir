import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BLOCKED_ANIMATION_LIBRARIES,
  blockedImports,
  blockedLockfilePackages,
  blockedManifestDependencies,
  checkDependencies,
  compare,
  isScanned,
  REGISTERED_LAYOUT_TRANSITIONS,
  REGISTERED_LOOPS,
  REGISTERED_POINTER_TRACKING,
  REGISTRATIONS,
  scanCss,
  scanTree,
  scanTs,
} from './check-motion-layer.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function observed(entries) {
  return new Map(entries);
}

/** The current tree plus one new file, against the real registrations. */
function withTree(path, counts) {
  const tree = scanTree(root);
  tree.set(path, counts);
  return tree;
}

describe('motion layer guard', () => {
  it('passes on the current tree', () => {
    expect(compare(scanTree(root))).toEqual([]);
    expect(checkDependencies(root)).toEqual([]);
  });

  it('has no ratchet allowlist any more (#2080)', () => {
    expect(
      existsSync(join(root, 'scripts', 'motion-layer-allowlist.json')),
    ).toBe(false);
  });

  it('rejects a new ad-hoc @keyframes in a feature stylesheet', () => {
    const counts = scanCss(
      '.wir-new { animation: wir-new-pop var(--duration-context) var(--easing-enter); }\n@keyframes wir-new-pop { from { opacity: 0; } }',
    );
    expect(counts.keyframes).toBe(1);
    expect(compare(withTree('src/components/WirNewThing.css', counts))).toEqual(
      [
        'src/components/WirNewThing.css: keyframes 1. Ad-hoc motion is not allowed outside src/motion/ (Motion Contract M14); use the motion layer.',
      ],
    );
  });

  it('rejects a new Element.animate() call in a feature module', () => {
    const counts = scanTs(
      'export function pop(node: HTMLElement) {\n  node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 });\n}',
    );
    expect(counts.animate).toBe(1);
    expect(compare(withTree('src/components/newPop.ts', counts))).toEqual([
      'src/components/newPop.ts: animate 1. Ad-hoc motion is not allowed outside src/motion/ (Motion Contract M14); use the motion layer.',
    ]);
  });

  it('rejects ad-hoc motion even in a file that has a registration for another rule', () => {
    const [path] = Object.keys(REGISTERED_LOOPS);
    const counts = scanCss(
      `.a { animation: eimir-motion-x var(--duration-context) infinite; }
       .a { animation: eimir-motion-x var(--duration-context) infinite; }
       .a { animation: eimir-motion-x var(--duration-context) infinite; }
       .a { animation: eimir-motion-x var(--duration-context) infinite; }
       @keyframes local-pop { to { opacity: 1; } }`,
    );
    const errors = compare(observed([[path, counts]]), {
      infinite: { [path]: { use: 'scenes', count: 4 } },
    });
    expect(errors).toEqual([
      `${path}: keyframes 1. Ad-hoc motion is not allowed outside src/motion/ (Motion Contract M14); use the motion layer.`,
    ]);
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
    expect(loop.use).toBe('scenes');
    const registrations = { infinite: { [path]: loop } };
    expect(
      compare(observed([[path, { infinite: loop.count }]]), registrations),
    ).toEqual([]);
    for (const count of [loop.count + 1, loop.count - 1])
      expect(
        compare(observed([[path, { infinite: count }]]), registrations).join(
          ' | ',
        ),
      ).toMatch(/infinite, but .* are registered \(scenes\)/);
    expect(
      compare(
        observed([['src/components/NewLoop.css', { infinite: 1 }]]),
        registrations,
      ).join(' | '),
    ).toMatch(/NewLoop\.css: infinite 1\. Ad-hoc motion is not allowed/);
  });

  it('counts layout transitions once per declaration, including `all`', () => {
    expect(
      scanCss(`
        .a { transition: opacity var(--duration-context) var(--easing-standard); }
        .b { transition: height var(--duration-context) var(--easing-standard),
             margin-top var(--duration-context) var(--easing-standard); }
        .c { transition: all var(--duration-feedback) var(--easing-standard); }
        .d { transition-property: grid-template-rows, opacity; }
        .e { transition: translate var(--duration-transition) var(--easing-standard); }
      `)['layout-transition'],
    ).toBe(3);
  });

  it('allows layout transitions only in the registered disclose uses', () => {
    const counts = scanCss(
      '.planen-new { transition: width var(--duration-transition) var(--easing-standard); }',
    );
    expect(compare(withTree('src/components/PlanenNew.css', counts))).toEqual([
      'src/components/PlanenNew.css: layout-transition 1. Ad-hoc motion is not allowed outside src/motion/ (Motion Contract M14); use the motion layer.',
    ]);
    const [path, entry] = Object.entries(REGISTERED_LAYOUT_TRANSITIONS)[0];
    expect(entry.use).toBe('disclose');
    expect(
      compare(observed([[path, { 'layout-transition': entry.count + 1 }]]), {
        'layout-transition': { [path]: entry },
      }).join(' | '),
    ).toMatch(/layout-transition, but .* registered \(disclose\)/);
  });

  it('counts pointer tracking by listener and React handler', () => {
    const counts = scanTs(`
      function onPointerMove(event) {}
      const onTouchMove = () => {};
      element.addEventListener('pointermove', onPointerMove);
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      element.removeEventListener('pointermove', onPointerMove);
      const view = <div onPointerMove={onPointerMove} onTouchMoveCapture={onTouchMove} />;
      const props = { onPointerMove: (event) => event };
      // element.addEventListener('mousemove', ignored);
    `);
    expect(counts['pointer-tracking']).toBe(5);
  });

  it('allows pointer tracking only in registered gesture owners and pointer input', () => {
    const counts = scanTs(
      'export function track(node: HTMLElement) {\n  node.addEventListener("pointermove", (event) => { node.style.translate = event.clientX + "px"; });\n}',
    );
    expect(compare(withTree('src/components/newSwipe.ts', counts))).toEqual([
      'src/components/newSwipe.ts: pointer-tracking 1. Ad-hoc motion is not allowed outside src/motion/ (Motion Contract M14); use the motion layer.',
    ]);
    for (const entry of Object.values(REGISTERED_POINTER_TRACKING))
      expect(['gesture', 'input']).toContain(entry.use);
  });

  it('requires a registration to be removed when its use is gone', () => {
    const errors = compare(observed([]), REGISTRATIONS);
    expect(errors.length).toBe(
      Object.values(REGISTRATIONS).reduce(
        (sum, registry) => sum + Object.keys(registry).length,
        0,
      ),
    );
    expect(
      errors.every((error) => /: 0 .*, but \d+ are registered/.test(error)),
    ).toBe(true);
  });

  it('rejects animation-library dependencies, lockfile packages and imports', () => {
    expect(BLOCKED_ANIMATION_LIBRARIES).toEqual([
      'motion',
      'framer-motion',
      'motion-plus*',
      'gsap',
      'animejs',
    ]);
    expect(
      blockedManifestDependencies({
        dependencies: { react: '19.0.0', motion: '12.0.0' },
        devDependencies: { 'motion-plus-react': '1.0.0', vitest: '3.0.0' },
        optionalDependencies: { gsap: '3.12.0' },
      }),
    ).toEqual(['gsap', 'motion', 'motion-plus-react']);
    expect(
      blockedLockfilePackages({
        packages: {
          '': {},
          'node_modules/react': {},
          'node_modules/foo/node_modules/framer-motion': {},
          'node_modules/animejs': {},
          'node_modules/motion-dom-utils-unrelated': {},
        },
      }),
    ).toEqual(['animejs', 'framer-motion']);
    expect(
      blockedImports(`
        import { animate } from 'motion/react';
        import gsap from "gsap";
        const anime = await import('animejs');
        import { run } from '../motion/run';
        import { useReducedMotion } from './motion';
        // import { motion } from 'framer-motion';
      `),
    ).toEqual(['animejs', 'gsap', 'motion/react']);
  });

  it('exempts the motion layer and tests', () => {
    expect(isScanned('src/motion/motion.css')).toBe(false);
    expect(isScanned('src/motion/run.ts')).toBe(false);
    expect(isScanned('src/components/Foo.test.tsx')).toBe(false);
    expect(isScanned('src/components/Foo.css')).toBe(true);
    expect(isScanned('src/components/foo.ts')).toBe(true);
  });
});

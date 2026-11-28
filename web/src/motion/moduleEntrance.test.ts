import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Enter `module` (Motion Contract 4.1, Product Owner 2026-11-26): every
 * module of a primary page enters the same way, on every page. These checks
 * read the stylesheets that animate modules and require the one look: the
 * module rises by `--motion-module-rise` while it fades in, over
 * `--duration-module-enter`, with `--easing-enter`, the modules one
 * `--duration-stagger-item` apart.
 */

const src = join(__dirname, '..');
const read = (path: string) =>
  readFileSync(join(src, path), 'utf8').replace(/\s+/g, ' ');

const LOOK = 'var(--duration-module-enter) var(--easing-enter)';

describe('Enter module: one entrance for the modules of every page', () => {
  it('Momente, Planen, Listen and Mehr rise with the module look', () => {
    const layout = read('layout.css');
    expect(layout).toContain(
      `.page[data-motion-stage="playing"] > :not(.page-heading) { --motion-stage-rise: var(--motion-module-rise); animation: eimir-motion-root-rise ${LOOK}`,
    );
    expect(layout).toContain('var(--duration-stagger-item)');
    expect(layout).not.toContain('--motion-stage-rise: 0.9rem');
  });

  it('a segment panel keeps its own fade under the same module rise', () => {
    expect(read('layout.css')).toContain(
      `eimir-motion-root-rise ${LOOK} var(--root-intro-delay`,
    );
  });

  it('the Wir modules rise as one module with the module look', () => {
    const wir = read('components/WirMotion.css');
    expect(wir).toContain(
      '.today-section[data-wir-reveal="pending"] { opacity: 0; translate: 0 var(--motion-module-rise); }',
    );
    expect(wir).toContain(
      '.today-section[data-wir-reveal="shown"] { --motion-enter-rise: var(--motion-module-rise); animation: eimir-motion-enter-rise calc(var(--duration-module-enter) * var(--wir-reveal-scale, 1)) var(--easing-enter) var(--wir-reveal-delay) both; }',
    );
    // No module enters in parts (a heading, a body, single dates).
    expect(wir).not.toContain(
      '[data-wir-reveal="shown"] .today-section-header',
    );
    expect(wir).not.toContain('[data-wir-reveal="shown"] .today-section-body');
    expect(wir).not.toContain('.today-agenda-list > * { animation');
  });

  it('a Wir module that replaces its placeholder arrives with the module look', () => {
    expect(read('components/TodayPage.css')).toContain(
      `.today-module-reveal { --motion-enter-rise: var(--motion-module-rise); animation: eimir-motion-enter-rise ${LOOK} both; }`,
    );
  });

  it('a memory world arrives with the module look', () => {
    const world = read('components/memoryWorlds/WorldEnter.css');
    expect(world).toContain(
      `.memory-world-enter { transition: opacity ${LOOK}, translate ${LOOK}; }`,
    );
    expect(world).toContain('translate: 0 var(--motion-module-rise);');
    expect(world).not.toContain('14px');
  });

  it('the first item of an empty area arrives like a module before its glow', () => {
    const settle = read('components/FirstContentSettle.css');
    expect(settle).toContain(
      '--motion-enter-from: 0 var(--motion-module-rise);',
    );
    expect(settle).toContain('--motion-enter-from-scale: 1;');
    expect(settle).toContain(`eimir-motion-enter-arrive ${LOOK} both`);
    expect(settle).toContain(
      'eimir-motion-feedback-glow var(--duration-gesture-moment) var(--easing-standard) var(--duration-module-enter) both',
    );
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AppDesignError,
  buildAppDesigns,
  contrastRatio,
  validateDesign,
} from './app-designs.mjs';

const tokens = JSON.parse(
  readFileSync(new URL('../../design/tokens.json', import.meta.url), 'utf8'),
);
const designDirectory = new URL('../../design/designs/', import.meta.url);
const designs = Object.fromEntries(
  readdirSync(designDirectory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => [
      name.slice(0, -'.json'.length),
      JSON.parse(readFileSync(new URL(name, designDirectory), 'utf8')),
    ]),
);

function design(overrides = {}) {
  return { ...designs.warm, id: 'sample', ...overrides };
}

describe('app design token sets', () => {
  it('builds every design file in design/designs', () => {
    const { css, registry } = buildAppDesigns(tokens, designs);
    for (const id of Object.keys(designs)) {
      expect(css).toContain(`[data-design-preview="${id}"]`);
      expect(registry).toContain(`${id}: {`);
    }
  });

  it('keeps the default design on the root tokens and emits no scoped block for it', () => {
    const { css } = buildAppDesigns(tokens, designs);
    expect(css).not.toContain('[data-app-design="connected"]');
    expect(css).toMatch(
      /:root \{\n {2}--font-heading-family: var\(--font-ui\);\n {2}--design-backdrop-glow: var\(--color-brand-glow\);\n\}/,
    );
  });

  it('applies a non-default design to Light, explicit Dark and system Dark', () => {
    const { css } = buildAppDesigns(tokens, designs);
    expect(css).toContain(':root[data-app-design="warm"] .today-page {');
    expect(css).toContain(
      ':root[data-theme="dark"][data-app-design="warm"] .today-page {',
    );
    expect(css).toContain(
      ':root:not([data-theme])[data-app-design="warm"] .today-page {',
    );
  });

  it('lets a design on the default colour world inherit the root palette', () => {
    const { css } = buildAppDesigns(tokens, designs);
    expect(css).toContain(':root[data-app-design="modern"] .today-page {');
    expect(css).not.toContain('[data-theme="dark"][data-app-design="modern"]');
  });

  it('never lets a design change the create action colour', () => {
    const { css } = buildAppDesigns(tokens, designs);
    expect(css).not.toContain('--color-action-primary');
    expect(css).not.toContain('--person-');
  });

  it('rejects unknown fields and values outside the presets', () => {
    expect(() =>
      validateDesign(design({ buttons: 'round' }), tokens),
    ).toThrowError(AppDesignError);
    expect(() =>
      validateDesign(design({ layout: 'dashboard' }), tokens),
    ).toThrowError(/layout/);
    expect(() =>
      validateDesign(design({ shape: 'blob' }), tokens),
    ).toThrowError(/shape/);
    expect(() =>
      validateDesign(
        design({ icon: { stroke: 3, accent: 'duotone' } }),
        tokens,
      ),
    ).toThrowError(/icon.stroke/);
  });

  it('rejects a palette below WCAG contrast', () => {
    const light = { ...tokens.identity.colorWorlds.warm.light };
    const weak = { ...light, mutedText: '#C9B8C4' };
    expect(contrastRatio(weak.mutedText, weak.page)).toBeLessThan(4.5);
    expect(() =>
      validateDesign(
        design({
          color: { light: weak, dark: tokens.identity.colorWorlds.warm.dark },
        }),
        tokens,
      ),
    ).toThrowError(/light mutedText on page/);
  });

  it('keeps motion presets out of reduced motion', () => {
    const { css } = buildAppDesigns(tokens, {
      ...designs,
      sample: design({ motion: 'calm' }),
    });
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{\n {2}:root\[data-app-design="sample"\] \.today-page \{\n {4}--duration-feedback: 150ms;/,
    );
  });

  it('requires one file per id', () => {
    expect(() =>
      buildAppDesigns(tokens, { ...designs, other: design() }),
    ).toThrowError(/design\/designs\/sample.json/);
  });
});

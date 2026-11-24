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

  it('applies a design app-wide in Light, explicit Dark and system Dark', () => {
    const { css } = buildAppDesigns(tokens, designs);
    expect(css).not.toContain('.today-page');
    expect(css).not.toContain('body:has(');
    for (const prefix of [
      ':root',
      ':root[data-theme="dark"]',
      ':root:not([data-theme])',
    ])
      expect(css).toContain(
        `${prefix}[data-app-palette="warm"],\n${prefix}[data-app-palette="warm"] [data-color-world] {`,
      );
  });

  it('lets a design on the default colour world inherit the root palette and contextual worlds', () => {
    const { css } = buildAppDesigns(tokens, designs);
    expect(css).toContain(':root[data-app-design="modern"] {');
    expect(css).not.toContain('[data-app-palette="modern"]');
    expect(css).not.toContain('[data-app-palette="connected"]');
  });

  it('keeps the palette rules independent of layout presets and groups shared colours', () => {
    const { css, registry } = buildAppDesigns(tokens, designs);
    const palette = css
      .split(':root[data-app-palette="warm"],')[1]
      .split('}')[0];
    const presets = css
      .split(':root[data-app-design="warm"] {')[1]
      .split('}')[0];
    expect(palette).toContain('--color-background: #FFF9F6;');
    expect(palette).not.toContain('--font-heading-family');
    expect(presets).toContain('--font-heading-family: var(--font-display);');
    expect(presets).not.toContain('--color-background');
    const choices = registry.match(/APP_PALETTE_IDS = \[([^\]]+)\]/)?.[1];
    expect(choices).toContain('"connected"');
    expect(choices).not.toContain('"classic"');
    expect(choices).not.toContain('"modern"');
  });

  it('gives each design its action colour and keeps the canonical blue for Verbunden', () => {
    const { css } = buildAppDesigns(tokens, designs);
    const block = (selector) => {
      const start = css.indexOf(selector);
      return css.slice(start, css.indexOf('}', start));
    };
    // Verbunden keeps today's blue from the product roles.
    expect(block('[data-design-preview="connected"]')).toContain(
      '--color-action-primary: #3055B8;',
    );
    expect(block(':root[data-app-palette="warm"],')).toContain(
      '--color-action-primary: #974A76;',
    );
    expect(block(':root[data-app-palette="shared_album"],')).toContain(
      '--color-action-primary: #143C34;',
    );
    expect(css).not.toContain('--person-');
  });

  it('lets an explicit action colour override the derived one and checks it', () => {
    const { light, dark } = designs.shared_album.color;
    const { css } = buildAppDesigns(tokens, {
      ...designs,
      sample: design({
        color: { light: { ...light, actionPrimary: '#245C51' }, dark },
      }),
    });
    expect(css).toContain('--color-action-primary: #245C51;');
    expect(() =>
      validateDesign(
        design({
          color: { light: { ...light, actionPrimary: '#E5ECDB' }, dark },
        }),
        tokens,
      ),
    ).toThrowError(
      /light (onActionPrimary on actionPrimary|actionPrimary on page)/,
    );
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
      /@media \(prefers-reduced-motion: no-preference\) \{\n {2}:root\[data-app-design="sample"\] \{\n {4}--duration-feedback: 150ms;/,
    );
  });

  it('lets optional fine roles replace the derived value once', () => {
    const { css } = buildAppDesigns(tokens, designs);
    const album = css.slice(
      css.indexOf(':root[data-app-palette="shared_album"],'),
    );
    const firstBlock = album.slice(0, album.indexOf('}'));
    expect(firstBlock.match(/--color-border-subtle:/g)).toHaveLength(1);
    expect(firstBlock).toContain('--color-border-subtle: #CBD1C1;');
    expect(firstBlock).toContain('--design-decoration: #123A33;');
  });

  it('rejects unknown colour roles and weak fine-role contrast', () => {
    const { light, dark } = designs.shared_album.color;
    expect(() =>
      validateDesign(
        design({ color: { light: { ...light, sparkle: '#FFFFFF' }, dark } }),
        tokens,
      ),
    ).toThrowError(/sparkle is not a colour role/);
    expect(() =>
      validateDesign(
        design({
          color: { light: { ...light, onDecoration: '#20403A' }, dark },
        }),
        tokens,
      ),
    ).toThrowError(/light onDecoration on decoration/);
  });

  it('lets a design adjust single roles of a colour world', () => {
    const { css } = buildAppDesigns(tokens, designs);
    const geborgen = css.slice(css.indexOf(':root[data-app-palette="warm"],'));
    expect(geborgen.slice(0, geborgen.indexOf('}'))).toContain(
      '--color-text-secondary: #6E5969;',
    );
    expect(() =>
      validateDesign(
        design({ color: { world: 'warm', light: { glitter: '#FFFFFF' } } }),
        tokens,
      ),
    ).toThrowError(/glitter is not a colour role/);
  });

  it('lets a design follow the app icon stroke with "standard"', () => {
    expect(() =>
      validateDesign(
        design({ icon: { stroke: 'standard', accent: 'duotone' } }),
        tokens,
      ),
    ).not.toThrow();
    const { css } = buildAppDesigns(tokens, designs);
    expect(css).not.toContain('--icon-stroke-width');
  });

  it('requires one file per id', () => {
    expect(() =>
      buildAppDesigns(tokens, { ...designs, other: design() }),
    ).toThrowError(/design\/designs\/sample.json/);
  });
});

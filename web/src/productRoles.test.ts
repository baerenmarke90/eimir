import { describe, expect, it } from 'vitest';

type NodeProcess = {
  getBuiltinModule(name: 'fs'): {
    readFileSync(path: URL, encoding: 'utf8'): string;
  };
};

function readSource(path: string): string {
  const processRef = (
    globalThis as typeof globalThis & { process?: NodeProcess }
  ).process;
  if (!processRef) throw new Error('Node process API is unavailable.');
  return processRef
    .getBuiltinModule('fs')
    .readFileSync(new URL(path, import.meta.url), 'utf8');
}

const tokens = JSON.parse(readSource('../../design/tokens.json'));
const css = readSource('./design/product-roles.css');
const root = css.match(/:root \{([^}]+)\}/)?.[1] ?? '';

function property(name: string, block = root): string {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Missing product role: ${name}`);
  return match[1].trim();
}

function resolvedColor(scheme: 'light' | 'dark', role: string): string {
  const value = tokens.color.scheme[scheme][role].$value;
  if (value.startsWith('{color.semantic.')) {
    return tokens.color.semantic[value.slice(16, -1)].$value.toLowerCase();
  }
  return value.toLowerCase();
}

function contrast(first: string, second: string): number {
  function luminance(hex: string): number {
    const channels = [1, 3, 5].map((offset) => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  const values = [luminance(first), luminance(second)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

describe('Product Reference v1 visual roles', () => {
  it('keeps content type and UI typography distinct without a second size scale', () => {
    const heading = tokens.typography.heading2.$value;
    const sizeRem = Number.parseFloat(heading.fontSize) / 16;
    expect(property('font-personal-heading')).toBe(
      `${tokens.font.weight.semibold.$value} ${sizeRem}rem / ${heading.lineHeight} "Literata", "Georgia", serif`,
    );
    expect(property('font-utility-heading')).toBe(
      `${tokens.font.weight.semibold.$value} ${sizeRem}rem / ${heading.lineHeight} "Instrument Sans", "Arial", sans-serif`,
    );
    expect(property('font-content-heading')).toContain('"Literata"');
    expect(property('font-section-heading')).toContain('"Instrument Sans"');
    expect(property('font-reading-body')).toContain('1rem / 1.5');
    expect(property('font-supporting-copy')).toContain('0.875rem / 1.45');
    expect(property('tracking-personal-heading')).toBe(heading.letterSpacing);
  });

  it('maps meaningful image, content and sheet shapes to the existing JSON scale', () => {
    for (const [role, token] of [
      ['radius-media', 'large'],
      ['radius-content', 'card'],
      ['radius-sheet-top', 'sheet'],
    ]) {
      expect(property(role)).toBe(
        `${Number.parseFloat(tokens.radius[token].$value) / 16}rem`,
      );
    }
    expect(property('elevation-overlay')).toContain(
      'var(--color-shadow-overlay)',
    );
  });

  it('shares the narrow gutter alias and breakpoint across viewport and container paths', () => {
    expect(tokens.layout.mobileGutterNarrow.$value).toBe('{spacing.4}');
    expect(property('page-gutter-narrow')).toBe(tokens.spacing['4'].$value);
    expect(property('page-gutter-comfortable')).toBe(
      tokens.layout.mobileGutter.$value,
    );
    const threshold = tokens.layout.breakpoint.compactComfortableMin.$value;
    expect(css).toContain(`@media (min-width: ${threshold})`);
    expect(css).toContain(`@container product-shell (width < ${threshold})`);
    expect(css).toContain(`@container product-shell (width >= ${threshold})`);
    for (const path of ['./shell.css', './product-reflow.css']) {
      expect(readSource(path)).toContain(
        'width: calc(100% - 2 * var(--page-gutter));',
      );
    }
  });

  it('keeps links readable on actual base surfaces while preserving primary action colors', () => {
    const dark = css.match(/:root\[data-theme="dark"\] \{([^}]+)\}/)?.[1] ?? '';
    expect(property('color-link-text')).toBe(
      resolvedColor('light', 'brandStrong'),
    );
    expect(property('color-link-text', dark)).toBe(
      resolvedColor('dark', 'brand'),
    );
    for (const scheme of ['light', 'dark'] as const) {
      const link = property(
        'color-link-text',
        scheme === 'light' ? root : dark,
      );
      for (const surface of [
        'background',
        'surface',
        'surfaceSubtle',
        'surfaceRaised',
      ]) {
        expect(
          contrast(link, resolvedColor(scheme, surface)),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(
            resolvedColor(scheme, 'textSecondary'),
            resolvedColor(scheme, surface),
          ),
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(
          resolvedColor(scheme, 'onAccent'),
          resolvedColor(scheme, 'brandStrong'),
        ),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(css).not.toContain('--color-text-secondary:');
    expect(css).not.toContain('--color-brand-strong:');
  });

  it('uses current motion tokens and removes movement duration under reduced motion', () => {
    const reduced = css.slice(
      css.indexOf('@media (prefers-reduced-motion: reduce)'),
    );
    for (const [role, token] of [
      ['duration-feedback', 'fast'],
      ['duration-transition', 'standard'],
      ['duration-context', 'emphasized'],
    ]) {
      expect(property(role)).toBe(tokens.motion.duration[token].$value);
      expect(property(role, reduced)).toBe(
        tokens.motion.duration.instant.$value,
      );
    }
    expect(
      readSource('./main.tsx').indexOf("import './design/product-roles.css';"),
    ).toBeGreaterThan(
      readSource('./main.tsx').indexOf("import './theme.css';"),
    );
  });
});

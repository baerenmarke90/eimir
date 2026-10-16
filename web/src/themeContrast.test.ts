import { describe, expect, it } from 'vitest';

type NodeFs = {
  readFileSync(path: URL, encoding: 'utf8'): string;
};

type NodeProcess = {
  getBuiltinModule(name: 'fs'): NodeFs;
};

function readSource(relativePath: string): string {
  const processRef = (
    globalThis as typeof globalThis & { process?: NodeProcess }
  ).process;
  if (!processRef)
    throw new Error('Node process API is unavailable in the test run.');
  return processRef
    .getBuiltinModule('fs')
    .readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function normalizeHex(hex: string): string {
  const value = hex.replace('#', '');
  if (value.length === 3 || value.length === 4) {
    return `#${value
      .slice(0, 3)
      .split('')
      .map((digit) => `${digit}${digit}`)
      .join('')}`;
  }
  return `#${value.slice(0, 6)}`;
}

function luminance(hex: string): number {
  const value = normalizeHex(hex).replace('#', '');
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return (
    0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
  );
}

function contrast(first: string, second: string): number {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssBlock(css: string, selector: string): string {
  const match = css.match(
    new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`),
  );
  if (!match) throw new Error(`CSS block is missing: ${selector}`);
  return match[1];
}

function darkThemeBlock(css: string): string {
  const match = css.match(
    /:root\[data-theme=(?:"dark"|'dark')\]\s*\{([^}]*)\}/,
  );
  if (!match) throw new Error('CSS block is missing: :root[data-theme=dark]');
  return match[1];
}

function optionalCssVariable(block: string, name: string): string | null {
  const match = block.match(
    new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6,8});`),
  );
  return match?.[1] ?? null;
}

function cssVariable(block: string, name: string): string {
  const value = optionalCssVariable(block, name);
  if (!value)
    throw new Error(`CSS variable is missing or is not a hex color: --${name}`);
  return value;
}

const themeCss = readSource('./theme.css');
const compatibilityLight = cssBlock(readSource('./styles.css'), ':root');
const explicitLight = cssBlock(themeCss, ':root');
const dark = darkThemeBlock(themeCss);
const white = '#ffffff';

function lightVariable(name: string): string {
  return (
    optionalCssVariable(explicitLight, name) ??
    cssVariable(compatibilityLight, name)
  );
}

describe('theme token contrast', () => {
  it('keeps primary and secondary text at WCAG AA across calibrated Light surfaces', () => {
    for (const surface of [
      'color-background',
      'color-surface',
      'color-surface-subtle',
      'color-surface-raised',
      'color-surface-panel',
      'color-surface-panel-tint',
      'color-surface-overlay',
    ]) {
      expect(
        contrast(lightVariable('color-text'), lightVariable(surface)),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(lightVariable('color-text-secondary'), lightVariable(surface)),
      ).toBeGreaterThanOrEqual(4.5);
    }

    expect(
      contrast(
        cssVariable(dark, 'color-text'),
        cssVariable(dark, 'color-background'),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(
        cssVariable(dark, 'color-text-secondary'),
        cssVariable(dark, 'color-surface'),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('establishes a deliberate Light ground, base, recessed, and raised ladder', () => {
    const background = lightVariable('color-background');
    const surface = lightVariable('color-surface');
    const subtle = lightVariable('color-surface-subtle');
    const raised = lightVariable('color-surface-raised');
    const border = lightVariable('color-border');

    expect(contrast(background, surface)).toBeGreaterThanOrEqual(1.07);
    expect(contrast(background, subtle)).toBeGreaterThanOrEqual(1.07);
    expect(contrast(background, raised)).toBeGreaterThanOrEqual(1.13);
    expect(contrast(surface, raised)).toBeGreaterThanOrEqual(1.05);
    expect(contrast(background, border)).toBeGreaterThanOrEqual(1.3);
  });

  it('keeps primary actions readable in both schemes', () => {
    expect(
      contrast(white, lightVariable('color-brand-strong')),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(white, cssVariable(dark, 'color-brand-strong')),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps entry copy readable across every hero gradient stop', () => {
    for (const theme of [explicitLight, dark]) {
      const foreground = cssVariable(theme, 'color-on-accent');
      for (const stop of [
        'color-entry-hero-start',
        'color-entry-hero-middle',
        'color-entry-hero-end',
      ]) {
        expect(
          contrast(foreground, cssVariable(theme, stop)),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps Discover supporting text readable across its actual identity surfaces and gradient stops', () => {
    const identityCss = readSource('./design/identity-roles.css');
    const discoverCss = readSource('./components/StoryProductPages.css');
    for (const theme of [
      cssBlock(identityCss, ':root'),
      darkThemeBlock(identityCss),
    ]) {
      for (const selector of [
        '.momente-hero-kicker',
        '.momente-tapestry-kind',
      ]) {
        const token = cssBlock(discoverCss, selector).match(
          /color:\s*var\(--([\w-]+)\)/,
        )?.[1];
        if (!token) throw new Error(`Missing foreground token for ${selector}`);
        for (const surface of [
          'color-brand-surface',
          'color-surface-raised',
          'color-surface',
        ]) {
          expect(
            contrast(cssVariable(theme, token), cssVariable(theme, surface)),
            `${selector} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      const actionToken = cssBlock(
        discoverCss,
        '.momente-stream-all-link',
      ).match(/color:\s*var\(--([\w-]+)\)/)?.[1];
      if (!actionToken)
        throw new Error('Missing Discover Timeline action foreground');
      expect(
        contrast(
          cssVariable(theme, actionToken),
          cssVariable(theme, 'color-background'),
        ),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps status text readable on its semantic surface', () => {
    expect(
      contrast(
        lightVariable('color-shared'),
        lightVariable('color-shared-surface'),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(
        lightVariable('color-error'),
        lightVariable('color-error-surface'),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(
        lightVariable('color-private'),
        cssVariable(explicitLight, 'color-private-surface-soft'),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(
        cssVariable(dark, 'color-shared'),
        cssVariable(dark, 'color-shared-surface'),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(
        cssVariable(dark, 'color-error'),
        cssVariable(dark, 'color-error-surface'),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(
        cssVariable(dark, 'color-private'),
        cssVariable(dark, 'color-private-surface-soft'),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('never uses the decorative shared accent as normal text on the shared surface', () => {
    const textColorPattern = /^\s*color:\s*var\(--color-shared-accent\)/m;
    for (const relativePath of [
      './components/TodayPage.css',
      './components/SharedPlanningSanctuary.css',
    ]) {
      expect(textColorPattern.test(readSource(relativePath))).toBe(false);
    }
  });

  it('keeps the focus indicator above 3:1 across calibrated Light surfaces', () => {
    for (const surface of [
      'color-background',
      'color-surface',
      'color-surface-subtle',
      'color-surface-raised',
      'color-surface-panel-tint',
    ]) {
      expect(
        contrast(lightVariable('color-focus'), lightVariable(surface)),
      ).toBeGreaterThanOrEqual(3);
    }

    expect(
      contrast(
        cssVariable(dark, 'color-focus'),
        cssVariable(dark, 'color-background'),
      ),
    ).toBeGreaterThanOrEqual(3);
  });
});

import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME } from './components/Brand';

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

function darkPreferenceFallbackBlock(css: string): string {
  const match = css.match(
    /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\)\s*\{([^}]*)\}/,
  );
  if (!match) {
    throw new Error(
      'CSS block is missing: @media (prefers-color-scheme: dark) :root:not([data-theme])',
    );
  }
  return match[1];
}

function cssVariable(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`CSS variable is missing: --${name}`);
  return match[1].trim();
}

function normalizeHex(hex: string): string {
  return hex.toLowerCase();
}

const tokensJson = JSON.parse(readSource('../../design/tokens.json'));
const themeCss = readSource('./theme.css');
const stylesCss = readSource('./styles.css');
const themeTs = readSource('./theme.ts');
const themeBootstrapJs = readSource('../public/theme-bootstrap.js');
const indexHtml = readSource('../index.html');
const nginxConfig = readSource('../nginx.conf');

const compatibilityLight = cssBlock(stylesCss, ':root');
const explicitLight = cssBlock(themeCss, ':root');
const explicitDark = darkThemeBlock(themeCss);
const systemDark = darkPreferenceFallbackBlock(themeCss);

const SHARED_RUNTIME_MATERIAL_ROLES = [
  ['color-background', 'background'],
  ['color-surface', 'surface'],
  ['color-surface-subtle', 'surfaceSubtle'],
  ['color-surface-raised', 'surfaceRaised'],
  ['color-surface-overlay', 'surfaceOverlay'],
  ['color-surface-panel', 'surfacePanel'],
  ['color-surface-panel-tint', 'surfacePanelTint'],
  ['color-header-surface', 'headerSurface'],
  ['color-header-border', 'headerBorder'],
  ['color-page-tint-brand', 'pageTintBrand'],
  ['color-page-tint-shared', 'pageTintShared'],
  ['color-border', 'border'],
  ['color-border-subtle', 'borderSubtle'],
  ['color-shadow-card', 'shadowCard'],
  ['color-shadow-soft', 'shadowSoft'],
  ['color-shadow-brand', 'shadowBrand'],
  ['color-shadow-overlay', 'shadowOverlay'],
] as const;

const LIGHT_RUNTIME_ROLES = [
  ...SHARED_RUNTIME_MATERIAL_ROLES,
  ['color-shimmer-base', 'skeletonBase'],
  ['color-shimmer-highlight', 'skeletonHighlight'],
] as const;

const DARK_RUNTIME_ROLES = [
  ...SHARED_RUNTIME_MATERIAL_ROLES,
  ['color-scrim', 'scrim'],
] as const;

describe('design token authority and drift enforcement', () => {
  it('enforces canonical metadata in design/tokens.json', () => {
    expect(tokensJson.meta.name).toBe('eimir. Design Tokens');
    expect(tokensJson.meta.version).toBe('2.1.0');
    expect(tokensJson.meta.status).toBe('foundation');
  });

  it('keeps every browser theme-color boundary tied to the authoritative tokens', () => {
    const lightBg = normalizeHex(
      tokensJson.color.scheme.light.background.$value,
    );
    const darkBg = normalizeHex(tokensJson.color.scheme.dark.background.$value);

    expect(themeBootstrapJs).toContain(`light: '${lightBg}'`);
    expect(themeBootstrapJs).toContain(`dark: '${darkBg}'`);
    expect(indexHtml).toContain(`name="theme-color" content="${lightBg}"`);
    expect(normalizeHex(cssVariable(explicitLight, 'color-background'))).toBe(
      lightBg,
    );
    expect(normalizeHex(cssVariable(explicitDark, 'color-background'))).toBe(
      darkBg,
    );

    expect(themeTs).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(themeTs).toContain("getPropertyValue('--color-background')");
  });

  it('keeps the synchronous external bootstrap before the React entry point', () => {
    const bootstrap = '<script src="/theme-bootstrap.js"></script>';
    const reactEntry = '<script type="module" src="/src/main.tsx"></script>';

    expect(indexHtml).toContain(bootstrap);
    expect(indexHtml).toContain(reactEntry);
    expect(indexHtml.indexOf(bootstrap)).toBeLessThan(
      indexHtml.indexOf(reactEntry),
    );
    expect(indexHtml).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
  });

  it('keeps the restrictive script CSP unchanged', () => {
    expect(nginxConfig).toContain("script-src 'self'");
    expect(nginxConfig).toContain("script-src-attr 'none'");
    expect(nginxConfig).not.toContain("'unsafe-inline'");
  });

  it('keeps styles.css compatibility fallbacks aligned with semantic defaults', () => {
    for (const [cssName, tokenName] of [
      ['color-background', 'background'],
      ['color-surface', 'surface'],
      ['color-surface-subtle', 'surfaceSubtle'],
      ['color-border', 'border'],
      ['color-border-subtle', 'borderSubtle'],
      ['color-brand', 'brand'],
      ['color-brand-strong', 'brandStrong'],
      ['color-brand-surface', 'brandSurface'],
      ['color-shared', 'shared'],
      ['color-shared-accent', 'sharedAccent'],
      ['color-shared-surface', 'sharedSurface'],
      ['color-private', 'private'],
      ['color-error', 'error'],
      ['color-error-surface', 'errorSurface'],
      ['color-focus', 'focus'],
    ] as const) {
      expect(normalizeHex(cssVariable(compatibilityLight, cssName))).toBe(
        normalizeHex(tokensJson.color.semantic[tokenName].$value),
      );
    }

    expect(cssVariable(compatibilityLight, 'content-max')).toBe(
      tokensJson.layout.contentMax.$value,
    );
    expect(cssVariable(compatibilityLight, 'reading-max')).toBe(
      tokensJson.layout.readingMax.$value,
    );
  });

  it('maps the explicit Light runtime material roles to color.scheme.light', () => {
    for (const [cssName, tokenName] of LIGHT_RUNTIME_ROLES) {
      expect(normalizeHex(cssVariable(explicitLight, cssName))).toBe(
        normalizeHex(tokensJson.color.scheme.light[tokenName].$value),
      );
    }

    expect(normalizeHex(cssVariable(explicitLight, 'color-scrim'))).toBe(
      normalizeHex(
        tokensJson.color.scheme.light.scrim.$value.replace(
          '{color.semantic.scrim}',
          tokensJson.color.semantic.scrim.$value,
        ),
      ),
    );
  });

  it('maps shared Dark material roles without changing the accepted Dark runtime palette', () => {
    for (const [cssName, tokenName] of DARK_RUNTIME_ROLES) {
      expect(normalizeHex(cssVariable(explicitDark, cssName))).toBe(
        normalizeHex(tokensJson.color.scheme.dark[tokenName].$value),
      );
    }
  });

  it('keeps the system-dark fallback identical to the explicit Dark material roles', () => {
    for (const [cssName] of DARK_RUNTIME_ROLES) {
      expect(normalizeHex(cssVariable(systemDark, cssName))).toBe(
        normalizeHex(cssVariable(explicitDark, cssName)),
      );
    }
  });

  it('keeps core Light and Dark semantic colors aligned beyond material roles', () => {
    expect(normalizeHex(cssVariable(explicitLight, 'color-brand-text'))).toBe(
      normalizeHex(tokensJson.color.semantic.brandStrong.$value),
    );
    expect(normalizeHex(cssVariable(explicitLight, 'color-brand-glow'))).toBe(
      normalizeHex(tokensJson.color.semantic.brandGlow.$value),
    );
    expect(normalizeHex(cssVariable(explicitLight, 'color-on-accent'))).toBe(
      normalizeHex(tokensJson.color.semantic.onAccent.$value),
    );

    for (const [cssName, tokenName] of [
      ['color-text', 'textPrimary'],
      ['color-text-secondary', 'textSecondary'],
      ['color-text-muted', 'textMuted'],
      ['color-brand', 'brand'],
      ['color-brand-strong', 'brandStrong'],
      ['color-brand-surface', 'brandSurface'],
      ['color-brand-glow', 'brandGlow'],
      ['color-shared', 'shared'],
      ['color-shared-accent', 'sharedAccent'],
      ['color-shared-surface', 'sharedSurface'],
      ['color-private', 'private'],
      ['color-error', 'error'],
      ['color-error-surface', 'errorSurface'],
      ['color-focus', 'focus'],
      ['color-on-accent', 'onAccent'],
      ['color-discovery', 'discovery'],
      ['color-discovery-surface', 'discoverySurface'],
    ] as const) {
      expect(normalizeHex(cssVariable(explicitDark, cssName))).toBe(
        normalizeHex(tokensJson.color.scheme.dark[tokenName].$value),
      );
    }
  });

  it('keeps discovery + discoverySurface mapped in every runtime path', () => {
    expect(
      normalizeHex(cssVariable(compatibilityLight, 'color-discovery')),
    ).toBe(normalizeHex(tokensJson.color.semantic.discovery.$value));
    expect(
      normalizeHex(cssVariable(compatibilityLight, 'color-discovery-surface')),
    ).toBe(normalizeHex(tokensJson.color.semantic.discoverySurface.$value));

    expect(normalizeHex(cssVariable(systemDark, 'color-discovery'))).toBe(
      normalizeHex(cssVariable(explicitDark, 'color-discovery')),
    );
    expect(
      normalizeHex(cssVariable(systemDark, 'color-discovery-surface')),
    ).toBe(normalizeHex(cssVariable(explicitDark, 'color-discovery-surface')));
  });

  it('exports canonical brand name eimir.', () => {
    expect(PRODUCT_NAME).toBe('eimir.');
  });
});

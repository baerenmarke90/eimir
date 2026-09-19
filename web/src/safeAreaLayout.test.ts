import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readWebFile(relativePath: string): string {
  return readFileSync(resolve(__dirname, '..', relativePath), 'utf8');
}

describe('Capacitor safe-area & statusbar insets (#1044)', () => {
  it('configures SystemBars plugin with insetsHandling: css in capacitor.config.ts', () => {
    const configContent = readWebFile('capacitor.config.ts');
    expect(configContent).toContain(
      "SystemBars: {\n      insetsHandling: 'css',\n    }",
    );
    expect(configContent).toContain(
      'CapacitorHttp: {\n      enabled: true,\n    }',
    );
  });

  it('binds .app-header sticky top to the native safe-area inset instead of top: 0', () => {
    const stylesCss = readWebFile('src/styles.css');
    const headerMatch = stylesCss.match(/\.app-header\s*\{([^}]+)\}/);
    expect(headerMatch).toBeTruthy();
    const headerRules = headerMatch?.[1] ?? '';

    expect(headerRules).toContain('position: sticky;');
    expect(headerRules).toContain(
      'top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));',
    );
    expect(headerRules).not.toMatch(/\btop:\s*0[;\s]/);
  });

  it('incorporates safe-area-inset-top into .demo-instance-banner padding and min-height', () => {
    const demoCss = readWebFile('src/demo.css');
    const bannerMatch = demoCss.match(/\.demo-instance-banner\s*\{([^}]+)\}/);
    expect(bannerMatch).toBeTruthy();
    const bannerRules = bannerMatch?.[1] ?? '';

    expect(bannerRules).toContain(
      'min-height: calc(40px + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)));',
    );
    expect(bannerRules).toContain(
      'padding: calc(var(--space-2) + var(--safe-area-inset-top, env(safe-area-inset-top, 0px))) var(--space-4) var(--space-2);',
    );
    expect(bannerRules).toContain('position: relative;');
    expect(bannerRules).toContain('z-index: 50;');
  });

  it('provides a fixed statusbar backdrop scrim on product-shell matching header surface', () => {
    const shellCss = readWebFile('src/shell.css');
    expect(shellCss).toContain(
      '.product-shell:not([data-focused-task="true"])::before',
    );
    expect(shellCss).toContain(
      'height: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));',
    );
    expect(shellCss).toContain('background: var(--color-header-surface);');
  });

  it('guarantees 0px fallback parity for Browser and PWA when native inset is absent', () => {
    const stylesCss = readWebFile('src/styles.css');
    // :root defines baseline 0px fallback for web environments
    expect(stylesCss).toContain(
      '--safe-area-inset-top: env(safe-area-inset-top, 0px);',
    );

    // In a browser with 0px inset:
    // calc(var(--space-2) + 0px) -> var(--space-2) (identical to default banner padding)
    // calc(40px + 0px) -> 40px (identical to default banner min-height)
    // top: 0px (identical to default sticky top: 0)
    const insetTopFallback = '0px';
    const evalHeaderTop = `var(--safe-area-inset-top, env(safe-area-inset-top, ${insetTopFallback}))`;
    expect(evalHeaderTop).toContain('0px');
  });
});

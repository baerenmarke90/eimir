import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readWebFile(relativePath: string): string {
  return readFileSync(resolve(__dirname, '..', relativePath), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
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

  it('keeps .app-header in normal flow while accounting for the native top safe area in its own box', () => {
    const stylesCss = readWebFile('src/styles.css');
    const headerMatch = stylesCss.match(/\.app-header\s*\{([^}]+)\}/);
    expect(headerMatch).toBeTruthy();
    const headerRules = headerMatch?.[1] ?? '';

    expect(headerRules).toContain('position: relative;');
    expect(headerRules).not.toMatch(/position:\s*(?:sticky|fixed)/);
    expect(headerRules).not.toMatch(/\btop\s*:/);
    expect(headerRules).toContain('var(--shell-header-safe-top, 0px)');
  });

  it('keeps the ServerAdmin top bar and its back control below the native status bar', () => {
    const adminCss = readWebFile('src/components/ServerAdminPage.css');
    const shell =
      adminCss.match(/\.server-admin-shell\s*\{([^}]+)\}/)?.[1] ?? '';
    const topbar =
      adminCss.match(/\.server-admin-topbar\s*\{([^}]+)\}/)?.[1] ?? '';

    expect(shell.replace(/\s+/g, ' ')).toContain(
      '--server-admin-safe-top: var( --safe-area-inset-top, env(safe-area-inset-top, 0px) );',
    );
    expect(topbar).toContain(
      'padding-block-start: calc(var(--space-3) + var(--server-admin-safe-top));',
    );
    expect(adminCss).toContain(
      '#root:has(> .demo-instance-banner) .server-admin-shell {\n  --server-admin-safe-top: 0px;',
    );
  });

  it('keeps the sticky composer header below the native status bar', () => {
    const composerCss = readWebFile('src/components/PageComposer.css');
    const headerMatch = composerCss.match(
      /\.page-composer \.composer-header\.page-heading\s*\{([^}]+)\}/,
    );
    expect(headerMatch).toBeTruthy();
    const rules = (headerMatch?.[1] ?? '').replace(/\s+/g, ' ');

    expect(rules).toContain('position: sticky;');
    expect(rules).toContain(
      'inset-block-start: calc( var(--composer-viewport-top, 0px) + var(--shell-header-safe-top, 0px) );',
    );
    // The ground is painted behind the status bar, as the gift composer does.
    expect(composerCss).toContain(
      'inset: calc(-1 * var(--shell-header-safe-top, 0px)) 0 0;',
    );
  });

  it('incorporates safe-area-inset-top into .demo-instance-banner padding and min-height', () => {
    const demoCss = readWebFile('src/demo.css');
    const bannerMatch = demoCss.match(/\.demo-instance-banner\s*\{([^}]+)\}/);
    expect(bannerMatch).toBeTruthy();
    const bannerRules = bannerMatch?.[1] ?? '';
    const normalizedBannerRules = bannerRules.replace(/\s+/g, ' ');

    expect(normalizedBannerRules).toContain(
      'min-height: calc( 40px + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) );',
    );
    expect(normalizedBannerRules).toContain(
      'padding: calc( var(--space-2) + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) ) var(--space-4) var(--space-2);',
    );
    expect(bannerRules).toContain('position: relative;');
    expect(bannerRules).toContain('z-index: 50;');
  });

  it('routes the native top inset through normal-flow header spacing and lets the demo banner consume it once', () => {
    const shellCss = readWebFile('src/shell.css');

    expect(shellCss).toContain(
      '--shell-header-safe-top: var(\n    --safe-area-inset-top,\n    env(safe-area-inset-top, 0px)\n  );',
    );
    expect(shellCss).toContain(
      '#root:has(> .demo-instance-banner) .product-shell',
    );
    expect(shellCss).toContain('--shell-header-safe-top: 0px;');
    expect(shellCss).not.toContain(
      '.product-shell:not([data-focused-task="true"])::before',
    );
  });

  it('guarantees 0px fallback parity for Browser and PWA when native inset is absent', () => {
    const stylesCss = readWebFile('src/styles.css');
    expect(stylesCss).toContain(
      '--safe-area-inset-top: env(safe-area-inset-top, 0px);',
    );

    const shellCss = readWebFile('src/shell.css');
    expect(shellCss).toContain('env(safe-area-inset-top, 0px)');
  });
});

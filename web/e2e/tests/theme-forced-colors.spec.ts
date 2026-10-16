import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const shellCss = fs.readFileSync(
  path.resolve(__dirname, '../../src/shell.css'),
  'utf8',
);

test.describe('Theme forced-colors safety (#880)', () => {
  test('keeps the accepted compact shell legible without shadow-dependent hierarchy', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ forcedColors: 'active' });
    await page.setContent(`
      <style>${shellCss}</style>
      <div class="mobile-bottom-shell">
        <nav class="mobile-bottom-nav" aria-label="Primary navigation">
          <a class="shell-nav-link shell-nav-link-active" href="#today">Wir</a>
        </nav>
      </div>
    `);

    expect(
      await page.evaluate(() => matchMedia('(forced-colors: active)').matches),
    ).toBe(true);

    const shell = page.locator('.mobile-bottom-shell');
    const activeLink = page.locator('.shell-nav-link-active');

    await expect(shell).toBeVisible();
    await expect(shell).toHaveCSS('box-shadow', 'none');
    await expect(shell).toHaveCSS('border-top-width', '1px');
    await expect(shell).toHaveCSS('border-top-style', 'solid');
    await expect(activeLink).toHaveCSS('outline-width', '2px');
    await expect(activeLink).toHaveCSS('outline-style', 'solid');
  });
});

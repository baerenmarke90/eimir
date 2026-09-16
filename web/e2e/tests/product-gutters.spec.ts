import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Exercise the real shell cascade independently of route data and proof styles.
const shellStyles = [
  'styles.css',
  'theme.css',
  'design/product-roles.css',
  'shell.css',
  'layout.css',
  'product-reflow.css',
]
  .map((file) =>
    fs.readFileSync(
      fileURLToPath(new URL(`../../src/${file}`, import.meta.url)),
      'utf8',
    ),
  )
  .join('\n');

const boundaries = [
  { width: 320, gutter: 16 },
  { width: 360, gutter: 16 },
  { width: 389, gutter: 16 },
  { width: 390, gutter: 20 },
  { width: 430, gutter: 20 },
  { width: 599, gutter: 20 },
  { width: 600, gutter: 20 },
  { width: 839, gutter: 20 },
  { width: 840, gutter: 32 },
];

async function installShell(page: Page, containerWidth?: number) {
  await page.setContent(`
    <style>${shellStyles}</style>
    <div class="product-shell" ${containerWidth ? `style="width: ${containerWidth}px"` : ''}>
      <div class="product-shell-body">
        <main class="product-main">
          <section class="page"><h1>Shell gutter contract</h1></section>
        </main>
      </div>
    </div>
  `);
}

async function expectGutters(page: Page, width: number, gutter: number) {
  const bounds = await page.evaluate(() => {
    const shell = document
      .querySelector('.product-shell')
      ?.getBoundingClientRect();
    const main = document
      .querySelector('.product-main')
      ?.getBoundingClientRect();
    if (!shell || !main) throw new Error('Product shell fixture is missing.');
    return {
      shellWidth: shell.width,
      mainWidth: main.width,
      left: main.left - shell.left,
      right: shell.right - main.right,
    };
  });
  expect(bounds.shellWidth).toBeCloseTo(width, 1);
  expect(bounds.mainWidth).toBeCloseTo(width - 2 * gutter, 1);
  expect(bounds.left).toBeCloseTo(gutter, 1);
  expect(bounds.right).toBeCloseTo(gutter, 1);
}

test.describe('Product shell gutter roles (#957)', () => {
  for (const { width, gutter } of boundaries) {
    test(`uses ${gutter}px gutters at a ${width}px viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await installShell(page);
      await expectGutters(page, width, gutter);
    });

    test(`uses ${gutter}px gutters in a ${width}px container inside Expanded`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await installShell(page, width);
      await expectGutters(page, width, gutter);
    });
  }

  test('keeps the Expanded content maximum centered', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installShell(page);
    await expectGutters(page, 1440, 120);
  });

  test('uses the narrow gutter at 400% root zoom in an Expanded viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installShell(page);
    await page.evaluate(() => {
      document.documentElement.style.zoom = '4';
    });
    await expectGutters(page, 1280, 16 * 4);
  });
});

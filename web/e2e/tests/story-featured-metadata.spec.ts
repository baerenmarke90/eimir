import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';

const LONG_AUTHOR_NAME =
  'AlexandraMargaretheVonWinterbergMitAussergewoehnlichLangemProfilnamen';

async function renderFixture(
  page: Page,
  width: number,
  colorScheme: 'light' | 'dark',
): Promise<void> {
  const baseCss = await readFile(
    new URL('../../src/components/StoryProductPages.css', import.meta.url),
    'utf8',
  );
  const metadataCss = await readFile(
    new URL('../../src/components/StoryMomentMetadata.css', import.meta.url),
    'utf8',
  );

  await page.emulateMedia({ colorScheme });
  await page.setViewportSize({ width, height: 900 });
  await page.setContent(`
    <main>
      <article class="fixture-card">
        <div class="momente-hero-meta">
          <time datetime="2026-09-05">5. September 2026</time>
          <span class="momente-author-meta">
            <span class="person-identity">
              <span class="person-identity-avatar-small" role="img" aria-label="${LONG_AUTHOR_NAME}">A</span>
            </span>
          </span>
        </div>
      </article>
      <article class="fixture-card">
        <div class="momente-tapestry-meta">
          <time datetime="2026-09-05">5. September 2026</time>
          <span class="momente-author-meta">
            <span class="person-identity">
              <span class="person-identity-avatar-small" role="img" aria-label="${LONG_AUTHOR_NAME}">A</span>
            </span>
          </span>
        </div>
      </article>
    </main>
  `);
  await page.addStyleTag({ content: baseCss });
  await page.addStyleTag({ content: metadataCss });
  await page.addStyleTag({
    content: `
      :root {
        --space-2: 0.5rem;
        --space-3: 0.75rem;
        --color-text-secondary: #5e5466;
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; }
      .fixture-card {
        width: calc(100vw - 40px);
        margin: 20px;
        padding: 20px;
      }
    `,
  });
}

function expectFits(scrollWidth: number, clientWidth: number): void {
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

async function expectMetadataContract(
  page: Page,
  selector: string,
): Promise<void> {
  const metadata = page.locator(selector);
  await expect(metadata).toBeVisible();

  const geometry = await metadata.evaluate((node) => {
    const row = node as HTMLElement;
    const date = row.querySelector<HTMLElement>(':scope > time');
    const author = row.querySelector<HTMLElement>(
      ':scope > .momente-author-meta',
    );
    if (!date || !author) {
      throw new Error('Expected date and author metadata');
    }

    const rowRect = row.getBoundingClientRect();
    const dateRect = date.getBoundingClientRect();
    const authorRect = author.getBoundingClientRect();
    return {
      justifyContent: getComputedStyle(row).justifyContent,
      rowLeft: rowRect.left,
      rowRight: rowRect.right,
      dateLeft: dateRect.left,
      dateRight: dateRect.right,
      authorLeft: authorRect.left,
      authorRight: authorRect.right,
      rowClientWidth: row.clientWidth,
      rowScrollWidth: row.scrollWidth,
      authorClientWidth: author.clientWidth,
      authorScrollWidth: author.scrollWidth,
    };
  });

  const leftOffset = Math.abs(geometry.dateLeft - geometry.rowLeft);
  const rightOffset = Math.abs(geometry.rowRight - geometry.authorRight);
  expect(geometry.justifyContent).toBe('space-between');
  expect(leftOffset).toBeLessThanOrEqual(1);
  expect(rightOffset).toBeLessThanOrEqual(1);
  expect(geometry.authorLeft).toBeGreaterThanOrEqual(geometry.dateRight);
  expectFits(geometry.rowScrollWidth, geometry.rowClientWidth);
  expectFits(geometry.authorScrollWidth, geometry.authorClientWidth);
}

test('Featured Moment metadata uses the shared layout', async ({
  page,
}, testInfo) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [390, 320]) {
      await renderFixture(page, width, colorScheme);

      const heroMetadata = page.locator('.momente-hero-meta');
      await expect(heroMetadata).not.toContainText(LONG_AUTHOR_NAME);
      await expect(
        heroMetadata.getByRole('img', { name: LONG_AUTHOR_NAME }),
      ).toHaveCount(1);
      const childTags = await heroMetadata
        .locator(':scope > *')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.tagName.toLowerCase()),
        );
      expect(childTags).toEqual(['time', 'span']);

      await expectMetadataContract(page, '.momente-hero-meta');
      await expectMetadataContract(page, '.momente-tapestry-meta');

      const viewport = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
    }
  }

  await renderFixture(page, 390, 'light');
  await expectMetadataContract(page, '.momente-hero-meta');
  await page.screenshot({
    path: testInfo.outputPath('shell-momente-featured-compact.png'),
    fullPage: true,
  });

  await renderFixture(page, 1440, 'light');
  await expectMetadataContract(page, '.momente-hero-meta');
  await page.screenshot({
    path: testInfo.outputPath('shell-momente-featured-expanded.png'),
    fullPage: true,
  });
});

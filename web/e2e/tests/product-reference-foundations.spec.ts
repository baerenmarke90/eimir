import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import de from '../fixtures/locales/de';

const PROOF_PATH = '/e2e/fixtures/product-reference-foundations.html';
const PHOTO_PATH = fileURLToPath(
  new URL(
    '../../../backend/demo_assets/images/cabin-lake.jpg',
    import.meta.url,
  ),
);
const widths = [320, 360, 390, 430, 1280] as const;
const themes = ['light', 'dark'] as const;

async function installPhoto(page: Page) {
  await page.route('**/__foundation-proof/cabin-lake.jpg', (route) =>
    route.fulfill({ path: PHOTO_PATH, contentType: 'image/jpeg' }),
  );
}

async function openProof(page: Page, parameters = '') {
  await page.goto(`${PROOF_PATH}?${parameters}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('heading', { name: de.pageTitle })).toBeVisible();
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const output = testInfo.outputPath(name);
  await page.screenshot({
    path: output,
    fullPage: (await page.locator('dialog[open]').count()) === 0,
    animations: 'disabled',
  });
  await testInfo.attach(name, { path: output, contentType: 'image/png' });
  const directory =
    process.env.SCREENSHOT_EXPORT_DIR || process.env.VISUAL_EVIDENCE_DIR;
  if (directory) {
    fs.mkdirSync(directory, { recursive: true });
    fs.copyFileSync(output, path.join(directory, name));
  }
}

async function measurement(testInfo: TestInfo, name: string, value: unknown) {
  const output = testInfo.outputPath(name);
  fs.writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`);
  await testInfo.attach(name, {
    path: output,
    contentType: 'application/json',
  });
  const directory =
    process.env.SCREENSHOT_EXPORT_DIR || process.env.VISUAL_EVIDENCE_DIR;
  if (directory) {
    fs.mkdirSync(directory, { recursive: true });
    fs.copyFileSync(output, path.join(directory, name));
  }
}

async function assertReflow(page: Page) {
  const geometry = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(geometry.content).toBeLessThanOrEqual(geometry.viewport);
}

async function renderedContrast(locator: Locator, property = 'color') {
  const pair = await locator.evaluate((element, selectedProperty) => {
    function channels(value: string) {
      return value.match(/[\d.]+/g)?.map(Number) ?? [];
    }
    const layers: number[][] = [];
    for (
      let current: Element | null = element;
      current;
      current = current.parentElement
    ) {
      layers.unshift(channels(getComputedStyle(current).backgroundColor));
    }
    let background = [255, 255, 255];
    for (const layer of layers) {
      const alpha = layer[3] ?? 1;
      background = background.map(
        (channel, index) => layer[index] * alpha + channel * (1 - alpha),
      );
    }
    const foreground = channels(
      getComputedStyle(element).getPropertyValue(selectedProperty),
    );
    const alpha = foreground[3] ?? 1;
    return {
      foreground: background.map(
        (channel, index) => foreground[index] * alpha + channel * (1 - alpha),
      ),
      background,
    };
  }, property);
  function luminance(channels: number[]) {
    const normalized = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return (
      normalized[0] * 0.2126 + normalized[1] * 0.7152 + normalized[2] * 0.0722
    );
  }
  const first = luminance(pair.foreground);
  const second = luminance(pair.background);
  return {
    ...pair,
    ratio: (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05),
  };
}

async function assertAccessible(page: Page) {
  const report = await new AxeBuilder({ page })
    .include('.foundation-proof')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(report.violations).toEqual([]);
}

for (const theme of themes) {
  for (const width of widths) {
    test(`foundation composition ${theme} at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await installPhoto(page);
      await openProof(page, `theme=${theme}`);
      const photo = page.locator('.proof-photo .story-media-preview');
      await expect(photo).toBeVisible();
      await assertReflow(page);

      const pageBox = await page.getByTestId('proof-page').boundingBox();
      const photoBox = await photo.boundingBox();
      expect(pageBox).not.toBeNull();
      expect(photoBox).not.toBeNull();
      if (!pageBox || !photoBox)
        throw new Error('Proof content geometry is unavailable.');
      if (width < 600) {
        const gutter = width < 390 ? 16 : 20;
        expect(pageBox.x).toBeCloseTo(gutter, 1);
        expect(pageBox.width).toBeCloseTo(width - gutter * 2, 1);
      } else {
        expect(pageBox.width).toBeLessThanOrEqual(720);
      }
      expect(photoBox.width).toBeCloseTo(pageBox.width, 1);
      expect(photoBox.width / photoBox.height).toBeCloseTo(1.6, 2);
      await expect(photo).toHaveCSS('filter', 'none');
      await expect(page.locator('#photo-title')).toHaveCSS(
        'font-family',
        /Literata/,
      );
      await expect(page.locator('#utility-title')).toHaveCSS(
        'font-family',
        /Instrument Sans/,
      );
      await expect(page.locator('.proof-thought')).toHaveCSS(
        'box-shadow',
        'none',
      );
      await expect(page.locator('.proof-photo-memory')).toHaveCSS(
        'border-top-width',
        '0px',
      );

      const contrast: Record<
        string,
        Awaited<ReturnType<typeof renderedContrast>>
      > = {};
      for (const [name, selector] of [
        ['body', '.proof-thought .proof-body'],
        ['supporting', '.proof-photo .proof-supporting'],
        ['shared', '.visibility-badge'],
        ['utility', '.proof-row-label'],
      ]) {
        contrast[name] = await renderedContrast(page.locator(selector).first());
        expect(contrast[name].ratio, name).toBeGreaterThanOrEqual(4.5);
      }
      const appearance = page.getByRole('button', {
        name: new RegExp(`^${de.appearance}`),
      });
      await appearance.focus();
      await expect(appearance).toHaveCSS('outline-style', 'solid');
      await appearance.hover();
      await expect(appearance).toHaveCSS('transition-property', 'color');
      await expect
        .poll(
          async () =>
            (await renderedContrast(appearance.locator('.proof-row-label')))
              .ratio,
        )
        .toBeGreaterThanOrEqual(4.5);
      contrast.link = await renderedContrast(
        appearance.locator('.proof-row-label'),
      );
      contrast.focus = await renderedContrast(appearance, 'outline-color');
      expect(contrast.focus.ratio).toBeGreaterThanOrEqual(3);
      for (const target of await page
        .locator('.proof-content-link, .proof-utility-row')
        .all()) {
        const bounds = await target.boundingBox();
        if (!bounds)
          throw new Error('Interactive target geometry is unavailable.');
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
      }
      await assertAccessible(page);
      await appearance.blur();
      await page.evaluate(() => window.scrollTo(0, 0));
      await screenshot(page, testInfo, `f1-${theme}-${width}.png`);
      await measurement(testInfo, `f1-${theme}-${width}.json`, {
        theme,
        width,
        pageBox,
        photoBox,
        contrast,
      });
    });
  }
}

test('pending media reserves its final geometry and successful loading keeps the same content', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/__foundation-proof/cabin-lake.jpg', async (route) => {
    await waiting;
    await route.fulfill({ path: PHOTO_PATH, contentType: 'image/jpeg' });
  });
  await openProof(page);
  await expect(page.locator('.story-media-skeleton')).toBeVisible();
  const pending = await page.getByTestId('photo-slot').boundingBox();
  await screenshot(page, testInfo, 'f1-loading-390.png');
  if (!release) throw new Error('Fixture request release is unavailable.');
  release();
  await expect(page.locator('.proof-photo .story-media-preview')).toBeVisible();
  const ready = await page.getByTestId('photo-slot').boundingBox();
  expect(ready).toEqual(pending);
  await measurement(testInfo, 'f1-loading-geometry.json', { pending, ready });
});

test('failed media retains the memory and retries without duplicate content', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let attempts = 0;
  await page.route('**/__foundation-proof/cabin-lake.jpg', (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 503, body: 'Fixture image unavailable' })
      : route.fulfill({ path: PHOTO_PATH, contentType: 'image/jpeg' });
  });
  await openProof(page);
  await expect(page.getByRole('alert')).toContainText(de.mediaErrorTitle);
  await expect(page.locator('#photo-title')).toBeVisible();
  const failed = await page.getByTestId('photo-slot').boundingBox();
  await assertAccessible(page);
  await screenshot(page, testInfo, 'f1-media-error-390.png');
  await page.getByRole('button', { name: de.retry }).click();
  await expect(page.locator('.proof-photo .story-media-preview')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(attempts).toBe(2);
  await expect(page.locator('#photo-title')).toHaveCount(1);
  expect(await page.getByTestId('photo-slot').boundingBox()).toEqual(failed);
  await screenshot(page, testInfo, 'f1-media-recovered-390.png');
});

test('direct photo detail recovers from a rejected network request', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let recover = false;
  await page.route('**/__foundation-proof/cabin-lake.jpg', (route) =>
    recover
      ? route.fulfill({ path: PHOTO_PATH, contentType: 'image/jpeg' })
      : route.abort('failed'),
  );
  await page.goto(`${PROOF_PATH}?theme=dark#/photo`);
  const detail = page.locator('.proof-detail');
  await expect(
    detail.getByRole('heading', { name: de.photoTitle }),
  ).toBeVisible();
  await expect(detail.getByRole('alert')).toContainText(de.mediaErrorTitle);
  await expect(detail.getByText(de.photoBody)).toBeVisible();
  await assertAccessible(page);
  await screenshot(page, testInfo, 'f1-detail-error-dark-390.png');
  recover = true;
  await detail.getByRole('button', { name: de.retry }).click();
  await expect(detail.locator('.story-media-preview')).toBeVisible();
  await expect(detail.getByRole('alert')).toHaveCount(0);
  await detail.getByRole('button', { name: de.back }).click();
  await expect(page.getByRole('heading', { name: de.pageTitle })).toBeVisible();
  recover = false;
  await page.getByRole('link', { name: de.openPhoto }).click();
  await expect(detail.getByRole('alert')).toContainText(de.mediaErrorTitle);
  await detail.getByRole('button', { name: de.back }).click();
  recover = true;
  await page.getByRole('link', { name: de.openPhoto }).click();
  await expect(detail.locator('.story-media-preview')).toBeVisible();
  await expect(detail.getByRole('alert')).toHaveCount(0);
});

test('text-only and cached offline samples remain truthful without a photo hole', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 844 });
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('__foundation-proof'))
      requests.push(request.url());
  });
  await openProof(page, 'media=none&offline=true&theme=dark');
  await expect(page.getByTestId('photo-slot')).toHaveCount(0);
  await expect(page.getByRole('status').first()).toContainText(de.offlineTitle);
  await expect(page.getByText(de.photoBody, { exact: false })).toBeVisible();
  expect(requests).toEqual([]);
  await assertReflow(page);
  await assertAccessible(page);
  await screenshot(page, testInfo, 'f1-text-offline-dark-360.png');
});

test('content opens a reading detail and return restores position and focus', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installPhoto(page);
  await openProof(page);
  await expect(page.locator('.proof-photo .story-media-preview')).toBeVisible();
  const thought = page.getByRole('link', {
    name: de.openThought,
  });
  await thought.scrollIntoViewIfNeeded();
  const scrollY = await page.evaluate(() => window.scrollY);
  await thought.click();
  await expect(page.locator('#detail-title')).toBeFocused();
  await expect(
    page.getByRole('heading', { name: de.thoughtTitle }),
  ).toBeVisible();
  await expect(page.getByTestId('photo-slot')).not.toBeVisible();
  await page.getByRole('button', { name: de.back }).click();
  await expect(thought).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeCloseTo(scrollY, 0);
  await page
    .getByRole('button', { name: new RegExp(`^${de.privateEntry}`) })
    .click();
  await expect(page.getByRole('status', { name: de.private })).toBeVisible();
  await screenshot(page, testInfo, 'f1-private-reading-390.png');
});

for (const theme of themes) {
  test(`native dialog has usable ${theme} visual roles and confirms an actual fixture change`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installPhoto(page);
    await openProof(page, `theme=${theme}`);
    const appearance = page.getByRole('button', {
      name: new RegExp(`^${de.appearance}`),
    });
    await appearance.click();
    const dialog = page.getByRole('dialog', { name: de.appearance });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: de.close })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    // Native modal traversal can hand off to browser chrome at its boundary.
    // The page behind the modal must stay inert throughout the keyboard cycle.
    const focusOnDocument = await page.evaluate(
      () => document.activeElement === document.body,
    );
    if (focusOnDocument) await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: de.done })).toBeFocused();
    await appearance.evaluate((element) => element.focus());
    await expect(dialog.getByRole('button', { name: de.done })).toBeFocused();
    const contrast = await renderedContrast(
      dialog.getByRole('button', { name: de.done }),
    );
    expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);
    await assertAccessible(page);
    await screenshot(page, testInfo, `f1-sheet-${theme}-390.png`);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(appearance).toBeFocused();
    await appearance.click();
    const next = theme === 'light' ? de.dark : de.light;
    await dialog.getByLabel(next, { exact: true }).check();
    await dialog.getByRole('button', { name: de.done }).click();
    await expect(dialog).not.toBeVisible();
    await expect(appearance).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      theme === 'light' ? 'dark' : 'light',
    );
    await expect(
      page.getByRole('status').filter({ hasText: de.appearanceChanged }),
    ).toBeVisible();
    await measurement(testInfo, `f1-sheet-${theme}-contrast.json`, contrast);
  });
}

test('200 percent text and long labels reflow, including the sheet', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await installPhoto(page);
  await openProof(page, 'long=true&theme=dark');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(page.locator('.proof-thought .proof-body')).toHaveCSS(
    'font-size',
    '32px',
  );
  await expect(page.locator('.proof-photo .story-media-preview')).toBeVisible();
  await assertReflow(page);
  await assertAccessible(page);
  await screenshot(page, testInfo, 'f1-large-text-dark-320.png');
  await page
    .getByRole('button', { name: new RegExp(`^${de.appearanceLong}`) })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await assertReflow(page);
  await dialog.getByRole('button', { name: de.done }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: de.done })).toBeInViewport();
  await screenshot(page, testInfo, 'f1-large-text-sheet-320.png');
});

test('reduced motion removes nonessential movement while preserving state and controls', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 430, height: 844 });
  await installPhoto(page);
  await openProof(page);
  await page
    .getByRole('button', { name: new RegExp(`^${de.appearance}`) })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveCSS('animation-name', 'none');
  await expect(dialog.getByRole('button', { name: de.done })).toHaveCSS(
    'transition-duration',
    '0s',
  );
  await expect(dialog.getByRole('button', { name: de.done })).toHaveCSS(
    'transform',
    'none',
  );
  await screenshot(page, testInfo, 'f1-reduced-motion-sheet-430.png');
  await dialog.getByRole('button', { name: de.close }).click();
  await expect(
    page.getByRole('button', { name: new RegExp(`^${de.appearance}`) }),
  ).toBeFocused();
});

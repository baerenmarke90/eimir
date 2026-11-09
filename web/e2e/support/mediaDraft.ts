import { expect, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';

/** Select one media identity without opening a second task or saving the draft. */
export async function selectDraftMedia(page: Page, index = 0) {
  const tile = page.locator('.photo-draft-tile').nth(index);
  await tile.click();
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
  await expectInlineDraftActions(page);
  return page.getByRole('group', {
    name: de.memory.photoSelected,
    exact: true,
  });
}

/** Contextual actions remain usable inline; no Done/dismiss step is needed. */
export async function expectInlineDraftActions(page: Page) {
  await expect(page.locator('dialog.photo-draft-preview-sheet')).toHaveCount(0);
  await expect(
    page.getByRole('group', { name: de.memory.photoSelected, exact: true }),
  ).toBeVisible();
}

/** Drag the photo itself; corner actions are separate pointer targets. */
export async function dragDraftMedia(
  page: Page,
  from: number,
  to: number,
  input: 'mouse' | 'touch' = 'mouse',
  cancel = false,
) {
  const tiles = page.locator('.photo-draft-tile');
  await tiles.nth(from).scrollIntoViewIfNeeded();
  const initial = await tiles.nth(from).boundingBox(),
    target = await tiles.nth(to).boundingBox();
  const height = page.viewportSize()?.height ?? 900;
  // Large-text photos may need successive visible drops instead of an offscreen target.
  if (
    initial &&
    target &&
    Math.abs(from - to) > 1 &&
    Math.max(initial.y + initial.height, target.y + target.height) -
      Math.min(initial.y, target.y) >
      height * 0.7
  ) {
    const next = from + Math.sign(to - from);
    await dragDraftMedia(page, from, next, input, cancel);
    if (!cancel) await dragDraftMedia(page, next, to, input);
    return;
  }

  if (
    initial &&
    target &&
    Math.max(initial.y + initial.height, target.y + target.height) -
      Math.min(initial.y, target.y) <
      height - 16
  )
    await tiles
      .nth(Math.min(from, to))
      .evaluate((element) =>
        element.scrollIntoView({ block: 'center', behavior: 'instant' }),
      );
  const a = await tiles.nth(from).boundingBox(),
    b = await tiles.nth(to).boundingBox();
  if (!a || !b) throw new Error('Missing photo drag geometry');
  const sourceKey = await tiles.nth(from).getAttribute('data-media-key');
  if (!sourceKey) throw new Error('Missing photo identity');
  const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const end = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const session =
    input === 'touch' ? await page.context().newCDPSession(page) : null;
  if (session) {
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [start],
    });
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 6, start.y);
  }
  await expect(page.locator('[data-dnd-dragging]')).toHaveCount(1);
  await expect(
    page.locator('[data-dnd-dragging] .photo-draft-tile'),
  ).toHaveAttribute('data-media-key', sourceKey);
  for (let step = 1; step <= 12; step++) {
    const point = {
      x: start.x + ((end.x - start.x) * step) / 12,
      y: start.y + ((end.y - start.y) * step) / 12,
    };
    if (session)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [point],
      });
    else await page.mouse.move(point.x, point.y);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  if (cancel) await page.keyboard.press('Escape');
  if (session) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await session.detach();
  } else await page.mouse.up();
  await expect(page.locator('[data-dnd-dragging]')).toHaveCount(0);
  if (!cancel)
    await expect(tiles.nth(to)).toHaveAttribute('data-media-key', sourceKey);
}

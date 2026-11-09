import type { Page } from '@playwright/test';

export async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

export async function swipeCarousel(
  page: Page,
  direction: 'previous' | 'next',
  surface: 'inline' | 'lightbox' = 'inline',
): Promise<{
  startScrollLeft: number;
  midScrollLeft: number;
  viewportWidth: number;
  visibleSlides: number;
}> {
  const track = page.locator(
    surface === 'inline'
      ? '.media-gallery-carousel-track'
      : '.media-lightbox-track',
  );
  const box = await track.boundingBox();
  if (!box) throw new Error('Carousel track did not render.');

  const startX =
    direction === 'next' ? box.x + box.width * 0.82 : box.x + box.width * 0.18;
  const endX =
    direction === 'next' ? box.x + box.width * 0.12 : box.x + box.width * 0.88;
  const midX = startX + (endX - startX) * 0.58;
  const clientY = box.y + box.height / 2;
  const startScrollLeft = await track.evaluate((element) => element.scrollLeft);
  const client = await page.context().newCDPSession(page);

  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y: clientY }],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: midX, y: clientY }],
    });
    await nextFrame(page);

    const midState = await track.evaluate((element) => {
      const viewport = element.getBoundingClientRect();
      const visibleSlides = Array.from(
        element.querySelectorAll<HTMLElement>(
          '[data-carousel-index], [data-lightbox-index]',
        ),
      ).filter((slide) => {
        const rect = slide.getBoundingClientRect();
        return rect.right > viewport.left + 1 && rect.left < viewport.right - 1;
      }).length;
      return {
        scrollLeft: element.scrollLeft,
        viewportWidth: element.clientWidth,
        visibleSlides,
      };
    });

    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: endX, y: clientY }],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });

    return {
      startScrollLeft,
      midScrollLeft: midState.scrollLeft,
      viewportWidth: midState.viewportWidth,
      visibleSlides: midState.visibleSlides,
    };
  } finally {
    await client.detach();
  }
}

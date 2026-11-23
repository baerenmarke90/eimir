import { expect, type Locator } from '@playwright/test';

/** Measure from the lowest title or in-row control, including wrapped titles. */
export async function expectTitleOnlyContentGap(firstContent: Locator) {
  await expect(firstContent).toBeVisible();
  await expect
    .poll(() =>
      firstContent.evaluate((content) => {
        const header = content
          .closest('.page')
          ?.querySelector(':scope > .page-heading');
        if (!header)
          throw new Error('Expected a page header above the first content.');
        const row = Array.from(header.querySelectorAll('h1, button, a'))
          .filter((entry) => getComputedStyle(entry).position !== 'fixed')
          .map((entry) => entry.getBoundingClientRect())
          .filter((box) => box.height > 0);
        const bottom = Math.max(...row.map((box) => box.bottom));
        const rootSize = Number.parseFloat(
          getComputedStyle(document.documentElement).fontSize,
        );
        return (content.getBoundingClientRect().top - bottom) / rootSize;
      }),
    )
    .toBeCloseTo(1.5, 1);
}

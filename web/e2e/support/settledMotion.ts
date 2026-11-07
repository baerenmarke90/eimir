import type { Page } from '@playwright/test';

/** Measure final rendered contrast after finite entry/theme motion completes. */
export async function waitForSettledMotion(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const animations = document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getComputedTiming();
      return timing && timing.iterations !== Infinity;
    });
    await Promise.all(
      animations.map((animation) => animation.finished.catch(() => {})),
    );
  });
}

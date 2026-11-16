import type { Page } from '@playwright/test';

/** Measure final rendered contrast after finite entry/theme motion completes. */
export async function waitForSettledMotion(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let idleOnPreviousFrame = false;
        const check = () => {
          const idle = !document
            .getAnimations()
            .some(
              (animation) =>
                animation.timeline === document.timeline &&
                (animation.playState === 'running' || animation.pending) &&
                animation.playbackRate !== 0 &&
                Number.isFinite(animation.effect?.getComputedTiming().endTime),
            );
          // A second frame includes motion started by the incoming render.
          if (idle && idleOnPreviousFrame) {
            resolve();
            return;
          }
          idleOnPreviousFrame = idle;
          requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
  );
}

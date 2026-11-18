import type { Page } from '@playwright/test';

/**
 * Measure final rendered contrast after finite entry/theme motion completes.
 * Ambient playback marked `data-playback-motion` (e.g. the Fotostory's
 * autoplay progress and slow photo zoom) restarts for as long as it plays and
 * changes no contrast, so it is not waited for.
 */
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
                !(animation.effect as KeyframeEffect | null)?.target?.closest(
                  '[data-playback-motion]',
                ) &&
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

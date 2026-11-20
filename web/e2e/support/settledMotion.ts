import type { Page } from '@playwright/test';

/**
 * Measure final rendered contrast after finite entry/theme motion completes.
 * Ambient playback marked `data-playback-motion` (e.g. the Fotostory's
 * autoplay progress and slow photo zoom) restarts for as long as it plays and
 * changes no contrast, so it is not waited for. Neither is repeating ambient
 * motion (ring breath, hanging sway, garden life): since #2063 it settles
 * after `--motion-ambient-repeat` cycles instead of looping forever, which
 * would otherwise hold a page "in motion" for tens of seconds.
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
                (animation.effect?.getComputedTiming().iterations ?? 1) <= 1 &&
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

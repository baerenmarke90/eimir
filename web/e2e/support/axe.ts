import PlaywrightAxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { waitForSettledMotion } from './settledMotion';

/** Audit the rendered view after entry, disclosure and theme motion settle. */
export default class AxeBuilder extends PlaywrightAxeBuilder {
  private readonly testPage: Page;

  constructor(options: ConstructorParameters<typeof PlaywrightAxeBuilder>[0]) {
    super(options);
    this.testPage = options.page;
  }

  override async analyze() {
    const motion = await this.testPage.evaluateHandle(() => {
      let started = 0;
      const recordStart = () => started++;
      document.addEventListener('animationstart', recordStart, true);
      document.addEventListener('transitionrun', recordStart, true);
      return {
        started: () => started,
        stop: () => {
          document.removeEventListener('animationstart', recordStart, true);
          document.removeEventListener('transitionrun', recordStart, true);
        },
      };
    });

    try {
      for (;;) {
        const started = await motion.evaluate((state) => state.started());
        await waitForSettledMotion(this.testPage);
        const result = await super.analyze();
        const contrastOnly =
          result.violations.length > 0 &&
          result.violations.every(({ id }) => id === 'color-contrast');
        // A later render or viewport reveal can start during the axe scan.
        if (
          !contrastOnly ||
          (await motion.evaluate((state) => state.started())) === started
        ) {
          return result;
        }
      }
    } finally {
      // Navigation disposes the listener with the old document.
      await motion.evaluate((state) => state.stop()).catch(() => {});
      await motion.dispose();
    }
  }
}

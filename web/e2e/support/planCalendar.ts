import { expect, type Locator } from '@playwright/test';
import m5s3 from '../../src/i18n/locales/m5s3';

/**
 * Chooses a day in the Plan schedule sheet's in-app calendar (#2063). Pages
 * month by month from the shown month towards `isoDay` (`YYYY-MM-DD`), then
 * taps the day like a person would.
 */
export async function pickPlanDay(scope: Locator, isoDay: string) {
  const day = scope.locator(`button[data-day="${isoDay}"]`);
  for (let step = 0; step < 36 && (await day.count()) === 0; step += 1) {
    const shown = await scope
      .locator('button[data-day]')
      .first()
      .getAttribute('data-day');
    const forward = !shown || shown < isoDay;
    await scope
      .getByRole('button', {
        name: forward ? m5s3.plan.calendarNext : m5s3.plan.calendarPrevious,
        exact: true,
      })
      .click();
  }
  await day.click();
  await expect(day).toHaveAttribute('aria-pressed', 'true');
}

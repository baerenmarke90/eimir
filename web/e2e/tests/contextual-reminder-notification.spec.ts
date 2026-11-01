import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  CAPABILITIES,
  PARTNER,
  SPACE_ID,
  installMocks,
  signIn,
  captureScreenshot,
} from '../support/storyTimelineFixture';

const REMINDER_ID = '56500000-0000-4000-8000-000000000001';
const TITLE = 'Einkaufen für unser gemeinsames Wochenende';
const reminder = {
  id: REMINDER_ID,
  spaceId: SPACE_ID,
  title: TITLE,
  description:
    'Frisches Obst, gutes Brot und etwas für unseren gemeinsamen Kochabend.',
  schedule: { type: 'ONCE', at: '2026-11-07T16:00:00Z' },
  source: 'MANUAL',
  sourceId: null,
  sourceType: null,
  ruleKey: null,
  offsets: [0],
  muted: false,
  version: 1,
  creator: PARTNER,
  createdBy: PARTNER.id,
  capabilities: CAPABILITIES,
  createdAt: '2026-11-01T12:00:00Z',
  updatedAt: '2026-11-01T12:00:00Z',
};

for (const width of [360, 390, 430, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`authorized reminder notification destination at ${width}px ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(
        (value) => localStorage.setItem('eimir.theme', value),
        theme,
      );
      await installMocks(page);
      await page.route(
        `**/api/v1/spaces/${SPACE_ID}/reminders/${REMINDER_ID}`,
        async (route) => {
          await route.fulfill({ json: reminder });
        },
      );
      await page.route(
        `**/api/v1/spaces/${SPACE_ID}/notifications`,
        async (route) => {
          await route.fulfill({
            json: { items: [], hasMore: false, nextCursor: null },
          });
        },
      );
      await signIn(page);
      await page.goto(`/plan/reminders/${REMINDER_ID}`);
      await expect(
        page.getByRole('heading', { level: 1, name: TITLE }),
      ).toBeVisible();
      await expect(page.getByText(reminder.description)).toBeVisible();
      await expect(page.getByText('Von Alex')).toBeVisible();
      await expect(page.getByRole('textbox')).toHaveCount(0);
      const back = page.getByRole('button', {
        name: 'Zurück zu den Benachrichtigungen',
      });
      const bounds = await back.boundingBox();
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      expect(
        (await new AxeBuilder({ page }).include('.page').analyze()).violations,
      ).toEqual([]);
      await captureScreenshot(
        page,
        testInfo,
        `reminder-${width}-${theme}.png`,
        { fullPage: true },
      );
      if (width === 360 && theme === 'dark') {
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '200%';
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
        ).toBe(true);
        expect(
          (await new AxeBuilder({ page }).include('.page').analyze())
            .violations,
        ).toEqual([]);
        await captureScreenshot(
          page,
          testInfo,
          'reminder-360-dark-text200.png',
          { fullPage: true },
        );
      }
      await back.click();
      await expect(page).toHaveURL(/\/more\/notifications$/);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Benachrichtigungen' }),
      ).toBeVisible();
    });
  }
}

test('deleted or inaccessible reminder reveals no cached title and retains a return path', async ({
  page,
}) => {
  await installMocks(page);
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/reminders/${REMINDER_ID}`,
    async (route) => {
      await route.fulfill({
        status: 404,
        json: { code: 'REMINDER_NOT_FOUND' },
      });
    },
  );
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/notifications`,
    async (route) => {
      await route.fulfill({
        json: { items: [], hasMore: false, nextCursor: null },
      });
    },
  );
  await signIn(page);
  await page.goto(`/plan/reminders/${REMINDER_ID}`);
  await expect(
    page.getByRole('heading', { level: 1, name: TITLE }),
  ).toHaveCount(0);
  await expect(page.getByText('Von Alex')).toHaveCount(0);
  await expect(page.locator('.ui-state')).toBeVisible();
  await page
    .getByRole('button', { name: 'Zurück zu den Benachrichtigungen' })
    .click();
  await expect(page).toHaveURL(/\/more\/notifications$/);
});

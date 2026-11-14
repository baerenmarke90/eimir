import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import dateIdeas from '../../src/i18n/locales/dateIdeas';
import m5s3 from '../../src/i18n/locales/m5s3';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import {
  categoryLabel,
  ideaDescription,
  ideaTitle,
  installDateIdeaMocks,
  signIn,
} from '../support/dateIdeas';
import { captureScreenshot } from '../support/storyTimelineFixture';

/*
 * #1892: Pro date inspiration under Planen → Wünsche. Free Spaces see a calm
 * explanation without a catalog read; Pro Spaces browse, filter, save an idea
 * as an ordinary Wish and plan one through the existing composer, returning
 * to the same filtered discovery context.
 */

const EXISTING_WISH = '55555555-5555-4555-8555-555555555551';
const EXISTING_WISH_TITLE = 'Night train to Vienna';
const PICNIC = ideaTitle('living-room-picnic');
const SUNRISE = ideaTitle('sunrise-walk');
const MENU = ideaTitle('blind-cooking-night');
const STARS = ideaTitle('stargazing-night');
const OUTDOORS = categoryLabel('outdoors');

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function assertNoWcagViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = result.violations
    .map((violation) => `${violation.id}: ${violation.nodes.length} node(s)`)
    .join('\n');
  expect(result.violations, summary || 'No axe violations').toEqual([]);
}

async function openFromWishes(page: Page): Promise<void> {
  await page.goto('/plan#wishes');
  const entry = page.getByRole('link', {
    name: new RegExp(dateIdeas.entryAction),
  });
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page).toHaveURL(/\/plan\/ideas$/);
  await expect(
    page.getByRole('heading', { level: 1, name: dateIdeas.title }),
  ).toBeVisible();
}

function idea(page: Page, title: string) {
  return page.getByRole('article', { name: title });
}

test.describe('date inspiration (#1892)', () => {
  test('Free Spaces get a calm Pro explanation and no catalog read', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const state = await installDateIdeaMocks(page, { pro: false });
    await signIn(page);
    await openFromWishes(page);

    await expect(
      page.getByRole('heading', { name: new RegExp(dateIdeas.locked.title) }),
    ).toBeVisible();
    await expect(page.getByText(dateIdeas.locked.retained)).toBeVisible();
    await expect(
      page.getByRole('link', { name: dateIdeas.locked.action }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(state.catalogRequests).toBe(0);
    await assertNoWcagViolations(page);
    await captureScreenshot(page, info, 'date-inspiration-free-390-light.png');
    expect(state.unexpected).toEqual([]);
  });

  test('Pro: filter, save as Wish, open it and return to the same filters', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const state = await installDateIdeaMocks(page, {
      pro: true,
      wishes: [{ id: EXISTING_WISH, title: EXISTING_WISH_TITLE }],
    });
    await signIn(page);
    await page.goto('/plan#wishes');
    await expect(page.getByText(EXISTING_WISH_TITLE)).toBeVisible();
    await captureScreenshot(page, info, 'date-inspiration-entry-390-light.png');
    await openFromWishes(page);

    await expect(idea(page, PICNIC)).toBeVisible();
    await page.getByRole('button', { name: OUTDOORS, exact: true }).click();
    await expect(idea(page, PICNIC)).toHaveCount(0);
    await page.getByRole('button', { name: dateIdeas.filters.more }).click();
    await page
      .getByRole('group', { name: dateIdeas.filters.budgetLegend })
      .getByRole('button', { name: dateIdeas.filters.budget.FREE })
      .click();
    await expect(page.getByRole('article')).toHaveCount(1);
    const sunrise = idea(page, SUNRISE);
    await expect(sunrise).toBeVisible();

    await sunrise.getByRole('button', { name: dateIdeas.card.save }).click();
    const saved = sunrise.getByRole('link', { name: dateIdeas.card.saved });
    await expect(saved).toBeVisible();
    expect(state.wishSaves).toHaveLength(1);
    expect(state.wishSaves[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    await assertNoWcagViolations(page);
    await captureScreenshot(page, info, 'date-inspiration-saved-390-light.png');

    await saved.click();
    await expect(page).toHaveURL(/\/plan\/wishes\/66666666-/);
    await expect(page.getByRole('heading', { name: SUNRISE })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/plan\/ideas$/);
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: OUTDOORS, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      idea(page, SUNRISE).getByRole('link', {
        name: dateIdeas.card.saved,
      }),
    ).toBeVisible();

    // The shell Back returns to the Wishes peer mode with the new Wish.
    await page.getByRole('button', { name: taskBoundary.back }).first().click();
    await expect(page).toHaveURL(/\/plan(#wishes)?$/);
    const overview = page.locator('.planen-overview');
    await expect(overview.getByText(SUNRISE)).toBeVisible();
    await expect(overview.getByText(EXISTING_WISH_TITLE)).toBeVisible();
    expect(state.wishSaves).toHaveLength(1);
    expect(state.unexpected).toEqual([]);
  });

  test('Pro: Jetzt planen opens the existing composer prefilled and saves a Plan', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const state = await installDateIdeaMocks(page, { pro: true });
    await signIn(page);
    await openFromWishes(page);

    await idea(page, MENU)
      .getByRole('link', { name: dateIdeas.card.plan })
      .click();
    await expect(page).toHaveURL(/\/plan\/plans\/new$/);
    await expect(page.locator('#planning-create-title')).toHaveValue(MENU);
    await expect(page.getByLabel(m5s3.common.description)).toHaveValue(
      ideaDescription('blind-cooking-night'),
    );
    await page.getByRole('button', { name: m5s3.common.save }).click();
    await expect(page).toHaveURL(/\/plan\/plans\/77777777-/);
    expect(state.createdPlans).toHaveLength(1);
    expect(state.createdPlans[0]).toMatchObject({
      title: MENU,
    });
    expect(state.wishSaves).toHaveLength(0);
    expect(state.unexpected).toEqual([]);
  });

  test('closing the prefilled composer without edits returns without a discard prompt', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installDateIdeaMocks(page, { pro: true });
    await signIn(page);
    await openFromWishes(page);
    await idea(page, STARS)
      .getByRole('link', { name: dateIdeas.card.plan })
      .click();
    await expect(page).toHaveURL(/\/plan\/plans\/new$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/plan\/ideas$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(idea(page, STARS)).toBeVisible();
  });

  test('catalog failure offers a retry instead of an empty list', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await installDateIdeaMocks(page, { pro: true });
    state.catalogFailure = 503;
    await signIn(page);
    await openFromWishes(page);
    const retry = page.getByRole('button', { name: /erneut/i });
    await expect(retry).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    state.catalogFailure = null;
    await retry.click();
    await expect(idea(page, PICNIC)).toBeVisible();
  });

  for (const { width, theme } of [
    { width: 320, theme: 'light' },
    { width: 360, theme: 'light' },
    { width: 390, theme: 'dark' },
    { width: 430, theme: 'light' },
    { width: 1280, theme: 'dark' },
  ] as const) {
    test(`discovery reflows at ${width}px ${theme}`, async ({
      page,
    }, info: TestInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(
        (choice) => localStorage.setItem('eimir.theme', choice),
        theme,
      );
      await installDateIdeaMocks(page, { pro: true });
      await signIn(page);
      await openFromWishes(page);
      await expect(idea(page, PICNIC)).toBeVisible();
      await captureScreenshot(
        page,
        info,
        `date-inspiration-${width}-${theme}.png`,
      );
      await idea(page, PICNIC).scrollIntoViewIfNeeded();
      await captureScreenshot(
        page,
        info,
        `date-inspiration-${width}-${theme}-cards.png`,
      );
      await page.getByRole('button', { name: dateIdeas.filters.more }).click();
      if (width === 320) {
        // 200 % text must still reflow without horizontal scrolling.
        await page.addStyleTag({
          content: 'html { font-size: 200% !important; }',
        });
      }
      await assertNoHorizontalOverflow(page);
      if (width !== 320) await assertNoWcagViolations(page);
      await captureScreenshot(
        page,
        info,
        `date-inspiration-${width}-${theme}-filters.png`,
      );
    });
  }
});

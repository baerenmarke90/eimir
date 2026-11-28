import { expect, type Page, type TestInfo, test } from '@playwright/test';
import dateIdeas from '../../src/i18n/locales/dateIdeas';
import m5s3 from '../../src/i18n/locales/m5s3';
import proPaywall from '../../src/i18n/locales/proPaywall';
import AxeBuilder from '../support/axe';
import {
  catalogIdea,
  categoryLabel,
  installDateIdeaMocks,
  placeLabel,
  signIn,
} from '../support/dateIdeas';
import { captureScreenshot } from '../support/storyTimelineFixture';
import germanUi from '../../src/i18n/locales/de';

/*
 * #1892: Pro date inspiration and the shared Pro paywall. Since #1907 J1 solo
 * browsing starts from the Wish composer; the shared round has its own pick
 * mode. Free Spaces see a calm hint without a catalog read and can open the
 * paywall deliberately. Pro Spaces filter the editorial catalog in one sheet
 * and adopt an idea only through the existing composers, returning to the
 * same filters.
 */

const EXISTING_WISH = '55555555-5555-4555-8555-555555555551';
const EXISTING_WISH_TITLE = 'Night train to Vienna';
const FIRST = catalogIdea('eimir-date-001');

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

async function openFromWishes(
  page: Page,
  capture?: { info: TestInfo; name: string },
): Promise<void> {
  await page.goto('/plan#wishes');
  await page
    .getByRole('link', { name: m5s3.overview.addWish, exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan\/wishes\/new$/);
  const entry = page.getByRole('link', {
    name: new RegExp(dateIdeas.composerHintAction),
  });
  await expect(entry).toBeVisible();
  if (capture) await captureScreenshot(page, capture.info, capture.name);
  await entry.click();
  await expect(page).toHaveURL(/\/plan\/ideas$/);
  await expect(
    page.getByRole('heading', { level: 1, name: dateIdeas.title }),
  ).toBeVisible();
}

function idea(page: Page, title: string) {
  return page.getByRole('article', { name: title });
}

async function openFilters(page: Page) {
  await page.getByRole('button', { name: dateIdeas.filters.open }).click();
  const sheet = page.getByRole('dialog', { name: dateIdeas.filters.label });
  await expect(sheet).toBeVisible();
  return sheet;
}

function back(page: Page) {
  return page.getByRole('button', { name: germanUi.common.back }).first();
}

test.describe('date inspiration and Pro paywall (#1892)', () => {
  test('Free: calm hint without catalog read, deliberate paywall and return', async ({
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
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(state.catalogRequests).toBe(0);
    expect(state.imageRequests).toEqual([]);
    await captureScreenshot(page, info, 'date-inspiration-free-390-light.png');

    await page.getByRole('link', { name: dateIdeas.locked.action }).click();
    await expect(page).toHaveURL(/\/more\/pro\?context=dateIdeas$/);
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: proPaywall.contexts.dateIdeas.title,
      }),
    ).toBeVisible();
    const yearly = page.getByRole('radio', {
      name: new RegExp(proPaywall.plans.yearly.name),
    });
    const monthly = page.getByRole('radio', {
      name: new RegExp(proPaywall.plans.monthly.name),
    });
    await expect(yearly).toBeChecked();
    await expect(page.getByText(proPaywall.forBoth)).toBeVisible();
    await expect(page.getByText(proPaywall.unavailableTitle)).toBeVisible();
    await expect(
      page.getByRole('button', { name: proPaywall.purchase.yearly }),
    ).toHaveCount(0);
    await assertNoWcagViolations(page);
    await captureScreenshot(page, info, 'paywall-dateIdeas-390-light.png', {
      fullPage: true,
    });
    await monthly.check();
    await expect(monthly).toBeChecked();

    await back(page).click();
    await expect(page).toHaveURL(/\/plan\/ideas$/);
    expect(state.catalogRequests).toBe(0);
    expect(state.unexpected).toEqual([]);
  });

  test('Pro: filter, save via the Wish composer, plan via conversion, return', async ({
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
    await expect(page.getByText('200 Ideen')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(24);
    await page
      .getByRole('button', {
        name: dateIdeas.showMore_other.replace('{{count}}', '24'),
      })
      .click();
    await expect(page.getByRole('article')).toHaveCount(48);

    const sheet = await openFilters(page);
    await sheet
      .getByRole('button', { name: categoryLabel('food_drink'), exact: true })
      .click();
    await sheet
      .getByRole('group', { name: dateIdeas.filters.placeLegend })
      .getByRole('button', { name: placeLabel('home') })
      .click();
    await sheet
      .getByRole('button', {
        name: new RegExp(dateIdeas.filters.show_other.replace('{{count}}', '')),
      })
      .click();
    await expect(sheet).toBeHidden();
    // Active filters stay visible as removable chips above the ideas.
    const food = page.getByRole('button', {
      name: dateIdeas.filters.remove.replace(
        '{{label}}',
        categoryLabel('food_drink'),
      ),
    });
    await expect(food).toBeVisible();
    const target = idea(page, FIRST.title);
    await expect(target).toBeVisible();
    // The idea's own image, loaded through the protected API, with alt text.
    const picture = target.getByRole('img', { name: FIRST.image.alt });
    await expect(picture).toBeVisible();
    await expect
      .poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(1200);
    expect(state.imageRequests).toContain('eimir-date-001');
    const count = await page.getByRole('article').count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(200);

    await target.getByRole('link', { name: dateIdeas.card.save }).click();
    await expect(page).toHaveURL(/\/plan\/wishes\/new$/);
    await expect(page.locator('#planning-create-title')).toHaveValue(
      FIRST.wishTitle,
    );
    expect(state.wishCreates).toHaveLength(0);
    await page.getByRole('button', { name: germanUi.common.save }).click();
    await expect(page).toHaveURL(/\/plan\/wishes\/66666666-/);
    expect(state.wishCreates).toHaveLength(1);
    expect(state.wishCreates[0].body).toMatchObject({
      title: FIRST.wishTitle,
      description: FIRST.description,
    });
    expect(state.wishCreates[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);

    await back(page).click();
    await expect(page).toHaveURL(/\/plan\/ideas$/);
    await expect(food).toBeVisible();
    const saved = idea(page, FIRST.title);
    await expect(
      saved.getByRole('link', { name: dateIdeas.card.saved }),
    ).toBeVisible();
    await assertNoWcagViolations(page);
    await captureScreenshot(page, info, 'date-inspiration-saved-390-light.png');

    await saved.getByRole('link', { name: dateIdeas.card.plan }).click();
    await expect(page).toHaveURL(/\/plan\/wishes\/66666666-/);
    await expect(page.locator('#wish-plan-title')).toHaveValue(FIRST.planTitle);
    await page.getByRole('button', { name: m5s3.wish.convert }).click();
    await expect(page).toHaveURL(/\/plan\/plans\/77777777-/);
    expect(state.conversions).toHaveLength(1);
    expect(state.conversions[0].ifMatch).toBeTruthy();
    expect(state.conversions[0].body).toMatchObject({
      title: FIRST.planTitle,
    });
    expect(state.unexpected).toEqual([]);
  });

  test('Pro: plan an unsaved idea in the existing composer', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const state = await installDateIdeaMocks(page, { pro: true });
    await signIn(page);
    await openFromWishes(page);
    await idea(page, FIRST.title)
      .getByRole('link', { name: dateIdeas.card.plan })
      .click();
    await expect(page).toHaveURL(/\/plan\/plans\/new$/);
    await expect(page.locator('#planning-create-title')).toHaveValue(
      FIRST.planTitle,
    );
    await page.getByRole('button', { name: germanUi.common.save }).click();
    await expect(page).toHaveURL(/\/plan\/plans\/77777777-/);
    expect(state.createdPlans[0]).toMatchObject({
      title: FIRST.planTitle,
      description: FIRST.description,
    });
    expect(state.wishCreates).toHaveLength(0);
    expect(state.unexpected).toEqual([]);
  });

  test('closing an unchanged prefilled composer saves nothing and needs no prompt', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await installDateIdeaMocks(page, { pro: true });
    await signIn(page);
    await openFromWishes(page);
    await idea(page, FIRST.title)
      .getByRole('link', { name: dateIdeas.card.save })
      .click();
    await expect(page).toHaveURL(/\/plan\/wishes\/new$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/plan\/ideas$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(state.wishCreates).toHaveLength(0);
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
    await expect(idea(page, FIRST.title)).toBeVisible();
  });

  test('the general paywall confirms an active Pro grant', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('eimir.theme', 'dark'));
    await installDateIdeaMocks(page, { pro: true });
    await signIn(page);
    await page.goto('/more/pro');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: proPaywall.contexts.general.title,
      }),
    ).toBeVisible();
    await expect(page.getByText(proPaywall.active.title)).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(0);
    const everyday = page.locator('summary', {
      hasText: proPaywall.catalogue.groups.everyday,
    });
    await everyday.click();
    await expect(
      page.getByText(proPaywall.catalogue.features.onceMessages.body),
    ).toBeVisible();
    await expect(everyday.locator('..').locator('dl')).toHaveCSS(
      'animation-name',
      'none',
    );
    await assertNoWcagViolations(page);
    await captureScreenshot(page, info, 'paywall-active-390-dark.png');
  });

  test('Free: explore the Pro features from Account and return', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({
      colorScheme: 'light',
      reducedMotion: 'no-preference',
    });
    const state = await installDateIdeaMocks(page, { pro: false });
    await signIn(page);
    await page.goto('/more/settings/account');
    await page.getByRole('link', { name: /eimir\. Pro/ }).click();
    await expect(page).toHaveURL(/\/more\/pro$/);
    await expect(page.getByText(proPaywall.webUnavailableBody)).toBeVisible();

    const section = page.getByRole('region', {
      name: proPaywall.catalogue.title,
    });
    const memories = section.locator('summary', {
      hasText: proPaywall.catalogue.groups.memories,
    });
    const map = section.getByText(proPaywall.catalogue.features.memoryMap.body);
    await expect(map).toBeHidden();
    await memories.focus();
    await memories.press('Enter');
    await expect(map).toBeVisible();
    await expect(memories.locator('..').locator('dl')).toHaveCSS(
      'animation-name',
      'eimir-motion-enter-shift',
    );
    await assertNoHorizontalOverflow(page);
    await assertNoWcagViolations(page);
    await captureScreenshot(page, info, 'paywall-catalogue-360-light.png', {
      fullPage: true,
    });
    await memories.press('Space');
    await expect(map).toBeHidden();
    expect(state.catalogRequests).toBe(0);
    await back(page).click();
    await expect(page).toHaveURL(/\/more\/settings\/account$/);
  });

  for (const { width, theme } of [
    { width: 320, theme: 'light' },
    { width: 360, theme: 'light' },
    { width: 390, theme: 'dark' },
    { width: 430, theme: 'light' },
    { width: 1280, theme: 'dark' },
  ] as const) {
    test(`discovery and paywall reflow at ${width}px ${theme}`, async ({
      page,
    }, info: TestInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript(
        (choice) => localStorage.setItem('eimir.theme', choice),
        theme,
      );
      const state = await installDateIdeaMocks(page, { pro: true });
      await signIn(page);
      await openFromWishes(page, {
        info,
        name: `date-inspiration-composer-hint-${width}-${theme}.png`,
      });
      await expect(idea(page, FIRST.title)).toBeVisible();
      await captureScreenshot(
        page,
        info,
        `date-inspiration-${width}-${theme}.png`,
      );
      await openFilters(page);
      if (width === 320)
        // 200 % text must still reflow without horizontal scrolling.
        await page.addStyleTag({
          content: 'html { font-size: 200% !important; }',
        });
      await assertNoHorizontalOverflow(page);
      if (width !== 320) await assertNoWcagViolations(page);
      await captureScreenshot(
        page,
        info,
        `date-inspiration-${width}-${theme}-filters.png`,
      );

      state.pro = false;
      const context = width === 320 || width === 1280 ? 'general' : 'recaps';
      await page.goto(`/more/pro?context=${context}`);
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: proPaywall.contexts[context].title,
        }),
      ).toBeVisible();
      if (context === 'general') {
        await page
          .locator('summary', {
            hasText: proPaywall.catalogue.groups.integrations,
          })
          .click();
        await expect(
          page.getByText(proPaywall.catalogue.features.calendarSync.body),
        ).toBeVisible();
      }
      if (width === 320)
        await page.addStyleTag({
          content: 'html { font-size: 200% !important; }',
        });
      await assertNoHorizontalOverflow(page);
      if (width !== 320) await assertNoWcagViolations(page);
      await captureScreenshot(page, info, `paywall-${width}-${theme}.png`, {
        fullPage: true,
      });
    });
  }
});

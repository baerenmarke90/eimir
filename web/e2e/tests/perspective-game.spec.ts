import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { WHO_OF_US_QUESTION_IDS } from '../../src/client/whoOfUsSession';
import de from '../../src/i18n/locales/de';
import games from '../../src/i18n/locales/games';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { renderedContrast } from '../support/renderedContrast';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '44444444-4444-4444-8444-444444444444';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const SPACE_PATH = `/api/v1/spaces/${SPACE_ID}`;
const CREATED_AT = '2026-10-17T08:00:00Z';
const copy = games.whoOfUs;

function localized(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, String(value)),
    template,
  );
}

async function installMocks(page: Page) {
  const unexpected: string[] = [];
  const writes: string[] = [];
  const responses: Record<string, unknown> = {
    '/api/v1/instance/status': {
      maintenanceMode: false,
      registrationAvailable: true,
      registrationUnavailableReason: null,
      auth: {
        localPassword: true,
        passkey: true,
        magicLink: true,
        oidc: false,
      },
    },
    '/api/v1/auth/me': { id: ACCOUNT_ID, displayName: 'Lea' },
    '/api/v1/auth/capabilities': { serverAdmin: false },
    '/api/v1/auth/memberships': [
      { role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' },
    ],
    [SPACE_PATH]: {
      id: SPACE_ID,
      createdAt: CREATED_AT,
      partners: [
        { id: ACCOUNT_ID, displayName: 'Lea' },
        { id: PARTNER_ID, displayName: 'Alex' },
      ],
    },
    [`${SPACE_PATH}/entitlements`]: {
      spaceId: SPACE_ID,
      tier: 'PREMIUM',
      status: 'ACTIVE',
      effectiveUntil: null,
      isInGracePeriod: false,
      capabilities: ['games.couple'],
    },
    [`${SPACE_PATH}/partner-nickname`]: {
      nickname: null,
      partnerId: PARTNER_ID,
      version: 0,
    },
    [`${SPACE_PATH}/notifications/unread-count`]: { unreadCount: 0 },
  };
  for (const [id, displayName] of [
    [ACCOUNT_ID, 'Lea'],
    [PARTNER_ID, 'Alex'],
  ]) {
    responses[`${SPACE_PATH}/profiles/${id}`] = {
      id,
      accountId: id,
      displayName,
      birthday: null,
      profileAttachmentId: null,
      preferences: [],
      version: 1,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
  }
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await route.fulfill({
        json: {
          account: { id: ACCOUNT_ID, displayName: 'Lea' },
          tokens: {
            accessToken: 'perspective-test-access-token',
            refreshToken: 'perspective-test-refresh-token',
            accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
            refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          },
        },
      });
      return;
    }
    if (request.method() === 'POST' && pathname === `${SPACE_PATH}/presence`) {
      await route.fulfill({ json: { state: null } });
      return;
    }
    if (request.method() !== 'GET')
      writes.push(`${request.method()} ${pathname}`);
    if (request.method() === 'GET' && pathname in responses) {
      await route.fulfill({ json: responses[pathname] });
      return;
    }
    unexpected.push(`${request.method()} ${pathname}`);
    await route.fulfill({
      status: 500,
      json: { code: 'E2E_UNEXPECTED_REQUEST' },
    });
  });
  return { unexpected, writes };
}

async function openGames(page: Page) {
  await page.goto('/games');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  const start = page.getByRole('button', {
    name: new RegExp(games.entries.perspective.title),
  });
  await expect(start).toBeVisible();
  return start;
}

async function expectReflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
}

async function capture(page: Page, info: TestInfo, name: string) {
  const output = info.outputPath(name);
  await page.screenshot({ path: output, fullPage: true });
  if (process.env.VISUAL_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.VISUAL_EVIDENCE_DIR, { recursive: true });
    fs.copyFileSync(output, path.join(process.env.VISUAL_EVIDENCE_DIR, name));
  }
}

const cases = [
  { width: 320, theme: 'light', reduce: true, largeText: false },
  { width: 360, theme: 'dark', reduce: true, largeText: true },
  { width: 390, theme: 'light', reduce: false, largeText: false },
  { width: 430, theme: 'dark', reduce: true, largeText: false },
  { width: 1280, theme: 'dark', reduce: true, largeText: false },
] as const;

for (const scenario of cases) {
  test(`perspective game conceals, reveals, restarts and returns at ${scenario.width}px ${scenario.theme}`, async ({
    page,
  }, info) => {
    const network = await installMocks(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: scenario.width, height: 844 });
    await page.emulateMedia({
      colorScheme: scenario.theme,
      reducedMotion: scenario.reduce ? 'reduce' : 'no-preference',
    });
    const start = await openGames(page);
    if (scenario.largeText) {
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });
    }
    await start.click();
    const total = WHO_OF_US_QUESTION_IDS.length;
    for (let round = 0; round < total; round += 1) {
      const first = round % 2 === 0 ? 'Lea' : 'Alex';
      const second = round % 2 === 0 ? 'Alex' : 'Lea';
      await expect(
        page.getByText(localized(copy.round, { current: round + 1, total })),
      ).toBeVisible();
      const question = await page
        .locator('#who-of-us-question-title')
        .innerText();
      await expectReflow(page);
      await page
        .getByRole('button', {
          name: localized(copy.choiceAria, { responder: first, choice: 'Lea' }),
        })
        .click();
      const confirm = page.getByRole('button', {
        name: localized(copy.handoffConfirm, { name: second }),
      });
      await expect(confirm).toBeVisible();
      await expect(page.getByText(copy.choosePrompt)).toHaveCount(0);
      await expect(page.getByText(question, { exact: true })).toHaveCount(0);
      await expect(page.locator('.who-of-us-choice')).toHaveCount(0);
      await expect(page.locator('.who-of-us-reveal-answers')).toHaveCount(0);
      await expectReflow(page);
      if (round === 0) {
        const axe = await new AxeBuilder({ page })
          .include('.games-product-page')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(axe.violations).toEqual([]);
        if (scenario.width === 390 || scenario.width === 1280) {
          await capture(
            page,
            info,
            `perspective-handoff-${scenario.width}-${scenario.theme}.png`,
          );
        }
      }
      await confirm.click();
      await expect(page.getByText(question, { exact: true })).toBeVisible();
      await expect(page.locator('.who-of-us-reveal-answers')).toHaveCount(0);
      await page
        .getByRole('button', {
          name: localized(copy.choiceAria, {
            responder: second,
            choice: round % 2 === 0 ? 'Lea' : 'Alex',
          }),
        })
        .click();
      await expect(
        page.getByRole('heading', {
          name: round % 2 === 0 ? copy.sameTitle : copy.differentTitle,
        }),
      ).toBeVisible();
      await expect(page.locator('.who-of-us-reveal')).toHaveAttribute(
        'data-outcome',
        round % 2 === 0 ? 'same' : 'different',
      );
      await expect(page.locator('.who-of-us-reveal-answers dd')).toHaveText([
        'Lea',
        round % 2 === 0 ? 'Lea' : 'Alex',
      ]);
      await expectReflow(page);
      if (round === 0 && (scenario.width === 390 || scenario.width === 1280)) {
        await capture(
          page,
          info,
          `perspective-reveal-${scenario.width}-${scenario.theme}.png`,
        );
      }
      if (round === 1) {
        const axe = await new AxeBuilder({ page })
          .include('.games-product-page')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(axe.violations).toEqual([]);
      }
      await page.getByRole('button', { name: copy.continue }).click();
    }
    await expect(
      page.getByRole('heading', { name: copy.finishTitle }),
    ).toBeVisible();
    await expect(
      page.getByText(
        localized(copy.finishAgreement, {
          count: total / 2,
          total,
        }),
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: copy.restart }).click();
    await expect(
      page.getByText(localized(copy.round, { current: 1, total })),
    ).toBeVisible();
    await expect(
      page.getByText(localized(copy.agreementCount, { count: 0 })),
    ).toBeVisible();
    await page.getByRole('button', { name: copy.back, exact: true }).click();
    await expect(start).toBeVisible();
    await start.click();
    await expect(
      page.getByText(localized(copy.round, { current: 1, total })),
    ).toBeVisible();
    await expect(
      page.getByText(localized(copy.agreementCount, { count: 0 })),
    ).toBeVisible();
    await expect(page.locator('.who-of-us-reveal-answers')).toHaveCount(0);
    await page.getByRole('button', { name: copy.back, exact: true }).click();
    await expect(start).toBeVisible();
    expect(network.unexpected).toEqual([]);
    expect(network.writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`perspective Back retains contrast, focus and keyboard return in ${theme}`, async ({
    page,
  }, info) => {
    const network = await installMocks(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const start = await openGames(page);
    const measurements = [];
    for (const width of [320, 360, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate((largeText) => {
        document.documentElement.style.fontSize = largeText ? '200%' : '';
      }, width === 360);
      await start.click();
      await expect(page.locator('#who-of-us-question-title')).toBeVisible();
      const back = page.getByRole('button', { name: copy.back, exact: true });
      await expect(back).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const normal = await renderedContrast(back);
      if (
        process.env.VISUAL_EVIDENCE_DIR &&
        (width === 390 || width === 1280)
      ) {
        await capture(page, info, `perspective-back-${width}-${theme}.png`);
      }
      expect(
        normal.ratio,
        `${width}px ${theme} Back text`,
      ).toBeGreaterThanOrEqual(4.5);
      const bounds = await back.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
      await expectReflow(page);

      // Start keyboard navigation from the control's previous tab stop.
      await back.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(back).toBeFocused();
      const focusStyle = await back.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          visible: element.matches(':focus-visible'),
          width: Number.parseFloat(style.outlineWidth),
          style: style.outlineStyle,
        };
      });
      expect(focusStyle.visible).toBe(true);
      expect(focusStyle.width).toBeGreaterThanOrEqual(2);
      expect(focusStyle.style).toBe('solid');
      const focus = await renderedContrast(back, 'outline-color');
      expect(focus.ratio).toBeGreaterThanOrEqual(3);
      const focusedText = await renderedContrast(back);
      expect(focusedText.ratio).toBeGreaterThanOrEqual(4.5);
      if (width === 360 || width === 390 || width === 1280) {
        await capture(
          page,
          info,
          `perspective-back-focus-${width}-${theme}.png`,
        );
      }
      await back.hover();
      const hover = await renderedContrast(back);
      expect(hover.ratio).toBeGreaterThanOrEqual(4.5);
      await back.press('Enter');
      await expect(start).toBeVisible();
      await start.click();
      await expect(
        page.getByText(
          localized(copy.round, {
            current: 1,
            total: WHO_OF_US_QUESTION_IDS.length,
          }),
        ),
      ).toBeVisible();
      await expect(page.locator('.who-of-us-reveal-answers')).toHaveCount(0);
      await back.press('Space');
      await expect(start).toBeVisible();
      measurements.push({
        width,
        largeText: width === 360,
        normal,
        focus,
        focusedText,
        hover,
        bounds,
      });
    }
    const output = info.outputPath(`perspective-back-${theme}.json`);
    fs.writeFileSync(output, `${JSON.stringify(measurements, null, 2)}\n`);
    await info.attach(`perspective-back-${theme}`, {
      path: output,
      contentType: 'application/json',
    });
    if (process.env.VISUAL_EVIDENCE_DIR) {
      fs.copyFileSync(
        output,
        path.join(
          process.env.VISUAL_EVIDENCE_DIR,
          `perspective-back-${theme}.json`,
        ),
      );
    }
    expect(network.unexpected).toEqual([]);
    expect(network.writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}

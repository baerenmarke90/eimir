import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import copy from '../../src/i18n/locales/wirDesign';
import quoteCopy from '../../src/i18n/locales/dailyQuote';
import profileCopy from '../../src/i18n/locales/profileIdentity';
import energyCopy from '../../src/i18n/locales/dailyEnergy';
import reflections from '../../src/i18n/locales/relationshipReflections';
import notificationCopy from '../../src/i18n/locales/notificationSettings';
import { DASHBOARD_MODULE_KEYS } from '../../src/client/dashboardModules';
import fs from 'node:fs';
import {
  PARTNER_ID,
  SPACE_ID,
  PARTNER,
  installMocks,
  signIn,
  captureScreenshot,
} from '../support/storyTimelineFixture';

async function fixture(
  page: Page,
  options: { pro?: boolean; initial?: string; failure?: number } = {},
) {
  const unexpected = await installMocks(page, { strict: true });
  let current = options.initial ?? 'warm';
  let version = 0;
  let pro = options.pro !== false;
  let failure = options.failure ?? 0;
  const writes: string[] = [];
  const base = `/api/v1/spaces/${SPACE_ID}`;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.includes('/attachments/') && path.endsWith('/content')) {
      return route.fulfill({
        contentType: 'image/jpeg',
        body: fs.readFileSync(
          new URL(
            '../../../backend/demo_assets/images/cabin-lake.jpg',
            import.meta.url,
          ),
        ),
      });
    }
    if (path === `${base}/appearance/wir-design`) {
      if (request.method() === 'PATCH') {
        writes.push(request.postDataJSON().designId);
        expect(request.headers()['if-match']).toBe(`"appearance:${version}"`);
        if (failure)
          return route.fulfill({
            status: failure,
            json: {
              title: 'Synthetic outage',
              status: failure,
              code:
                failure === 409
                  ? 'RESOURCE_VERSION_CONFLICT'
                  : 'SERVICE_UNAVAILABLE',
            },
          });
        expect(pro || request.postDataJSON().designId === 'warm').toBe(true);
        current = request.postDataJSON().designId;
        version++;
      }
      return route.fulfill({
        json: { designId: current, version },
        headers: { ETag: `"appearance:${version}"` },
      });
    }
    if (path === `${base}/entitlements`)
      return route.fulfill({
        json: {
          spaceId: SPACE_ID,
          tier: pro ? 'PREMIUM' : 'FREE',
          status: 'ACTIVE',
          isInGracePeriod: false,
          capabilities: [
            'daily.quote',
            ...(pro ? ['theme.bespoke_packs', 'relationship.passport'] : []),
          ],
        },
      });
    if (path === `${base}/configuration`)
      return route.fulfill({
        json: {
          spaceId: SPACE_ID,
          version: 1,
          canManageSpaceConfiguration: false,
          dailyContextTimezone: 'Europe/Berlin',
          dailyQuestionsEnabled: false,
          loveNotesEnabled: false,
          sharedAchievementsEnabled: false,
          supportGesturesEnabled: false,
          energyCheckInEnabled: true,
          energyVisibilityMode: 'IMMEDIATE',
          vibeCheckEnabled: true,
          vibeVisibilityMode: 'IMMEDIATE',
        },
        headers: { ETag: '"1"' },
      });
    if (path === `${base}/profiles/${PARTNER_ID}`)
      return route.fulfill({
        json: {
          id: 'partner-profile',
          accountId: PARTNER_ID,
          displayName: PARTNER.displayName,
          profileAttachmentId: null,
          preferences: [],
          version: 1,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      });
    if (path === `${base}/daily-quote/catalog`)
      return route.fulfill({ json: { categories: [], sources: [] } });
    if (path === `${base}/daily-check-in/today`)
      return route.fulfill({
        json: {
          checkedOn: '2026-10-29',
          dailyContextTimezone: 'Europe/Berlin',
          own: { energyLevel: null, vibe: 'GOOD', vibeNote: null, version: 1 },
          energy: {
            visibilityMode: 'IMMEDIATE',
            partner: { state: 'NO_CHECK_IN' },
          },
          vibe: {
            visibilityMode: 'IMMEDIATE',
            partner: { state: 'VISIBLE', value: 'GOOD' },
            partnerNote: null,
          },
        },
        headers: { ETag: '"today:1"' },
      });
    if (path === `${base}/daily-quote`)
      return route.fulfill({
        json: {
          checkedOn: '2026-10-29',
          enabled: true,
          quote: {
            id: 'fixture-quote',
            text: 'A calm thought for our day together.',
            authorDisplay: 'Example Author',
            sourceDisplay: 'Example Source',
            sourceId: 'classic_literature',
            categoryIds: ['love'],
            locale: 'de',
            rightsClassification: 'PUBLIC_DOMAIN',
            attributionRequired: true,
          },
        },
      });
    if (path === `${base}/dashboard/preferences`)
      return route.fulfill({ json: { items: [] } });
    if (path === `${base}/profile-preferences`)
      return route.fulfill({ json: [] });
    if (path === `${base}/activity`)
      return route.fulfill({
        json: { items: [], hasMore: false, nextCursor: null },
      });
    if (path === `${base}/dashboard`)
      return route.fulfill({
        json: {
          space: { spaceId: SPACE_ID, partner: PARTNER },
          relationshipDuration: {
            startedOn: '2023-07-04',
            daysTogether: 1213,
            displayMode: 'DAYS',
          },
          retrospective: null,
          keepsake: {
            type: 'MEMORY',
            id: 'mem-canal',
            titleOrText: 'Our morning by the lake',
            occurredOn: '2026-10-12',
            previewAttachmentId: 'att-canal-1',
            previewIsSensitive: true,
          },
          upcoming: [
            {
              type: 'PLAN',
              id: 'special-plan',
              titleOrText: 'A special weekend',
              scheduledOn: '2099-11-10',
            },
          ],
          anticipation: {
            planId: 'special-plan',
            title: 'A special weekend',
            eventOn: '2099-11-10',
            daysRemaining: 12,
          },
          recentShared: [],
          sharedStorySummary: { memories: 3, heartMoments: 2, milestones: 1 },
          viewerLocalDate: '2026-10-29',
        },
      });
    return route.fallback();
  });
  return {
    writes,
    unexpected,
    setPro: (v: boolean) => {
      pro = v;
    },
    setFailure: (v: number) => {
      failure = v;
    },
  };
}
async function open(page: Page) {
  await page.goto('/more/settings/appearance');
  await expect(page.getByText(copy.loading, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: copy.change }).click();
  await expect(page.getByRole('dialog', { name: copy.choices })).toBeVisible();
  await expect(page.getByText(copy.proLoading, { exact: true })).toHaveCount(0);
}
async function reflow(page: Page) {
  const overflow = await page.evaluate(() =>
    Array.from(document.querySelectorAll('body *'))
      .filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);
      })
      .map((node) => ({
        tag: node.tagName,
        className: node.getAttribute('class'),
        width: Math.round(node.getBoundingClientRect().width),
      }))
      .slice(0, 20),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    JSON.stringify(overflow),
  ).toBe(true);
}

async function alignedVisibilityControls(page: Page) {
  const centers = await page
    .locator('.dashboard-module-option input[type="checkbox"]')
    .evaluateAll((inputs) =>
      inputs.map((input) => {
        const bounds = input.getBoundingClientRect();
        return bounds.x + bounds.width / 2;
      }),
    );
  expect(centers.length).toBe(DASHBOARD_MODULE_KEYS.length);
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1);
  const targets = await page
    .locator('.dashboard-module-option')
    .evaluateAll((rows) =>
      rows.map((row) => {
        const label = row.querySelector('.dashboard-module-option-label');
        const target = row.querySelector('.dashboard-module-switch');
        if (!label || !target) throw new Error('Missing visibility control');
        const text = label.getBoundingClientRect();
        const bounds = target.getBoundingClientRect();
        return {
          width: bounds.width,
          height: bounds.height,
          overlapsLabel:
            bounds.left < text.right &&
            bounds.right > text.left &&
            bounds.top < text.bottom &&
            bounds.bottom > text.top,
        };
      }),
    );
  expect(targets).toHaveLength(DASHBOARD_MODULE_KEYS.length);
  for (const target of targets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.overlapsLabel).toBe(false);
  }
}
for (const [width, theme, large] of [
  [320, 'light', false],
  [360, 'light', false],
  [390, 'dark', false],
  [430, 'light', false],
  [1280, 'dark', false],
  [390, 'dark', true],
] as const) {
  test(`three personal designs save, return and reload at ${width} ${theme}${large ? ' large text' : ''}`, async ({
    page,
  }, info) => {
    // Three full save/return/reload cycles and three axe passes share this journey.
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const f = await fixture(page);
    await signIn(page);
    if (large)
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () =>
          document.documentElement.style.setProperty(
            'font-size',
            '200%',
            'important',
          ),
        );
      });
    await page.goto('/today');
    await expect(page.locator('.today-page')).toHaveAttribute(
      'data-wir-design',
      'warm',
    );
    for (const design of ['warm', 'modern', 'classic'] as const) {
      if (design !== 'warm') {
        await open(page);
        const radio = page.getByRole('radio', {
          name: new RegExp(copy.names[design]),
        });
        await radio.focus();
        await page.keyboard.press('Space');
        await expect(radio).toBeChecked();
        await captureScreenshot(
          page,
          info,
          `selector-${design}-${width}-${theme}${large ? '-large' : ''}.png`,
        );
        await page
          .getByRole('button', { name: copy.save, exact: true })
          .click();
        await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
        await page
          .getByRole('button', { name: copy.close, exact: true })
          .click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.goto('/today');
      }
      await expect(page.locator('.today-page')).toHaveAttribute(
        'data-wir-design',
        design,
      );
      await expect(page.locator('.couple-presence-eyebrow')).toHaveCount(
        design === 'warm' ? 1 : 0,
      );
      if (design === 'warm') {
        await expect(page.locator('.today-page')).toHaveAttribute(
          'data-color-world',
          'warm',
        );
        await expect(page.locator('.couple-presence-eyebrow')).toHaveText(
          copy.welcome,
        );
        await expect(page.locator('.daily-quote-card')).toHaveCSS(
          'background-color',
          'rgba(0, 0, 0, 0)',
        );
        await expect(page.locator('.daily-vibe-person').first()).toHaveCSS(
          'background-color',
          'rgba(0, 0, 0, 0)',
        );
      }
      await expect(page.locator('.daily-vibe-checkin')).toBeVisible();
      await expect(page.locator('.daily-quote-card')).toBeVisible();
      await expect(page.locator('.anticipation-card')).toBeVisible();
      await reflow(page);
      const battery = page
        .locator('.today-hero')
        .getByRole('button', { name: energyCopy.badgeAriaEmpty });
      await battery.click();
      await expect(page.getByTestId('daily-energy-popover')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('daily-energy-popover')).toHaveCount(0);
      await captureScreenshot(
        page,
        info,
        `wir-${design}-${width}-${theme}${large ? '-large' : ''}.png`,
        { fullPage: true },
      );
      const issues = await new AxeBuilder({ page })
        .include('.today-page')
        .analyze();
      expect(issues.violations).toEqual([]);
      await page.reload();
      await expect(page.locator('.today-page')).toHaveAttribute(
        'data-wir-design',
        design,
      );
    }
    expect(f.writes).toEqual(['modern', 'classic']);
    expect(f.unexpected).toEqual([]);
  });
}
test('Free can preview, cancel, retain a saved Pro design and reset to Geborgen', async ({
  page,
}) => {
  const f = await fixture(page, { pro: false, initial: 'classic' });
  await signIn(page);
  await open(page);
  await page
    .getByRole('radio', { name: new RegExp(copy.names.modern) })
    .check();
  await expect(page.getByRole('button', { name: copy.discover })).toBeVisible();
  expect(f.writes).toEqual([]);
  await page.getByRole('button', { name: copy.close, exact: true }).click();
  await page.goto('/today');
  await expect(page.locator('.today-page')).toHaveAttribute(
    'data-wir-design',
    'classic',
  );
  await open(page);
  await page.getByRole('radio', { name: new RegExp(copy.names.warm) }).check();
  await page.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
  expect(f.writes).toEqual(['warm']);
  expect(f.unexpected).toEqual([]);
});
test('failure keeps the draft and confirmed retry changes the visible design', async ({
  page,
}) => {
  const f = await fixture(page, { failure: 503 });
  await signIn(page);
  await open(page);
  await page
    .getByRole('radio', { name: new RegExp(copy.names.modern) })
    .check();
  await page.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByText(copy.error, { exact: true })).toBeVisible();
  await expect(page.getByText(copy.saved, { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('radio', { name: new RegExp(copy.names.modern) }),
  ).toBeChecked();
  f.setFailure(0);
  await page.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
  expect(f.writes).toEqual(['modern', 'modern']);
  expect(f.unexpected).toEqual([]);
});

test('quote and statistics order survives pointer release, keyboard movement and reload', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const state = await fixture(page);
  let order = [...DASHBOARD_MODULE_KEYS];
  const orders: string[][] = [];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/dashboard/preferences/order')) {
      order = route.request().postDataJSON().moduleKeys;
      orders.push([...order]);
      return route.fulfill({
        json: {
          items: order.map((moduleKey) => ({ moduleKey, visible: true })),
        },
      });
    }
    if (path.endsWith('/dashboard/preferences'))
      return route.fulfill({
        json: {
          items: order.map((moduleKey) => ({ moduleKey, visible: true })),
        },
      });
    if (path.endsWith('/daily-quote/preferences'))
      return route.fulfill({
        json: {
          enabled: true,
          selectedCategoryIds: [],
          selectedSourceIds: [],
          version: 1,
        },
        headers: { ETag: '"quote-pref:1"' },
      });
    return route.fallback();
  });
  await signIn(page);
  await page.goto('/more/settings/today');
  await expect(page.locator('.dashboard-module-configure')).toHaveCount(0);
  await expect(page.locator('#wir-statistics-setting')).toHaveCount(0);
  await alignedVisibilityControls(page);
  const quote = page.locator('[data-sortable-item-id="daily_quote"]');
  const grip = quote.getByRole('button', {
    name: profileCopy.dashboardOrderHandle.replace('{{name}}', quoteCopy.title),
  });
  await grip.scrollIntoViewIfNeeded();
  const initial = await grip.boundingBox();
  const rowBefore = await quote.boundingBox();
  if (!initial || !rowBefore) throw new Error('Missing visible quote row');
  await page.mouse.move(
    initial.x + initial.width / 2,
    initial.y + initial.height / 2,
  );
  await page.mouse.down();
  const dragDistance = rowBefore.height + 20;
  await page.mouse.move(
    initial.x + initial.width / 2,
    initial.y + initial.height / 2 + dragDistance,
    { steps: 12 },
  );
  await expect(quote).toHaveCSS('box-shadow', 'none');
  await expect(quote).toHaveCSS('outline-style', 'none');
  const held = await quote.boundingBox();
  expect(Math.abs((held?.y ?? 0) - rowBefore.y - dragDistance)).toBeLessThan(4);
  await page.mouse.up();
  await expect.poll(() => orders.length).toBe(1);
  expect(order.indexOf('daily_quote')).toBeGreaterThan(
    order.indexOf('keepsake'),
  );
  const statisticsGrip = page
    .locator('[data-sortable-item-id="shared_story_summary"]')
    .getByRole('button');
  await statisticsGrip.focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => orders.length).toBe(2);
  await page
    .getByRole('checkbox', { name: reflections.passport.wirStatisticsTitle })
    .click();
  await page.reload();
  await expect(
    page.getByRole('checkbox', {
      name: reflections.passport.wirStatisticsTitle,
    }),
  ).toBeChecked();
  expect(
    await page
      .locator('[data-sortable-item-id]')
      .evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-sortable-item-id')),
      ),
  ).toEqual(order);
  await captureScreenshot(page, info, 'settings-order-390-light.png', {
    fullPage: true,
  });
  for (const [width, theme] of [
    [360, 'light'],
    [430, 'dark'],
    [1280, 'dark'],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await alignedVisibilityControls(page);
    await reflow(page);
    await captureScreenshot(
      page,
      info,
      `settings-aligned-${width}-${theme}.png`,
      {
        fullPage: true,
      },
    );
  }
  await page.goto('/today');
  await expect(page.locator('.shared-story-summary')).toBeVisible();
  expect(
    await page
      .locator('.today-section-moment')
      .evaluate((node) =>
        Boolean(
          node.compareDocumentPosition(
            document.querySelector('.daily-quote-card')!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
  ).toBe(true);
  await page.reload();
  await expect(page.locator('.shared-story-summary')).toBeVisible();

  let quoteFailure = true;
  await page.route('**/daily-quote/preferences', (route) =>
    quoteFailure
      ? route.fulfill({
          status: 503,
          json: { title: 'Synthetic outage', status: 503 },
        })
      : route.fallback(),
  );
  await page.goto('/more/settings/today');
  await page.reload();
  const failedQuote = page.locator('[data-sortable-item-id="daily_quote"]');
  const failure = failedQuote.getByRole('status');
  await expect(failure).toContainText(quoteCopy.preferencesUnavailable);
  await alignedVisibilityControls(page);
  const errorBounds = await failure.boundingBox();
  const rowBounds = await failedQuote.boundingBox();
  if (!errorBounds || !rowBounds) throw new Error('Missing quote recovery');
  expect(Math.abs(errorBounds.width - rowBounds.width)).toBeLessThan(1);
  await captureScreenshot(failedQuote, info, 'settings-quote-error-1280-dark.png');
  const issues = await new AxeBuilder({ page })
    .include('.settings-category-page')
    .analyze();
  expect(issues.violations).toEqual([]);
  quoteFailure = false;
  await failedQuote.getByRole('button', { name: quoteCopy.retry }).click();
  await expect(failure).toHaveCount(0);
  await expect(failedQuote.getByRole('checkbox')).toBeEnabled();
  await alignedVisibilityControls(page);
  expect(state.unexpected).toEqual([]);
});

for (const [width, theme] of [
  [390, 'light'],
  [1280, 'dark'],
] as const) {
  test(`concise utility surfaces retain their controls at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await fixture(page);
    const channels = ['IN_APP', 'PUSH', 'EMAIL'];
    const notifications = {
      catalogVersion: 2,
      quietHours: {
        enabled: false,
        start: null,
        end: null,
        timeZone: 'Europe/Berlin',
      },
      capabilities: channels.map((channel) => ({
        channel,
        available: true,
        reason: null,
        ...(channel === 'EMAIL' ? { destination: 'fixture@example.org' } : {}),
      })),
      items: [
        'COMMENT_CREATED',
        'REMINDER_DUE',
        'THINKING_OF_YOU',
        'PARTNER_KISS',
        'PARTNER_CHECK_IN',
      ].map((kind) => ({
        kind,
        deliveryClass: kind === 'COMMENT_CREATED' ? 'DIGESTIBLE' : 'IMMEDIATE',
        channels: channels.map((channel) => ({
          channel,
          configurable: true,
          enabled: channel === 'IN_APP',
        })),
      })),
    };
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/v1/notification-preferences')
        return route.fulfill({ json: notifications });
      if (path.startsWith('/api/v1/notification-preferences/')) {
        const [kind, channel] = path.split('/').slice(-2);
        const choice = notifications.items
          .find((item) => item.kind === kind)
          ?.channels.find((item) => item.channel === channel);
        if (!choice) throw new Error('Unexpected fixture notification write');
        choice.enabled = route.request().postDataJSON().enabled;
        return route.fulfill({
          json: { kind, channel, enabled: choice.enabled },
        });
      }
      if (path.includes('/rules/') && path.endsWith('/preference'))
        return route.fulfill({
          json: {
            ruleKey: path.split('/').at(-2),
            enabled: false,
            parameters: { daysBefore: [1], localTime: '09:00:00' },
          },
        });
      if (path === '/api/v1/account/photo-location-preference')
        return route.fulfill({ json: { enabled: false, version: 1 } });
      return route.fallback();
    });
    await signIn(page);
    await page.goto('/more/settings/notifications');
    await expect(page.locator('.notification-settings-group')).toHaveCount(2);
    await expect(
      page.getByRole('switch', { name: 'Kommentare: E-Mail' }),
    ).toBeHidden();
    await page
      .getByRole('switch', { name: 'Gemeinsame Aktivität: E-Mail' })
      .click();
    await expect(
      page.getByText(notificationCopy.groupSaved, { exact: true }),
    ).toBeVisible();
    expect(
      notifications.items.slice(0, 2).every((item) => item.channels[2].enabled),
    ).toBe(true);
    await captureScreenshot(page, info, `notifications-${width}-${theme}.png`, {
      fullPage: true,
    });
    await reflow(page);
    await page.goto('/more/settings/memories');
    await expect(page).toHaveURL(/\/more\/settings$/);
    await expect(page.locator('a[href="/more/settings/memories"]')).toHaveCount(
      0,
    );
    await page.goto('/more/private');
    await expect(page.locator('.private-area-privacy-banner')).toHaveCount(0);
    await expect(page.locator('.private-area-intro-text')).toHaveCount(1);
    await captureScreenshot(page, info, `private-${width}-${theme}.png`, {
      fullPage: true,
    });
    await page.goto('/more/profile');
    await expect(page.locator('.profile-identity-hero')).toBeVisible();
    const partner = page.locator('.profile-partner-disclosure');
    await expect(partner).not.toHaveAttribute('open');
    await partner.locator(':scope > summary').click();
    await expect(partner).toHaveAttribute('open');
    await partner.locator(':scope > summary').click();
    await captureScreenshot(page, info, `profile-${width}-${theme}.png`, {
      fullPage: true,
    });
    await reflow(page);
    const issues = await new AxeBuilder({ page })
      .include('.profile-page')
      .analyze();
    expect(issues.violations).toEqual([]);
    expect(state.unexpected).toEqual([]);
  });
}

test('Free Wir controls keep readable labels and fit 320px with large text', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const state = await fixture(page, { pro: false });
  await page.route(`**/api/v1/spaces/${SPACE_ID}/entitlements`, (route) =>
    route.fulfill({
      json: {
        spaceId: SPACE_ID,
        tier: 'FREE',
        status: 'ACTIVE',
        effectiveUntil: null,
        isInGracePeriod: false,
        capabilities: [],
      },
    }),
  );
  await signIn(page);
  await page.goto('/more/settings/today');
  const row = page.locator('[data-sortable-item-id="shared_story_summary"]');
  await expect(row.getByRole('checkbox')).toBeDisabled();
  await expect(row.locator('.pro-mark')).toBeVisible();
  await alignedVisibilityControls(page);
  const label = await row
    .locator('.dashboard-module-option-label')
    .boundingBox();
  expect(label?.width).toBeGreaterThan(100);
  await captureScreenshot(page, info, 'settings-free-320-light.png', {
    fullPage: true,
  });
  await reflow(page);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await reflow(page);
  await alignedVisibilityControls(page);
  await captureScreenshot(page, info, 'settings-free-320-large.png', {
    fullPage: true,
  });
  expect(state.unexpected).toEqual([]);
});

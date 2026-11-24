import fs from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { DASHBOARD_MODULE_KEYS } from '../../src/client/dashboardModules';
import quoteCopy from '../../src/i18n/locales/dailyQuote';
import m5s5Copy from '../../src/i18n/locales/m5s5';
import navigation from '../../src/i18n/locales/navigation';
import notificationCopy from '../../src/i18n/locales/notificationSettings';
import personColoursCopy from '../../src/i18n/locales/personColours';
import profileCopy from '../../src/i18n/locales/profileIdentity';
import reflections from '../../src/i18n/locales/relationshipReflections';
import wirCheckInCopy from '../../src/i18n/locales/wirCheckIn';
import copy from '../../src/i18n/locales/wirDesign';
import { expectFloatingAddAction } from '../support/addAction';
import AxeBuilder from '../support/axe';
import { fulfillDefaultProductContext } from '../support/productContext';
import {
  captureScreenshot,
  installMocks,
  PARTNER,
  PARTNER_ID,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

async function fixture(
  page: Page,
  options: {
    pro?: boolean;
    initial?: string;
    failure?: number;
    agenda?: boolean;
  } = {},
) {
  const unexpected = await installMocks(page, { strict: true });
  let current = options.initial ?? 'warm';
  let palette: string | undefined;
  let version = 0;
  let pro = options.pro !== false;
  let failure = options.failure ?? 0;
  const writes: string[] = [];
  const paletteWrites: (string | null)[] = [];
  const base = `/api/v1/spaces/${SPACE_ID}`;
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultProductContext(route)) return;
    const request = route.request();
    const path = new URL(request.url()).pathname;
    // The Settings overview reads the calendar connection and the sign-in
    // methods for its row statuses.
    if (path === `${base}/calendar-sync`)
      return route.fulfill({
        json: {
          available: false,
          canSync: false,
          connections: [],
          services: [],
          target: null,
          targetToken: 'calendar-target-token',
        },
      });
    if (path === '/api/v1/auth/sign-in-methods')
      return route.fulfill({
        json: { emailLink: true, localPassword: false, oidc: [], passkeys: [] },
      });
    // Settings › Wir reads the owner's partner-distance view (#1792) to
    // decide on the display toggle; a Space without it shares nothing.
    if (path === `${base}/partner-location/settings`)
      return route.fulfill({
        json: {
          available: false,
          level: 'OFF',
          state: 'OFF',
          indefinite: false,
          expiresAt: null,
          generation: 0,
          lastPublishedAt: null,
        },
      });
    // The opted-in story lifeline (#1770) with no shared history yet.
    if (path === `${base}/story-lifeline`)
      return route.fulfill({
        json: { startsOn: null, today: '2026-11-12', weeks: [] },
      });
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
        const change = request.postDataJSON();
        if ('designId' in change) writes.push(change.designId);
        if ('paletteId' in change) paletteWrites.push(change.paletteId);
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
        if ('designId' in change) {
          expect(pro || change.designId === 'warm').toBe(true);
          current = change.designId;
        }
        if ('paletteId' in change) {
          expect(
            pro || [null, 'connected', 'warm'].includes(change.paletteId),
          ).toBe(true);
          palette = change.paletteId ?? undefined;
        }
        version++;
      }
      return route.fulfill({
        json: { designId: current, paletteId: palette, version },
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
            // A second plan stays in the agenda; the first is the anticipation.
            ...(options.agenda
              ? [
                  {
                    type: 'PLAN',
                    id: 'harbour-dinner',
                    titleOrText: 'Dinner at the harbour',
                    scheduledOn: '2099-12-04',
                  },
                ]
              : []),
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
    paletteWrites,
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

test('selecting design colours keeps the current layout and navigation', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const state = await fixture(page, { initial: 'home_rooms', pro: false });
  await signIn(page);
  await page.goto('/more/settings/appearance');

  const root = page.locator('html');
  const card = page.getByRole('region', { name: copy.palette.title });
  const trigger = card.getByRole('button', {
    name: `${copy.palette.title} ${copy.palette.followDesign}`,
  });
  await expect(trigger).toBeVisible();
  await expect(root).toHaveAttribute('data-app-palette', 'home_rooms');
  const previousHeading = await card.evaluate(
    (element) =>
      element.previousElementSibling?.querySelector('h2')?.textContent,
  );
  expect(previousHeading).toBe(personColoursCopy.title);
  await card.scrollIntoViewIfNeeded();
  await captureScreenshot(page, info, 'design-colours-390-dark.png');

  await trigger.click();
  const sheet = page.getByRole('dialog', { name: copy.palette.choices });
  await expect(
    sheet.getByRole('radio', { name: copy.palette.followDesign }),
  ).toBeChecked();
  await sheet.getByRole('radio', { name: copy.names.warm }).check();
  await expect(root).toHaveAttribute('data-app-palette', 'home_rooms');
  await sheet.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(sheet.getByText(copy.palette.saved)).toBeVisible();
  await expect(root).toHaveAttribute('data-app-design', 'home_rooms');
  await expect(root).toHaveAttribute('data-app-palette', 'warm');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    '#2c2334',
  );
  await sheet.getByRole('button', { name: copy.close, exact: true }).click();
  await expect(
    card.getByRole('button', {
      name: `${copy.palette.title} ${copy.names.warm}`,
    }),
  ).toBeFocused();

  await page.goto('/today');
  await expect(page.locator('.home-landing')).toBeVisible();
  await expect(
    page.getByRole('button', { name: copy.homeRooms.rooms, exact: true }),
  ).toBeVisible();
  await expect(root).toHaveAttribute('data-wir-layout', 'rooms');
  await expect(root).toHaveAttribute('data-app-palette', 'warm');
  await page.goto('/more/settings/appearance');
  await page.emulateMedia({ colorScheme: 'light' });
  for (const width of [360, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await reflow(page);
  }
  await captureScreenshot(page, info, 'design-colours-1440-light.png');
  await card
    .getByRole('button', { name: `${copy.palette.title} ${copy.names.warm}` })
    .click();
  await sheet.getByRole('radio', { name: copy.palette.followDesign }).check();
  await sheet.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(root).toHaveAttribute('data-app-palette', 'home_rooms');
  await expect(root).toHaveAttribute('data-app-design', 'home_rooms');
  expect(state.writes).toEqual([]);
  expect(state.paletteWrites).toEqual(['warm', null]);
  expect(state.unexpected).toEqual([]);
});
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

// The shared-album composition: names and story entry lead, two portrait
// check-in targets follow, and upcoming plans carry a local date stamp.
async function expectSharedAlbumComposition(page: Page) {
  const hero = page.locator('.shared-album-hero');
  const story = hero.getByRole('link', {
    name: m5s5Copy.dashboard.storySummaryTitle,
  });
  await expect(story).toBeVisible();
  await expect(hero.locator('.shared-album-person strong')).toHaveCount(2);
  const portraits = hero.locator('.partner-avatar-slot');
  await expect(portraits).toHaveCount(2);
  const storyBox = await story.boundingBox();
  for (const portrait of await portraits.all()) {
    const box = await portrait.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.y ?? 0).toBeGreaterThan(storyBox?.y ?? Number.MAX_VALUE);
  }
  const stamp = page.locator('.today-agenda-list .shared-album-date-stamp');
  await expect(stamp).toHaveCount(1);
  // The stamp is decorative; the row keeps one full machine-readable date.
  await expect(page.locator('.today-agenda-list time')).toHaveAttribute(
    'datetime',
    '2099-12-04',
  );
  // The overview itself is covered by the story specs.
  await expect(story).toHaveAttribute('href', '/story/our-story');
}

async function alignedVisibilityControls(page: Page) {
  const controls = page.locator(
    '.dashboard-module-option input[type="checkbox"]',
  );
  // Not listed: the fixed couple hero, and partner distance (#1792), which
  // this fixture's Space cannot use.
  await expect(controls).toHaveCount(DASHBOARD_MODULE_KEYS.length - 2);
  const centers = await controls.evaluateAll((inputs) =>
    inputs.map((input) => {
      const bounds = input.getBoundingClientRect();
      return bounds.x + bounds.width / 2;
    }),
  );
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
  // The shared couple hero is fixed and has no visibility switch.
  expect(targets).toHaveLength(DASHBOARD_MODULE_KEYS.length - 2);
  for (const target of targets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.overlapsLabel).toBe(false);
  }
}
for (const [width, theme] of [
  [390, 'light'],
  [1280, 'dark'],
] as const) {
  test(`does not paint a default design while the first selection is unresolved at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const f = await fixture(page, { initial: 'modern' });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/appearance/wir-design', async (route) => {
      await pending;
      await route.fallback();
    });
    try {
      await signIn(page);
      await page.locator('.product-shell a[href="/today"]:visible').click();
      await expect(page.locator('.today-page')).toBeVisible();
      expect(
        await page.locator('.today-page').getAttribute('data-wir-design'),
      ).toBeNull();
      expect(
        await page.locator('html').getAttribute('data-app-design'),
      ).toBeNull();
      await expect(page.locator('.today-content')).toHaveCount(0);
      await captureScreenshot(
        page,
        info,
        `today-startup-unresolved-${width}-${theme}.png`,
      );
      release();
      await expect(page.locator('.today-page')).toHaveAttribute(
        'data-wir-design',
        'modern',
      );
      await expect(page.locator('.today-content')).toBeVisible();
      expect(f.unexpected).toEqual([]);
    } finally {
      release();
    }
  });

  test(`restores the chosen design before its slow startup revalidation at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const f = await fixture(page, { initial: 'modern' });
    await signIn(page);
    await page.goto('/today');
    await expect(page.locator('.today-page')).toHaveAttribute(
      'data-wir-design',
      'modern',
    );
    await expect(page.locator('.today-content')).toBeVisible();
    await page.waitForFunction(() =>
      Array.from({ length: localStorage.length }, (_, i) =>
        localStorage.key(i),
      ).some((key) => key?.startsWith('eimir-wir-design-v1:')),
    );
    let release!: () => void;
    let arrived!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requested = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    await page.route('**/appearance/wir-design', async (route) => {
      arrived();
      await pending;
      await route.fallback();
    });
    await page.addInitScript(() => {
      const designs: string[] = [];
      Object.assign(window, { startupDesigns: designs });
      new MutationObserver(() => {
        const root = document.querySelector<HTMLElement>('.today-page');
        if (root?.querySelector('.today-content'))
          designs.push(root.dataset.wirDesign ?? 'missing');
      }).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
      });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await requested;
    try {
      await expect(page.locator('.today-content')).toBeVisible();
      await expect(page.locator('.today-page')).toHaveAttribute(
        'data-wir-design',
        'modern',
      );
      expect(
        await page.evaluate(
          () =>
            (window as Window & { startupDesigns: string[] }).startupDesigns,
        ),
      ).not.toContain('warm');
      await captureScreenshot(
        page,
        info,
        `today-startup-preserved-${width}-${theme}.png`,
      );
    } finally {
      release();
    }
    await expect(page.locator('.today-page')).toHaveAttribute(
      'data-wir-design',
      'modern',
    );
    expect(f.unexpected).toEqual([]);
  });
}

for (const [width, theme, reduced] of [
  [360, 'light', false],
  [390, 'dark', false],
  [430, 'light', true],
] as const) {
  test(`shape-following press and keyboard focus at ${width} ${theme}${reduced ? ' reduced' : ''}`, async ({
    browser,
    baseURL,
  }, info) => {
    const context = await browser.newContext({
      serviceWorkers: 'block',
      baseURL,
      viewport: { width, height: 900 },
      isMobile: true,
      hasTouch: true,
      colorScheme: theme,
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    const page = await context.newPage();
    try {
      const f = await fixture(page);
      await signIn(page);
      await page.goto('/today');
      await expect(page.locator('.today-content')).toBeVisible();
      const overlay = page.getByRole('dialog');
      const control = page.locator('[data-floating-create]');
      await expect(control).toHaveCSS(
        '-webkit-tap-highlight-color',
        'rgba(0, 0, 0, 0)',
      );
      await expectFloatingAddAction(
        control,
        page.locator('.mobile-bottom-shell'),
      );
      const bounds = await control.boundingBox();
      if (!bounds) throw new Error('Create control is not laid out');
      const reveal = page.locator(
        '.today-moment-media .sensitive-media-preview-control',
      );
      await expect(reveal).toBeVisible();
      const revealBounds = await reveal.boundingBox();
      if (!revealBounds) throw new Error('Photo reveal is not laid out');
      expect(revealBounds.x + revealBounds.width).toBeLessThan(bounds.x);
      const session = await context.newCDPSession(page);
      const contact = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      };
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [contact],
      });
      await expect(control).toHaveAttribute('data-control-pressed', '');
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchCancel',
        touchPoints: [],
      });
      await expect(control).not.toHaveAttribute('data-control-pressed');
      await expect(overlay).toHaveCount(0);
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [contact],
      });
      try {
        await expect
          .poll(() => control.evaluate((node) => getComputedStyle(node).scale))
          .toBe(reduced ? 'none' : '0.96');
        await captureScreenshot(
          page,
          info,
          `shell-control-press-${width}-${theme}${reduced ? '-reduced' : ''}.png`,
        );
      } finally {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
      }
      await expect(page.locator('[data-control-pressed]')).toHaveCount(0);
      await expect(overlay).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(overlay).toHaveCount(0);
      await page.keyboard.press('Tab');
      await control.focus();
      expect(
        await control.evaluate((node) => node.matches(':focus-visible')),
      ).toBe(true);
      expect(
        await control.evaluate((node) => getComputedStyle(node).outlineStyle),
      ).not.toBe('none');
      expect(f.unexpected).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

for (const [width, theme, large] of [
  [320, 'light', false],
  [360, 'light', false],
  [390, 'dark', false],
  [430, 'light', false],
  [1280, 'dark', false],
  [390, 'dark', true],
] as const) {
  test(`personal designs save, return and reload at ${width} ${theme}${large ? ' large text' : ''}`, async ({
    page,
  }, info) => {
    // Four full save/return/reload cycles and four axe passes share this journey.
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const f = await fixture(page, { agenda: true });
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
    for (const design of [
      'warm',
      'modern',
      'classic',
      'shared_album',
    ] as const) {
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
        // Geborgen's palette comes from design/designs/warm.json (#1907 C1).
        await expect(page.locator('html')).toHaveAttribute(
          'data-app-design',
          'warm',
        );
        await expect(page.locator('.today-page')).toHaveAttribute(
          'data-wir-layout',
          'open',
        );
        expect(
          await page
            .locator('.today-page')
            .evaluate((node) =>
              getComputedStyle(node)
                .getPropertyValue('--color-background')
                .trim(),
            ),
        ).toBe(theme === 'dark' ? '#2c2334' : '#fff9f6');
        await expect(page.locator('.couple-presence-eyebrow')).toHaveText(
          copy.welcome,
        );
        await expect(page.locator('.daily-quote-card')).toHaveCSS(
          'background-color',
          'rgba(0, 0, 0, 0)',
        );
      }
      await expect(page.getByTestId('wir-checkin-own-badge')).toBeVisible();
      await expect(page.locator('.daily-quote-card')).toBeVisible();
      await expect(page.locator('.anticipation-card')).toBeVisible();
      await expect(page.locator('.shared-album-hero')).toHaveCount(
        design === 'shared_album' ? 1 : 0,
      );
      if (design === 'shared_album') await expectSharedAlbumComposition(page);
      await reflow(page);
      const ownAvatar = page
        .locator('.today-hero')
        .getByRole('button', { name: /^Dein Tag:/ });
      await ownAvatar.click();
      const dayPanel = page.getByRole('region', {
        name: wirCheckInCopy.panelTitle,
      });
      await expect(dayPanel).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dayPanel).toBeHidden();
      await expect(ownAvatar).toBeFocused();
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
    expect(f.writes).toEqual(['modern', 'classic', 'shared_album']);
    expect(f.unexpected).toEqual([]);
  });
}
test('Wir centers the Verbunden stage and uses the Planen width on Expanded', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await fixture(page, { initial: 'connected' });
  await signIn(page);

  const content = page.locator('.today-content');
  await page.goto('/today');
  await expect(content).toBeVisible();
  const compactWidth = await page
    .locator('.product-main')
    .evaluate((node) => node.getBoundingClientRect().width);
  await expect(content).toHaveCSS('width', `${compactWidth}px`);
  await captureScreenshot(page, info, 'today-reading-width-390-light.png');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/plan');
  const planning = page.locator('.planen-overview');
  await expect(planning).toBeVisible();
  const planningWidth = await planning.evaluate(
    (node) => node.getBoundingClientRect().width,
  );

  for (const width of [768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/today');
    const stage = page.locator('.wir-stage');
    await expect(stage).toBeVisible();
    if (width >= 840) {
      await expect(content).toHaveCSS('width', `${planningWidth}px`);
    }
    // Layout settles asynchronously; a mid-render measurement must retry.
    await expect
      .poll(
        async () => {
          const box = await stage.boundingBox();
          return box
            ? Math.abs(box.x + box.width / 2 - width / 2)
            : Number.POSITIVE_INFINITY;
        },
        { message: `the stage is centered at ${width} px` },
      )
      .toBeLessThanOrEqual(1);
    if (width === 1440) {
      await captureScreenshot(page, info, 'today-reading-width-1440-light.png');
    }
  }
});
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

// Serves the personal module order and the quote preference for the Wir
// settings journeys, recording every saved order.
async function routeModuleOrder(page: Page) {
  const saved = { order: [...DASHBOARD_MODULE_KEYS], writes: [] as string[][] };
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultProductContext(route)) return;
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/dashboard/preferences/order')) {
      saved.order = route.request().postDataJSON().moduleKeys;
      saved.writes.push([...saved.order]);
      return route.fulfill({
        json: {
          items: saved.order.map((moduleKey) => ({ moduleKey, visible: true })),
        },
      });
    }
    if (path.endsWith('/dashboard/preferences'))
      return route.fulfill({
        json: {
          items: saved.order.map((moduleKey) => ({ moduleKey, visible: true })),
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
  return saved;
}

test('quote and statistics order survives pointer release, keyboard movement and reload', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const state = await fixture(page);
  const saved = await routeModuleOrder(page);
  const orders = saved.writes;
  await signIn(page);
  await page.goto('/more/settings/today');
  await alignedVisibilityControls(page);
  await expect(page.locator('.dashboard-module-configure')).toHaveCount(0);
  await expect(page.locator('#wir-statistics-setting')).toHaveCount(0);
  const quote = page.locator('[data-sortable-item-id="daily_quote"]');
  const grip = quote.getByRole('button', {
    name: profileCopy.dashboardOrderHandle.replace('{{name}}', quoteCopy.title),
  });
  await grip.scrollIntoViewIfNeeded();
  const initial = await grip.boundingBox();
  const rowBefore = await quote.boundingBox();
  // Since #2158 C the waiting-games row sits between the quote and the
  // keepsake; drag past both so the quote lands after the keepsake on Wir.
  const keepsakeRow = await page
    .locator('[data-sortable-item-id="keepsake"]')
    .boundingBox();
  if (!initial || !rowBefore || !keepsakeRow)
    throw new Error('Missing visible quote or keepsake row');
  await page.mouse.move(
    initial.x + initial.width / 2,
    initial.y + initial.height / 2,
  );
  await page.mouse.down();
  const dragDistance =
    keepsakeRow.y + keepsakeRow.height - (rowBefore.y + rowBefore.height) + 20;
  await page.mouse.move(
    initial.x + initial.width / 2,
    initial.y + initial.height / 2 + dragDistance,
    { steps: 12 },
  );
  await expect(quote).toHaveCSS('box-shadow', 'none');
  // The lifted row is marked by a quiet outline while it is dragged.
  await expect(quote).toHaveCSS('outline-style', 'solid');
  const held = await quote.boundingBox();
  expect(Math.abs((held?.y ?? 0) - rowBefore.y - dragDistance)).toBeLessThan(4);
  await page.mouse.up();
  await expect.poll(() => orders.length).toBe(1);
  expect(saved.order.indexOf('daily_quote')).toBeGreaterThan(
    saved.order.indexOf('keepsake'),
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
    // The fixed couple hero keeps its stored slot but is not sortable; partner
    // distance (#1792) keeps its slot but is not listed for this Space.
  ).toEqual(
    saved.order.filter(
      (key) => key !== 'relationship_presence' && key !== 'partner_distance',
    ),
  );
  await captureScreenshot(page, info, 'settings-order-390-light.png', {
    fullPage: true,
  });
  await page.locator('.product-shell a[href="/today"]:visible').click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('.shared-story-summary')).toBeVisible();
  await expect(page.locator('.daily-quote-card')).toBeVisible();
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
  expect(state.unexpected).toEqual([]);
});

// Separate from the ordering journey (#1597, #1607): visibility controls stay
// aligned and the settings page reflows across Compact and Expanded themes.
test('module visibility controls stay aligned and reflow at 360 light, 430 dark and 1280 dark', async ({
  page,
}, info) => {
  const state = await fixture(page);
  await routeModuleOrder(page);
  await signIn(page);
  await page.goto('/more/settings/today');
  await expect(page.locator('.dashboard-module-option').first()).toBeVisible();
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
  expect(state.unexpected).toEqual([]);
});

test('quote preference recovery keeps aligned controls and accessible feedback', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  const state = await fixture(page);
  let quoteFailure = true;
  await page.route('**/daily-quote/preferences', (route) =>
    quoteFailure
      ? route.fulfill({
          status: 503,
          json: { title: 'Synthetic outage', status: 503 },
        })
      : route.fulfill({
          json: {
            enabled: true,
            selectedCategoryIds: [],
            selectedSourceIds: [],
            version: 1,
          },
          headers: { ETag: '"quote-pref:1"' },
        }),
  );
  await signIn(page);
  await page.goto('/more/settings/today');
  await page.reload();
  const failedQuote = page.locator('[data-sortable-item-id="daily_quote"]');
  const failure = failedQuote.getByRole('status');
  await expect(failure).toContainText(quoteCopy.preferencesUnavailable);
  await alignedVisibilityControls(page);
  const errorBounds = await failure.boundingBox();
  const rowBounds = await failedQuote.boundingBox();
  if (!errorBounds || !rowBounds) throw new Error('Missing quote recovery');
  // #1564: recovery spans the row's full available (content) width.
  const rowPadding = await failedQuote.evaluate((row) => {
    const style = getComputedStyle(row);
    return (
      Number.parseFloat(style.paddingLeft) +
      Number.parseFloat(style.paddingRight)
    );
  });
  expect(
    Math.abs(errorBounds.width - (rowBounds.width - rowPadding)),
  ).toBeLessThan(1);
  await captureScreenshot(
    failedQuote,
    info,
    'settings-quote-error-1280-dark.png',
  );
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
      if (await fulfillDefaultProductContext(route)) return;
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (
        request.method() === 'GET' &&
        path === '/api/v1/push-endpoints/configuration'
      )
        return route.fulfill({
          json: { fcm: null, unifiedPush: null, webPush: null, apns: null },
        });
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
      // The private area opens on its notes.
      if (request.method() === 'GET' && path.endsWith('/private/notes'))
        return route.fulfill({
          json: { hasMore: false, items: [], nextCursor: null },
        });
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

// #1907 C1: a saved design is a token set that applies app-wide: other tabs,
// portaled sheets and the browser theme colour follow it, not only Wir.
test('a saved design colours Mehr, its sheet and the browser chrome and switches live', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const f = await fixture(page, { initial: 'warm' });
  await signIn(page);
  await page.goto('/more/settings/appearance');
  const pageColour = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((node) =>
        getComputedStyle(node).getPropertyValue('--color-background').trim(),
      );
  await expect(page.locator('html')).toHaveAttribute('data-app-design', 'warm');
  expect(await pageColour('html')).toBe('#fff9f6');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    '#fff9f6',
  );
  await open(page);
  expect(await pageColour('[role="dialog"]')).toBe('#fff9f6');
  await page
    .getByRole('radio', { name: new RegExp(copy.names.shared_album) })
    .check();
  await page.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'data-app-design',
    'shared_album',
  );
  expect(await pageColour('[role="dialog"]')).toBe('#f6f4ec');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    '#f6f4ec',
  );
  expect(f.writes).toEqual(['shared_album']);
  expect(f.unexpected).toEqual([]);
});

test('Zu zweit keeps the names and the add action in the moment header', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const f = await fixture(page, { initial: 'quiet_together', agenda: true });
  await signIn(page);
  await page.goto('/today');
  await expect(page.locator('.today-page')).toHaveAttribute(
    'data-wir-layout',
    'names',
  );
  await expect(
    page.locator('.wir-compact-hero .couple-presence-title > span'),
  ).toHaveCount(2);
  await expect(
    page.locator('.today-section-moment .today-section-header .add-action'),
  ).toBeVisible();
  expect(f.unexpected).toEqual([]);
});

test('the retired design falls back to Verbunden and the picker still saves', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 830 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const f = await fixture(page, { initial: 'handwriting', pro: false });
  await signIn(page);
  await page.goto('/today');
  await expect(page.locator('.today-page')).toHaveAttribute(
    'data-wir-layout',
    'connected',
  );
  await open(page);
  const picker = page.getByRole('dialog', { name: copy.choices });
  await expect(picker.locator('input[value="handwriting"]')).toHaveCount(0);
  await expect(page.getByText(copy.unavailable, { exact: true })).toHaveCount(
    0,
  );
  await expect(
    picker.getByRole('radio', { name: new RegExp(copy.names.connected) }),
  ).toBeChecked();
  await captureScreenshot(page, info, 'design-selection-360-light.png');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await captureScreenshot(page, info, 'design-selection-1440-dark.png');

  await picker
    .getByRole('radio', { name: new RegExp(copy.names.warm) })
    .check();
  await picker.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(picker.getByText(copy.saved, { exact: true })).toBeVisible();
  await picker.getByRole('button', { name: copy.close, exact: true }).click();
  await page.goto('/today');
  await expect(page.locator('.today-page')).toHaveAttribute(
    'data-wir-design',
    'warm',
  );
  expect(f.writes).toEqual(['warm']);
  expect(f.unexpected).toEqual([]);
});

async function expectTitleGap(
  page: Page,
  parent: string,
  firstContent: string,
) {
  const row = page.locator(parent + ' .page-heading-title-row');
  await expect(row).toBeVisible();
  await expect(
    row.getByRole('button').or(row.getByRole('link')).first(),
  ).toBeVisible();
  const content = page.locator(firstContent).first();
  await expect(content).toBeVisible();
  await expect
    .poll(async () => {
      const titleBox = await row.boundingBox();
      const contentBox = await content.boundingBox();
      return titleBox && contentBox
        ? Math.round(contentBox.y - titleBox.y - titleBox.height)
        : null;
    })
    .toBe(24);
}

async function checkResponsiveTitleGaps(page: Page) {
  const destinations = [
    {
      route: '/more/profile',
      header: '.profile-page',
      content: '.profile-identity-panel',
    },
    {
      route: '/story/years',
      header: '.story-years-page',
      content: '.story-years-recaps-entry',
    },
  ];
  for (const { route, header, content } of destinations) {
    await page.goto(route);
    for (const [width, height] of [
      [390, 844],
      [768, 900],
      [1280, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await expectTitleGap(page, header, content);
    }
  }
}

test('Zuhause navigation, saved appearance and secondary title spacing', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const saved = await fixture(page, { initial: 'connected' });
  await signIn(page);
  await open(page);
  await page
    .getByRole('radio', { name: new RegExp(copy.names.home_rooms) })
    .check();
  await page.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
  expect(saved.writes).toEqual(['home_rooms']);
  await page.goto('/today');
  await expect(page.locator('html')).toHaveAttribute(
    'data-wir-layout',
    'rooms',
  );
  await expect(page.locator('.home-landing')).toBeVisible();
  await captureScreenshot(page, info, 'home_rooms-compact.png', {
    animations: 'disabled',
  });
  await reflow(page);
  await page
    .getByRole('button', { name: copy.homeRooms.rooms, exact: true })
    .click();
  const picker = page.getByRole('dialog');
  await expect(picker).toBeVisible();
  await picker.getByRole('link').filter({ hasText: 'Listen' }).click();
  await expect(page).toHaveURL(/\/more\/collections/);
  await page.goto('/today?view=wir');
  await expect(page.locator('.today-content')).toBeVisible();
  await expect(page.locator('.home-landing')).toHaveCount(0);
  await checkResponsiveTitleGaps(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/today');
  await expect(page.locator('.home-landing')).toBeVisible();
  await captureScreenshot(page, info, 'home_rooms-expanded.png', {
    animations: 'disabled',
  });
});

test('Unser Takt navigation, saved appearance and secondary title spacing', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const saved = await fixture(page, { initial: 'connected' });
  await signIn(page);
  await open(page);
  await page
    .getByRole('radio', { name: new RegExp(copy.names.shared_rhythm) })
    .check();
  await page.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
  expect(saved.writes).toEqual(['shared_rhythm']);
  await page.goto('/today');
  await expect(page.locator('html')).toHaveAttribute(
    'data-wir-layout',
    'chapters',
  );
  await expect(page.locator('.rhythm-today-lead')).toBeVisible();
  await captureScreenshot(page, info, 'shared_rhythm-compact.png', {
    animations: 'disabled',
  });
  await reflow(page);
  const chapters = page.getByRole('navigation', { name: 'Hauptnavigation' });
  await chapters.getByRole('link', { name: 'Listen' }).click();
  await expect(page).toHaveURL(/\/more\/collections/);
  await chapters.getByRole('link', { name: copy.rhythm.history }).click();
  await expect(page).toHaveURL(/\/story/);
  await checkResponsiveTitleGaps(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/today');
  await expect(page.locator('.rhythm-today-lead')).toBeVisible();
  await captureScreenshot(page, info, 'shared_rhythm-expanded.png', {
    animations: 'disabled',
  });
});

test('retired Faden restores standard navigation and the picker still saves', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 830 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const saved = await fixture(page, { initial: 'together_index', pro: false });
  await signIn(page);

  await page.goto('/faden');
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('.today-page')).toHaveAttribute(
    'data-wir-layout',
    'connected',
  );
  const mobileNavigation = page.locator('.mobile-bottom-nav');
  await mobileNavigation
    .getByRole('link', { name: navigation.story, exact: true })
    .click();
  await expect(page).toHaveURL(/\/story$/);
  await page.goto('/story/memories/mem-canal');
  await expect(
    page.getByRole('heading', { name: 'Breakfast by the canal' }),
  ).toBeVisible();

  await open(page);
  const picker = page.getByRole('dialog', { name: copy.choices });
  await expect(picker.locator('input[value="together_index"]')).toHaveCount(0);
  await expect(page.getByText(copy.unavailable, { exact: true })).toHaveCount(
    0,
  );
  await expect(
    picker.getByRole('radio', { name: new RegExp(copy.names.connected) }),
  ).toBeChecked();
  await reflow(page);
  await captureScreenshot(page, info, 'faden-picker-360-light.png');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await captureScreenshot(page, info, 'faden-picker-1440-dark.png');

  await picker
    .getByRole('radio', { name: new RegExp(copy.names.warm) })
    .check();
  await picker.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(picker.getByText(copy.saved, { exact: true })).toBeVisible();
  await picker.getByRole('button', { name: copy.close, exact: true }).click();
  await page.goto('/today');
  await expect(page.locator('.today-page')).toHaveAttribute(
    'data-wir-design',
    'warm',
  );
  await expect(page.locator('.app-header .shell-nav')).toBeVisible();
  expect(saved.writes).toEqual(['warm']);
  expect(saved.unexpected).toEqual([]);
});

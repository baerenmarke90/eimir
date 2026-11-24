import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '../support/axe';
import { expect, type Locator, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import importantDates from '../../src/i18n/locales/importantDates';
import m5s3 from '../../src/i18n/locales/m5s3';
import navigationCopy from '../../src/i18n/locales/navigation';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { nextFrame } from '../support/mediaCarouselGesture';
import {
  installNativeAppLifecycle,
  nativeHapticCalls,
} from '../support/nativeAppLifecycle';
import { fulfillEmptyPlanComments } from '../support/planComments';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const PARTNER_ID = '44444444-4444-4444-8444-444444444444';
const PARTNER_PROFILE_ID = '55555555-5555-4555-8555-555555555555';
const TEST_NOW = '2026-09-01T10:00:00Z';
const ME = { id: ACCOUNT_ID, displayName: 'Anna Sommer' };
const PARTNER = { id: PARTNER_ID, displayName: 'Ben Winter' };
const CAPABILITIES = { canEdit: true, canDelete: true, canComment: true };

function generateTimelineItems() {
  const items = [];
  const dates = [
    { date: '2026-08-26', title: 'Late Summer Lake Walk', kind: 'MEMORY' },
    { date: '2026-08-15', title: 'Stargazing by the lake', kind: 'MEMORY' },
    { date: '2026-08-01', title: 'Moved in together', kind: 'MILESTONE' },
    {
      date: '2026-07-20',
      title: 'Cooked fresh pasta together',
      kind: 'MEMORY',
    },
    {
      date: '2026-07-05',
      title: 'Summer picnic memories',
      kind: 'HEART_MOMENT',
    },
    {
      date: '2026-06-18',
      title: 'Evening bike ride through fields',
      kind: 'MEMORY',
    },
    { date: '2026-05-30', title: 'First apartment viewing', kind: 'MEMORY' },
    {
      date: '2026-05-12',
      title: 'Weekend getaway in the hills',
      kind: 'MEMORY',
    },
    {
      date: '2026-04-22',
      title: 'Spring garden coffee morning',
      kind: 'MEMORY',
    },
    {
      date: '2026-04-01',
      title: 'Decided on moving together',
      kind: 'MILESTONE',
    },
    {
      date: '2026-03-14',
      title: 'Rainy Sunday breakfast in bed',
      kind: 'MEMORY',
    },
    {
      date: '2026-02-14',
      title: 'Valentine surprise note',
      kind: 'HEART_MOMENT',
    },
  ];

  for (const entry of dates) {
    if (entry.kind === 'MEMORY') {
      items.push({
        kind: 'MEMORY',
        effectiveDate: `${entry.date}T12:00:00Z`,
        memory: {
          id: `mem-${entry.date}`,
          title: entry.title,
          happenedOn: entry.date,
          createdAt: `${entry.date}T12:00:00Z`,
          author: ME,
          capabilities: CAPABILITIES,
          visibility: 'SHARED',
          attachments: [],
        },
      });
    } else if (entry.kind === 'MILESTONE') {
      items.push({
        kind: 'MILESTONE',
        effectiveDate: `${entry.date}T12:00:00Z`,
        milestone: {
          id: `ms-${entry.date}`,
          title: entry.title,
          happenedOn: entry.date,
          createdAt: `${entry.date}T12:00:00Z`,
          author: ME,
          capabilities: CAPABILITIES,
        },
      });
    } else {
      items.push({
        kind: 'HEART_MOMENT',
        effectiveDate: `${entry.date}T12:00:00Z`,
        heartMoment: {
          id: `hm-${entry.date}`,
          text: entry.title,
          emotion: 'LOVED',
          happenedOn: entry.date,
          createdAt: `${entry.date}T12:00:00Z`,
          author: ME,
          capabilities: CAPABILITIES,
          visibility: 'SHARED',
          attachment: null,
        },
      });
    }
  }
  return items;
}

async function installApiMocks(
  page: Page,
  { connectedWir = false } = {},
): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;

    if (
      connectedWir &&
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/appearance/wir-design`
    ) {
      await route.fulfill({
        json: { designId: 'connected', version: 1 },
        headers: { ETag: '"connected:1"' },
      });
      return;
    }

    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillEmptyPlanComments(route)) return;

    const fulfillJson = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      await fulfillJson({
        maintenanceMode: false,
        registrationAvailable: true,
        registrationUnavailableReason: null,
        auth: {
          localPassword: true,
          passkey: true,
          magicLink: true,
          oidc: false,
        },
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await fulfillJson({
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'scroll-nav-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'scroll-nav-refresh-token',
        },
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ displayName: 'Anna', id: ACCOUNT_ID });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      await fulfillJson({ serverAdmin: false });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      await fulfillJson([
        { role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' },
      ]);
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`) {
      await fulfillJson({
        id: SPACE_ID,
        createdAt: TEST_NOW,
        partners: [ME, PARTNER],
      });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: null,
        showRelationshipDuration: false,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profile-preferences`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await fulfillJson({
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner: PARTNER, spaceId: SPACE_ID },
        upcoming: [],
      });
      return;
    }

    if (
      method === 'GET' &&
      (pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}` ||
        pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${PARTNER_ID}`)
    ) {
      const isPartner = pathname.endsWith(PARTNER_ID);
      await fulfillJson({
        accountId: isPartner ? PARTNER_ID : ACCOUNT_ID,
        createdAt: TEST_NOW,
        displayName: isPartner ? PARTNER.displayName : ME.displayName,
        id: isPartner ? PARTNER_PROFILE_ID : PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
    ) {
      await fulfillJson({ unreadCount: 0 });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/entitlements`
    ) {
      await fulfillJson({
        spaceId: SPACE_ID,
        tier: 'PREMIUM',
        status: 'ACTIVE',
        effectiveUntil: null,
        isInGracePeriod: false,
        capabilities: ['games.couple'],
      });
      return;
    }

    if (
      method === 'GET' &&
      (pathname === `/api/v1/spaces/${SPACE_ID}/timeline` ||
        pathname === `/api/v1/spaces/${SPACE_ID}/story/timeline`)
    ) {
      await fulfillJson({
        availableYears: [2026],
        hasMore: false,
        items: generateTimelineItems(),
        nextCursor: null,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/discover`
    ) {
      const items = generateTimelineItems();
      await fulfillJson({
        selectionDate: '2026-09-01',
        lead: items[0] ?? null,
        items: items.slice(1, 8),
        leadContext: null,
      });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/wishes`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/plans`) {
      await fulfillJson({
        hasMore: false,
        items: [],
        nextCursor: null,
      });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/chapters`
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/collections`
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/related-persons`
    ) {
      await fulfillJson([]);
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/important-dates`
    ) {
      await fulfillJson([]);
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await fulfillJson({ state: null });
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `The browser test did not define this API request: ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

const LISTEN_ROUTE = '/more/collections';

/**
 * A primary tab link by its root. Listen lives under /more, so the bare prefix
 * of the Mehr root also matches it and is excluded.
 */
function primaryTabLink(nav: Locator, root: string): Locator {
  return root === LISTEN_ROUTE
    ? nav.locator(`a[href="${LISTEN_ROUTE}"]`)
    : nav.locator(`a[href^="${root}"]:not([href="${LISTEN_ROUTE}"])`);
}

async function addScrollFixture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('Main content missing.');
    document.querySelector('[data-shell-scroll-fixture]')?.remove();
    const spacer = document.createElement('div');
    spacer.dataset.shellScrollFixture = 'true';
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.height = '1800px';
    main.appendChild(spacer);
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

async function expectAnchoredNavigation(page: Page, safeArea = 0) {
  const navigation = page.locator('.mobile-bottom-shell');
  await expect(navigation).toBeInViewport({ ratio: 1 });
  const geometry = await navigation.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      top: rect.top,
      bottomGap: window.innerHeight - rect.bottom,
      left: rect.left,
      rightGap: window.innerWidth - rect.right,
      paddingBottom: Number.parseFloat(style.paddingBottom),
      radius: style.borderRadius,
      contentBottom: Math.max(
        ...Array.from(element.querySelectorAll('a, button')).map(
          (control) => control.getBoundingClientRect().bottom,
        ),
      ),
      bottom: rect.bottom,
      zoom:
        Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1,
    };
  });
  // The full-width dock fills the safe area; controls stay above it.
  expect(Math.abs(geometry.bottomGap)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.rightGap)).toBeLessThanOrEqual(1);
  expect(geometry.radius).toBe('0px');
  expect(geometry.paddingBottom).toBeGreaterThanOrEqual(safeArea);
  expect(geometry.contentBottom).toBeLessThanOrEqual(
    geometry.bottom - safeArea * geometry.zoom + 1,
  );
  return geometry;
}

test.describe('Global header document flow and persistent bottom navigation', () => {
  test('bottom navigation stays viewport-anchored across scroll, safe areas and route return (#1489)', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);

    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 740 });
      await page.addStyleTag({
        content: ':root { --safe-area-inset-bottom: 24px; }',
      });
      for (const destination of [
        '/today',
        '/story?tab=timeline',
        '/plan',
        '/more',
      ]) {
        await page
          .locator(`.mobile-bottom-nav a[href="${destination.split('?')[0]}"]`)
          .click();
        await expect(page).toHaveURL(new RegExp(destination.split('?')[0]));
        await page.evaluate(() => window.scrollTo(0, 0));
        const initial = await expectAnchoredNavigation(page, 24);
        await addScrollFixture(page);
        for (const top of [700, 660, 1800, 0]) {
          await page.evaluate(
            (top) => window.scrollTo({ top, behavior: 'instant' }),
            top,
          );
          const current = await expectAnchoredNavigation(page, 24);
          expect(Math.abs(current.top - initial.top)).toBeLessThanOrEqual(1);
          if (
            width === 390 &&
            destination.startsWith('/story') &&
            top === 700
          ) {
            await page.screenshot({
              path: testInfo.outputPath('anchored-390-story-scrolled.png'),
            });
          }
        }
        await page.screenshot({
          path: testInfo.outputPath(
            `anchored-${width}-${destination.split('?')[0].slice(1)}.png`,
          ),
        });
        await expectNoHorizontalOverflow(page);
      }
      await page.goBack();
      await expectAnchoredNavigation(page, 24);
    }
  });

  test('focused end-aligned content clears the fixed navigation (#1489)', async ({
    page,
  }, testInfo) => {
    // Font/viewport changes must remain safe before the next observer frame.
    await page.addInitScript(() => {
      const NativeResizeObserver = window.ResizeObserver;
      window.ResizeObserver = class extends NativeResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          super((entries, observer) => {
            const ready = entries.filter(
              (entry) =>
                !entry.target.classList.contains('mobile-bottom-shell'),
            );
            if (ready.length) callback(ready, observer);
          });
        }
      };
    });
    await page.setViewportSize({ width: 390, height: 700 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await addScrollFixture(page);
    await page.evaluate(() => {
      const target = document.createElement('button');
      target.dataset.shellClearanceAction = 'true';
      target.textContent = 'Browser focus clearance fixture';
      document.querySelector('main')?.appendChild(target);
    });
    const target = page.locator('[data-shell-clearance-action]');
    for (const state of [
      { width: 360, height: 640, theme: 'light', text: '100%', zoom: '1' },
      { width: 390, height: 420, theme: 'dark', text: '100%', zoom: '1' },
      { width: 430, height: 740, theme: 'dark', text: '100%', zoom: '1' },
      { width: 320, height: 640, theme: 'light', text: '200%', zoom: '1' },
      { width: 1280, height: 900, theme: 'light', text: '100%', zoom: '4' },
    ]) {
      await page.setViewportSize({ width: state.width, height: state.height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate((state) => {
        document.documentElement.dataset.theme = state.theme;
        document.documentElement.style.fontSize = state.text;
        document.documentElement.style.zoom = state.zoom;
      }, state);
      await target.focus();
      await target.evaluate((element) =>
        element.scrollIntoView({ block: 'end', behavior: 'instant' }),
      );
      await expect(target).toBeFocused();
      const bar = await expectAnchoredNavigation(page);
      const box = await target.boundingBox();
      if (!box) throw new Error('Focused clearance action has no geometry.');
      expect(box.y + box.height).toBeLessThanOrEqual(bar.top - 1);
      const add = page.locator('[data-floating-create]');
      await expect(add).toBeVisible();
      if (
        await add.evaluate(
          (element) => getComputedStyle(element).position === 'fixed',
        )
      ) {
        const addBox = await add.boundingBox();
        if (!addBox) throw new Error('Floating add action has no geometry.');
        expect(box.y + box.height).toBeLessThanOrEqual(addBox.y - 1);
      }
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(
          `focused-action-${state.width}-${state.height}-${state.theme}.png`,
        ),
      });
    }
  });

  test('Today, Momente, Planen and Mehr omit Compact global chrome while bottom navigation stays fixed', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);

    for (const route of ['/today', '/story?tab=timeline', '/plan', '/more']) {
      await page
        .locator('.mobile-bottom-nav')
        .locator(`a[href="${route.split('?')[0]}"]`)
        .click();
      await page.evaluate(() => window.scrollTo(0, 0));

      const header = page.locator('.product-topbar');
      const bottomShell = page.locator('.mobile-bottom-shell');
      await expect(header).toBeHidden();
      await expect(bottomShell).toBeVisible();

      expect(
        await header.evaluate((element) => getComputedStyle(element).position),
      ).toBe('relative');
      expect(
        await bottomShell.evaluate(
          (element) => getComputedStyle(element).position,
        ),
      ).toBe('fixed');
      expect(await bottomShell.getAttribute('data-hidden')).toBeNull();

      const flowGap = await page.evaluate(() => {
        const header = document
          .querySelector('.product-topbar')
          ?.getBoundingClientRect();
        const body = document
          .querySelector('.product-shell-body')
          ?.getBoundingClientRect();
        if (!header || !body) throw new Error('Shell geometry missing.');
        return body.top - header.bottom;
      });
      expect(Math.abs(flowGap)).toBeLessThanOrEqual(1);

      await addScrollFixture(page);
      await page.evaluate(() =>
        window.scrollTo({ top: 700, behavior: 'instant' }),
      );
      await page.waitForFunction(() => window.scrollY > 500);

      const afterDown = await header.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      });
      expect(afterDown.bottom).toBeLessThanOrEqual(0);
      await expect(bottomShell).toBeVisible();

      await page.evaluate(() =>
        window.scrollTo({
          top: Math.max(0, window.scrollY - 40),
          behavior: 'instant',
        }),
      );
      const afterSmallReverse = await header.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      });
      expect(afterSmallReverse.bottom).toBeLessThanOrEqual(0);
      await expect(bottomShell).toBeVisible();

      await expectNoHorizontalOverflow(page);
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' }),
      );
      await expect(header).toBeHidden();

      if (route === '/today') {
        await page.screenshot({
          path: testInfo.outputPath('01-today-without-global-header.png'),
        });
        await testInfo.attach('today-without-global-header', {
          path: testInfo.outputPath('01-today-without-global-header.png'),
          contentType: 'image/png',
        });
      }
    }
  });

  for (const viewport of [
    { label: 'compact', width: 390, height: 844 },
    { label: 'expanded', width: 1280, height: 900 },
  ] as const) {
    test(`Root headings keep one display typeface without a visible title band on ${viewport.label}`, async ({
      page,
    }, testInfo) => {
      await installApiMocks(page);
      await page.goto('/login');
      await signIn(page);

      const destinations = [
        { slug: 'wir', path: '/today', title: navigationCopy.today },
        {
          slug: 'momente',
          path: '/story?tab=timeline',
          title: de.story.timelineTitle,
        },
        { slug: 'planen', path: '/plan', title: m5s3.overview.title },
        { slug: 'mehr', path: '/more', title: de.more.title },
      ] as const;
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      // #1861: the root tabs keep their level-1 heading for assistive
      // technology but no longer show a title band.
      const metrics: Array<{
        fontFamily: string;
        fontSize: string;
        fontWeight: string;
        titleBand: { width: number; height: number };
        lineHeight: string;
      }> = [];

      for (const destination of destinations) {
        const navigation = page.locator(
          viewport.width >= 840 ? '.shell-nav' : '.mobile-bottom-nav',
        );
        await navigation
          .locator(`a[href="${destination.path.split('?')[0]}"]`)
          .click();
        await page.evaluate(() => window.scrollTo(0, 0));

        const heading = page.getByRole('heading', {
          level: 1,
          name: destination.title,
          exact: true,
        });
        await expect(heading).toHaveCount(1);

        const metric = await heading.evaluate((element) => {
          const headingStyle = getComputedStyle(element);
          const band = element.parentElement?.getBoundingClientRect();
          if (!band) throw new Error('Root page title container missing.');
          return {
            fontFamily: headingStyle.fontFamily,
            fontSize: headingStyle.fontSize,
            fontWeight: headingStyle.fontWeight,
            titleBand: { width: band.width, height: band.height },
            lineHeight: headingStyle.lineHeight,
          };
        });
        metrics.push(metric);

        expect(metric.fontFamily).toContain('Literata');
        // A compositor translation can introduce subpixel rounding in a DOMRect.
        expect(metric.titleBand.width).toBeCloseTo(1, 4);
        expect(metric.titleBand.height).toBeCloseTo(1, 4);

        await expectNoHorizontalOverflow(page);
        await page.screenshot({
          path: testInfo.outputPath(
            `shell-root-header-${destination.slug}-${viewport.label}.png`,
          ),
          fullPage: false,
        });
      }

      const [baseline, ...peers] = metrics.map(
        ({ fontFamily: _family, ...rhythm }) => rhythm,
      );
      for (const peer of peers) {
        expect(peer).toEqual(baseline);
      }
    });
  }

  test('Headerless Today retains its relationship surface and consumes the demo inset once', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.waitForURL('**/today');

    const shell = page.locator('.product-shell');
    const header = page.locator('.product-topbar');
    const hero = page.locator('.today-hero');

    await expect(shell).toHaveAttribute('data-top-surface', 'today');
    await expect(header).toBeHidden();
    await expect(hero).toBeVisible();

    // The full-bleed glow moves with Wir even when the header is hidden.
    const backdrop = await page.locator('.today-page').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        opacity: style.opacity,
        width: style.width,
      };
    });
    expect(backdrop.backgroundImage).toContain('radial-gradient');
    expect(backdrop.opacity).toBe('1');
    expect(backdrop.width).toBe('390px');

    const headerMaterial = await header.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderBottomWidth: style.borderBottomWidth,
        boxShadow: style.boxShadow,
      };
    });
    expect(headerMaterial.backgroundColor).toMatch(
      /rgba\(0, 0, 0, 0\)|transparent/,
    );
    expect(headerMaterial.backgroundImage).toBe('none');
    expect(headerMaterial.borderBottomWidth).toBe('0px');
    expect(headerMaterial.boxShadow).toBe('none');
    expect(
      await hero.evaluate(
        (element) => getComputedStyle(element, '::before').content,
      ),
    ).toBe('none');

    const more = page.locator('.mobile-bottom-nav a[href="/more"]');
    await more.focus();
    await expect(more).toBeFocused();
    await more.click();
    const search = page.locator('.more-search-entry');
    await search.focus();
    await expect(search).toBeFocused();
    const notifications = page.locator(
      '.more-page a[href="/more/notifications"]',
    );
    await notifications.focus();
    await expect(notifications).toBeFocused();
    const moreAxe = await new AxeBuilder({ page })
      .include('.more-page')
      .analyze();
    expect(moreAxe.violations).toEqual([]);
    await page.goBack();
    const axe = await new AxeBuilder({ page }).include('.today-hero').analyze();
    expect(axe.violations).toEqual([]);

    await page.evaluate(() => {
      const root = document.querySelector('#root');
      const shell = root?.querySelector('.product-shell');
      if (!root || !shell) throw new Error('Shell root missing.');
      const banner = document.createElement('div');
      banner.className = 'demo-instance-banner';
      banner.setAttribute('role', 'note');
      banner.textContent = 'Demo · Test environment';
      root.insertBefore(banner, shell);
    });

    const demoGeometry = await page.evaluate(() => {
      const banner = document
        .querySelector('.demo-instance-banner')
        ?.getBoundingClientRect();
      const body = document
        .querySelector('.product-shell-body')
        ?.getBoundingClientRect();
      if (!banner || !body) throw new Error('Demo/content geometry missing.');
      return {
        gap: body.top - banner.bottom,
        safeTop: getComputedStyle(
          document.querySelector('.product-shell') as HTMLElement,
        ).getPropertyValue('--shell-header-safe-top'),
      };
    });
    expect(Math.abs(demoGeometry.gap)).toBeLessThanOrEqual(1);
    expect(demoGeometry.safeTop.trim()).toBe('0px');
    await expectNoHorizontalOverflow(page);

    const screenshotPath = testInfo.outputPath(
      '02-today-shared-surface-with-demo-banner.png',
    );
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await testInfo.attach('today-shared-surface-with-demo-banner', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  });

  test('Compact widths, short height and 200% text keep shell controls reflow-safe', async ({
    page,
  }) => {
    await installApiMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');
    await signIn(page);

    for (const [width, height] of [
      [320, 640],
      [360, 640],
      [390, 700],
      [430, 720],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/today');
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.locator('.product-topbar')).toBeHidden();
      await expect(page.locator('.mobile-bottom-shell')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }

    await page.setViewportSize({ width: 320, height: 640 });
    await page.addStyleTag({ content: ':root { font-size: 200%; }' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoHorizontalOverflow(page);

    const header = page.locator('.product-topbar');
    const bottomShell = page.locator('.mobile-bottom-shell');
    await addScrollFixture(page);
    await page.evaluate(() =>
      window.scrollTo({ top: 700, behavior: 'instant' }),
    );
    await page.waitForFunction(() => window.scrollY > 500);
    expect(
      await header.evaluate(
        (element) => element.getBoundingClientRect().bottom,
      ),
    ).toBeLessThanOrEqual(0);
    await expect(bottomShell).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

for (const variant of [
  { width: 360, theme: 'light', view: 'timeline', reduced: false },
  { width: 390, theme: 'dark', view: 'discover', reduced: true },
  { width: 430, theme: 'light', view: 'timeline', reduced: true },
  { width: 1280, theme: 'light', view: 'discover', reduced: false },
] as const) {
  test(`primary destinations open at the top and reset ${variant.view} and Planning mode at ${variant.width}px ${variant.theme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: variant.width, height: 740 });
    await page.emulateMedia({
      colorScheme: variant.theme,
      reducedMotion: variant.reduced ? 'reduce' : 'no-preference',
    });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, variant.theme);
    const nav = page.locator(
      variant.width >= 840 ? '.shell-nav' : '.mobile-bottom-nav',
    );
    await nav.locator('a[href^="/story"]').click();
    const selectedStoryTab = page.getByRole('tab', {
      name:
        variant.view === 'timeline'
          ? de.story.tabTimeline
          : de.story.tabDiscover,
      exact: true,
    });
    if (variant.view === 'timeline')
      await page
        .getByRole('tab', { name: de.story.tabTimeline, exact: true })
        .click();
    await expect(selectedStoryTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tablist')).toHaveCount(1);
    // Discover plays one Fotostory that opens with the rediscovery lead
    // (#2192); the Diary lists the entries.
    await expect(
      variant.view === 'discover'
        ? page
            .locator('.momente-story-slide[data-state="current"]')
            .getByText('Late Summer Lake Walk', { exact: true })
        : page
            .getByText('Cooked fresh pasta together', { exact: true })
            .first(),
    ).toBeVisible();
    if (variant.view === 'timeline')
      await expect(page.locator('.story-timeline').first()).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await scrollDownFromEntry(page);
    if (variant.width === 430)
      await page.screenshot({
        path: testInfo.outputPath('diary-scrolled.png'),
      });
    // Expanded navigation is in document flow; activation remains a root selection.
    if (variant.width >= 840) {
      await nav
        .locator('a[href="/plan"]')
        .evaluate((element: HTMLAnchorElement) => element.click());
    } else await nav.locator('a[href="/plan"]').click();
    await expect(page).toHaveURL(/\/plan$/);
    await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
    await expect(
      page.getByRole('tab', { name: m5s3.overview.segmentWishes }),
    ).toHaveAttribute('aria-selected', 'true');
    if (variant.view === 'discover') {
      const datesTab = page.getByRole('tab', {
        name: importantDates.heading,
        exact: true,
      });
      await datesTab.click();
      await expect(datesTab).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveURL(/\/plan#dates$/);
      await expect(
        page.getByText(importantDates.emptyTitle, { exact: true }),
      ).toBeVisible();
    }
    // Activate Expanded navigation without first scrolling its header into view.
    if (variant.width >= 840) {
      await nav
        .locator('a[href^="/story"]')
        .evaluate((element: HTMLAnchorElement) => element.click());
    } else await nav.locator('a[href^="/story"]').click();
    await expect(
      page.getByRole('tab', { name: de.story.tabDiscover, exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/story$/);
    await expect(page.getByRole('tablist')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({
      path: testInfo.outputPath(`reset-${variant.width}-${variant.theme}.png`),
    });
    await page.screenshot({
      path: testInfo.outputPath(
        `tab-reset-${variant.width}-${variant.theme}.png`,
      ),
    });
    await expectNoHorizontalOverflow(page);
    // The current root is a reselect action, not another route/history entry.
    await scrollDownFromEntry(page);
    const historyLength = await page.evaluate(() => history.length);
    await nav
      .locator('a[href^="/story"]')
      .evaluate((element: HTMLAnchorElement) => element.click());
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeLessThan(2);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    await nav.locator('a[href="/plan"]').click();
    await expect(
      page.getByRole('tab', { name: m5s3.overview.segmentPlans }),
    ).toHaveAttribute('aria-selected', 'true');
    await page.goBack();
    await expect(page).toHaveURL(/\/story/);
    await expect(
      page.getByRole('tab', { name: de.story.tabDiscover, exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/story$/);
    await expect(page.getByRole('tablist')).toHaveCount(1);
  });
}

test('selecting each primary destination opens it at the top after an earlier visit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installApiMocks(page);
  await page.goto('/login');
  await signIn(page);
  await expect(page).toHaveURL(/\/today$/);
  await addScrollFixture(page);
  const nav = page.locator('.mobile-bottom-nav');
  const order = ['/story', '/plan', LISTEN_ROUTE, '/more', '/today'];
  for (const destination of [...order, ...order]) {
    await scrollDownFromEntry(page);
    await primaryTabLink(nav, destination).click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  }
});

test('native primary tab switching replaces root history but keeps nested task return', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    document.addEventListener('animationstart', ({ target, animationName }) => {
      if (
        animationName === 'eimir-motion-surface-out' &&
        target instanceof HTMLDialogElement &&
        target.matches('.contextual-create-sheet')
      ) {
        for (const animation of target.getAnimations()) animation.pause();
      }
    });
  });
  await installNativeAppLifecycle(page);
  await installApiMocks(page);
  await page.goto('/login');
  await signIn(page);
  const nav = page.locator('.mobile-bottom-nav');
  const historyLength = await page.evaluate(() => history.length);
  for (const root of ['/story', '/plan', '/more', '/today', '/plan', '/more']) {
    await primaryTabLink(nav, root).click();
    await expect(page).toHaveURL(new RegExp(`${root}$`));
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
  }
  await expect(page.locator('[data-floating-create]:visible')).toHaveCount(0);
  await nav.locator('a[href="/today"]').click();
  await expect(page).toHaveURL(/\/today$/);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  const moment = page.getByRole('button', {
    name: navigationCopy.quickCreateTitle,
  });
  await moment.click();
  await page
    .getByRole('dialog', { name: navigationCopy.quickCreateTitle })
    .locator('a[href="/story/memories/new"]')
    .click();
  await expect(page).toHaveURL(/\/story\/memories\/new$/);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('.mobile-bottom-shell')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);
  await expect(moment).toBeFocused();
  await expect(nav).toBeVisible();
});

async function dragTouch(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  beforeRelease?: () => Promise<void>,
) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...from, id: 1 }],
    });
    await nextFrame(page);
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: from.x + ((to.x - from.x) * step) / 8,
            y: from.y + ((to.y - from.y) * step) / 8,
            id: 1,
          },
        ],
      });
    }
    await beforeRelease?.();
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await nextFrame(page);
  } finally {
    await session.detach();
  }
}

async function scrollDownFromEntry(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'instant' }));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
}

async function expectPrimaryReadingSurface(page: Page) {
  const surfaceForRoute: Record<string, string> = {
    '/today': 'main > .primary-tab-panel:not([hidden]) .today-page',
    '/story': 'main > .primary-tab-panel:not([hidden]) .story-page',
    '/plan': 'main > .primary-tab-panel:not([hidden]) .planen-overview',
    '/more/collections':
      'main > .primary-tab-panel:not([hidden]) .shared-content-page',
    '/more': 'main > .primary-tab-panel:not([hidden]) .more-page',
  };
  const selector = surfaceForRoute[new URL(page.url()).pathname];
  if (!selector)
    throw new Error('A primary swipe requires a primary destination.');
  await expect(page.locator(selector)).toBeVisible();
  if (selector.endsWith('.today-page')) {
    // Use the settled reading surface. During cold startup the loading node
    // can disappear between hit-testing and the native touch sequence.
    await expect(page.locator('main .today-hero')).toBeVisible();
  }
}

async function swipePrimary(page: Page, direction: 'next' | 'previous') {
  const { width, startX, y } = await primarySwipeStart(page, direction);
  await dragTouch(
    page,
    { x: startX, y },
    { x: direction === 'next' ? width * 0.25 : width * 0.75, y },
  );
}

async function primarySwipeStart(page: Page, direction: 'next' | 'previous') {
  await expectPrimaryReadingSurface(page);
  const width = page.viewportSize()?.width ?? 390;
  const startX = direction === 'next' ? width * 0.75 : width * 0.25;
  // Use the existing reading surface, clear of gesture-owning controls.
  const y = await page.evaluate((x) => {
    for (let y = 100; y < innerHeight - 150; y += 30) {
      const target = document.elementFromPoint(x, y);
      // Chromium can retarget a real touch in a small gap to a nearby control.
      // Keep the reading gesture clear of the taller three-mode Planning tabs.
      const nearControl = Array.from(
        document.querySelectorAll(
          'main input, main select, main textarea, main [role="tablist"], main [contenteditable="true"]',
        ),
      ).some((control) => {
        const rect = control.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          x >= rect.left - 24 &&
          x <= rect.right + 24 &&
          y >= rect.top - 24 &&
          y <= rect.bottom + 24
        );
      });
      if (
        !nearControl &&
        target?.closest('main') &&
        !target.closest(
          'button, input, form, [role="tablist"], .eimir-media-snap-track',
        )
      ) {
        let scroller: Element | null = target;
        while (scroller && scroller.tagName !== 'MAIN') {
          const style = getComputedStyle(scroller);
          if (
            /(auto|scroll)/.test(style.overflowX) &&
            scroller.scrollWidth > scroller.clientWidth + 1
          )
            break;
          scroller = scroller.parentElement;
        }
        if (scroller?.tagName === 'MAIN') return y;
      }
    }
    throw new Error('No visible reading surface for a primary swipe.');
  }, startX);
  return { width, startX, y };
}

async function pauseNavigationMotion(page: Page) {
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.matches('main.product-main')) {
        animation.pause();
        animation.currentTime = 0;
      }
      return animation;
    };
  });
}

test.describe('primary tab touch navigation', () => {
  test.use({ hasTouch: true });

  test('acknowledges a held tap and keeps the floating action anchored during entry', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await pauseNavigationMotion(page);
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    const main = page.locator('main.product-main');
    const nav = page.locator('.mobile-bottom-nav');
    const before = await page.evaluate(() => performance.timeOrigin);
    const tab = nav.locator('a[href="/plan"]');
    const bounds = await tab.boundingBox();
    if (!bounds) throw new Error('Missing Planning navigation tab.');
    const restingColor = await tab.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    const touch = await page.context().newCDPSession(page);
    try {
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
        ],
      });
      await expect(tab).toHaveAttribute('data-control-pressed', '');
      expect(
        await tab.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      ).not.toBe(restingColor);
      await expect(page).toHaveURL(/\/today$/);
    } finally {
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await touch.detach();
    }
    await expect(page).toHaveURL(/\/plan$/);
    await expect(main).toHaveAttribute('data-navigation-motion', 'content');

    const floatingAction = main.locator('[data-floating-create]:visible');
    await expect(floatingAction).toHaveCount(1);
    await page.screenshot({
      path: testInfo.outputPath('shell-planning-tab-entry-390.png'),
    });
    const position = await floatingAction.evaluate((action) => {
      const surface = action.closest('main');
      const dock = document.querySelector('.mobile-bottom-shell');
      if (!surface || !dock) throw new Error('Missing navigation surface.');
      const during = action.getBoundingClientRect();
      const entry = surface
        .getAnimations()
        .find(({ playState }) => playState === 'paused');
      if (!entry) throw new Error('Missing live route entry animation.');
      entry.finish();
      const after = action.getBoundingClientRect();
      return {
        during: during.toJSON(),
        after: after.toJSON(),
        dockTop: dock.getBoundingClientRect().top,
      };
    });
    expect(position.during.x).toBeCloseTo(position.after.x);
    expect(position.during.y).toBeCloseTo(position.after.y);
    expect(position.during.bottom).toBeLessThan(position.dockTop);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(before);
  });

  test('reveals a cold destination once and reuses it on a warm visit', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await pauseNavigationMotion(page);
    await installApiMocks(page);
    const response = Promise.withResolvers<void>();
    let reads = 0;
    await page.route(`**/spaces/${SPACE_ID}/discover`, async (route) => {
      reads++;
      await response.promise;
      await route.fallback();
    });
    await page.goto('/login');
    await signIn(page);
    const main = page.locator('main.product-main');
    const nav = page.locator('.mobile-bottom-nav');
    const story = nav.locator('a[href="/story"]');
    const discover = page.locator('#momente-panel-discover');
    try {
      await story.tap();
      await expect(story).toHaveAttribute('aria-current', 'page');
      await expect(discover.locator('.ui-state-loading')).toBeVisible();
      await expect(main).not.toHaveAttribute(
        'data-navigation-motion',
        'content',
      );
      await page.screenshot({
        path: testInfo.outputPath('shell-story-cold-loading-390.png'),
      });
    } finally {
      response.resolve();
    }
    await expect(discover.locator('.momente-hero-highlight')).toBeVisible();
    await expect(main).toHaveAttribute('data-navigation-motion', 'content');
    await page.screenshot({
      path: testInfo.outputPath('shell-story-cold-arrival-390.png'),
    });

    // A same-page tab selection has its own feedback and does not replay entry.
    await page
      .getByRole('tab', { name: de.story.tabTimeline, exact: true })
      .tap();
    await expect(page).toHaveURL(/\/story\?tab=timeline$/);
    await expect(main).not.toHaveAttribute('data-navigation-motion', 'content');
    await nav.locator('a[href="/more"]').tap();
    await story.tap();
    await expect(discover.locator('.momente-hero-highlight')).toBeVisible();
    await expect(main).toHaveAttribute('data-navigation-motion', 'content');
    expect(reads).toBe(1);
  });

  test('a second swipe works at once while the previous one is still settling', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await expect(page).toHaveURL(/\/today$/);
    await swipePrimary(page, 'next');
    await expect(page).toHaveURL(/\/story$/);
    await expectNoHorizontalOverflow(page);
    // A second real touch must work right after the first one.
    await swipePrimary(page, 'next');
    await expect(page).toHaveURL(/\/plan$/);
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('main')).not.toHaveAttribute(
      'data-primary-tab-dragging',
    );
  });

  for (const variant of [
    { width: 360, theme: 'light', reduced: false },
    { width: 390, theme: 'dark', reduced: true },
    { width: 430, theme: 'light', reduced: false },
    { width: 1280, theme: 'dark', reduced: false },
  ] as const) {
    test(`primary swipe follows tab order at ${variant.width}px ${variant.theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: variant.width, height: 844 });
      await page.emulateMedia({
        reducedMotion: variant.reduced ? 'reduce' : 'no-preference',
      });
      await installApiMocks(page);
      await page.goto('/login');
      await signIn(page);
      await expect(page).toHaveURL(/\/today$/);
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, variant.theme);
      const nav = page.locator(
        variant.width >= 840 ? '.shell-nav' : '.mobile-bottom-nav',
      );
      const documentLifetime = await page.evaluate(
        () => performance.timeOrigin,
      );
      await swipePrimary(page, 'previous');
      await expect(page).toHaveURL(/\/today$/);
      // The order is Wir, Momente, Planen, Listen, Mehr.
      for (const destination of ['/story', '/plan', LISTEN_ROUTE, '/more']) {
        await swipePrimary(page, 'next');
        await expect(page).toHaveURL(new RegExp(`${destination}$`));
        await expect(primaryTabLink(nav, destination)).toHaveAttribute(
          'aria-current',
          'page',
        );
        await expectNoHorizontalOverflow(page);
      }
      await page.screenshot({
        path: testInfo.outputPath(
          `swipe-more-${variant.width}-${variant.theme}.png`,
        ),
      });
      await swipePrimary(page, 'next');
      await expect(page).toHaveURL(/\/more$/);
      for (const destination of [LISTEN_ROUTE, '/plan', '/story', '/today']) {
        await swipePrimary(page, 'previous');
        await expect(page).toHaveURL(new RegExp(`${destination}$`));
        await expect(primaryTabLink(nav, destination)).toHaveAttribute(
          'aria-current',
          'page',
        );
      }
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(
        documentLifetime,
      );
      if (variant.reduced) {
        expect(
          await page
            .locator('main')
            .evaluate((element) => getComputedStyle(element).animationName),
        ).toBe('none');
      }
      await page.screenshot({
        path: testInfo.outputPath(
          `swipe-wir-${variant.width}-${variant.theme}.png`,
        ),
      });
      await expectNoHorizontalOverflow(page);
    });
  }

  for (const [from, to] of [
    ['/today', '/story'],
    ['/plan', '/more/collections'],
  ] as const)
    test(`primary swipe drags ${from} beside ${to} like a pager`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await installApiMocks(page);
      await page.goto('/login');
      await signIn(page);
      await expect(page).toHaveURL(/\/today$/);
      if (from === '/plan')
        await primaryTabLink(page.locator('.mobile-bottom-nav'), from).tap();
      await expect(page).toHaveURL(new RegExp(`${from}$`));
      const { width, startX, y } = await primarySwipeStart(page, 'next');
      const main = page.locator('main.product-main');
      await expect(main).not.toHaveAttribute('data-navigation-slide');
      const current = page.locator(
        'main > .primary-tab-panel:not([hidden], [data-primary-tab-peek], [data-primary-tab-prewarm]) > .page',
      );
      const neighbourPanel = main.locator(
        ':scope > .primary-tab-panel[data-primary-tab-peek]',
      );
      const neighbour = neighbourPanel.locator(':scope > .page');
      const action = main.locator('[data-floating-create]:visible');
      await expect(action).toHaveCSS('position', 'fixed');
      const restingAction = await action.boundingBox();
      if (!restingAction) throw new Error('Missing floating create action.');
      const restBox = await current.boundingBox();
      const mainBox = await main.boundingBox();
      const session = await page.context().newCDPSession(page);
      try {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: startX, y, id: 1 }],
        });
        await nextFrame(page);
        for (let step = 1; step <= 5; step++)
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: startX - 40 * step, y, id: 1 }],
          });
        await expect(main).toHaveAttribute('data-primary-tab-dragging', 'true');
        await expect(neighbour).toBeVisible();
        await expect(neighbourPanel).toHaveAttribute('data-primary-tab', to);
        const draggingAction = await action.boundingBox();
        expect(draggingAction?.x).toBeCloseTo(restingAction.x, 0);
        expect(draggingAction?.y).toBeCloseTo(restingAction.y, 0);
        // The page follows the finger one to one; the next tab is one viewport
        // further along, so both are on screen while dragging.
        const currentBox = await current.boundingBox();
        const neighbourBox = await neighbour.boundingBox();
        expect(currentBox).not.toBeNull();
        expect(neighbourBox).not.toBeNull();
        if (!currentBox || !neighbourBox) return;
        expect(currentBox.x).toBeCloseTo((restBox?.x ?? 0) - 200, 0);
        // One viewport further along, in the same content column.
        expect(neighbourBox.x).toBeCloseTo((mainBox?.x ?? 0) + width - 200, 0);
        const translations = await Promise.all(
          [current, neighbourPanel].map((box) =>
            box.evaluate(
              (element) =>
                new DOMMatrixReadOnly(getComputedStyle(element).transform).m41,
            ),
          ),
        );
        expect(translations[0]).toBeCloseTo(-200, 0);
        expect(translations[1]).toBeCloseTo(width - 200, 0);
        // The page boxes follow the finger; their content never inherits the
        // per-frame offsets (especially important for pages with many cards).
        for (const [pageBox, property] of [
          [current, '--primary-tab-offset'],
          [neighbour, '--primary-tab-peek-offset'],
        ] as const) {
          // A lazy preview can replace its loading node while the finger is down.
          await expect(pageBox.locator(':scope > *').first()).toHaveCSS(
            property,
            '0px',
          );
        }
        await expectNoHorizontalOverflow(page);
        await page.screenshot({
          path: testInfo.outputPath('swipe-mid-drag.png'),
        });
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
      } finally {
        await session.detach();
      }
      await expect(page).toHaveURL(new RegExp(`${to}$`));
      await expect(main).not.toHaveAttribute('data-primary-tab-dragging');
      await expect(neighbour).toHaveCount(0);
      await expectPrimaryReadingSurface(page);
      await expectNoHorizontalOverflow(page);
    });

  test('a short primary swipe settles back without leaving the tab', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await expect(page).toHaveURL(/\/today$/);
    const { startX, y } = await primarySwipeStart(page, 'next');
    await dragTouch(page, { x: startX, y }, { x: startX - 30, y });
    await expect(page).toHaveURL(/\/today$/);
    const main = page.locator('main.product-main');
    await expect(main).not.toHaveAttribute('data-primary-tab-dragging');
    await expect(
      page.locator('main > .primary-tab-panel[data-primary-tab-peek]'),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  for (const variant of [
    { width: 390, theme: 'dark', nav: '.mobile-bottom-nav' },
    { width: 1280, theme: 'light', nav: '.shell-nav' },
  ] as const) {
    test(`Wir keeps its background when swiped in from Momente at ${variant.width}px ${variant.theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: variant.width, height: 844 });
      await page.emulateMedia({
        colorScheme: variant.theme,
        reducedMotion: 'no-preference',
      });
      await installApiMocks(page, { connectedWir: true });
      await page.goto('/login');
      await signIn(page);
      await expect(page).toHaveURL(/\/today$/);
      await expectPrimaryReadingSurface(page);

      const wir = page.locator(
        'main > .primary-tab-panel[data-primary-tab="/today"]',
      );
      const background = () =>
        wir.locator('.today-page').evaluate((element) => {
          const style = getComputedStyle(element, '::before');
          return {
            content: style.content,
            image: style.backgroundImage,
            opacity: style.opacity,
            top: style.top,
            width: style.width,
          };
        });
      const atRest = await background();
      expect(atRest.content).toBe('""');
      expect(atRest.image).toContain('radial-gradient');
      expect(atRest.opacity).toBe('1');
      const shellWidth = await page
        .locator('.product-shell')
        .evaluate((shell) => shell.clientWidth);
      expect(Number.parseFloat(atRest.width)).toBeCloseTo(shellWidth, 0);

      await page.locator(`${variant.nav} a[href="/story"]`).tap();
      await expect(page).toHaveURL(/\/story$/);
      const { width, startX, y } = await primarySwipeStart(page, 'previous');
      const capture = (phase: 'during' | 'after') =>
        page.screenshot({
          path: testInfo.outputPath(
            `today-wir-backdrop-${variant.width}-${variant.theme}-${phase}-swipe.png`,
          ),
        });
      await dragTouch(
        page,
        { x: startX, y },
        { x: startX + width / 2, y },
        async () => {
          await expect(wir).toHaveAttribute('data-primary-tab-peek', 'true');
          await expect(wir.locator('.today-hero')).toBeVisible();
          expect(await background()).toEqual(atRest);
          await capture('during');
        },
      );
      await expect(page).toHaveURL(/\/today$/);
      await expect(wir).not.toHaveAttribute('data-primary-tab-peek');
      expect(await background()).toEqual(atRest);
      await expectNoHorizontalOverflow(page);
      await capture('after');
    });
  }

  test('primary swipe previews and opens a visited tab at the top without growing native history or refetching fresh content', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installNativeAppLifecycle(page);
    await installApiMocks(page);
    let timelineReads = 0;
    let planReads = 0;
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/timeline')) timelineReads++;
      if (path.endsWith('/plans')) planReads++;
    });
    await page.goto('/login');
    await signIn(page);
    await expect(page).toHaveURL(/\/today$/);
    await swipePrimary(page, 'next');
    await expect(page).toHaveURL(/\/story$/);
    const diaryTab = page.getByRole('tab', {
      name: de.story.tabTimeline,
      exact: true,
    });
    await diaryTab.click();
    await expect(diaryTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.story-timeline').first()).toBeVisible();
    const historyLength = await page.evaluate(() => history.length);
    await expect(
      page.getByText('Cooked fresh pasta together', { exact: true }).first(),
    ).toBeVisible();
    const storyPage = page.locator('[data-primary-tab="/story"] > .story-page');
    const entryTop = await storyPage.evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
    await scrollDownFromEntry(page);
    const reads = timelineReads;
    expect(reads).toBeGreaterThan(0);
    await swipePrimary(page, 'next');
    await expect(page).toHaveURL(/\/plan$/);
    await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
    await expect(
      page.getByRole('tab', { name: m5s3.overview.segmentWishes }),
    ).toHaveAttribute('aria-selected', 'true');
    const { width, startX, y } = await primarySwipeStart(page, 'previous');
    const discoverPreview = storyPage.locator(
      '[role="tab"][aria-controls="momente-panel-discover"]',
    );
    // A short peek shows the landing view while the current Wishes segment stays put.
    await dragTouch(page, { x: startX, y }, { x: startX + 25, y }, async () => {
      await expect(discoverPreview).toHaveAttribute('aria-selected', 'true');
    });
    await expect(page.locator('main')).not.toHaveAttribute(
      'data-primary-tab-dragging',
    );
    await expect(
      page.getByRole('tab', { name: m5s3.overview.segmentWishes }),
    ).toHaveAttribute('aria-selected', 'true');
    await dragTouch(
      page,
      { x: startX, y },
      { x: startX + width / 2, y },
      async () => {
        await expect(
          page.locator('[data-primary-tab="/story"]'),
        ).toHaveAttribute('data-primary-tab-peek', 'true');
        await expect(discoverPreview).toHaveAttribute('aria-selected', 'true');
        expect(
          await storyPage.evaluate(
            (element) => element.getBoundingClientRect().top,
          ),
        ).toBeCloseTo(entryTop, 0);
        await page.screenshot({
          path: testInfo.outputPath('story-preview.png'),
        });
      },
    );
    await expect(page).toHaveURL(/\/story$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(
      page.getByRole('tab', { name: de.story.tabDiscover, exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(timelineReads).toBe(reads);
    const planReadsBeforePeek = planReads;
    const next = await primarySwipeStart(page, 'next');
    await dragTouch(
      page,
      { x: next.startX, y: next.y },
      { x: next.startX - next.width / 2, y: next.y },
      async () => {
        const preview = page
          .locator('[data-primary-tab-peek] [role=tab]')
          .filter({ hasText: m5s3.overview.segmentPlans });
        await expect(preview).toHaveAttribute('aria-selected', 'true');
        expect(planReads).toBe(planReadsBeforePeek);
      },
    );
    await expect(page).toHaveURL(/\/plan$/);
    await expect(
      page.getByRole('tab', { name: m5s3.overview.segmentPlans }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    const addPlan = page.getByRole('link', { name: m5s3.overview.addPlan });
    await addPlan.click();
    await expect(page).toHaveURL(/\/plan\/plans\/new$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/plan$/);
    await expect(addPlan).toBeVisible();
  });

  test('a cold Lists loading page keeps its geometry through a swipe and follows the next drag', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await installApiMocks(page);
    let releaseChunk = () => {};
    const held = new Promise<void>((resolve) => {
      releaseChunk = resolve;
    });
    await page.route('**/CollectionsOverviewPage-*.js', async (route) => {
      await held;
      await route.continue();
    });
    try {
      await page.goto('/login');
      await signIn(page);
      await primaryTabLink(page.locator('.mobile-bottom-nav'), '/plan').click();
      await expect(page).toHaveURL(/\/plan$/);
      const loading = page.locator(
        `[data-primary-tab="${LISTEN_ROUTE}"] .ui-state-loading`,
      );
      const geometry = () =>
        loading.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const panel = element.closest('[data-primary-tab-peek]');
          return {
            left: rect.left - (panel?.getBoundingClientRect().left ?? 0),
            top: rect.top,
            width: rect.width,
          };
        });
      const { width, startX, y } = await primarySwipeStart(page, 'next');
      let preview: Awaited<ReturnType<typeof geometry>> | undefined;
      await dragTouch(
        page,
        { x: startX, y },
        { x: startX - width / 2, y },
        async () => {
          await expect(loading).toBeVisible();
          preview = await geometry();
        },
      );
      await expect(page).toHaveURL(/\/more\/collections$/);
      await expect(page.locator('main')).not.toHaveAttribute(
        'data-primary-tab-dragging',
      );
      const entry = await geometry();
      expect(entry).toEqual(preview);

      const reverse = { x: width * 0.25, y: entry.top + 25 };
      await dragTouch(
        page,
        reverse,
        { x: reverse.x + width / 2, y: reverse.y },
        async () => {
          await expect
            .poll(async () => (await geometry()).left - entry.left)
            .toBeCloseTo(width / 2, 0);
        },
      );
      await expect(page).toHaveURL(/\/plan$/);
    } finally {
      releaseChunk();
    }
  });

  test('native horizontal content scrolling and vertical document scrolling keep gesture ownership', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await expect(page).toHaveURL(/\/today$/);
    await expectPrimaryReadingSurface(page);
    await page.evaluate(() => {
      const scroller = document.createElement('div');
      scroller.dataset.testHorizontalContent = 'true';
      scroller.style.cssText =
        'display:flex;overflow-x:auto;width:100%;height:100px;';
      for (let index = 0; index < 4; index++) {
        const item = document.createElement('div');
        item.style.cssText = 'flex:0 0 250px;background:var(--color-surface);';
        item.textContent = `Synthetic horizontal item ${index + 1}`;
        scroller.append(item);
      }
      const main = document.querySelector('main');
      if (!main) throw new Error('The primary reading surface disappeared.');
      main.prepend(scroller);
    });
    const scroller = page.locator('[data-test-horizontal-content]');
    const box = await scroller.boundingBox();
    if (!box) throw new Error('Horizontal content is missing.');
    await dragTouch(page, { x: 300, y: box.y + 50 }, { x: 80, y: box.y + 50 });
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(100);
    await expect(page).toHaveURL(/\/today$/);
    await scroller.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await dragTouch(page, { x: 300, y: box.y + 50 }, { x: 80, y: box.y + 50 });
    await expect(page).toHaveURL(/\/today$/);
    // Local content retains both directions when every item fits, too.
    await scroller.evaluate((element) => {
      const item = document.createElement('div');
      item.style.flex = '0 0 80px';
      item.textContent = 'A single horizontal item';
      element.replaceChildren(item);
    });
    expect(
      await scroller.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await dragTouch(page, { x: 300, y: box.y + 50 }, { x: 80, y: box.y + 50 });
    await expect(page).toHaveURL(/\/today$/);
    await dragTouch(page, { x: 80, y: box.y + 50 }, { x: 300, y: box.y + 50 });
    await expect(page).toHaveURL(/\/today$/);
    await addScrollFixture(page);
    await dragTouch(page, { x: 200, y: 650 }, { x: 200, y: 280 });
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(100);
    await expect(page).toHaveURL(/\/today$/);
  });
});

test.describe('floating create action while scrolling (#1790)', () => {
  for (const variant of [
    { theme: 'light', motion: 'no-preference' },
    { theme: 'dark', motion: 'reduce' },
  ] as const) {
    test(`tucks away on the viewer's own downward scroll and returns on the way up (${variant.theme}, ${variant.motion})`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({
        colorScheme: variant.theme,
        reducedMotion: variant.motion,
      });
      await installApiMocks(page);
      await page.goto('/login');
      await signIn(page);
      await expect(page).toHaveURL(/\/today$/);
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, variant.theme);
      const add = page.locator('[data-floating-create]');
      await expect(add).toBeVisible();
      await addScrollFixture(page);
      const tucked = () =>
        page.evaluate(() =>
          document.documentElement.hasAttribute('data-floating-create-tucked'),
        );
      const opacity = () =>
        add.evaluate((element) => getComputedStyle(element).opacity);
      await page.screenshot({
        path: testInfo.outputPath(`fab-rest-390-${variant.theme}.png`),
      });

      await page.mouse.move(195, 420);
      await page.mouse.wheel(0, 600);
      await expect.poll(tucked).toBe(true);
      await expect.poll(opacity).toBe('0');
      expect(
        await add.evaluate(
          (element) => getComputedStyle(element).pointerEvents,
        ),
      ).toBe('none');
      await expect(page.locator('.mobile-bottom-shell')).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`fab-tucked-390-${variant.theme}.png`),
      });

      await page.mouse.wheel(0, -80);
      await expect.poll(tucked).toBe(false);
      await expect.poll(opacity).toBe('1');
      await page.screenshot({
        path: testInfo.outputPath(`fab-returned-390-${variant.theme}.png`),
      });

      // Keyboard focus always shows the tucked action.
      await page.mouse.wheel(0, 600);
      await expect.poll(opacity).toBe('0');
      await page.keyboard.press('Shift');
      await add.focus();
      await expect.poll(opacity).toBe('1');
      await add.blur();

      // Programmatic scrolling, such as a restored position, shows it again.
      await page.mouse.wheel(0, 300);
      await expect.poll(tucked).toBe(true);
      await page.waitForTimeout(1300);
      await page.evaluate(() =>
        window.scrollTo({ top: 200, behavior: 'instant' }),
      );
      await expect.poll(tucked).toBe(false);
      await expect.poll(opacity).toBe('1');
      await expectNoHorizontalOverflow(page);
    });
  }
});

/**
 * Motion migration step 4 (#2075): shell, overlays and navigation on the
 * motion layer. Run with VISUAL_EVIDENCE_DIR to export the evidence images
 * (docs/product/design/evidence/2075).
 */
test.describe('shell, overlays and navigation on the motion layer (#2075)', () => {
  type MotionLog = { css: string[]; tabs: string[]; offsets: string[] };

  async function saveEvidence(page: Page, name: string) {
    const output = test.info().outputPath(`${name}.png`);
    await page.screenshot({ path: output });
    const exportDir = process.env.VISUAL_EVIDENCE_DIR;
    if (exportDir) {
      fs.mkdirSync(exportDir, { recursive: true });
      fs.copyFileSync(output, path.join(exportDir, `${name}.png`));
    }
  }

  /**
   * Records every CSS animation start (also with the primary tab it runs in)
   * and the starting offset of route entrances.
   */
  async function recordMotion(page: Page) {
    await page.addInitScript(() => {
      const log = {
        css: [] as string[],
        tabs: [] as string[],
        offsets: [] as string[],
      };
      (window as unknown as { motionLog: typeof log }).motionLog = log;
      document.addEventListener('animationstart', (event) => {
        log.css.push(event.animationName);
        const panel =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-primary-tab]')
            : null;
        log.tabs.push(
          `${event.animationName}@${panel?.dataset.primaryTab ?? ''}`,
        );
      });
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (keyframes, options) {
        const frames = Array.isArray(keyframes) ? keyframes : [];
        const first = frames[0] as Keyframe | undefined;
        if (first && frames.length === 2 && this.matches('.page')) {
          if ('left' in first) log.offsets.push(String(first.left));
          else if (typeof first.transform === 'string')
            log.offsets.push(`${new DOMMatrixReadOnly(first.transform).m41}px`);
        }
        return animate.call(this, keyframes, options);
      };
    });
  }

  const motionLog = (page: Page) =>
    page.evaluate(
      () => (window as unknown as { motionLog: MotionLog }).motionLog,
    );

  const clearMotionLog = (page: Page) =>
    page.evaluate(() => {
      const log = (window as unknown as { motionLog: MotionLog }).motionLog;
      log.css.length = 0;
      log.tabs.length = 0;
      log.offsets.length = 0;
    });

  async function openQuickCreate(page: Page) {
    const trigger = page.getByRole('button', {
      name: navigationCopy.quickCreateTitle,
    });
    await trigger.click();
    const sheet = page.getByRole('dialog', {
      name: navigationCopy.quickCreateTitle,
    });
    await expect(sheet).toBeVisible();
    return { trigger, sheet };
  }

  const runningLayerAnimations = (page: Page) =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            ((animation as CSSAnimation).animationName ?? '').startsWith(
              'eimir-motion-',
            ),
        )
        .map((animation) => (animation as CSSAnimation).animationName),
    );

  test('a sheet enters and exits on the catalogue for Close, Escape and the backdrop, and focus returns', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await recordMotion(page);
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await expect(page).toHaveURL(/\/today$/);

    // Frame-sampled entrance: Compact slides the whole sheet up, so its
    // translate falls to 0 while its opacity stays 1.
    await clearMotionLog(page);
    const { trigger, sheet } = await openQuickCreate(page);
    const samples = await page.evaluate(async () => {
      const dialog = document.querySelector('dialog.short-task-sheet');
      const out: Array<{ translate: string; opacity: string }> = [];
      for (let frame = 0; frame < 30 && dialog; frame += 1) {
        const style = getComputedStyle(dialog);
        out.push({ translate: style.translate, opacity: style.opacity });
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return out;
    });
    test.info().annotations.push({
      type: 'sheet-entrance-samples',
      description: JSON.stringify(samples),
    });
    expect(samples.every((sample) => sample.opacity === '1')).toBe(true);
    expect(samples.at(-1)?.translate).toMatch(/^(none|0px)$/);
    const log = await motionLog(page);
    expect(log.css).toContain('eimir-motion-surface-in');
    expect(log.css).toContain('eimir-motion-backdrop-in');

    // Escape: the shared exit, then the trigger has focus again.
    await clearMotionLog(page);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    expect((await motionLog(page)).css).toContain('eimir-motion-surface-out');
    await expect(trigger).toBeFocused();

    // The close control.
    await openQuickCreate(page);
    await clearMotionLog(page);
    await page
      .locator('dialog.short-task-sheet .short-task-sheet-close')
      .click();
    await expect(sheet).toHaveCount(0);
    expect((await motionLog(page)).css).toContain('eimir-motion-surface-out');
    await expect(trigger).toBeFocused();

    // The backdrop: a press above the sheet.
    await openQuickCreate(page);
    await clearMotionLog(page);
    await page.mouse.click(195, 20);
    await expect(sheet).toHaveCount(0);
    expect((await motionLog(page)).css).toContain('eimir-motion-surface-out');
    await expect(trigger).toBeFocused();

    // Rapid open and close converge on closed, with nothing left running.
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect.poll(() => runningLayerAnimations(page)).toEqual([]);
  });

  test('navigation moves by direction, and a kept tab never replays its entrance', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await recordMotion(page);
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    const nav = page.locator('.mobile-bottom-nav');

    // The first visit to Planen plays the root-tab entrance once. A later
    // tab comes in from the inline end.
    await clearMotionLog(page);
    await primaryTabLink(nav, '/plan').click();
    await expect(page).toHaveURL(/\/plan$/);
    await expect
      .poll(async () => (await motionLog(page)).css)
      .toContain('eimir-motion-root-rise');
    expect((await motionLog(page)).offsets).toContain('32px');
    await expect(page.locator('.page[data-motion-stage]')).toHaveCount(0);

    // Mehr, then Planen again: the kept tab shows its final state at once,
    // and an earlier tab comes in from the inline start.
    await primaryTabLink(nav, '/more').click();
    await expect(page).toHaveURL(/\/more$/);
    await expect(page.locator('.page[data-motion-stage]')).toHaveCount(0);
    await clearMotionLog(page);
    await primaryTabLink(nav, '/plan').click();
    await expect(page).toHaveURL(/\/plan$/);
    await expect(page.locator('.page[data-motion-stage]')).toHaveCount(0);
    expect((await motionLog(page)).offsets).toContain('-32px');
    expect((await motionLog(page)).tabs).not.toContain(
      'eimir-motion-root-rise@/plan',
    );

    // Forward into a deeper page, then Back.
    await primaryTabLink(nav, '/more').click();
    await expect(page).toHaveURL(/\/more$/);
    await clearMotionLog(page);
    await page.locator('main a[href="/more/people"]').first().click();
    await expect(page).toHaveURL(/\/more\/people$/);
    await expect
      .poll(async () => (await motionLog(page)).offsets)
      .toEqual(['32px']);
    await clearMotionLog(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/more$/);
    await expect
      .poll(async () => (await motionLog(page)).offsets)
      .toEqual(['-32px']);
    expect((await motionLog(page)).tabs).not.toContain(
      'eimir-motion-root-rise@/more',
    );
  });

  test('reduced motion shows sheets and destinations at once with the same focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await recordMotion(page);
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await expect(page).toHaveURL(/\/today$/);
    await clearMotionLog(page);
    const { trigger, sheet } = await openQuickCreate(page);
    await expect(sheet.locator(':focus')).toHaveCount(1);
    expect(await runningLayerAnimations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await primaryTabLink(page.locator('.mobile-bottom-nav'), '/plan').click();
    await expect(page).toHaveURL(/\/plan$/);
    await expect(page.locator('.page[data-motion-stage]')).toHaveCount(0);
    const log = await motionLog(page);
    expect(log.offsets).toEqual([]);
    expect(log.css.filter((name) => name.startsWith('eimir-motion-'))).toEqual(
      [],
    );
    await saveEvidence(page, '2075-390-light-reduced-motion-plan');
  });

  for (const variant of [
    { width: 360, theme: 'light', text: '' },
    { width: 360, theme: 'dark', text: '' },
    { width: 390, theme: 'light', text: '' },
    { width: 390, theme: 'dark', text: '' },
    { width: 430, theme: 'light', text: '' },
    { width: 430, theme: 'dark', text: '' },
    { width: 390, theme: 'light', text: '200%' },
    { width: 1280, theme: 'light', text: '' },
    { width: 1280, theme: 'dark', text: '' },
  ] as const) {
    const label = `${variant.width}-${variant.theme}${variant.text ? '-200-text' : ''}`;
    test(`visual evidence 2075 ${label}`, async ({ page }) => {
      await page.setViewportSize({ width: variant.width, height: 800 });
      await page.emulateMedia({
        colorScheme: variant.theme,
        reducedMotion: 'no-preference',
      });
      await installApiMocks(page);
      await page.goto('/login');
      await signIn(page);
      await expect(page).toHaveURL(/\/today$/);
      const applyAppearance = () =>
        page.evaluate(
          ({ theme, text }) => {
            document.documentElement.dataset.theme = theme;
            if (text) document.documentElement.style.fontSize = text;
          },
          { theme: variant.theme, text: variant.text },
        );
      await applyAppearance();

      // The sheet mid-entrance (paused at half its duration), then at rest.
      await page.evaluate(() => {
        document.addEventListener(
          'animationstart',
          (event) => {
            if (event.animationName !== 'eimir-motion-surface-in') return;
            for (const animation of document.getAnimations()) {
              const name = (animation as CSSAnimation).animationName ?? '';
              if (!name.startsWith('eimir-motion-')) continue;
              const duration = Number(
                animation.effect?.getComputedTiming().duration ?? 0,
              );
              animation.pause();
              animation.currentTime = duration / 2;
            }
          },
          { once: true },
        );
      });
      const { sheet } = await openQuickCreate(page);
      await saveEvidence(page, `2075-${label}-1-sheet-entering`);
      await page.evaluate(() => {
        for (const animation of document.getAnimations()) animation.finish();
      });
      await saveEvidence(page, `2075-${label}-2-sheet-open`);
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);

      // A deeper page mid-arrival (paused at half), then settled.
      const nav = page.locator(
        variant.width >= 840 ? '.shell-nav' : '.mobile-bottom-nav',
      );
      await primaryTabLink(nav, '/more').click();
      await expect(page).toHaveURL(/\/more$/);
      await page.evaluate(() => {
        for (const animation of document.getAnimations()) animation.finish();
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (keyframes, options) {
          const animation = animate.call(this, keyframes, options);
          if (this.matches('.page, main.product-main')) {
            const duration = Number(
              animation.effect?.getComputedTiming().duration ?? 0,
            );
            animation.pause();
            animation.currentTime = duration / 2;
          }
          return animation;
        };
      });
      await page.locator('main a[href="/more/people"]').first().click();
      await expect(page).toHaveURL(/\/more\/people$/);
      await expect(page.locator('main .ui-state-loading')).toHaveCount(0);
      await saveEvidence(page, `2075-${label}-3-forward-arriving`);
      await page.evaluate(() => {
        for (const animation of document.getAnimations()) animation.finish();
      });
      await saveEvidence(page, `2075-${label}-4-forward-settled`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
  }
});

/**
 * Motion migration step 5 (#2076): gestures and haptics on the motion layer.
 * The tab pager settle is sampled frame by frame under 4x CPU throttling,
 * grabbed again mid-settle, and checked with the native haptics stub. Run
 * with VISUAL_EVIDENCE_DIR to export the measurements
 * (docs/product/design/evidence/2076).
 */
test.describe('gestures and haptics on the motion layer (#2076)', () => {
  test.use({ hasTouch: true });

  type Sample = { t: number; left: number; dragging: boolean };
  type Session = Awaited<
    ReturnType<ReturnType<Page['context']>['newCDPSession']>
  >;

  const CURRENT_PAGE =
    'main.product-main > .primary-tab-panel:not([hidden], [data-primary-tab-peek], [data-primary-tab-prewarm]) > .page';

  function exportMeasurement(name: string, value: unknown) {
    const exportDir = process.env.VISUAL_EVIDENCE_DIR;
    const text = `${JSON.stringify(value, null, 2)}\n`;
    fs.writeFileSync(test.info().outputPath(name), text);
    if (exportDir) {
      fs.mkdirSync(exportDir, { recursive: true });
      fs.writeFileSync(path.join(exportDir, name), text);
    }
  }

  /** Reads the active page's compositor transform at each animation frame. */
  async function startSampling(page: Page) {
    await page.evaluate((selector) => {
      const recorded: Sample[] = [];
      const surface = document.querySelector('main.product-main');
      const current = document.querySelector<HTMLElement>(selector);
      (window as unknown as { settleSamples: Sample[] }).settleSamples =
        recorded;
      const start = performance.now();
      const tick = () => {
        const transform = current?.isConnected
          ? getComputedStyle(current).transform
          : 'none';
        recorded.push({
          t: Math.round(performance.now() - start),
          left: transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41,
          dragging: surface?.hasAttribute('data-primary-tab-dragging') ?? false,
        });
        if (recorded.length < 90 && recorded.at(-1)?.dragging)
          requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, CURRENT_PAGE);
  }

  const samples = (page: Page) =>
    page.evaluate(
      () => (window as unknown as { settleSamples: Sample[] }).settleSamples,
    );

  const pageOffset = (page: Page) =>
    page.locator(CURRENT_PAGE).evaluate((element) => {
      const transform = getComputedStyle(element).transform;
      return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41;
    });

  async function openToday(page: Page, { native = true } = {}) {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    if (native) await installNativeAppLifecycle(page);
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await expect(page).toHaveURL(/\/today$/);
    await expectPrimaryReadingSurface(page);
  }

  async function touch(
    session: Session,
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    x?: number,
    y?: number,
  ) {
    await session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: x === undefined ? [] : [{ x, y: y ?? 0, id: 1 }],
    });
  }

  /** A swipe toward the next tab, released at 40 % of the width. */
  async function swipeAndRelease(page: Page, steps = 6) {
    const { width, startX, y } = await primarySwipeStart(page, 'next');
    const session = await page.context().newCDPSession(page);
    const releaseX = width * 0.4;
    await touch(session, 'touchStart', startX, y);
    await nextFrame(page);
    for (let step = 1; step <= steps; step++) {
      await touch(
        session,
        'touchMove',
        startX + ((releaseX - startX) * step) / steps,
        y,
      );
      await nextFrame(page);
    }
    const released = await page.evaluate(
      () =>
        Number.parseFloat(
          getComputedStyle(
            document.querySelector('main.product-main') as Element,
          ).getPropertyValue('--primary-tab-offset'),
        ) || 0,
    );
    await startSampling(page);
    await touch(session, 'touchEnd');
    return { session, released, width, y };
  }

  test('the pager settle continues from the release, frame by frame, under 4x CPU throttling', async ({
    page,
  }) => {
    await openToday(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    try {
      const { session, released, width } = await swipeAndRelease(page);
      await expect(page).toHaveURL(/\/story$/);
      const frames = (await samples(page)).filter(
        (sample) => sample.dragging && Number.isFinite(sample.left),
      );
      await session.detach();
      exportMeasurement('2076-pager-settle-cpu4.json', {
        viewport: 390,
        cpuThrottling: 4,
        releasedOffset: released,
        target: -width,
        frames,
      });
      // The settle starts where the finger let go (no jump), travels toward
      // the next tab without reversing, and ends on it.
      expect(frames.length).toBeGreaterThan(3);
      expect(Math.abs(frames[0].left - released)).toBeLessThan(width * 0.25);
      for (let index = 1; index < frames.length; index++)
        expect(frames[index].left).toBeLessThanOrEqual(
          frames[index - 1].left + 0.5,
        );
      expect(frames.at(-1)?.left ?? 0).toBeLessThan(released);
      // Haptics: one commit at release, no tick while dragging past the commit distance.
      await expect.poll(() => nativeHapticCalls(page)).toEqual(['tap']);
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await cdp.detach();
    }
  });

  async function holdPagerSettle(page: Page) {
    await page.evaluate((selector) => {
      window.addEventListener(
        'touchend',
        () => {
          // Hold the compositor spring while CDP delivers the follow-up touch.
          for (const panel of document.querySelectorAll(
            selector + ', main > [data-primary-tab-peek]',
          )) {
            for (const animation of panel.getAnimations()) {
              const effect = animation.effect;
              if (!(effect instanceof KeyframeEffect)) continue;
              const frames = effect.getKeyframes();
              if (frames.length <= 2 || !('transform' in frames[0])) continue;
              animation.pause();
              animation.currentTime = Number(effect.getTiming().duration) / 5;
            }
          }
        },
        { once: true },
      );
    }, CURRENT_PAGE);
  }

  test('a tap on the fixed create action during a committed swipe opens the destination menu', async ({
    page,
  }) => {
    await openToday(page);
    const action = await page
      .locator('main [data-floating-create]:visible')
      .boundingBox();
    if (!action) throw new Error('Missing floating create action.');
    await holdPagerSettle(page);
    const { session } = await swipeAndRelease(page);
    try {
      await touch(
        session,
        'touchStart',
        action.x + action.width / 2,
        action.y + action.height / 2,
      );
      await touch(session, 'touchEnd');
      await expect(page).toHaveURL(/\/story$/);
      await expect(
        page.getByRole('dialog', { name: de.story.addMoment }),
      ).toBeVisible();
    } finally {
      await session.detach();
    }
  });

  test('grabbing the settling pages stops them where they are, without a jump', async ({
    page,
  }) => {
    await openToday(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    try {
      const action = page.locator('main [data-floating-create]:visible');
      const restingAction = await action.boundingBox();
      if (!restingAction) throw new Error('Missing floating create action.');
      await holdPagerSettle(page);
      await page.evaluate((selector) => {
        window.addEventListener(
          'touchend',
          () => {
            // Read the drawn offset just before and after the real grab.
            const record = window as unknown as { grab: number[] };
            record.grab = [];
            const read = () => {
              const transform = getComputedStyle(
                document.querySelector(selector) as Element,
              ).transform;
              return transform === 'none'
                ? 0
                : new DOMMatrixReadOnly(transform).m41;
            };
            window.addEventListener(
              'touchstart',
              () => record.grab.push(read()),
              {
                capture: true,
                once: true,
              },
            );
            window.addEventListener(
              'touchstart',
              () => record.grab.push(read()),
              {
                once: true,
              },
            );
          },
          { once: true },
        );
      }, CURRENT_PAGE);
      const { session, width, y } = await swipeAndRelease(page);
      const settlingAction = await action.boundingBox();
      expect(settlingAction?.x).toBeCloseTo(restingAction.x, 0);
      expect(settlingAction?.y).toBeCloseTo(restingAction.y, 0);
      await touch(session, 'touchStart', width * 0.5, y);
      const [before, after] = await page.evaluate(
        () => (window as unknown as { grab: number[] }).grab,
      );
      expect(after).toBeCloseTo(await pageOffset(page), 0);
      exportMeasurement('2076-pager-grab-cpu4.json', {
        viewport: 390,
        cpuThrottling: 4,
        offsetBeforeGrab: before,
        offsetAfterGrab: after,
      });
      // No jump: the pages stop where they were drawn, not at either end.
      expect(Math.abs(after - before)).toBeLessThan(1);
      expect(after).toBeGreaterThan(-width + 2);
      expect(after).toBeLessThan(-2);
      await expect(page).toHaveURL(/\/today$/);
      // Dragging back toward Wir and releasing returns to rest on Wir.
      for (let step = 1; step <= 6; step++) {
        await touch(session, 'touchMove', width * 0.5 + step * 30, y);
        await nextFrame(page);
      }
      await touch(session, 'touchEnd');
      await session.detach();
      await expect(
        page.locator('main.product-main[data-primary-tab-dragging]'),
      ).toHaveCount(0);
      await expect(page).toHaveURL(/\/today$/);
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await cdp.detach();
    }
  });

  test('the in-app switch silences haptics in the native app', async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem('eimir.motion.haptics', 'off'),
    );
    await openToday(page);
    const { session } = await swipeAndRelease(page);
    await session.detach();
    await expect(page).toHaveURL(/\/story$/);
    expect(await nativeHapticCalls(page)).toEqual([]);
  });

  test('with reduced motion the swipe still commits, at once', async ({
    page,
  }) => {
    await openToday(page, { native: false });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { session } = await swipeAndRelease(page);
    await session.detach();
    await expect(page).toHaveURL(/\/story$/);
    await expect(
      page.locator('main.product-main[data-primary-tab-dragging]'),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        document.getAnimations().some((animation) => {
          const effect = animation.effect;
          return (
            effect instanceof KeyframeEffect &&
            effect.target?.matches('.page, .primary-tab-panel') &&
            effect
              .getKeyframes()
              .some((frame) => 'left' in frame || 'transform' in frame)
          );
        }),
      ),
    ).toBe(false);
  });
});

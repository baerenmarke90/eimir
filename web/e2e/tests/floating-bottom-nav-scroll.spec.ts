import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import importantDates from '../../src/i18n/locales/importantDates';
import m5s3 from '../../src/i18n/locales/m5s3';
import navigationCopy from '../../src/i18n/locales/navigation';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { nextFrame } from '../support/mediaCarouselGesture';
import { installNativeAppLifecycle } from '../support/nativeAppLifecycle';
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

async function installApiMocks(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillEmptyPlanComments(route)) return;
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;

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
        expect(metric.titleBand).toEqual({ width: 1, height: 1 });

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

    // The glow is a faded layer so route changes can transition it.
    const glow = () =>
      shell.evaluate((element) => {
        const style = getComputedStyle(element, '::before');
        return {
          backgroundImage: style.backgroundImage,
          opacity: style.opacity,
        };
      });
    expect((await glow()).backgroundImage).toContain('radial-gradient');
    await expect.poll(async () => (await glow()).opacity).toBe('1');

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
  test(`primary destinations restore scroll and reset ${variant.view} and Planning mode at ${variant.width}px ${variant.theme}`, async ({
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
    await expect(
      page.getByText('Cooked fresh pasta together', { exact: true }).first(),
    ).toBeVisible();
    if (variant.view === 'timeline')
      await expect(page.locator('.story-timeline').first()).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const targetY = await page.evaluate(() => {
      const top = Math.min(
        550,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      window.scrollTo({ top, behavior: 'instant' });
      return top;
    });
    expect(targetY).toBeGreaterThan(100);
    await expect
      .poll(async () =>
        Math.abs((await page.evaluate(() => window.scrollY)) - targetY),
      )
      .toBeLessThan(2);
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
    // On Expanded, Playwright would scroll the non-sticky header into view
    // before clicking, changing the position we meant to restore.
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
    await expectRestoredScroll(page, targetY);
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

test('native primary tab switching replaces root history but keeps nested task return', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    document.addEventListener('animationstart', ({ target, animationName }) => {
      if (
        animationName === 'short-task-sheet-exit' &&
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
    await nav.locator(`a[href^="${root}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${root}$`));
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
  }
  await expect(page.locator('[data-floating-create]:visible')).toHaveCount(0);
  await nav.locator('a[href="/today"]').click();
  await expect(page).toHaveURL(/\/today$/);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  const moment = page.getByRole('button', { name: de.story.addMoment });
  await moment.click();
  await page
    .getByRole('dialog', { name: de.story.addMoment })
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
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await nextFrame(page);
  } finally {
    await session.detach();
  }
}

async function expectRestoredScroll(page: Page, desired: number) {
  await expect
    .poll(() =>
      page.evaluate((stored) => {
        const max = Math.max(
          0,
          document.documentElement.scrollHeight - innerHeight,
        );
        return Math.abs(window.scrollY - Math.min(stored, max));
      }, desired),
    )
    .toBeLessThan(3);
}

async function expectPrimaryReadingSurface(page: Page) {
  const surfaceForRoute: Record<string, string> = {
    '/today': '.today-page',
    '/story': '.story-page',
    '/plan': '.planen-overview',
    '/more': '.more-page',
  };
  const selector = surfaceForRoute[new URL(page.url()).pathname];
  if (!selector)
    throw new Error('A primary swipe requires a primary destination.');
  await expect(
    page.locator(`main > .primary-tab-panel:not([hidden]) ${selector}`),
  ).toBeVisible();
  if (selector === '.today-page') {
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
      for (const destination of ['/story', '/plan', '/more']) {
        await swipePrimary(page, 'next');
        await expect(page).toHaveURL(new RegExp(`${destination}$`));
        await expect(nav.locator(`a[href^="${destination}"]`)).toHaveAttribute(
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
      for (const destination of ['/plan', '/story', '/today']) {
        await swipePrimary(page, 'previous');
        await expect(page).toHaveURL(new RegExp(`${destination}$`));
        await expect(nav.locator(`a[href^="${destination}"]`)).toHaveAttribute(
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

  test('primary swipe drags the page beside its neighbour like a pager', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await expect(page).toHaveURL(/\/today$/);
    const { width, startX, y } = await primarySwipeStart(page, 'next');
    const main = page.locator('main.product-main');
    const current = page.locator(
      'main > .primary-tab-panel:not([hidden]):not([data-primary-tab-peek]) > .page',
    );
    const neighbour = page.locator(
      'main > .primary-tab-panel[data-primary-tab-peek] > .page',
    );
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
    await expect(page).toHaveURL(/\/story$/);
    await expect(main).not.toHaveAttribute('data-primary-tab-dragging');
    await expect(neighbour).toHaveCount(0);
    await expect(
      page.locator('main > .primary-tab-panel:not([hidden]) .story-page'),
    ).toBeVisible();
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

  test('primary swipe restores reading position and resets Planning segment without growing native history or refetching fresh content', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installNativeAppLifecycle(page);
    await installApiMocks(page);
    let timelineReads = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/timeline'))
        timelineReads++;
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
    const targetY = await page.evaluate(() => {
      const top = Math.min(
        500,
        document.documentElement.scrollHeight - innerHeight,
      );
      window.scrollTo({ top, behavior: 'instant' });
      return top;
    });
    expect(targetY).toBeGreaterThan(100);
    await expect
      .poll(async () =>
        Math.abs((await page.evaluate(() => window.scrollY)) - targetY),
      )
      .toBeLessThan(2);
    const reads = timelineReads;
    expect(reads).toBeGreaterThan(0);
    await swipePrimary(page, 'next');
    await expect(page).toHaveURL(/\/plan$/);
    await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
    await expect(
      page.getByRole('tab', { name: m5s3.overview.segmentWishes }),
    ).toHaveAttribute('aria-selected', 'true');
    await swipePrimary(page, 'previous');
    await expect(page).toHaveURL(/\/story/);
    await expectRestoredScroll(page, targetY);
    await expect(page).toHaveURL(/\/story$/);
    await expect(
      page.getByRole('tab', { name: de.story.tabDiscover, exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(timelineReads).toBe(reads);
    await swipePrimary(page, 'next');
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

import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const PARTNER_ID = '44444444-4444-4444-8444-444444444444';
const PARTNER_PROFILE_ID = '55555555-5555-4555-8555-555555555555';
const TEST_NOW = '2026-09-01T10:00:00Z';
const ME = { id: ACCOUNT_ID, displayName: 'Anna Sommer' };
const PARTNER = { id: PARTNER_ID, displayName: 'Ben Winter' };
const CAPABILITIES = { canEdit: true, canDelete: true, canComment: true };

const EVIDENCE_DIR = path.resolve(
  __dirname,
  '../../../docs/design/eimir/screenshots/global-header-document-flow',
);

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
      pathname === `/api/v1/spaces/${SPACE_ID}/related-people`
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/important-dates`
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
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

test.describe('Global header document flow and persistent bottom navigation', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test('Today, Momente, Planen and Mehr scroll the global header naturally while bottom navigation stays fixed', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);

    for (const route of ['/today', '/story?tab=timeline', '/plan', '/more']) {
      await page.goto(route);
      await page.evaluate(() => window.scrollTo(0, 0));

      const header = page.locator('.product-topbar');
      const bottomShell = page.locator('.mobile-bottom-shell');
      await expect(header).toBeVisible();
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
      await expect(header).toBeInViewport();

      if (route === '/today') {
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, '01-today-header-at-top.png'),
        });
        await testInfo.attach('today-header-at-top', {
          path: path.join(EVIDENCE_DIR, '01-today-header-at-top.png'),
          contentType: 'image/png',
        });
      }
    }
  });

  test('Momente, Planen and Mehr share one root heading rhythm on Compact and Expanded', async ({
    page,
  }, testInfo) => {
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);

    const destinations = [
      {
        slug: 'momente',
        path: '/story?tab=timeline',
        title: de.story.timelineTitle,
      },
      { slug: 'planen', path: '/plan', title: de.m5s3.overview.title },
      { slug: 'mehr', path: '/more', title: de.more.title },
    ] as const;
    const viewports = [
      { label: 'compact', width: 390, height: 844 },
      { label: 'expanded', width: 1280, height: 900 },
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      const metrics: Array<{
        fontFamily: string;
        fontSize: string;
        fontWeight: string;
        headerMarginBottom: string;
        lineHeight: string;
      }> = [];

      for (const destination of destinations) {
        await page.goto(destination.path);
        await page.evaluate(() => window.scrollTo(0, 0));

        const rootHeader = page.locator('.page-heading-root');
        const heading = rootHeader.getByRole('heading', {
          level: 1,
          name: destination.title,
        });
        await expect(rootHeader).toBeVisible();
        await expect(heading).toBeVisible();

        const metric = await heading.evaluate((element) => {
          const headingStyle = getComputedStyle(element);
          const header = element.closest<HTMLElement>('.page-heading-root');
          if (!header) throw new Error('Root page header missing.');
          const headerStyle = getComputedStyle(header);
          return {
            fontFamily: headingStyle.fontFamily,
            fontSize: headingStyle.fontSize,
            fontWeight: headingStyle.fontWeight,
            headerMarginBottom: headerStyle.marginBottom,
            lineHeight: headingStyle.lineHeight,
          };
        });
        metrics.push(metric);

        expect(metric.fontFamily).toContain('Literata');
        expect(metric.fontSize).toBe('36px');
        expect(metric.fontWeight).toBe('700');
        expect(metric.headerMarginBottom).toBe('32px');

        await expectNoHorizontalOverflow(page);
        await page.screenshot({
          path: testInfo.outputPath(
            `shell-root-header-${destination.slug}-${viewport.label}.png`,
          ),
          fullPage: false,
        });
      }

      const [baseline, ...peers] = metrics;
      for (const peer of peers) {
        expect(peer).toEqual(baseline);
      }
    }
  });

  test('Today header and Couple Presence share one surface, including with the demo banner', async ({
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
    await expect(header).toBeVisible();
    await expect(hero).toBeVisible();

    expect(
      await shell.evaluate(
        (element) => getComputedStyle(element).backgroundImage,
      ),
    ).toContain('radial-gradient');

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

    const search = header.locator('a[href="/search"]');
    await search.focus();
    await expect(search).toBeFocused();
    const notifications = header.locator('.header-notifications-trigger');
    await notifications.focus();
    await expect(notifications).toBeFocused();

    const axe = await new AxeBuilder({ page })
      .include('.product-topbar')
      .include('.today-hero')
      .analyze();
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
      const header = document
        .querySelector('.product-topbar')
        ?.getBoundingClientRect();
      if (!banner || !header) throw new Error('Demo/header geometry missing.');
      return {
        gap: header.top - banner.bottom,
        safeTop: getComputedStyle(
          document.querySelector('.product-shell') as HTMLElement,
        ).getPropertyValue('--shell-header-safe-top'),
      };
    });
    expect(Math.abs(demoGeometry.gap)).toBeLessThanOrEqual(1);
    expect(demoGeometry.safeTop.trim()).toBe('0px');
    await expectNoHorizontalOverflow(page);

    const screenshotPath = path.join(
      EVIDENCE_DIR,
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
      await expect(page.locator('.product-topbar')).toBeVisible();
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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const TEST_NOW = '2026-09-01T10:00:00Z';
const ME = { id: ACCOUNT_ID, displayName: 'Anna Sommer' };
const CAPABILITIES = { canEdit: true, canDelete: true, canComment: true };

const EVIDENCE_DIR = path.resolve(
  __dirname,
  '../../../docs/design/eimir/screenshots/970-hide-on-scroll',
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
      await fulfillJson({ id: SPACE_ID, createdAt: TEST_NOW, partners: [] });
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
        space: { partner: null, spaceId: SPACE_ID },
        upcoming: [],
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}`
    ) {
      await fulfillJson({
        accountId: ACCOUNT_ID,
        createdAt: TEST_NOW,
        displayName: 'Anna',
        id: PROFILE_ID,
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

test.describe('Context-Aware Hide-on-Scroll Navigation (#970)', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test('Momente: deliberate downward scroll hides navigation; slight upward scroll reveals it quickly', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.waitForURL('**/today');

    // Navigate to Momente / Story Timeline
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');
    const bottomShell = page.locator('.mobile-bottom-shell');
    await expect(bottomShell).toBeVisible();
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');

    // Evidence 1: Initial state (visible at top of page)
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '01-momente-initial-visible.png'),
    });

    // Verify page has scrollable height
    const scrollHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    expect(scrollHeight).toBeGreaterThan(1200);

    // Deliberate downward scroll: scroll down by 100px (> 50px threshold)
    await page.evaluate(() => {
      window.scrollTo({ top: 120, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    });
    await expect(bottomShell).toHaveAttribute('data-hidden', 'true');

    // Evidence 2: Hidden after deliberate downward scroll
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '02-momente-scrolled-down-hidden.png'),
    });

    // Slight upward scroll: scroll up by 20px (> 15px reveal threshold)
    await page.evaluate(() => {
      window.scrollTo({ top: 95, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    });
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');

    // Evidence 3: Revealed quickly after slight upward scroll
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '03-momente-scrolled-up-revealed.png'),
    });

    // Route change while scrolled/hidden: scroll down again so it hides
    await page.evaluate(() => {
      window.scrollTo({ top: 200, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    });
    await expect(bottomShell).toHaveAttribute('data-hidden', 'true');

    // Navigate to /plan while hidden (e.g. programmatically or via link dispatch)
    await page.evaluate(() => {
      document.querySelector<HTMLAnchorElement>('a[href="/plan"]')?.click();
    });
    await page.waitForURL('**/plan');

    // Navigation must be visible on route change!
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');

    // Evidence 4: Reset to visible on route change
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '04-route-change-reset-visible.png'),
    });
  });

  test('Persistent surfaces: Heute and Planen remain visible when scrolled', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.waitForURL('**/today');

    const bottomShell = page.locator('.mobile-bottom-shell');
    await expect(bottomShell).toBeVisible();
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');

    // Add content to make Heute long enough to scroll
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.style.height = '1500px';
      spacer.textContent = 'Spacer for testing Heute scroll persistence';
      document.querySelector('main')?.appendChild(spacer);
    });

    // Scroll down 200px on Heute
    await page.evaluate(() => {
      window.scrollTo({ top: 200, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    });
    // Must remain visible!
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');

    // Evidence 5: Heute persistent when scrolled
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '05-heute-persistent-scrolled.png'),
    });

    // Navigate to Planen
    await page.goto('/plan');
    await expect(bottomShell).toBeVisible();
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');

    // Make Planen long enough to scroll
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.style.height = '1500px';
      spacer.textContent = 'Spacer for testing Planen scroll persistence';
      document.querySelector('main')?.appendChild(spacer);
    });

    // Scroll down 200px on Planen
    await page.evaluate(() => {
      window.scrollTo({ top: 200, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    });
    // Must remain visible!
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');

    // Evidence 6: Planen persistent when scrolled
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '06-planen-persistent-scrolled.png'),
    });
  });

  test('Top of page always restores navigation visibility', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    const bottomShell = page.locator('.mobile-bottom-shell');
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');

    // Scroll down 150px -> hides
    await page.evaluate(() => {
      window.scrollTo({ top: 150, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    });
    await expect(bottomShell).toHaveAttribute('data-hidden', 'true');

    // Scroll directly back to top (scrollY = 0)
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    });
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');

    // Evidence 7: Top of page reset
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '07-top-of-page-reset.png'),
    });
  });

  test('Keyboard focus inside bottom navigation restores and keeps it visible', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    const bottomShell = page.locator('.mobile-bottom-shell');
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');

    // Scroll down 100px -> hides
    await page.evaluate(() => {
      window.scrollTo({ top: 120, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    });
    await expect(bottomShell).toHaveAttribute('data-hidden', 'true');

    // Focus an element inside the bottom shell (e.g. Quick Create trigger)
    const trigger = bottomShell.locator('button.quick-create-trigger');
    await trigger.focus();

    // Focusing must immediately reveal the navigation bar!
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');

    // Further downward scrolling while focused must not hide it
    await page.evaluate(() => {
      window.scrollTo({ top: 250, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    });
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');
  });

  test('Reduced-motion preferences: transition is disabled when prefers-reduced-motion: reduce', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    const bottomShell = page.locator('.mobile-bottom-shell');
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');

    // Check computed transition style
    const transition = await bottomShell.evaluate(
      (el) => window.getComputedStyle(el).transitionProperty,
    );
    // In reduced motion, transition is none
    expect(transition).toBe('none');

    // Scroll down -> hides immediately
    await page.evaluate(() => {
      window.scrollTo({ top: 120, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    });
    await expect(bottomShell).toHaveAttribute('data-hidden', 'true');

    // Evidence 8: Reduced motion hidden
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '08-reduced-motion-hidden.png'),
    });
  });

  test('Layout stability: showing and hiding navigation causes no horizontal overflow or reflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.goto('/story?tab=timeline');
    await page.waitForSelector('.story-timeline');

    const dimensionsBefore = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensionsBefore.scrollWidth).toBeLessThanOrEqual(
      dimensionsBefore.clientWidth + 1,
    );

    // Scroll down 120px
    await page.evaluate(() => {
      window.scrollTo({ top: 120, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    });
    const bottomShell = page.locator('.mobile-bottom-shell');
    await expect(bottomShell).toHaveAttribute('data-hidden', 'true');

    const dimensionsAfterHide = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensionsAfterHide.scrollWidth).toBe(dimensionsBefore.scrollWidth);
    expect(dimensionsAfterHide.clientWidth).toBe(dimensionsBefore.clientWidth);

    // Scroll up 25px -> reveal
    await page.evaluate(() => {
      window.scrollTo({ top: 95, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    });
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');

    const dimensionsAfterReveal = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensionsAfterReveal.scrollWidth).toBe(
      dimensionsBefore.scrollWidth,
    );
  });

  test('Momente same-path peer mode navigation: switching Discover ↔ Timeline through product UI restores visible bottom navigation (#970)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.waitForURL('**/today');

    // 1. Open /story?tab=discover
    await page.goto('/story?tab=discover');
    await page.waitForSelector('.momente-discover-page');
    const bottomShell = page.locator('.mobile-bottom-shell');
    await expect(bottomShell).toBeVisible();
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');

    // 2. Scroll enough to hide the bottom bar (> 50px downward scroll)
    await page.evaluate(() => {
      window.scrollTo({ top: 80, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    });
    await expect(bottomShell).toHaveAttribute('data-hidden', 'true');

    // 3. Switch to Timeline through the actual product UI
    const timelineTab = page.getByRole('tab', { name: de.story.tabTimeline });
    await expect(timelineTab).toBeVisible();
    await timelineTab.click();

    // Verify switch to Timeline mode
    await page.waitForSelector('.story-timeline');
    await expect(page).toHaveURL(/.*[?&]tab=timeline/);

    // 4. Assert bottom navigation becomes visible
    await expect(bottomShell).toBeVisible();
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');

    // 5. Verify reverse mode switch: scroll to hide while in Timeline
    await page.evaluate(() => {
      window.scrollTo({ top: window.scrollY + 80, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    });
    await expect(bottomShell).toHaveAttribute('data-hidden', 'true');

    // Switch back to Discover through the actual product UI
    const discoverTab = page.getByRole('tab', { name: de.story.tabDiscover });
    await expect(discoverTab).toBeVisible();
    await discoverTab.click();

    // Verify switch back to Discover mode
    await page.waitForSelector('.momente-discover-page');
    await expect(page).toHaveURL(/.*[?&]tab=discover/);

    // Assert bottom navigation becomes visible on reverse switch
    await expect(bottomShell).toBeVisible();
    await expect(bottomShell).toHaveAttribute('data-hidden', 'false');
  });
});

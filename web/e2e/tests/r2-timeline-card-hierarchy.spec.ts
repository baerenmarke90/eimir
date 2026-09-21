import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import de from '../../src/i18n/locales/de';

/**
 * #969: Timeline cards lead with content, not taxonomy. Kind badges, the
 * Milestone stripe and the shared-visibility pill are gone; kind semantics
 * live on the Timeline node, visibility and photo count are icon metadata in
 * one responsive footer, and month headings are ordinary content that passes
 * cleanly under an opaque app bar instead of showing through it.
 *
 * Screenshots are written to `docs/product/design/evidence/r2-969/<phase>/`
 * only when `R2_969_EVIDENCE_PHASE` is set (`before` or `after`), so a
 * routine suite run never rewrites committed evidence.
 */

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '99999999-9999-4999-8999-999999999999';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const ME = { id: ACCOUNT_ID, displayName: 'Lea Sommer' };
// A deliberately long first name: the footer must wrap, never clip.
const PARTNER = {
  id: PARTNER_ID,
  displayName: 'Anna-Katharina-Josephine Lindqvist',
};
const CAPABILITIES = { canEdit: true, canDelete: true, canComment: true };

const WCAG_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
];

const EVIDENCE_PHASE = process.env.R2_969_EVIDENCE_PHASE;
const EVIDENCE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'docs',
  'product',
  'design',
  'evidence',
  'r2-969',
  EVIDENCE_PHASE ?? 'unused',
);

// A small warm gradient so photo cards read as photos in the evidence.
const PHOTO_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c98b6b"/><stop offset="1" stop-color="#5f7f86"/></linearGradient></defs><rect width="800" height="500" fill="url(#g)"/></svg>`,
);

async function capture(
  target: Page | Locator,
  testInfo: TestInfo,
  fileName: string,
  options?: { fullPage?: boolean },
): Promise<void> {
  const outputPath = testInfo.outputPath(fileName);
  if (!('goto' in target)) {
    // Centre a card crop so neither the sticky app bar nor the floating
    // navigation covers it.
    await target.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  }
  await target.screenshot({ path: outputPath, ...options });
  if (!EVIDENCE_PHASE) return;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.copyFileSync(outputPath, path.join(EVIDENCE_DIR, fileName));
}

function attachment(id: string, position: number) {
  return {
    id,
    position,
    status: 'READY',
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    hasThumbnail: true,
    width: 800,
    height: 500,
    size: 1,
  };
}

function timelineItems() {
  return [
    {
      kind: 'MEMORY',
      effectiveDate: '2026-09-12T00:00:00Z',
      memory: {
        id: 'mem-lake',
        title: 'Our first evening at the lake',
        happenedOn: '2026-09-12',
        createdAt: '2026-09-12T00:00:00Z',
        author: PARTNER,
        capabilities: CAPABILITIES,
        attachments: [
          attachment('att-lake-1', 0),
          attachment('att-lake-2', 1),
          attachment('att-lake-3', 2),
        ],
      },
    },
    {
      kind: 'HEART_MOMENT',
      effectiveDate: '2026-09-08T00:00:00Z',
      heartMoment: {
        id: 'hm-coffee',
        text: 'You brought me coffee before I even asked. Thank you.',
        emotion: 'LOVED',
        happenedOn: '2026-09-08',
        createdAt: '2026-09-08T00:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
        visibility: 'SHARED',
        attachment: attachment('att-coffee', 0),
      },
    },
    {
      kind: 'MEMORY',
      effectiveDate: '2026-09-02T00:00:00Z',
      memory: {
        id: 'mem-sunday',
        title: 'A quiet Sunday morning',
        happenedOn: '2026-09-02',
        createdAt: '2026-09-02T00:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
        attachments: [],
      },
    },
    {
      kind: 'MILESTONE',
      effectiveDate: '2026-08-20T00:00:00Z',
      milestone: {
        id: 'ms-three-years',
        title: 'Three years together',
        happenedOn: '2026-08-20',
        createdAt: '2026-08-20T00:00:00Z',
        author: PARTNER,
        capabilities: CAPABILITIES,
      },
    },
    {
      kind: 'HEART_MOMENT',
      effectiveDate: '2026-08-11T00:00:00Z',
      heartMoment: {
        id: 'hm-picnic',
        text: 'Thinking of our spring picnic',
        emotion: 'GRATEFUL',
        happenedOn: '2026-08-11',
        createdAt: '2026-08-11T00:00:00Z',
        author: PARTNER,
        capabilities: CAPABILITIES,
        visibility: 'SHARED',
        attachment: null,
      },
    },
    {
      kind: 'MEMORY',
      effectiveDate: '2026-08-03T00:00:00Z',
      memory: {
        id: 'mem-market',
        title: 'Saturday market',
        happenedOn: '2026-08-03',
        createdAt: '2026-08-03T00:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
        attachments: [attachment('att-market', 0)],
      },
    },
    {
      kind: 'MILESTONE',
      effectiveDate: '2025-12-20T00:00:00Z',
      milestone: {
        id: 'ms-keys',
        title: 'Keys to our flat',
        happenedOn: '2025-12-20',
        createdAt: '2025-12-20T00:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
      },
    },
  ];
}

async function installMocks(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;
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
        account: { displayName: ME.displayName, id: ME.id },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'r2-969-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'r2-969-refresh-token',
        },
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ displayName: ME.displayName, id: ME.id });
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
        createdAt: '2023-06-17T00:00:00Z',
        partners: [ME, PARTNER],
      });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: '2023-06-17',
        showRelationshipDuration: true,
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
    const profileMatch = pathname.match(
      new RegExp(`^/api/v1/spaces/${SPACE_ID}/profiles/([^/]+)$`),
    );
    if (method === 'GET' && profileMatch) {
      const person = profileMatch[1] === PARTNER_ID ? PARTNER : ME;
      await fulfillJson({
        accountId: person.id,
        createdAt: '2023-06-17T00:00:00Z',
        displayName: person.displayName,
        id: person.id === ME.id ? PROFILE_ID : `${PROFILE_ID}-partner`,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: '2023-06-17T00:00:00Z',
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
      method === 'POST' &&
      pathname.includes('/attachments/') &&
      pathname.endsWith('/read-access')
    ) {
      const match = pathname.match(/\/attachments\/([^/]+)\/read-access/);
      await fulfillJson({
        method: 'DIRECT',
        url: `/api/v1/spaces/${SPACE_ID}/attachments/${match?.[1] ?? 'att'}/file`,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname.includes('/attachments/') &&
      /\/(file|thumbnail|content)$/.test(pathname)
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: PHOTO_SVG,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/timeline`
    ) {
      let items = timelineItems();
      const type = url.searchParams.get('type');
      if (type) items = items.filter((item) => item.kind === type);
      if (url.searchParams.get('order') === 'ASC') items = [...items].reverse();
      await fulfillJson({
        items,
        hasMore: false,
        nextCursor: null,
        availableYears: [2026, 2025],
      });
      return;
    }

    await fulfillJson({}, 200);
  });
}

async function openTimeline(
  page: Page,
  viewport: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(viewport);
  await installMocks(page);
  await page.goto('/story?tab=timeline');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  await page.goto('/story?tab=timeline');
  await page.waitForSelector('.story-timeline .story-card');
  await expect(
    page.locator('.story-media-preview, .story-media-skeleton'),
  ).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
}

function card(page: Page, title: string): Locator {
  return page.locator('.story-card-link', { hasText: title });
}

/** Every footer child stays inside its card, and no two footer parts overlap. */
async function expectContainedFooters(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const found: string[] = [];
    for (const cardEl of Array.from(document.querySelectorAll('.story-card'))) {
      const cardBox = cardEl.getBoundingClientRect();
      const title = cardEl.querySelector('h4');
      if (title && title.scrollWidth > title.clientWidth + 1) {
        found.push(`title clipped: ${title.textContent?.slice(0, 30)}`);
      }
      const footer = cardEl.querySelector('.story-card-footer');
      if (!footer) continue;
      if (footer.scrollWidth > footer.clientWidth + 1) {
        found.push(`footer scrolls: ${cardEl.textContent?.slice(0, 30)}`);
      }
      const parts = Array.from(
        footer.querySelectorAll(':scope > *, :scope > * > *'),
      )
        .map((el) => el.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0);
      for (const box of parts) {
        if (box.left < cardBox.left - 0.5 || box.right > cardBox.right + 0.5) {
          found.push(`escapes card: ${cardEl.textContent?.slice(0, 30)}`);
        }
      }
      const leaves = Array.from(
        footer.querySelectorAll(
          'time, .momente-author-meta, .story-card-meta-item',
        ),
      ).map((el) => el.getBoundingClientRect());
      for (let i = 0; i < leaves.length; i += 1) {
        for (let j = i + 1; j < leaves.length; j += 1) {
          const a = leaves[i];
          const b = leaves[j];
          const overlap =
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
          if (overlap)
            found.push(`overlap in: ${cardEl.textContent?.slice(0, 30)}`);
        }
      }
      for (const text of Array.from(footer.querySelectorAll('*'))) {
        const style = getComputedStyle(text);
        if (
          style.textOverflow === 'ellipsis' &&
          text.scrollWidth > text.clientWidth
        ) {
          found.push(`ellipsis in: ${cardEl.textContent?.slice(0, 30)}`);
        }
      }
    }
    if (
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
    ) {
      found.push('page scrolls horizontally');
    }
    return found;
  });
  expect(problems).toEqual([]);
}

test.describe('R2 follow-up: Timeline card hierarchy (#969)', () => {
  test.describe('card detail at 2x', () => {
    // Crisp crops: small metadata glyphs are unreadable at 1x.
    test.use({ deviceScaleFactor: 2 });

    test('390px Timeline leads with content and captures each kind', async ({
      page,
    }, testInfo) => {
      await openTimeline(page, { width: 390, height: 844 });
      await capture(page, testInfo, '01-timeline-390-light-full.png', {
        fullPage: true,
      });
      await capture(
        card(page, 'A quiet Sunday morning'),
        testInfo,
        '02-memory-card-390.png',
      );
      await capture(
        card(page, 'Our first evening at the lake'),
        testInfo,
        '03-memory-full-metadata-card-390.png',
      );
      await capture(
        card(page, 'You brought me coffee'),
        testInfo,
        '04-heart-moment-card-390.png',
      );
      await capture(
        page.locator('.story-timeline-item', {
          hasText: 'Three years together',
        }),
        testInfo,
        '05-milestone-entry-390.png',
      );

      // No kind or shared pills anywhere in the Timeline.
      await expect(page.locator('.story-timeline .kind-badge')).toHaveCount(0);
      await expect(page.locator('.story-timeline .shared-badge')).toHaveCount(
        0,
      );
      for (const label of [
        de.story.kind.memory,
        de.story.kind.heartMoment,
        de.story.kind.milestone,
        de.story.shared,
      ]) {
        await expect(
          page.locator('.story-timeline').getByText(label, { exact: true }),
        ).toHaveCount(0);
      }

      // Milestone: no decorative stripe; the Timeline node carries the marker.
      const milestoneCard = page.locator('.story-card-milestone').first();
      const stripe = await milestoneCard.evaluate(
        (el) => getComputedStyle(el, '::before').content,
      );
      expect(stripe === 'none' || stripe === 'normal').toBe(true);
      await expect(
        page.locator('.story-timeline-marker-milestone svg'),
      ).toHaveCount(2);

      // Heart Moment and Milestone keep an accessible, non-colour marker.
      await expect(
        page.getByRole('link', {
          name: new RegExp(
            `^${de.story.kind.heartMoment}: You brought me coffee`,
          ),
        }),
      ).toBeVisible();
      await expect(
        page.locator('.story-timeline-marker-heart-moment svg'),
      ).toHaveCount(2);
      // The default Memory node stays a plain dot.
      await expect(
        page
          .locator('.story-timeline-item-memory .story-timeline-marker')
          .locator('svg'),
      ).toHaveCount(0);

      // Photo count and shared visibility are icon metadata with names.
      const lake = card(page, 'Our first evening at the lake');
      await expect(lake.locator('.story-card-meta-item')).toHaveText(['3']);
      await expect(lake.getByRole('img', { name: '3 Fotos' })).toHaveCount(1);
      const coffee = card(page, 'You brought me coffee');
      await expect(
        coffee.getByRole('img', { name: de.story.shared }),
      ).toHaveCount(1);
      // #1064 keeps author identity on the avatar without visible prose.
      await expect(lake.locator('.story-card-author')).toHaveCount(0);
      await expect(
        lake.getByRole('img', { name: PARTNER.displayName }),
      ).toHaveCount(1);
      await expect(lake).not.toContainText(
        de.story.byAuthor.replace('{{author}}', 'Anna-Katharina-Josephine'),
      );

      await expectContainedFooters(page);
    });
  });

  test('removing badges reduces card height instead of leaving empty space', async ({
    page,
  }) => {
    await openTimeline(page, { width: 390, height: 844 });
    const gaps = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.story-card')).map((cardEl) => {
        const cardTop = cardEl.getBoundingClientRect().top;
        const first = cardEl.firstElementChild as HTMLElement;
        return {
          firstClass: first.className,
          offset: first.getBoundingClientRect().top - cardTop,
          padding: Number.parseFloat(getComputedStyle(cardEl).paddingTop),
        };
      }),
    );
    for (const gap of gaps) {
      expect(gap.firstClass).not.toContain('story-card-meta');
      // The first real child starts at the card's own padding, not below a
      // leftover badge row.
      expect(gap.offset).toBeLessThanOrEqual(gap.padding + 2);
    }
  });

  test('320px narrow viewport keeps metadata inside every card', async ({
    page,
  }, testInfo) => {
    await openTimeline(page, { width: 320, height: 640 });
    await capture(page, testInfo, '06-timeline-320-light-full.png', {
      fullPage: true,
    });
    await expectContainedFooters(page);
  });

  test('200% text wraps the footer into a controlled second row', async ({
    page,
  }, testInfo) => {
    await openTimeline(page, { width: 390, height: 844 });
    await page.addStyleTag({ content: ':root { font-size: 200%; }' });
    await page.evaluate(() => document.fonts.ready);
    // Same width, taller window: the enlarged card fits into one crop.
    await page.setViewportSize({ width: 390, height: 1800 });
    await capture(
      card(page, 'Our first evening at the lake'),
      testInfo,
      '07-full-metadata-card-390-200pct-text.png',
    );
    await expectContainedFooters(page);

    await page.setViewportSize({ width: 320, height: 640 });
    await capture(page, testInfo, '08-timeline-320-200pct-text-full.png', {
      fullPage: true,
    });
    await expectContainedFooters(page);
  });

  test('month heading pins at the viewport edge after the app header scrolls away', async ({
    page,
  }, testInfo) => {
    await openTimeline(page, { width: 390, height: 844 });
    const topbar = page.locator('.product-topbar');
    const august = page.locator('.story-year-month-header').nth(1);

    expect(await topbar.evaluate((el) => getComputedStyle(el).position)).toBe(
      'relative',
    );

    await page
      .locator('.story-timeline-item', {
        hasText: 'Thinking of our spring picnic',
      })
      .evaluate((el) => {
        window.scrollBy(0, el.getBoundingClientRect().top - 120);
      });
    await page.waitForTimeout(150);

    expect(
      await topbar.evaluate((el) => el.getBoundingClientRect().bottom),
    ).toBeLessThanOrEqual(0);
    expect(await august.evaluate((el) => getComputedStyle(el).position)).toBe(
      'sticky',
    );
    const pinned = await august.boundingBox();
    expect(Math.abs(pinned?.y ?? 999)).toBeLessThanOrEqual(1);
    expect(
      await august.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).not.toMatch(/transparent|rgba\([^)]*,\s*0\)$/);

    await capture(
      page,
      testInfo,
      '09-month-heading-pinned-at-viewport-edge-390.png',
    );
  });

  test('persistent bottom navigation stays visible while Timeline month context is pinned', async ({
    page,
  }, testInfo) => {
    await openTimeline(page, { width: 390, height: 844 });
    const shell = page.locator('.mobile-bottom-shell');

    await expect(shell).toBeVisible();
    expect(await shell.getAttribute('data-hidden')).toBeNull();

    for (let step = 0; step < 9; step += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(40);
    }

    await expect(shell).toBeVisible();
    expect(await shell.getAttribute('data-hidden')).toBeNull();
    expect(
      await page
        .locator('.product-topbar')
        .evaluate((el) => el.getBoundingClientRect().bottom),
    ).toBeLessThanOrEqual(0);

    const pinned = await page.evaluate(() => {
      const boxes = Array.from(
        document.querySelectorAll('.story-year-month-header'),
      ).map((el) => el.getBoundingClientRect());
      return boxes.some((box) => Math.abs(box.top) <= 1);
    });
    expect(pinned).toBe(true);

    await page.mouse.wheel(0, -40);
    await expect(shell).toBeVisible();
    expect(await shell.getAttribute('data-hidden')).toBeNull();

    await capture(
      page,
      testInfo,
      '13-integrated-persistent-bar-heading-pinned-390.png',
    );
  });

  test('320px and 200% text keep the persistent shell collision-free', async ({
    page,
  }, testInfo) => {
    await openTimeline(page, { width: 320, height: 640 });
    const shell = page.locator('.mobile-bottom-shell');

    await page.addStyleTag({ content: ':root { font-size: 200%; }' });
    for (let step = 0; step < 8; step += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(40);
    }

    await expect(shell).toBeVisible();
    expect(await shell.getAttribute('data-hidden')).toBeNull();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expectContainedFooters(page);

    const links = page.locator('.story-card-link');
    const count = await links.count();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await page.waitForTimeout(150);
    const last = await links.nth(count - 1).boundingBox();
    const bar = await shell.boundingBox();
    expect((last?.y ?? 0) + (last?.height ?? 0)).toBeLessThanOrEqual(
      (bar?.y ?? 0) + 1,
    );

    await capture(
      page,
      testInfo,
      '16-integrated-320-200pct-text-persistent-bar.png',
    );
  });

  test('Expanded 1280px adapts the same card system', async ({
    page,
  }, testInfo) => {
    await openTimeline(page, { width: 1280, height: 900 });
    await capture(page, testInfo, '12-timeline-1280-light-full.png', {
      fullPage: true,
    });
    await expect(page.locator('.story-timeline .kind-badge')).toHaveCount(0);
    await expectContainedFooters(page);
    // A wide card keeps date and metadata on one row.
    const rows = await page
      .locator('.story-card-footer')
      .evaluateAll((footers) =>
        footers.map((footer) => {
          const centres = Array.from(footer.children).map((child) => {
            const box = child.getBoundingClientRect();
            return box.top + box.height / 2;
          });
          return Math.max(...centres) - Math.min(...centres);
        }),
      );
    for (const spread of rows) expect(spread).toBeLessThanOrEqual(2);
  });

  test('dark mode keeps the quiet markers legible and axe-clean', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() =>
      window.localStorage.setItem('eimir.theme', 'system'),
    );
    await openTimeline(page, { width: 390, height: 844 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await capture(page, testInfo, '11-timeline-390-dark-full.png', {
      fullPage: true,
    });
    const results = await new AxeBuilder({ page })
      .include('.story-timeline-months')
      .withTags(WCAG_TAGS)
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('light mode Timeline is axe-clean and keyboard reachable', async ({
    page,
  }) => {
    await openTimeline(page, { width: 390, height: 844 });
    const results = await new AxeBuilder({ page })
      .include('.story-timeline-months')
      .withTags(WCAG_TAGS)
      .analyze();
    expect(results.violations).toEqual([]);

    const firstCard = page.locator('.story-card-link').first();
    await firstCard.focus();
    await expect(firstCard).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/story\/memories\/mem-lake/);
  });
});

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
          'time, .story-card-author, .story-card-meta-item',
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
      // The author reads as a name, without the "byAuthor" prose.
      await expect(lake.locator('.story-card-author')).toHaveText(
        'Anna-Katharina-Josephine',
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

  test('month heading pins below the measured app bar instead of hiding under it', async ({
    page,
  }, testInfo) => {
    await openTimeline(page, { width: 390, height: 844 });
    const topbar = page.locator('.product-topbar');
    const barBottom = () =>
      topbar.evaluate((el) => el.getBoundingClientRect().bottom);
    const header = page.locator('.story-year-month-header').nth(1);
    const heading = page.getByRole('heading', {
      name: 'August 2026',
      level: 2,
    });

    // Scroll well into August: its heading stays whole, right below the bar.
    const bottom = await barBottom();
    await page
      .locator('.story-timeline-item', {
        hasText: 'Thinking of our spring picnic',
      })
      .evaluate((el, barEdge) => {
        window.scrollBy(0, el.getBoundingClientRect().top - barEdge - 80);
      }, bottom);
    await page.waitForTimeout(150);
    await capture(
      page,
      testInfo,
      '09-month-heading-pinned-below-app-bar-390.png',
    );
    expect(await header.evaluate((el) => getComputedStyle(el).position)).toBe(
      'sticky',
    );
    const pinned = await header.boundingBox();
    expect(
      Math.abs((pinned?.y ?? 0) - (await barBottom())),
    ).toBeLessThanOrEqual(1);
    await expect(heading).toBeInViewport({ ratio: 1 });

    // The band is opaque, so cards pass beneath it rather than through it.
    expect(
      await header.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).not.toMatch(/rgba\(.*,\s*0(\.\d+)?\)$|transparent/);

    // The next month hands over: December pushes August out.
    await page
      .locator('.story-timeline-item', { hasText: 'Keys to our flat' })
      .evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await page.waitForTimeout(150);
    await capture(page, testInfo, '10-month-heading-handover-390.png');
    const december = page.locator('.story-year-month-header').nth(2);
    const decemberBox = await december.boundingBox();
    expect(decemberBox?.y ?? 0).toBeGreaterThanOrEqual((await barBottom()) - 1);

    // The shared bar is opaque over the Timeline, so a handed-over heading
    // never shows through it.
    const layers = await topbar.evaluate(
      (el) => getComputedStyle(el).backgroundImage,
    );
    expect(layers).toContain('linear-gradient');
  });

  test('pinned month heading and hide-on-scroll bottom bar work together (#970)', async ({
    page,
  }, testInfo) => {
    await openTimeline(page, { width: 390, height: 844 });
    const shell = page.locator('.mobile-bottom-shell');
    const topbar = page.locator('.product-topbar');
    const barBottom = await topbar.evaluate(
      (el) => el.getBoundingClientRect().bottom,
    );
    // The heading currently pinned under the app bar, whichever month it is.
    const pinnedHeading = () =>
      page.evaluate((edge) => {
        const boxes = Array.from(
          document.querySelectorAll('.story-year-month-header'),
        ).map((el) => el.getBoundingClientRect());
        const box = boxes.find((b) => Math.abs(b.top - edge) <= 1);
        return box ? { y: box.top, height: box.height } : null;
      }, barBottom);
    const noOverflow = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      );

    // Deliberate downward reading into August hides the bottom bar while the
    // month heading stays pinned directly below the app bar.
    await expect(shell).toHaveAttribute('data-hidden', 'false');
    for (let step = 0; step < 9; step += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(60);
    }
    await expect(shell).toHaveAttribute('data-hidden', 'true');
    await page.waitForTimeout(300);
    const hiddenPinned = await pinnedHeading();
    expect(hiddenPinned).not.toBeNull();
    expect(await noOverflow()).toBe(true);
    await capture(
      page,
      testInfo,
      '13-integrated-scrolled-down-bar-hidden-heading-pinned-390.png',
    );

    // A small upward scroll reveals the bar; the heading does not move.
    await page.mouse.wheel(0, -40);
    await expect(shell).toHaveAttribute('data-hidden', 'false');
    await page.waitForTimeout(300);
    const revealedPinned = await pinnedHeading();
    expect(revealedPinned?.y).toBe(hiddenPinned?.y);
    const shellBox = await shell.boundingBox();
    // The pinned heading and the bottom bar never overlap.
    expect(
      (revealedPinned?.y ?? 0) + (revealedPinned?.height ?? 0),
    ).toBeLessThan(shellBox?.y ?? 0);
    expect(await noOverflow()).toBe(true);
    await capture(
      page,
      testInfo,
      '14-integrated-scrolled-up-bar-revealed-heading-pinned-390.png',
    );
  });

  test('the revealed bottom bar never covers the last card or a focused card (#970)', async ({
    page,
  }, testInfo) => {
    await openTimeline(page, { width: 390, height: 844 });
    const shell = page.locator('.mobile-bottom-shell');
    const links = page.locator('.story-card-link');
    const count = await links.count();

    // End of the Timeline with the bar revealed: content clears the bar.
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await page.waitForTimeout(300);
    await page.mouse.wheel(0, -40);
    await expect(shell).toHaveAttribute('data-hidden', 'false');
    await page.waitForTimeout(300);
    const lastCard = await links.nth(count - 1).boundingBox();
    const revealed = await shell.boundingBox();
    expect((lastCard?.y ?? 0) + (lastCard?.height ?? 0)).toBeLessThanOrEqual(
      (revealed?.y ?? 0) + 1,
    );
    await capture(
      page,
      testInfo,
      '15-integrated-timeline-end-bar-revealed-390.png',
    );

    // Park the last card just below the revealed bar, then move focus to it
    // with the keyboard: the focus scroll must leave it clear of the bar.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await links.nth(count - 1).evaluate((el) => {
      window.scrollBy(
        0,
        el.getBoundingClientRect().top - (window.innerHeight - 100),
      );
    });
    await page.waitForTimeout(200);
    await page.mouse.wheel(0, -30);
    await expect(shell).toHaveAttribute('data-hidden', 'false');
    await page.waitForTimeout(300);
    await links
      .nth(count - 2)
      .evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press('Tab');
    await expect(links.nth(count - 1)).toBeFocused();
    await page.waitForTimeout(400);
    const focused = await links.nth(count - 1).boundingBox();
    const state = await shell.evaluate((el) => ({
      hidden: el.getAttribute('data-hidden'),
      top: el.getBoundingClientRect().top,
    }));
    if (state.hidden === 'false') {
      expect((focused?.y ?? 0) + (focused?.height ?? 0)).toBeLessThanOrEqual(
        state.top + 1,
      );
    }
    await capture(
      page,
      testInfo,
      '16-integrated-keyboard-focus-clear-of-bar-390.png',
    );
  });

  test('dark mode keeps pinned heading and hidden bar coherent (#970)', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() =>
      window.localStorage.setItem('eimir.theme', 'system'),
    );
    await openTimeline(page, { width: 390, height: 844 });
    for (let step = 0; step < 9; step += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(60);
    }
    await expect(page.locator('.mobile-bottom-shell')).toHaveAttribute(
      'data-hidden',
      'true',
    );
    await page.waitForTimeout(300);
    const header = page.locator('.story-year-month-header').nth(1);
    expect(
      await header.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).not.toMatch(/rgba\(.*,\s*0(\.\d+)?\)$|transparent/);
    await capture(
      page,
      testInfo,
      '17-integrated-dark-bar-hidden-heading-pinned-390.png',
    );
  });

  test('Expanded 1280px pins month headings without a bottom bar (#970)', async ({
    page,
  }, testInfo) => {
    await openTimeline(page, { width: 1280, height: 900 });
    await expect(page.locator('.mobile-bottom-shell')).toBeHidden();
    await page
      .locator('.story-timeline-item', { hasText: 'Saturday market' })
      .evaluate((el) => {
        window.scrollBy(0, el.getBoundingClientRect().top - 200);
      });
    await page.waitForTimeout(300);
    const barBottom = await page
      .locator('.product-topbar')
      .evaluate((el) => el.getBoundingClientRect().bottom);
    const august = await page
      .locator('.story-year-month-header')
      .nth(1)
      .boundingBox();
    expect(Math.abs((august?.y ?? 0) - barBottom)).toBeLessThanOrEqual(1);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await capture(
      page,
      testInfo,
      '18-integrated-expanded-1280-heading-pinned.png',
    );
  });

  test('320px and 200% text keep the integrated shell free of collisions (#970)', async ({
    page,
  }, testInfo) => {
    await openTimeline(page, { width: 320, height: 640 });
    const shell = page.locator('.mobile-bottom-shell');
    for (let step = 0; step < 8; step += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(60);
    }
    await expect(shell).toHaveAttribute('data-hidden', 'true');
    await page.mouse.wheel(0, -40);
    await expect(shell).toHaveAttribute('data-hidden', 'false');
    await page.waitForTimeout(300);
    await expectContainedFooters(page);
    await capture(page, testInfo, '19-integrated-320-bar-revealed.png');

    // Enlarged text: pinning falls back when the app bar grows too tall,
    // the bar still hides and reveals, and nothing overflows.
    await page.setViewportSize({ width: 320, height: 640 });
    await page.addStyleTag({ content: ':root { font-size: 200%; }' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    for (let step = 0; step < 8; step += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(60);
    }
    await expect(shell).toHaveAttribute('data-hidden', 'true');
    await page.mouse.wheel(0, -40);
    await expect(shell).toHaveAttribute('data-hidden', 'false');
    await page.waitForTimeout(300);
    await expectContainedFooters(page);
    const pinned = await page
      .locator('.story-timeline-months')
      .evaluate((el) => el.hasAttribute('data-sticky-months'));
    const barHeight = await page
      .locator('.product-topbar')
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(pinned).toBe(barHeight <= 640 * 0.2);
    await capture(
      page,
      testInfo,
      '20-integrated-320-200pct-text-bar-revealed.png',
    );
  });

  test('month headings stay ordinary content when the app bar is too tall', async ({
    page,
  }) => {
    await openTimeline(page, { width: 390, height: 844 });
    await page.locator('html').evaluate((el) => {
      el.style.zoom = '2';
    });
    await expect(page.locator('.story-timeline-months')).not.toHaveAttribute(
      'data-sticky-months',
      '',
    );
    expect(
      await page
        .locator('.story-year-month-header')
        .first()
        .evaluate((el) => getComputedStyle(el).position),
    ).not.toBe('sticky');
  });

  test('a focused card scrolls clear of the pinned month heading', async ({
    page,
  }) => {
    await openTimeline(page, { width: 390, height: 844 });
    const links = page.locator('.story-card-link');
    const count = await links.count();
    for (let index = 0; index < count; index += 1) {
      await page.keyboard.press('Tab');
    }
    await links.nth(4).focus();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.keyboard.press('Shift+Tab');
    const focused = page.locator('.story-card-link:focus');
    await expect(focused).toHaveCount(1);
    const obstruction = await page.evaluate(() => {
      const bar = document
        .querySelector('.product-topbar')
        ?.getBoundingClientRect();
      if (!bar || !document.activeElement) throw new Error('No bar or focus.');
      const link = document.activeElement.getBoundingClientRect();
      const headers = Array.from(
        document.querySelectorAll('.story-year-month-header'),
      )
        .map((el) => el.getBoundingClientRect())
        .filter((box) => box.top <= bar.bottom + 1 && box.bottom > bar.bottom);
      const cover = Math.max(bar.bottom, ...headers.map((box) => box.bottom));
      return { linkTop: link.top, cover };
    });
    expect(obstruction.linkTop).toBeGreaterThanOrEqual(obstruction.cover - 1);
  });

  test('the app bar keeps its own translucency away from the Timeline', async ({
    page,
  }) => {
    await openTimeline(page, { width: 390, height: 844 });
    await page.goto('/plan');
    await expect(page.locator('.story-year-month')).toHaveCount(0);
    const image = await page
      .locator('.product-topbar')
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(image).toBe('none');
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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import occasionMarks from '../../src/i18n/locales/occasionMarks';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  installMocks,
  ME,
  PARTNER,
  PARTNER_ID,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';
import germanUi from '../../src/i18n/locales/de';

/**
 * #1907 F2: a moment that happened on one of the couple's occasions says so
 * on its Timeline card and in its detail. Only the relationship anniversary,
 * both partners' birthdays and shared, person-independent important dates
 * count (Product Owner decision 2026-11-15); private dates and dates linked
 * to a related person never mark a moment.
 *
 * Evidence images are written to the design reference folder only when
 * `OCCASION_MARK_EVIDENCE` is set, so a routine run never rewrites them.
 */

const EVIDENCE = Boolean(process.env.OCCASION_MARK_EVIDENCE);
const EVIDENCE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'docs',
  'product',
  'design',
  'references',
  'occasion-memory-mark',
);

const PHOTO = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e7b37f"/><stop offset=".55" stop-color="#c9826b"/><stop offset="1" stop-color="#5f7f86"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/></svg>`,
);

function attachment(id: string) {
  return {
    id,
    position: 0,
    status: 'READY',
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    hasThumbnail: true,
    isSensitive: false,
    width: 800,
    height: 600,
    size: 1024,
  };
}

const PICNIC = {
  id: 'mem-canal',
  title: 'Lakeside picnic',
  body: 'Strawberries, a blanket and far too much cake.',
  happenedOn: '2026-06-17',
  createdAt: '2026-06-17T18:30:00Z',
  author: ME,
  capabilities: CAPABILITIES,
  visibility: 'SHARED',
  attachments: [attachment('att-lake')],
};

function timeline() {
  return [
    { kind: 'MEMORY', effectiveDate: '2026-06-17', memory: PICNIC },
    {
      kind: 'MEMORY',
      effectiveDate: '2026-05-12',
      memory: {
        id: 'mem-coffee',
        title: 'Balcony breakfast',
        happenedOn: '2026-05-12',
        createdAt: '2026-05-12T08:30:00Z',
        author: PARTNER,
        capabilities: CAPABILITIES,
        visibility: 'SHARED',
        attachments: [],
      },
    },
    {
      kind: 'MEMORY',
      effectiveDate: '2026-03-28',
      memory: {
        id: 'mem-hike',
        title: 'Hike to the viewpoint',
        happenedOn: '2026-03-28',
        createdAt: '2026-03-28T14:00:00Z',
        author: ME,
        capabilities: CAPABILITIES,
        visibility: 'SHARED',
        attachments: [],
      },
    },
  ];
}

function importantDate(id: string, overrides: Record<string, unknown>) {
  return {
    id,
    label: 'Occasion',
    type: 'CUSTOM',
    date: '2020-03-28',
    repeats: 'ANNUALLY',
    visibility: 'SHARED',
    relatedPersonId: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    version: 1,
    ...overrides,
  };
}

async function installOccasionData(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') return route.fallback();
    const pathname = new URL(request.url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (pathname === `/api/v1/spaces/${SPACE_ID}`)
      return json({
        id: SPACE_ID,
        createdAt: '2023-06-17T00:00:00Z',
        partners: [ME, PARTNER],
        relationshipStartedOn: '2023-06-17',
      });
    if (pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${PARTNER_ID}`)
      return json({
        accountId: PARTNER_ID,
        displayName: PARTNER.displayName,
        birthday: '1994-05-12',
        id: 'profile-partner',
        preferences: [],
        profileAttachmentId: null,
        createdAt: '2023-06-17T00:00:00Z',
        updatedAt: '2023-06-17T00:00:00Z',
        version: 1,
      });
    if (pathname === `/api/v1/spaces/${SPACE_ID}/important-dates`)
      // Both fall on the hike's day and must not mark it.
      return json([
        importantDate('private-date', {
          label: 'Just for me',
          visibility: 'PRIVATE',
        }),
        importantDate('person-date', {
          label: 'Birthday of Mum',
          type: 'BIRTHDAY',
          relatedPersonId: 'person-mama',
        }),
      ]);
    if (pathname === `/api/v1/spaces/${SPACE_ID}/timeline`)
      return json({ items: timeline(), hasMore: false, nextCursor: null });
    if (pathname === `/api/v1/spaces/${SPACE_ID}/memories/mem-canal`)
      return json({
        ...PICNIC,
        spaceId: SPACE_ID,
        authorId: ACCOUNT_ID,
        updatedAt: '2026-06-17T18:30:00Z',
        version: 1,
      });
    if (pathname.includes('/attachments/att-lake/content'))
      return route.fulfill({ contentType: 'image/svg+xml', body: PHOTO });
    return route.fallback();
  });
}

async function openTimeline(
  page: Page,
  options: { width?: number; dark?: boolean; reducedMotion?: boolean } = {},
) {
  await page.setViewportSize({ width: options.width ?? 390, height: 844 });
  await page.emulateMedia({
    colorScheme: options.dark ? 'dark' : 'light',
    reducedMotion: options.reducedMotion === false ? 'no-preference' : 'reduce',
  });
  await installMocks(page);
  await installOccasionData(page);
  await signIn(page);
}

const card = (page: Page, title: string) =>
  page.locator('.story-timeline-item', { hasText: title });

async function evidence(page: Page, name: string) {
  if (!EVIDENCE) return;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, name),
    quality: 82,
    animations: 'disabled',
  });
}

test.describe('occasion mark on moments (#1907 F2)', () => {
  test('marks the anniversary and the partner birthday, not private or person-linked dates', async ({
    page,
  }) => {
    await openTimeline(page);
    const anniversary = occasionMarks.anniversary_ordinal_other.replace(
      '{{count}}',
      '3',
    );
    const birthday = occasionMarks.partnerBirthday.replace(
      '{{name}}',
      PARTNER.displayName,
    );

    const picnic = card(page, 'Lakeside picnic');
    await expect(picnic.locator('.occasion-mark')).toHaveText(anniversary);
    // The mark is part of the card's accessible description.
    await expect(picnic.getByRole('link')).toHaveAccessibleDescription(
      new RegExp(`^${anniversary}`),
    );
    await expect(
      card(page, 'Balcony breakfast').locator('.occasion-mark'),
    ).toHaveText(birthday);
    const hike = card(page, 'Hike to the viewpoint');
    await expect(hike).toBeVisible();
    await expect(hike.locator('.occasion-mark')).toHaveCount(0);
    await expect(page.getByText('Just for me')).toHaveCount(0);
    await expect(page.getByText('Birthday of Mum')).toHaveCount(0);
    await evidence(page, '20-impl-timeline-390-light.jpg');

    await picnic.getByRole('link').click();
    await expect(page).toHaveURL(/\/story\/memories\/mem-canal/u);
    const detailMark = page.locator('.detail-headline .occasion-mark');
    await expect(detailMark).toHaveText(anniversary);
    await evidence(page, '21-impl-detail-390-light.jpg');

    await page.getByRole('button', { name: germanUi.common.back }).click();
    await expect(page).toHaveURL(/\/story/u);
    await expect(
      card(page, 'Lakeside picnic').locator('.occasion-mark'),
    ).toHaveText(anniversary);
  });

  test('greets once with motion when the line comes into view', async ({
    page,
  }) => {
    await openTimeline(page, { reducedMotion: false });
    const mark = card(page, 'Lakeside picnic').locator('.occasion-mark');
    await expect(mark).toBeVisible();
    // The one-shot reveal runs and ends; the line stays at rest afterwards.
    await expect(mark).toHaveAttribute('data-occasion-reveal', 'done');
    await expect(mark).not.toHaveClass(/occasion-mark-revealing/u);
    await expect(mark).toHaveCSS('opacity', '1');
  });

  test('shows the line without movement under reduced motion', async ({
    page,
  }) => {
    await openTimeline(page);
    const mark = card(page, 'Lakeside picnic').locator('.occasion-mark');
    await expect(mark).toBeVisible();
    await expect(mark).toHaveAttribute(
      'data-occasion-reveal',
      /revealing|done/u,
    );
    await expect(mark).toHaveCSS('animation-name', 'none');
    await expect(mark).toHaveCSS('opacity', '1');
  });

  for (const variant of [
    { name: '390-dark', width: 390, dark: true },
    { name: '360-light-large', width: 360, large: true },
    { name: '1280-light', width: 1280 },
  ]) {
    test(`keeps the line readable at ${variant.name}`, async ({ page }) => {
      await openTimeline(page, variant);
      if (variant.large)
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '200%';
        });
      const mark = card(page, 'Lakeside picnic').locator('.occasion-mark');
      await expect(mark).toBeVisible();
      // The line wraps instead of clipping or pushing the card wider.
      expect(
        await mark.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true);
      const box = await mark.boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
        variant.width,
      );
      await mark.evaluate((element) =>
        element.scrollIntoView({ block: 'center' }),
      );
      await evidence(page, `22-impl-timeline-${variant.name}.jpg`);
    });
  }
});

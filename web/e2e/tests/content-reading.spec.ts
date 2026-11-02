import { expect, test } from '@playwright/test';
import copy from '../../src/i18n/locales/storyProducts';
import m5s3 from '../../src/i18n/locales/m5s3';
import memoryCopy from '../../src/i18n/locales/memoryProduct';
import { placeDetailPath } from '../../src/client/routes';
import {
  ACCOUNT_ID,
  PARTNER_ID,
  SPACE_ID,
  captureScreenshot,
  installMocks,
  signIn,
} from '../support/storyTimelineFixture';

for (const [width, theme, large] of [
  [360, 'light', false],
  [390, 'dark', false],
  [430, 'light', true],
  [1280, 'dark', false],
] as const) {
  test(`bounded Plan description and quiet context at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({
      colorScheme: theme,
      reducedMotion: large ? 'reduce' : 'no-preference',
    });
    const unexpected = await installMocks(page, { strict: true });
    let previewRequests = 0;
    let remoteRequests = 0;
    await page.route('https://unwanted.example/**', async (route) => {
      remoteRequests++;
      await route.abort();
    });
    const plan = {
      id: 'reading-plan',
      spaceId: SPACE_ID,
      title: 'A quiet evening by the lake',
      description: `<p>Bring a blanket and something warm to drink.</p>${'<p>Time together by the lake, with a walk before sunset.</p>'.repeat(12)}<p><a href="https://example.org/lake">The lakeside walk</a></p><img src="https://unwanted.example/tracker"><script>window.unwanted = true</script>`,
      plannedOn: '2099-12-05',
      plannedStart: null,
      plannedEnd: null,
      experiencedOn: null,
      status: 'PLANNED',
      sourceWishId: 'source-wish',
      placeId: 'lake-place',
      creator: { id: PARTNER_ID, displayName: 'Alex' },
      createdBy: PARTNER_ID,
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
      version: 1,
      capabilities: { canEdit: true, canDelete: true, canComment: true },
      attachments: [],
    };
    await page.route(`**/api/v1/spaces/${SPACE_ID}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/plans/reading-plan'))
        return route.fulfill({ json: plan });
      if (path.endsWith('/places'))
        return route.fulfill({
          json: {
            items: [
              {
                id: 'lake-place',
                name: 'Lake shore',
                version: 1,
                createdAt: plan.createdAt,
                updatedAt: plan.updatedAt,
                capabilities: plan.capabilities,
                spaceId: SPACE_ID,
              },
            ],
            hasMore: false,
            nextCursor: null,
          },
        });
      if (path.endsWith('/link-preview')) {
        previewRequests++;
        return route.fulfill({
          json: { available: true, title: 'A lakeside walk' },
        });
      }
      return route.fallback();
    });
    await signIn(page);
    await page.goto('/plan/plans/reading-plan');
    await expect(page.getByRole('heading', { name: plan.title })).toBeVisible();
    if (large) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const more = page.locator('.description-disclosure');
    await expect(more).toHaveText(copy.descriptionDisclosure.more);
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(
      page.locator('.planen-detail-context').getByRole('link'),
    ).toHaveCount(2);
    await expect(
      page.getByRole('link', { name: 'Lake shore' }),
    ).toHaveAttribute('href', placeDetailPath('lake-place'));
    await expect(
      page.getByRole('link', { name: m5s3.plan.openWish }),
    ).toHaveAttribute('href', '/plan/wishes/source-wish');
    await captureScreenshot(
      page,
      info,
      `planning-content-reading-${width}-${theme}.png`,
      { fullPage: true },
    );
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.authored-text')).not.toContainText('<p>');
    await expect(page.locator('.authored-text')).not.toContainText(
      'window.unwanted',
    );
    await page.locator('.authored-link-previews > summary').click();
    expect(previewRequests).toBe(0);
    await page
      .getByRole('button', {
        name: copy.authoredLinks.load.replace('{{host}}', 'example.org'),
      })
      .click();
    await expect(
      page.getByRole('link', { name: /A lakeside walk/ }),
    ).toBeVisible();
    expect(previewRequests).toBe(1);
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(remoteRequests).toBe(0);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(unexpected).toEqual([]);
  });
}

test('partner edits shared words while author identity and destructive controls stay protected', async ({
  page,
}) => {
  await installMocks(page, { strict: true });
  const memory = {
    id: 'mem-canal',
    spaceId: SPACE_ID,
    authorId: PARTNER_ID,
    author: { id: PARTNER_ID, displayName: 'Alex' },
    title: 'A shared lakeside memory',
    body: 'The original words.',
    happenedOn: '2026-05-12',
    createdAt: '2026-05-12T08:30:00Z',
    updatedAt: '2026-05-12T08:30:00Z',
    version: 1,
    tags: [],
    attachments: [],
    capabilities: { canEdit: true, canDelete: false, canComment: true },
  };
  let writes = 0;
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/memories/mem-canal`,
    async (route) => {
      if (route.request().method() === 'PATCH') {
        expect(route.request().headers()['if-match']).toBe('1');
        expect(route.request().postDataJSON()).not.toHaveProperty('authorId');
        Object.assign(memory, route.request().postDataJSON(), { version: 2 });
        writes++;
      } else expect(route.request().method()).toBe('GET');
      return route.fulfill({ json: memory });
    },
  );
  await signIn(page);
  await page.goto('/story/memories/mem-canal');
  await page.getByRole('link', { name: memoryCopy.edit, exact: true }).click();
  await page
    .locator('textarea[name="body"]')
    .fill('The original words, with a thought from the partner.');
  await expect(
    page.getByRole('button', { name: memoryCopy.deleteConfirm }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: memoryCopy.save, exact: true })
    .click();
  await expect(page.locator('.memory-diary-prose')).toContainText(
    'with a thought from the partner.',
  );
  expect(writes).toBe(1);
  expect(memory.authorId).toBe(PARTNER_ID);
  expect(memory.authorId).not.toBe(ACCOUNT_ID);
});

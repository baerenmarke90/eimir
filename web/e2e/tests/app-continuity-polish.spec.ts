import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import copy from '../../src/i18n/locales/coupleExperiences';
import m5s3 from '../../src/i18n/locales/m5s3';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import localizedFixture from '../fixtures/locales/de';
import { installNativeAppLifecycle } from '../support/nativeAppLifecycle';
import { fulfillDefaultProductContext } from '../support/productContext';
import {
  CAPABILITIES,
  captureScreenshot,
  getTimelineItems,
  installMocks,
  ME,
  PARTNER,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const fixture = localizedFixture.sharedExperience;
const root = `/api/v1/spaces/${SPACE_ID}`;
const canalCard = 'a.story-card-link[href="/story/memories/mem-canal"]';
const canalThumbnail = '**/attachments/att-canal-1/content?variant=thumbnail';
const canalPhoto = readFileSync(
  new URL(
    '../../../backend/demo_assets/images/cabin-lake.jpg',
    import.meta.url,
  ),
);

function countStoredCanalPhotos(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('eimir-authorized-media-v1');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('media', 'readonly');
          const keys = tx.objectStore('media').getAllKeys();
          keys.onsuccess = () =>
            resolve(
              keys.result.filter((key) => String(key).includes('att-canal-1'))
                .length,
            );
          tx.oncomplete = () => db.close();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

test('the alphabet includes later API pages before showing the wish list', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const unknown = await installMocks(page, { strict: true });
  await installContext(page);
  let release!: () => void;
  const secondPage = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reads: string[] = [];
  const wish = (id: string, title: string) => ({
    id,
    title,
    spaceId: SPACE_ID,
    creator: ME,
    createdBy: ME.id,
    status: 'OPEN',
    version: 1,
    capabilities: CAPABILITIES,
    createdAt: '2026-11-05T08:00:00Z',
    updatedAt: '2026-11-05T08:00:00Z',
  });
  await page.route(`**${root}/wishes?**`, async (route) => {
    const cursor =
      new URL(route.request().url()).searchParams.get('cursor') ?? '';
    reads.push(cursor);
    if (cursor) await secondPage;
    return route.fulfill({
      json: {
        items: [
          cursor ? wish('wish-a', 'A calm evening') : wish('wish-z', 'Zoo'),
        ],
        nextCursor: cursor ? null : 'older-wishes',
        hasMore: !cursor,
      },
    });
  });
  await signIn(page);
  expect(reads).toEqual([]);
  await page.goto('/plan#wishes');
  await expect.poll(() => reads).toEqual(['', 'older-wishes']);
  await expect(page.locator('.planen-wish-list')).toHaveCount(0);
  release();
  await expect(page.locator('.planen-wish-copy > strong')).toHaveText([
    'A calm evening',
    'Zoo',
  ]);
  await expect(
    page.getByText(
      m5s3.overview.createdBy.replace('{{name}}', ME.displayName),
      { exact: true },
    ),
  ).toHaveCount(0);
  await captureScreenshot(page, info, 'wishes-complete-alphabet-390-light.png');
  expect(unknown).toEqual([]);
});

for (const native of [false, true]) {
  test(`image bytes survive a ${native ? 'native session cold start' : 'page reload'}`, async ({
    page,
  }) => {
    if (native) await installNativeAppLifecycle(page);
    await installMocks(page, { strict: true });
    let downloads = 0;
    let grants = 0;
    let storyReads = 0;
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/timeline')) storyReads++;
      if (path.endsWith('/attachments/att-canal-1/read-access')) grants++;
      return route.fallback();
    });
    await page.route(canalThumbnail, (route) => {
      downloads++;
      return route.fulfill({ contentType: 'image/jpeg', body: canalPhoto });
    });
    await signIn(page);
    const image = page.locator(canalCard).locator('img').first();
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
    await expect.poll(() => countStoredCanalPhotos(page)).toBeGreaterThan(0);
    expect(downloads).toBe(1);
    const epoch = await page.evaluate(() =>
      localStorage.getItem('eimir-media-epoch-v1'),
    );
    const initialGrants = grants;
    const initialStoryReads = storyReads;
    if (native)
      await page.evaluate(() => sessionStorage.removeItem('eimir-session-v1'));
    await page.reload();
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(() => localStorage.getItem('eimir-media-epoch-v1')),
    ).toBe(epoch);
    expect(downloads).toBe(1);
    expect(storyReads).toBeGreaterThan(initialStoryReads);
    expect(grants).toBe(initialGrants);
  });
}

test('a stored photo stays hidden while access is checked and is evicted after a denial', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await installMocks(page, { strict: true });
  // The normal detail mock is text-only. Include its timeline attachment so
  // opening the detail makes a new original-media authorization request.
  const attachment = getTimelineItems()[0]?.memory?.attachments[0];
  if (!attachment) throw new Error('Missing canal attachment fixture.');
  await page.route(`**${root}/memories/mem-canal`, (route) =>
    route.fulfill({
      json: {
        id: 'mem-canal',
        spaceId: SPACE_ID,
        author: ME,
        authorId: ME.id,
        title: 'Breakfast by the canal',
        body: 'A wonderful morning by the water.',
        happenedOn: '2026-05-12',
        createdAt: '2026-05-12T08:30:00Z',
        updatedAt: '2026-05-12T08:30:00Z',
        version: 1,
        attachments: [attachment],
        capabilities: CAPABILITIES,
      },
    }),
  );
  let holding = false;
  let held = 0;
  let downloads = 0;
  let release!: () => void;
  const denied = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/attachments/att-canal-1/read-access', async (route) => {
    // The generated API serializes attachmentReadRequest as the POST body.
    // A missing variant means original; thumbnails explicitly request theirs.
    const variant = route.request().postDataJSON()?.variant ?? 'original';
    if (!holding || variant !== 'original') return route.fallback();
    held++;
    await denied;
    return route.fulfill({
      status: 404,
      contentType: 'application/problem+json',
      body: JSON.stringify({ status: 404, code: 'NOT_FOUND' }),
    });
  });
  await page.route(canalThumbnail, (route) => {
    downloads++;
    return route.fulfill({ contentType: 'image/jpeg', body: canalPhoto });
  });
  await signIn(page);
  const card = page.locator(canalCard);
  await expect
    .poll(() =>
      card
        .locator('img')
        .first()
        .evaluate((node: HTMLImageElement) => node.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect.poll(() => countStoredCanalPhotos(page)).toBeGreaterThan(0);
  expect(downloads).toBe(1);
  await captureScreenshot(page, info, 'diary-expanded-dark.png');

  // A tab return preserves an already authorized image without redelivery.
  await page.locator('a[href="/plan"]').first().click();
  await expect(card).not.toBeVisible();
  await page.goBack();
  await expect(card).toBeVisible();
  await expect(card.locator('img')).toHaveCount(1);
  expect(held).toBe(0);

  // A fresh detail original must authorize independently of the kept preview.
  // A document reload may use a fresh Timeline projection as its proof, so it
  // is not a reliable way to force an attachment read-access request.
  holding = true;
  await card.click();
  await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
  await expect.poll(() => held).toBeGreaterThan(0);
  expect(await countStoredCanalPhotos(page)).toBeGreaterThan(0);

  release();
  await expect.poll(() => countStoredCanalPhotos(page)).toBe(0);
  await page.goBack();
  await expect(card).toBeVisible();
  await expect(card.locator('.story-media-placeholder')).toBeVisible();
  expect(downloads).toBe(1);
  await captureScreenshot(page, info, 'diary-access-denied-expanded-dark.png');
});

test('a native Diary cold start prepares the content in parallel and displays it only with current membership', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await installNativeAppLifecycle(page);
  await installMocks(page, { strict: true });
  let membershipReply: Promise<boolean> | undefined;
  const reads: string[] = [];
  let downloads = 0;
  await page.route('**/api/v1/auth/memberships', async (route) => {
    if (membershipReply && !(await membershipReply))
      return route.fulfill({ json: [] });
    return route.fallback();
  });
  const projection = /\/api\/v1\/spaces\/[^/]+\/(timeline|discover)(?:\?|$)/;
  await page.route(projection, (route) => {
    if (membershipReply) reads.push(new URL(route.request().url()).pathname);
    return route.fallback();
  });
  await page.route(canalThumbnail, (route) => {
    downloads++;
    return route.fulfill({ contentType: 'image/jpeg', body: canalPhoto });
  });
  await signIn(page);
  const card = page.locator(canalCard);
  const photoWidth = () =>
    card
      .locator('img')
      .first()
      .evaluate((node: HTMLImageElement) => node.naturalWidth);
  await expect.poll(photoWidth).toBeGreaterThan(0);
  await expect.poll(() => countStoredCanalPhotos(page)).toBeGreaterThan(0);
  expect(downloads).toBe(1);

  const restartWithMembership = async (authorized: boolean) => {
    reads.length = 0;
    let reply!: (value: boolean) => void;
    membershipReply = new Promise<boolean>((resolve) => {
      reply = resolve;
    });
    const responses = ['timeline', 'discover'].map((kind) =>
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `${root}/${kind}` &&
          response.ok(),
      ),
    );
    await page.evaluate(() => sessionStorage.removeItem('eimir-session-v1'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await Promise.all(responses);
    await expect(page.locator('.branded-startup')).toBeVisible();
    await expect(card).toHaveCount(0);
    if (authorized)
      await captureScreenshot(page, info, 'diary-startup-compact-light.png');
    reply(authorized);
  };

  await restartWithMembership(true);
  await expect.poll(photoWidth).toBeGreaterThan(0);
  expect(reads.sort()).toEqual([`${root}/discover`, `${root}/timeline`]);
  expect(downloads).toBe(1);
  await captureScreenshot(page, info, 'diary-restored-compact-light.png');

  await restartWithMembership(false);
  await expect(page.locator('.branded-startup')).toHaveCount(0);
  await expect(card).toHaveCount(0);
  await expect(page.locator('.product-shell')).toHaveCount(0);
  await expect.poll(() => countStoredCanalPhotos(page)).toBe(0);
  expect(downloads).toBe(1);
});

test('a read-mode Memory refreshes its detail alongside the membership check', async ({
  page,
}) => {
  await installMocks(page, { strict: true });
  let restoring = false;
  // Count only the reloaded document: the page being replaced may still
  // finish its own read after the reload starts.
  let reloaded = false;
  let reads = 0;
  let release!: () => void;
  const membership = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/auth/memberships', async (route) => {
    if (restoring) await membership;
    return route.fallback();
  });
  const detail = `${root}/memories/mem-canal`;
  await page.route(`**${detail}`, (route) => {
    if (restoring && reloaded) reads++;
    return route.fallback();
  });
  page.on('framenavigated', (frame) => {
    if (restoring && frame === page.mainFrame()) reloaded = true;
  });
  await signIn(page);
  await page.locator(canalCard).click();
  const title = page.getByRole('heading', { name: 'Breakfast by the canal' });
  await expect(title).toBeVisible();

  restoring = true;
  const prepared = page.waitForResponse(
    (response) => new URL(response.url()).pathname === detail && response.ok(),
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await prepared;
  await expect(page.locator('.branded-startup')).toBeVisible();
  await expect(title).toHaveCount(0);
  release();
  await expect(title).toBeVisible();
  expect(reads).toBe(1);
});

async function installContext(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultProductContext(route)) return;
    const path = new URL(route.request().url()).pathname;
    if (path === `${root}/dashboard/preferences`)
      return route.fulfill({ json: { items: [] } });
    if (path === `${root}/configuration`)
      return route.fulfill({
        json: {
          spaceId: SPACE_ID,
          version: 1,
          supportGesturesEnabled: false,
          dailyQuestionsEnabled: false,
          energyCheckInEnabled: false,
          loveNotesEnabled: false,
          sharedAchievementsEnabled: false,
        },
        headers: { ETag: '"1"' },
      });
    if (path === `${root}/profiles/${PARTNER.id}`)
      return route.fulfill({
        json: {
          accountId: PARTNER.id,
          displayName: PARTNER.displayName,
          profileAttachmentId: null,
          preferences: [],
          version: 1,
        },
      });
    return route.fallback();
  });
}

for (const [width, theme] of [
  [360, 'light'],
  [390, 'dark'],
  [430, 'light'],
  [1280, 'dark'],
] as const) {
  test(`Diary months clear system icons and both happiness answers stand apart at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const unknown = await installMocks(page, { strict: true });
    await installContext(page);
    const entry = {
      id: 'mem-canal',
      spaceId: SPACE_ID,
      author: PARTNER,
      authorId: PARTNER.id,
      title: fixture.question,
      body: fixture.partnerAnswer,
      happenedOn: '2026-11-03',
      createdAt: '2026-11-03T08:00:00Z',
      updatedAt: '2026-11-03T08:00:00Z',
      attachments: [],
      tags: [],
      version: 1,
      capabilities: CAPABILITIES,
      experienceKind: 'HAPPINESS',
      experienceRootId: 'mem-canal',
      experienceAnswers: [
        {
          id: 'mem-canal',
          author: PARTNER,
          body: fixture.partnerAnswer,
          attachments: [],
          version: 1,
          capabilities: CAPABILITIES,
        },
        {
          id: 'own-answer',
          author: ME,
          body: fixture.ownInitial,
          attachments: [],
          version: 1,
          capabilities: CAPABILITIES,
        },
      ],
    };
    await page.route(`**${root}/memories?**`, async (route) => {
      if (
        new URL(route.request().url()).searchParams.get('experienceKind') !==
        'HAPPINESS'
      )
        return route.fallback();
      return route.fulfill({
        json: { items: [entry], nextCursor: null, hasMore: false },
      });
    });
    await signIn(page);
    await page.addStyleTag({
      content: ':root { --safe-area-inset-top: 28px; }',
    });
    const month = page.locator('.story-year-month-header').first();
    await month.evaluate((node) =>
      window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top),
    );
    await expect
      .poll(async () => (await month.boundingBox())?.y)
      .toBeCloseTo(36, 0);
    await expect(page.locator('.product-shell')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await captureScreenshot(
      page,
      info,
      `story-sticky-safe-area-${width}-${theme}.png`,
    );

    await page.goto('/story/happiness');
    await expect(
      page.getByRole('heading', { name: copy.history }),
    ).toBeVisible();
    const history = page.locator('.couple-experience-history-entry');
    const answers = history.locator('.experience-answer-preview');
    await expect(answers).toContainText([
      fixture.partnerAnswer,
      fixture.ownInitial,
    ]);
    await expect(answers).toHaveCount(2);
    // #1775: both answers stand apart through author name and identity
    // colour on one shared surface, not through nested answer boxes.
    const colors = await history.evaluate((node) => ({
      answers: Array.from(
        node.querySelectorAll('.experience-answer-preview'),
      ).map((answer) => getComputedStyle(answer).backgroundColor),
      avatars: Array.from(
        node.querySelectorAll('.experience-answer-avatar'),
      ).map((avatar) => getComputedStyle(avatar).borderColor),
    }));
    expect(colors.answers).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
    expect(colors.avatars[0]).not.toBe(colors.avatars[1]);
    await history.scrollIntoViewIfNeeded();
    await captureScreenshot(
      page,
      info,
      `shared-answers-history-${width}-${theme}.png`,
    );
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(unknown).toEqual([]);
  });
}

test('opening a current partner comment consumes only that event and moves it into quiet history', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const unknown = await installMocks(page, { strict: true });
  await installContext(page);
  const comment = (id: string) => ({
    id,
    sourceEventId: `source-${id}`,
    kind: 'COMMENT_CREATED',
    actorId: PARTNER.id,
    actor: PARTNER,
    targetType: 'MEMORY',
    targetId: 'mem-canal',
    target: {
      targetType: 'MEMORY',
      targetId: 'mem-canal',
      title: fixture.question,
    },
    createdAt: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
  });
  let activities = [comment('first-comment')];
  await page.route(`**${root}/dashboard`, (route) =>
    route.fulfill({
      json: {
        space: { spaceId: SPACE_ID, partner: PARTNER },
        upcoming: [],
        recentShared: [],
        retrospective: null,
        keepsake: null,
      },
    }),
  );
  await page.route(`**${root}/activity?**`, (route) =>
    route.fulfill({ json: { items: activities, nextCursor: null } }),
  );
  await signIn(page);
  await page.goto('/today');
  const signal = page.locator('.today-living-partner_signal');
  await expect(signal).toBeVisible();
  await expect(page.locator('.today-section-recent')).toHaveCount(0);
  await captureScreenshot(
    page,
    info,
    'today-current-comment-before-open-390-light.png',
  );
  await signal.getByRole('link').click();
  await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
  await page
    .locator('.composer-header')
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(signal).toHaveCount(0);
  await expect(
    page.locator('.today-section-recent .activity-card'),
  ).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.today-section-recent')).toBeVisible();
  await expect(signal).toHaveCount(0);
  await captureScreenshot(
    page,
    info,
    'today-consumed-comment-history-390-light.png',
  );
  activities = [comment('second-comment'), ...activities];
  await page.reload();
  await expect(signal).toBeVisible();
  await expect(
    page.locator('.today-section-recent .activity-card'),
  ).toHaveCount(1);
  expect(unknown).toEqual([]);
});

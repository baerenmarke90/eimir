import fixtureCopy from '../fixtures/locales/de';
import placeCopy from '../../src/i18n/locales/photoPlaces';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import copy from '../../src/i18n/locales/coupleExperiences';
import taskCopy from '../../src/i18n/locales/taskBoundary';
import de from '../../src/i18n/locales/de';
import navigation from '../../src/i18n/locales/navigation';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  ME,
  PARTNER,
  SPACE_ID,
  captureScreenshot,
  installMocks,
  signIn,
} from '../support/storyTimelineFixture';

const fixture = fixtureCopy.subpageNavigation;
const base = `/api/v1/spaces/${SPACE_ID}`;
const photo = readFileSync(
  new URL(
    '../../../backend/demo_assets/images/lake-sunrise.jpg',
    import.meta.url,
  ),
);

for (const width of [390, 1280]) {
  test(`More photo, chapter and year entries retain visible and browser Back at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await installMocks(page);
    await page.addInitScript(
      ({ accountId, spaceId }) => {
        localStorage.setItem(
          `eimir:product-tour:v1:${accountId}:${spaceId}`,
          'seen',
        );
      },
      { accountId: ACCOUNT_ID, spaceId: SPACE_ID },
    );
    await page.route(`**${base}/photos*`, (route) =>
      route.fulfill({
        json: { items: [], totalCount: 0, hasMore: false, nextCursor: null },
      }),
    );
    let emptyYears = true;
    await page.route(`**${base}/timeline*`, (route) =>
      route.fulfill({
        json: {
          items: [],
          availableYears: emptyYears ? [] : [2026],
          hasMore: false,
          nextCursor: null,
        },
      }),
    );
    await signIn(page);
    await page
      .getByRole('link', { name: navigation.more, exact: true })
      .click();
    const back = page.getByRole('button', { name: taskCopy.back, exact: true });
    for (const name of [
      de.more.destinations.photos,
      de.more.destinations.chapters,
      de.more.destinations.years,
    ]) {
      const entry = page.getByRole('link', { name, exact: true });
      await entry.click();
      await expect(back).toHaveCount(1);
      await back.click();
      await expect(page).toHaveURL(/\/more$/);
      await entry.click();
      await page.goBack();
      await expect(page).toHaveURL(/\/more$/);
    }
    emptyYears = false;
    // Start the populated-server scenario without the previous empty query cache.
    await page.reload();
    await page
      .getByRole('link', { name: de.more.destinations.years, exact: true })
      .click();
    await page
      .getByRole('link', {
        name: de.storyYears.openYear.replace('{{year}}', '2026'),
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/story\/years\/2026$/);
    await back.click();
    await expect(page).toHaveURL(/\/story\/years$/);
    await back.click();
    await expect(page).toHaveURL(/\/more$/);
    await page.goto('/story/photos');
    await back.click();
    await expect(page).toHaveURL(/\/story$/);
  });
}

for (const [width, theme, large] of [
  [360, 'light', false],
  [390, 'dark', false],
  [430, 'light', false],
  [1280, 'light', false],
  [1280, 'dark', false],
  [320, 'light', true],
] as const) {
  test(`secondary navigation and date/Place context at ${width} ${theme}${large ? ' large reduced' : ''}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await installMocks(page);
    const attachment = {
      id: 'context-photo',
      position: 0,
      status: 'READY',
      mediaType: 'IMAGE',
      mimeType: 'image/jpeg',
      size: photo.length,
      width: 800,
      height: 600,
      hasThumbnail: false,
      isSensitive: false,
    };
    await page.route(`**${base}/memories/mem-canal`, (route) =>
      route.fulfill({
        json: {
          id: 'mem-canal',
          spaceId: SPACE_ID,
          title: fixture.title,
          body: fixture.body,
          happenedOn: '2026-05-12',
          author: ME,
          authorId: ACCOUNT_ID,
          attachments: [attachment],
          tags: [],
          capabilities: CAPABILITIES,
          createdAt: '2026-05-12T08:30:00Z',
          updatedAt: '2026-05-12T08:30:00Z',
          version: 1,
        },
      }),
    );
    await page.route('**/attachments/context-photo/read-access*', (route) =>
      route.fulfill({
        json: {
          method: 'STREAM',
          url: `${base}/attachments/context-photo/content`,
        },
      }),
    );
    await page.route('**/attachments/context-photo/content*', (route) =>
      route.fulfill({ contentType: 'image/jpeg', body: photo }),
    );
    await page.route(`**${base}/moments/*/*/places*`, (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: 'saar',
              name: fixture.place,
              address: fixture.address,
              latitude: 49.23,
              longitude: 6.99,
              geocodingSource: 'openstreetmap',
            },
          ],
          hasMore: false,
          nextCursor: null,
        },
      }),
    );
    await signIn(page);
    await expect(page.locator('.subpage-back-slot')).toHaveCount(0);
    await page.goto('/story/memories/mem-canal');
    if (large)
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
    const back = page.locator('.subpage-back-slot .task-back-control');
    await expect(back).toHaveCount(1);
    await expect(back).toBeVisible();
    await expect(back).toHaveAccessibleName(taskCopy.back);
    const backBox = await back.boundingBox();
    expect(backBox?.width).toBeGreaterThanOrEqual(44);
    expect(backBox?.height).toBeGreaterThanOrEqual(44);
    const title = page.getByRole('heading', {
      name: fixture.title,
      level: 1,
    });
    expect(backBox?.y).toBeLessThan((await title.boundingBox())?.y ?? 0);
    const metadata = page.locator('header .moment-metadata');
    await expect(
      metadata.getByRole('button', { name: fixture.place }),
    ).toBeVisible();
    await expect(metadata.locator('.moment-date svg')).toBeVisible();
    await expect(metadata.locator('time')).toHaveAttribute(
      'datetime',
      '2026-05-12',
    );
    const dateBox = await metadata.locator('time').boundingBox();
    const placeBox = await metadata
      .getByRole('button', { name: fixture.place })
      .boundingBox();
    expect(placeBox?.width).toBeGreaterThanOrEqual(44);
    expect(placeBox?.height).toBeGreaterThanOrEqual(44);
    if (!large && width >= 390)
      expect(
        Math.abs(
          (dateBox?.y ?? 0) +
            (dateBox?.height ?? 0) / 2 -
            (placeBox?.y ?? 0) -
            (placeBox?.height ?? 0) / 2,
        ),
      ).toBeLessThanOrEqual(3);
    expect(await page.locator('article .moment-places').count()).toBe(0);
    await expect(
      page.locator('.memory-photo-gallery img').first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await captureScreenshot(
      page,
      info,
      `story-context-${width}-${theme}${large ? '-large-reduced' : ''}.png`,
      { fullPage: true },
    );
    await metadata.getByRole('button', { name: fixture.place }).click();
    await expect(
      page.getByRole('dialog', { name: fixture.place }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: placeCopy.mapAddress.replace('{{address}}', fixture.address),
      }),
    ).toHaveAttribute('href', /49.23/);
    await expect(
      page.getByRole('link', { name: '© OpenStreetMap' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      metadata.getByRole('button', { name: fixture.place }),
    ).toBeFocused();
    await back.click();
    await expect(page).toHaveURL(/\/story$/);
    await page.goto('/more/settings/appearance');
    await expect(
      page.locator('.subpage-back-slot .task-back-control'),
    ).toHaveCount(1);
    await page.locator('.subpage-back-slot .task-back-control').click();
    await expect(page).toHaveURL(/\/more\/settings$/);
  });
}

for (const [width, theme] of [
  [390, 'light'],
  [390, 'dark'],
  [1280, 'dark'],
] as const) {
  for (const kind of ['HAPPINESS', 'TIME_TRAVEL'] as const) {
    test(`Wir includes the original ${kind} prompt and returns after opening at ${width} ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await installMocks(page);
      const prompt = fixture.prompt;
      const text = fixture.answer;
      const createdAt = new Date().toISOString();
      await page.route(`**${base}/dashboard/preferences`, (route) =>
        route.fulfill({ json: { items: [] } }),
      );
      await page.route(`**${base}/activity*`, (route) =>
        route.fulfill({
          json: { items: [], hasMore: false, nextCursor: null },
        }),
      );
      await page.route(`**${base}/configuration`, (route) =>
        route.fulfill({
          json: {
            spaceId: SPACE_ID,
            version: 7,
            canManageSpaceConfiguration: true,
            dailyContextTimezone: 'Europe/Berlin',
            dailyQuestionsEnabled: false,
            energyCheckInEnabled: false,
            energyVisibilityMode: 'MUTUAL_REVEAL',
            loveNotesEnabled: false,
            sharedAchievementsEnabled: false,
            supportGesturesEnabled: false,
            vibeCheckEnabled: true,
            vibeVisibilityMode: 'MUTUAL_REVEAL',
          },
          headers: { ETag: '\"7\"' },
        }),
      );
      await page.route(`**${base}/daily-check-in/today`, (route) =>
        route.fulfill({
          json: {
            checkedOn: '2026-11-04',
            dailyContextTimezone: 'Europe/Berlin',
            own: { energyLevel: null, vibe: null, vibeNote: null, version: 1 },
            energy: null,
            vibe: {
              visibilityMode: 'MUTUAL_REVEAL',
              partner: { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' },
              partnerNote: null,
            },
          },
          headers: { ETag: '\"2026-11-04:empty\"' },
        }),
      );
      await page.route(`**${base}/profiles/*`, (route) =>
        route.fulfill({
          json: {
            id: 'profile-' + route.request().url().split('/').at(-1),
            accountId: route.request().url().split('/').at(-1),
            displayName: route.request().url().endsWith(ACCOUNT_ID)
              ? ME.displayName
              : PARTNER.displayName,
            preferences: [],
            profileAttachmentId: null,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
            version: 1,
          },
        }),
      );
      await page.route(`**${base}/dashboard`, (route) =>
        route.fulfill({
          json: {
            space: { spaceId: SPACE_ID, partner: PARTNER },
            relationshipDuration: null,
            retrospective: null,
            upcoming: [],
            recentShared: [],
            viewerLocalDate: '2026-11-04',
            incomingExperience: {
              id: 'mem-canal',
              kind,
              prompt,
              text,
              authorId: PARTNER.id,
              happenedOn: '2026-11-04',
              createdAt,
            },
          },
        }),
      );
      await signIn(page);
      await page.goto('/today');
      const section = page.locator('.shared-experience-section');
      await expect(section.getByText(prompt, { exact: true })).toBeVisible();
      await expect(section.getByText(text, { exact: true })).toBeVisible();
      await expect(
        section.getByRole('heading', {
          name: copy.incoming.from.replace('{{name}}', 'Alex'),
          exact: true,
        }),
      ).toBeVisible();
      await expect(section.locator('.shared-experience-from')).toHaveText(
        kind === 'HAPPINESS'
          ? copy.incoming.happiness
          : copy.incoming.timeTravel,
      );
      await expect(section.locator('time')).toHaveAttribute(
        'datetime',
        '2026-11-04',
      );
      expect(
        (
          await new AxeBuilder({ page })
            .include('.shared-experience-section')
            .analyze()
        ).violations,
      ).toEqual([]);
      await expect(page.locator('.ui-state-error')).toHaveCount(0);
      await captureScreenshot(
        page,
        info,
        `today-context-${kind.toLowerCase()}-${width}-${theme}.png`,
        { fullPage: true },
      );
      await section.getByRole('link', { name: copy.incoming.open }).click();
      await expect(page).toHaveURL(/\/story\/memories\/mem-canal$/);
      await page.locator('.subpage-back-slot .task-back-control').click();
      await expect(page).toHaveURL(/\/today$/);
      await expect(page.locator('.shared-experience-section')).toHaveCount(0);
    });
  }
}

for (const shared of [true, false]) {
  test(`HeartMoment metadata retains ${shared ? 'shared Places' : 'owner-only privacy'}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await installMocks(page);
    let reads = 0;
    await page.route(
      `**${base}/moments/heart-moments/hm-love/places*`,
      (route) => {
        reads++;
        return route.fulfill({
          json: {
            items: [
              {
                id: 'saar',
                name: fixture.place,
                address: fixture.address,
                latitude: 49.23,
                longitude: 6.99,
              },
            ],
            hasMore: false,
            nextCursor: null,
          },
        });
      },
    );
    await page.route(`**${base}/heart-moments/hm-love`, (route) =>
      route.fulfill({
        json: {
          id: 'hm-love',
          spaceId: SPACE_ID,
          text: fixture.heartText,
          emotion: 'LOVED',
          happenedOn: '2026-11-04',
          author: ME,
          authorId: ACCOUNT_ID,
          capabilities: { ...CAPABILITIES, canComment: shared },
          createdAt: '2026-11-04T10:00:00Z',
          updatedAt: '2026-11-04T10:00:00Z',
          version: 1,
          visibility: shared ? 'SHARED' : 'PRIVATE',
          tags: [],
          attachment: null,
        },
      }),
    );
    await signIn(page);
    await page.goto('/story/heart-moments/hm-love');
    await expect(
      page.getByText(fixture.heartText, { exact: true }),
    ).toBeVisible();
    const meta = page.locator('header .moment-metadata');
    await expect(meta.locator('.moment-date svg')).toBeVisible();
    if (shared) {
      await expect(
        meta.getByRole('button', { name: fixture.place }),
      ).toBeVisible();
      expect(reads).toBe(1);
      await captureScreenshot(
        page,
        info,
        'story-context-heart-shared-390-light.png',
        { fullPage: true },
      );
    } else {
      expect(reads).toBe(0);
      await expect(
        page.getByRole('button', { name: fixture.place }),
      ).toHaveCount(0);
    }
    await expect(
      page.locator('.subpage-back-slot .task-back-control'),
    ).toHaveCount(1);
    await page.locator('.subpage-back-slot .task-back-control').click();
    await expect(page).toHaveURL(/\/story$/);
  });
}

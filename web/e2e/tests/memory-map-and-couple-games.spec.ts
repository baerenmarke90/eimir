import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import taskCopy from '../../src/i18n/locales/taskBoundary';
import experienceCopy from '../../src/i18n/locales/coupleExperiences';
import calendarCopy from '../../src/i18n/locales/calendarPlan';
import gameCopy from '../../src/i18n/locales/games';
import mapCopy from '../../src/i18n/locales/memoryMap';
import {
  ACCOUNT_ID,
  captureScreenshot,
  installMocks,
  PARTNER_ID,
  SPACE_ID,
  signIn,
  TINY_PNG,
} from '../support/storyTimelineFixture';

for (const [width, theme] of [
  [360, 'light'],
  [390, 'dark'],
  [430, 'light'],
  [1280, 'dark'],
] as const) {
  test(`saved memory map at ${width} ${theme}: immediate map, grouped sources and return`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({
      colorScheme: theme,
      reducedMotion: width === 430 ? 'no-preference' : 'reduce',
    });
    await installMocks(page);
    let tileReads = 0;
    await page.route('https://tile.openstreetmap.org/**', async (route) => {
      tileReads++;
      await route.fulfill({ contentType: 'image/png', body: TINY_PNG });
    });
    await page.route(`**/api/v1/spaces/${SPACE_ID}/memory-map*`, (route) =>
      route.fulfill({
        json: {
          items: [
            {
              memoryId: 'mem-canal',
              title: 'Afternoon by the canal',
              happenedOn: '2026-10-30',
              placeId: 'lake',
              placeName: 'Lake',
              latitude: 49.45,
              longitude: 7.16,
            },
            {
              memoryId: 'mem-walk',
              title: 'One more walk together',
              happenedOn: '2026-06-12',
              placeId: 'lake',
              placeName: 'Lake',
              latitude: 49.45,
              longitude: 7.16,
            },
          ],
          nextCursor: null,
        },
      }),
    );
    await signIn(page);
    await page.getByRole('link', { name: mapCopy.entry }).click();
    await expect(
      page.getByRole('heading', { name: mapCopy.title }),
    ).toBeVisible();
    const place = page.getByRole('button', { name: 'Lake · 2 Erinnerungen' });
    await expect(place).toBeVisible();
    await expect(page.locator('.memory-map-marker')).toHaveCount(1);
    await expect.poll(() => tileReads).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Karte laden' })).toHaveCount(
      0,
    );
    await captureScreenshot(
      page,
      info,
      `memory-map-places-${width}-${theme}.png`,
      {
        fullPage: true,
      },
    );
    await place.hover();
    if (width !== 430) await expect(place).toHaveCSS('transform', 'none');
    await place.click();
    const memory = page.getByRole('link', { name: /Afternoon by the canal/ });
    await expect(memory).toHaveAttribute('href', '/story/memories/mem-canal');
    await expect(page.locator('.memory-map-selection ul')).toHaveCSS(
      'animation-name',
      width === 430 ? 'eimir-disclosure-reveal' : 'none',
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await captureScreenshot(page, info, `memory-map-${width}-${theme}.png`, {
      fullPage: true,
    });
    expect(
      (await new AxeBuilder({ page }).include('.memory-map-page').analyze())
        .violations,
    ).toEqual([]);
    await memory.click();
    await expect(page).toHaveURL(/\/story\/memories\/mem-canal/);
    await page.locator('.shell-detail-back').click();
    await expect(page).toHaveURL(/\/story\/map\?place=/);
    await expect(
      page.getByRole('link', { name: /Afternoon by the canal/ }),
    ).toBeVisible();
  });
}

test('failed map tiles keep memories usable at 320px with large text', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await installMocks(page);
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 503, body: '' }),
  );
  await page.route(`**/api/v1/spaces/${SPACE_ID}/memory-map*`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            memoryId: 'mem-canal',
            title: 'A long afternoon together by the canal after our walk',
            happenedOn: '2026-10-30',
            placeId: 'lake',
            placeName: 'Our favourite quiet place by the water',
            latitude: 49.45,
            longitude: 7.16,
          },
        ],
        nextCursor: null,
      },
    }),
  );
  await signIn(page);
  await page.getByRole('link', { name: mapCopy.entry, exact: true }).click();
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(page.locator('.place-map-canvas [role="status"]')).toBeVisible();
  await page
    .getByRole('button', { name: /Our favourite quiet place by the water/ })
    .click();
  await expect(
    page.getByRole('link', { name: /A long afternoon together/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await captureScreenshot(
    page,
    info,
    'memory-map-320-dark-large-tile-error.png',
    {
      fullPage: true,
    },
  );
  expect(
    (await new AxeBuilder({ page }).include('.memory-map-page').analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: mapCopy.allPlaces }).click();
  await expect(
    page.getByRole('button', {
      name: /Our favourite quiet place by the water/,
    }),
  ).toBeVisible();
});

test('map entitlement denial explains Pro without loading external tiles', async ({
  page,
}) => {
  await installMocks(page);
  await page.route(`**/api/v1/spaces/${SPACE_ID}/memory-map*`, (route) =>
    route.fulfill({
      status: 403,
      json: {
        type: 'about:blank',
        title: 'Forbidden',
        status: 403,
        detail: 'Capability required.',
        code: 'PREMIUM_ENTITLEMENT_REQUIRED',
      },
    }),
  );
  await signIn(page);
  await page.getByRole('link', { name: mapCopy.entry }).click();
  await expect(page.getByText(mapCopy.proTitle)).toBeVisible();
  await expect(page.locator('.place-map-viewport')).toHaveCount(0);
});

test('three Pro games retain their existing independent home', async ({
  page,
}, info) => {
  await installMocks(page);
  await page.route(`**/api/v1/spaces/${SPACE_ID}/entitlements`, (route) =>
    route.fulfill({
      json: {
        spaceId: SPACE_ID,
        tier: 'PREMIUM',
        status: 'ACTIVE',
        effectiveUntil: null,
        isInGracePeriod: false,
        capabilities: ['games.couple'],
      },
    }),
  );
  await page.route(`**/api/v1/spaces/${SPACE_ID}`, (route) =>
    route.fulfill({
      json: {
        id: SPACE_ID,
        partners: [
          { id: ACCOUNT_ID, displayName: 'Lea' },
          { id: PARTNER_ID, displayName: 'Alex' },
        ],
      },
    }),
  );
  await signIn(page);
  await page.goto('/games');
  await expect(page.locator('.games-entry-status')).toHaveText(
    Array(3).fill(gameCopy.status.playNow),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, info, 'games-390-light.png', {
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await captureScreenshot(page, info, 'games-1280-dark.png', {
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
});

for (const kind of ['happiness', 'timeTravel'] as const) {
  for (const [width, theme] of [
    [320, 'light'],
    [360, 'light'],
    [390, 'dark'],
    [430, 'light'],
    [1280, 'dark'],
  ] as const) {
    test(`authored ${kind} at ${width} ${theme} shares once and reveals the saved source to the partner`, async ({
      page,
      browser,
    }, info) => {
      type Note = {
        id: string;
        title: string;
        body: string;
        experienceKind: string;
        happenedOn: string | null;
        createdAt: string;
        updatedAt: string;
        spaceId: string;
        authorId: string;
        author: { id: string; displayName: string };
        version: number;
        tags: string[];
        attachments: never[];
        capabilities: {
          canEdit: boolean;
          canDelete: boolean;
          canComment: boolean;
        };
      };
      const notes: Note[] = [];
      const identities = new Map<string, Note>();
      let loseFirstResponse = kind === 'happiness';
      async function installExperienceRoutes(target: Page, asPartner = false) {
        const actor = asPartner ? PARTNER_ID : ACCOUNT_ID;
        await target.route('**/api/v1/**', async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          const path = url.pathname;
          if (path === `/api/v1/spaces/${SPACE_ID}/entitlements`)
            return route.fulfill({
              json: {
                spaceId: SPACE_ID,
                tier: 'PREMIUM',
                status: 'ACTIVE',
                isInGracePeriod: false,
                capabilities: ['games.couple'],
              },
            });
          if (path === `/api/v1/spaces/${SPACE_ID}`)
            return route.fulfill({
              json: {
                id: SPACE_ID,
                partners: [
                  { id: ACCOUNT_ID, displayName: 'Lea Sommer' },
                  { id: PARTNER_ID, displayName: 'Alex' },
                ],
              },
            });
          if (path === `/api/v1/spaces/${SPACE_ID}/memories`) {
            if (request.method() === 'POST') {
              const snapshot = request.postDataJSON();
              const identity = request.headers()['idempotency-key'];
              expect(identity).toBeTruthy();
              const previous = identities.get(identity);
              const note =
                previous ??
                ({
                  ...snapshot,
                  id: `experience-${snapshot.experienceKind.toLowerCase()}`,
                  spaceId: SPACE_ID,
                  authorId: actor,
                  author: {
                    id: actor,
                    displayName: asPartner ? 'Alex' : 'Lea Sommer',
                  },
                  createdAt: '2026-11-01T09:00:00Z',
                  updatedAt: '2026-11-01T09:00:00Z',
                  version: 1,
                  tags: [],
                  attachments: [],
                  capabilities: {
                    canEdit: true,
                    canDelete: true,
                    canComment: true,
                  },
                } as Note);
              if (!previous) {
                notes.push(note);
                identities.set(identity, note);
              }
              if (loseFirstResponse) {
                loseFirstResponse = false;
                return route.abort('failed');
              }
              return route.fulfill({
                status: previous ? 200 : 201,
                json: note,
                headers: { ETag: '"1"' },
              });
            }
            return route.fulfill({
              json: {
                items: notes.filter(
                  (note) =>
                    note.experienceKind ===
                    url.searchParams.get('experienceKind'),
                ),
                hasMore: false,
                nextCursor: null,
              },
            });
          }
          if (path.includes('/profiles/'))
            return route.fulfill({
              json: {
                accountId: path.split('/').at(-1),
                id: 'profile-test',
                displayName: path.endsWith(ACCOUNT_ID) ? 'Lea Sommer' : 'Alex',
                birthday: null,
                preferences: [],
                profileAttachmentId: null,
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
                version: 1,
              },
            });
          if (path.endsWith('/configuration'))
            return route.fulfill({
              json: {
                spaceId: SPACE_ID,
                version: 1,
                canManageSpaceConfiguration: true,
                dailyQuestionsEnabled: false,
                energyCheckInEnabled: false,
                vibeCheckEnabled: false,
                sharedAchievementsEnabled: false,
                loveNotesEnabled: false,
                supportGesturesEnabled: false,
                energyVisibilityMode: 'SHARED',
                vibeVisibilityMode: 'SHARED',
                dailyContextTimezone: 'Europe/Berlin',
              },
            });
          if (path.endsWith('/dashboard/preferences'))
            return route.fulfill({ json: { items: [] } });
          if (path.endsWith('/activity'))
            return route.fulfill({
              json: { items: [], hasMore: false, nextCursor: null },
            });
          const note = notes.find(
            (note) => path === `/api/v1/spaces/${SPACE_ID}/memories/${note.id}`,
          );
          if (note)
            return route.fulfill({
              json: {
                ...note,
                capabilities: {
                  canEdit: actor === note.authorId,
                  canDelete: actor === note.authorId,
                  canComment: true,
                },
              },
              headers: { ETag: '"1"' },
            });
          if (
            path.includes('/memories/experience-') &&
            path.endsWith('/comments')
          )
            return route.fulfill({
              json: { items: [], hasMore: false, nextCursor: null },
            });
          if (path === `/api/v1/spaces/${SPACE_ID}/dashboard`) {
            const incoming = notes
              .filter((note) => note.authorId !== actor)
              .at(-1);
            return route.fulfill({
              json: {
                space: {
                  spaceId: SPACE_ID,
                  partner: {
                    id: asPartner ? ACCOUNT_ID : PARTNER_ID,
                    displayName: asPartner ? 'Lea Sommer' : 'Alex',
                  },
                },
                relationshipDuration: {
                  startedOn: '2023-07-04',
                  daysTogether: 1216,
                  displayMode: 'DAYS',
                },
                retrospective: null,
                keepsake: incoming
                  ? {
                      type: 'MEMORY',
                      id: incoming.id,
                      titleOrText: incoming.title,
                      occurredOn: incoming.happenedOn,
                    }
                  : null,
                upcoming: [],
                recentShared: notes.map((note) => ({
                  type: 'MEMORY',
                  id: note.id,
                  titleOrText: note.body,
                  createdAt: note.createdAt,
                  occurredOn: note.happenedOn,
                })),
                sharedStorySummary: {
                  memories: notes.length,
                  heartMoments: 0,
                  milestones: 0,
                },
                thinkingOfYouAvailableAt: null,
                viewerLocalDate: '2026-11-01',
                incomingExperience: incoming
                  ? {
                      id: incoming.id,
                      kind: incoming.experienceKind,
                      text: incoming.body,
                      authorId: incoming.authorId,
                      happenedOn: incoming.happenedOn,
                      createdAt: incoming.createdAt,
                    }
                  : null,
              },
            });
          }
          return route.fallback();
        });
      }
      await installMocks(page);
      await installExperienceRoutes(page);
      await signIn(page);
      const partnerContext = await browser.newContext();
      const partnerPage = await partnerContext.newPage();
      await installMocks(partnerPage, { asPartner: true });
      await installExperienceRoutes(partnerPage, true);
      try {
        const base =
          kind === 'happiness' ? '/story/happiness' : '/story/time-travel';
        await page.goto('/story', { waitUntil: 'domcontentloaded' });
        await page
          .getByRole('link', {
            name: new RegExp(experienceCopy.entries[kind].title),
          })
          .click();
        await expect(page).toHaveURL(new RegExp(base + '$'));
        await page
          .getByRole('link', { name: experienceCopy.create[kind] })
          .click();
        await expect(page).toHaveURL(new RegExp(base + '/new$'));
        await expect(page.locator('[data-focused-task="true"]')).toBeVisible();
        const words =
          kind === 'happiness'
            ? 'Your laughter at breakfast made my day brighter.'
            : 'Do you remember laughing together in the rain by the lake?';
        await page
          .getByRole('textbox', { name: experienceCopy.write[kind] })
          .fill(words);
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        await page.addStyleTag({
          content: `html { font-size: ${width === 320 ? '200%' : '100%'}; }`,
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await captureScreenshot(
          page,
          info,
          `${kind}-compose-${width}-${theme}.png`,
          { fullPage: true },
        );
        const composerAxe = await new AxeBuilder({ page })
          .include('.memory-task-page')
          .analyze();
        expect(composerAxe.violations).toEqual([]);
        await page
          .getByRole('button', {
            name: experienceCopy.share.replace('{{name}}', 'Alex'),
          })
          .click();
        if (kind === 'happiness')
          await page
            .getByRole('button', { name: taskCopy.verify, exact: true })
            .click();
        await expect(page).toHaveURL(new RegExp('/story/memories/experience-'));
        await expect(page.getByText(words, { exact: true })).toBeVisible();
        expect(
          notes.filter(
            (note) =>
              note.experienceKind ===
              (kind === 'happiness' ? 'HAPPINESS' : 'TIME_TRAVEL'),
          ),
        ).toHaveLength(1);
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await expect(
          page
            .locator('.couple-experience-history-entry')
            .filter({ hasText: words }),
        ).toBeVisible();
        await signIn(partnerPage);
        await partnerPage.goto('/today', { waitUntil: 'domcontentloaded' });
        const reveal = partnerPage.locator('.shared-experience-reveal');
        await expect(reveal.getByText(words, { exact: true })).toBeVisible();
        await partnerPage.setViewportSize({ width, height: 900 });
        await partnerPage.emulateMedia({
          colorScheme: theme,
          reducedMotion: width === 430 ? 'no-preference' : 'reduce',
        });
        await partnerPage.addStyleTag({
          content: `html { font-size: ${width === 320 ? '200%' : '100%'}; }`,
        });
        await expect(reveal).toHaveCSS(
          'animation-name',
          width === 430 ? 'experience-note-enter' : 'none',
        );
        expect(
          await partnerPage.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await captureScreenshot(
          partnerPage,
          info,
          `${kind}-incoming-${width}-${theme}.png`,
          { fullPage: true },
        );
        const receiverAxe = await new AxeBuilder({ page: partnerPage })
          .include('.today-page')
          .analyze();
        expect(receiverAxe.violations).toEqual([]);
        await reveal
          .getByRole('link', { name: experienceCopy.incoming.open })
          .click();
        await expect(
          partnerPage.getByText(words, { exact: true }),
        ).toBeVisible();
        await partnerPage.goBack();
        await expect(partnerPage).toHaveURL(/\/today$/);
        await expect(
          partnerPage.locator('.shared-experience-words'),
        ).toHaveText(words);
      } finally {
        await partnerContext.close();
      }
    });
  }
}

test('dated plan hands off an RFC calendar file without changing the plan', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page);
  await page.route(
    `**/api/v1/spaces/${SPACE_ID}/plans/calendar-plan`,
    (route) =>
      route.fulfill({
        json: {
          id: 'calendar-plan',
          spaceId: SPACE_ID,
          title: 'Weekend at the lake',
          description: 'A quiet day',
          status: 'PLANNED',
          plannedOn: '2026-11-14',
          plannedStart: null,
          plannedEnd: null,
          placeId: null,
          sourceWishId: null,
          createdBy: ACCOUNT_ID,
          creator: { id: ACCOUNT_ID, displayName: 'Lea' },
          createdAt: '2026-10-30T10:00:00Z',
          updatedAt: '2026-10-31T10:00:00Z',
          version: 1,
          capabilities: { canEdit: true, canDelete: true, canComment: false },
        },
      }),
  );
  await signIn(page);
  await page.goto('/plan/plans/calendar-plan');
  await expect(
    page.getByRole('link', { name: calendarCopy.add }),
  ).toBeVisible();
  const calendar = await page
    .getByRole('link', { name: calendarCopy.add })
    .getAttribute('href');
  const content = await page.evaluate(
    async (url) => await (await fetch(url ?? '')).text(),
    calendar,
  );
  expect(content).toContain('DTSTART;VALUE=DATE:20261114');
  expect(content).toContain('DTEND;VALUE=DATE:20261115');
  expect(content).toContain('SUMMARY:Weekend at the lake');
  await captureScreenshot(page, info, 'calendar-plan-390-light.png', {
    fullPage: true,
  });
});

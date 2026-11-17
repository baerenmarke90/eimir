import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { recapDetailPath } from '../../src/client/routes';
import de from '../../src/i18n/locales/de';
import navigation from '../../src/i18n/locales/navigation';
import copy from '../../src/i18n/locales/recaps';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import taskSheets from '../../src/i18n/locales/taskSheets';
import fixtures from '../fixtures/locales/de';
import AxeBuilder from '../support/axe';
import { fulfillDefaultProductContext } from '../support/productContext';

const fixtureCopy = fixtures.recaps;

import { installNativeAppLifecycle } from '../support/nativeAppLifecycle';
import {
  ACCOUNT_ID,
  captureScreenshot,
  getTimelineItems,
  installMocks,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

/** Fill the `{{name}}` placeholders of a localised string. */
const fill = (text: string, values: Record<string, number | string>) =>
  Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{{${name}}}`, String(value)),
    text,
  );
const BASE = `/api/v1/spaces/${SPACE_ID}/recaps`;
const PHOTO = readFileSync(
  fileURLToPath(new URL('../fixtures/recap-lake.webp', import.meta.url)),
);
const VARIANTS = Object.fromEntries(
  ['dusk', 'warm', 'detail', 'mono'].map((name) => [
    `recap-photo-${name}`,
    readFileSync(
      fileURLToPath(
        new URL(`../fixtures/recap-lake-${name}.webp`, import.meta.url),
      ),
    ),
  ]),
);
const source = (id: string, title: string, kind = 'MEMORY') => ({
  key: `${kind}:${id}`,
  id,
  kind,
  occurredOn: '2026-10-17',
  version: 1,
  title,
  excerpt: fixtureCopy.excerpt,
  previewAttachmentId: kind === 'MEMORY' ? 'recap-photo' : null,
  previewIsSensitive: false,
  available: true,
});
const initial = (id = 'october', year = false) => ({
  id,
  kind: year ? 'YEAR' : 'MONTH',
  year: 2026,
  month: year ? 0 : 10,
  variant: 0,
  version: 1,
  startsOn: year ? '2026-01-01' : '2026-10-01',
  throughOn: '2026-10-30',
  isPartial: true,
  status: 'READY',
  theme: 'MOMENTS',
  generatedAt: '2026-10-30T10:00:00Z',
  savedAt: null as string | null,
  locale: 'de-DE',
  headline: year ? fixtureCopy.yearHeadline : fixtureCopy.monthHeadline,
  introduction: fixtureCopy.introduction,
  sources: [
    source('mem-canal', fixtureCopy.photoTitle),
    source('heart-coffee', fixtureCopy.wordsTitle, 'HEART_MOMENT'),
  ],
  reflections: [] as {
    id: string;
    ownerId: string;
    displayName: string;
    text: string;
    version: number;
  }[],
  ownDraft: null as { text: string; version: number } | null,
});
/** A full month: eight mixed highlights and server-counted facts. */
function denseSources() {
  const copy = fixtureCopy.dense;
  const entry = (
    id: string,
    kind: string,
    day: string,
    title: string,
    excerpt: string | null,
    photo: string | null,
  ) => ({
    key: `${kind}:${id}`,
    id,
    kind,
    occurredOn: `2026-10-${day}`,
    version: 1,
    title,
    excerpt,
    previewAttachmentId: photo,
    previewIsSensitive: false,
    available: true,
  });
  return [
    entry(
      'mem-canal',
      'MEMORY',
      '03',
      fixtureCopy.photoTitle,
      fixtureCopy.excerpt,
      'recap-photo',
    ),
    entry(
      'heart-coffee',
      'HEART_MOMENT',
      '06',
      fixtureCopy.wordsTitle,
      fixtureCopy.wordsTitle,
      null,
    ),
    entry(
      'plan-market',
      'PLAN',
      '10',
      copy.market,
      copy.marketText,
      'recap-photo-warm',
    ),
    entry(
      'mem-breakfast',
      'MEMORY',
      '12',
      copy.breakfast,
      copy.breakfastText,
      'recap-photo-detail',
    ),
    entry('mile-key', 'MILESTONE', '15', copy.key, copy.keyText, null),
    entry(
      'mem-jetty',
      'MEMORY',
      '17',
      copy.jetty,
      copy.jettyText,
      'recap-photo-dusk',
    ),
    entry('heart-thanks', 'HEART_MOMENT', '22', copy.thanks, copy.thanks, null),
    entry(
      'chapter-autumn',
      'CHAPTER',
      '01',
      copy.chapter,
      copy.chapterText,
      null,
    ),
  ];
}
/** A monthly film (#1744): curated media, Places, answers, tags and a frozen look. */
function filmMonth() {
  const words = fixtureCopy.film;
  const picture = (attachmentId: string, parentId: string) => ({
    attachmentId,
    parentId,
    kind: 'IMAGE',
  });
  const sources = denseSources().map((entry) => {
    const extra: Record<string, unknown> = {
      media: entry.previewAttachmentId
        ? [picture(entry.previewAttachmentId, entry.id)]
        : [],
      answers: [],
      placeName: null,
    };
    if (entry.id === 'mem-canal') extra.placeName = words.lake;
    if (entry.id === 'plan-market') extra.placeName = words.oldTown;
    if (entry.id === 'mem-jetty')
      extra.media = [
        picture('recap-photo-dusk', entry.id),
        picture('recap-photo-mono', entry.id),
        picture('recap-photo', entry.id),
      ];
    if (entry.id === 'mem-breakfast')
      Object.assign(extra, {
        title: words.question,
        answers: [
          { text: words.answerA, authorId: ACCOUNT_ID, authorName: 'Anna' },
          { text: words.answerB, authorId: 'partner', authorName: 'Ben' },
        ],
      });
    return { ...entry, ...extra };
  });
  return {
    sources,
    facts: DENSE_FACTS,
    film: {
      mood: 'rose',
      transitions: ['iris', 'slide'],
      cover: 'mosaic',
      motions: ['drift-left', 'zoom-in', 'parallax'],
      layouts: {
        photo: ['polaroid', 'bleed', 'split', 'inset', 'tilted'],
        duo: ['overlap', 'stacked', 'side'],
        words: ['letter', 'centered', 'lines', 'on-photo'],
        title: ['stamp', 'band', 'outline'],
        answers: ['dialog', 'stacked'],
        place: ['marker', 'list'],
        fact: ['large', 'row'],
      },
      highlightKey: 'MEMORY:mem-jetty',
      tags: words.tags.map((label, index) => ({ label, count: 5 - index })),
    },
  };
}
/** A year film (#1744): ten month chapters, three firsts, tags and a frozen look. */
function filmYear() {
  const words = fixtureCopy.yearFilm;
  const photos = [
    'recap-photo',
    'recap-photo-dusk',
    'recap-photo-warm',
    'recap-photo-detail',
    'recap-photo-mono',
  ];
  const day = (month: number, value: number) =>
    `2026-${String(month).padStart(2, '0')}-${String(value).padStart(2, '0')}`;
  const picture = (attachmentId: string, parentId: string) => ({
    attachmentId,
    parentId,
    kind: 'IMAGE',
  });
  const sources: Record<string, unknown>[] = [];
  const monthHighlights: { month: number; key: string }[] = [];
  words.highlights.forEach((title, index) => {
    const month = index + 1;
    const id = `year-top-${month}`;
    const photo = photos[index % photos.length];
    const place = [7, 5, 4].indexOf(month);
    sources.push({
      key: `MEMORY:${id}`,
      id,
      kind: 'MEMORY',
      occurredOn: day(month, 6),
      version: 1,
      title,
      excerpt: null,
      previewAttachmentId: photo,
      previewIsSensitive: false,
      available: true,
      media:
        month === 7
          ? [picture(photo, id), picture(photos[(index + 1) % 5], id)]
          : [picture(photo, id)],
      answers: [],
      placeName: place >= 0 ? words.places[place] : null,
    });
    monthHighlights.push({ month, key: `MEMORY:${id}` });
    const further = words.further[index];
    const heart = further.endsWith('.');
    const furtherId = `year-more-${month}`;
    const furtherPhoto =
      !heart && index % 3 === 0 ? photos[(index + 2) % 5] : null;
    sources.push({
      key: `${heart ? 'HEART_MOMENT' : 'MEMORY'}:${furtherId}`,
      id: furtherId,
      kind: heart ? 'HEART_MOMENT' : 'MEMORY',
      occurredOn: day(month, 19),
      version: 1,
      title: further,
      excerpt: heart ? further : null,
      previewAttachmentId: furtherPhoto,
      previewIsSensitive: false,
      available: true,
      media: furtherPhoto ? [picture(furtherPhoto, furtherId)] : [],
      answers: [],
      placeName: null,
    });
  });
  words.firsts.forEach((title, index) => {
    const id = `year-first-${index}`;
    sources.push({
      key: `MILESTONE:${id}`,
      id,
      kind: 'MILESTONE',
      occurredOn: day(2 + index * 3, 11),
      version: 1,
      title,
      excerpt: null,
      previewAttachmentId: null,
      previewIsSensitive: false,
      available: true,
      media: [],
      answers: [],
      placeName: null,
    });
  });
  sources.sort((left, right) =>
    String(left.occurredOn).localeCompare(String(right.occurredOn)),
  );
  return {
    sources,
    facts: {
      ...DENSE_FACTS,
      memories: 18,
      heartMoments: 2,
      milestones: 3,
      activeDays: 23,
    },
    film: {
      mood: 'sage',
      transitions: ['rise', 'wipe'],
      cover: 'mosaic',
      motions: ['zoom-out', 'drift-right', 'parallax'],
      layouts: {
        photo: ['inset', 'bleed', 'polaroid', 'split', 'tilted'],
        duo: ['side', 'overlap', 'stacked'],
        words: ['centered', 'letter', 'lines', 'on-photo'],
        title: ['band', 'stamp', 'outline'],
        answers: ['stacked', 'dialog'],
        place: ['list', 'marker'],
        fact: ['large', 'row'],
      },
      highlightKey: 'MEMORY:year-top-7',
      monthHighlights,
      tags: words.tags.map((label, index) => ({ label, count: 9 - index })),
    },
  };
}
const DENSE_FACTS = {
  memories: 11,
  heartMoments: 6,
  milestones: 1,
  chapters: 1,
  plans: 3,
  activeDays: 14,
  busiestMonth: null,
};
async function setup(
  page: Page,
  options: {
    pro?: boolean;
    fail?: boolean;
    empty?: boolean;
    pending?: boolean;
    start?: 'wir' | 'library' | 'momente';
    hideMonthly?: boolean;
    dense?: boolean;
    ownWords?: boolean;
    rhythm?: boolean;
    native?: boolean;
    earlier?: boolean;
    film?: boolean;
    yearFilm?: boolean;
  } = {},
) {
  // The API fixture's current day and the system clock share one timeline.
  await page.clock.setFixedTime(new Date('2026-10-30T12:00:00Z'));
  await page.addInitScript(
    ({ account, space }) =>
      localStorage.setItem(`eimir:product-tour:v1:${account}:${space}`, 'seen'),
    { account: ACCOUNT_ID, space: SPACE_ID },
  );
  if (options.native) await installNativeAppLifecycle(page);
  const unexpected = await installMocks(page);
  const month = initial();
  const year = initial('year', true);
  const september = {
    ...initial('september'),
    month: 9,
    startsOn: '2026-09-01',
    throughOn: '2026-09-30',
    isPartial: false,
    savedAt: '2026-10-08T03:00:00Z',
    headline: fixtureCopy.previousHeadline,
  };
  const august = {
    ...initial('august'),
    month: 8,
    startsOn: '2026-08-01',
    throughOn: '2026-08-31',
    isPartial: false,
    headline: fixtureCopy.previousHeadline,
    sources: [
      {
        ...source('mem-canal', fixtureCopy.photoTitle),
        previewIsSensitive: true,
      },
    ],
  };
  if (options.dense && options.ownWords) {
    const words = fixtureCopy.ownWords;
    const decorate = (sources: ReturnType<typeof denseSources>) =>
      sources.map((entry) =>
        entry.id === 'mem-canal'
          ? {
              ...entry,
              quote: {
                text: words.photoQuote,
                authorId: 'partner',
                authorName: 'Ben',
              },
            }
          : entry.id === 'mem-breakfast'
            ? { ...entry, mutualReaction: 'LOVE' }
            : entry.id === 'heart-thanks'
              ? {
                  ...entry,
                  quote: {
                    text: words.wordsQuote,
                    authorId: 'partner',
                    authorName: 'Anna',
                  },
                }
              : entry,
      );
    month.sources = decorate(denseSources()) as typeof month.sources;
  }
  if (options.dense)
    Object.assign(month, {
      sources: options.ownWords ? month.sources : denseSources(),
      facts: DENSE_FACTS,
      headline: fixtureCopy.dense.headline,
      introduction: fixtureCopy.dense.introduction,
    });
  if (options.dense && options.rhythm)
    Object.assign(month, {
      mood: {
        buckets: [
          { index: 1, mutualDays: 4, goodDays: 3 },
          { index: 2, mutualDays: 3, goodDays: 2 },
          { index: 3, mutualDays: 4, goodDays: 4 },
          { index: 4, mutualDays: 0, goodDays: 0 },
          { index: 5, mutualDays: 0, goodDays: 0 },
        ],
        leading: 3,
      },
    });
  if (options.film) Object.assign(month, filmMonth());
  if (options.yearFilm) Object.assign(year, filmYear());
  if (options.empty) {
    month.sources = [];
    month.status = 'EMPTY';
    month.headline = '';
  }
  if (options.pending) month.status = 'PENDING';
  let fail = options.fail === true;
  let writes = 0;
  let prepares = 0;
  let earlierReady = false;
  let deniedOverview = false;
  let overviewReads = 0;
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultProductContext(route)) return;
    const req = route.request(),
      path = new URL(req.url()).pathname,
      method = req.method();
    if (path === BASE && method === 'GET') {
      overviewReads++;
      if (deniedOverview)
        return route.fulfill({
          status: 403,
          json: { title: 'Access denied', status: 403 },
        });
      return route.fulfill({
        json: {
          canCompose: options.pro !== false,
          editions: [month, september, ...(earlierReady ? [august] : []), year],
          periods: options.earlier
            ? [
                ...(earlierReady
                  ? []
                  : [{ kind: 'MONTH', year: 2026, month: 8 }]),
                { kind: 'MONTH', year: 2026, month: 7 },
                { kind: 'YEAR', year: 2025, month: 0 },
              ]
            : [],
          hasMore: false,
        },
      });
    }
    if (
      options.start === 'wir' &&
      path.endsWith('/dashboard') &&
      method === 'GET'
    ) {
      return route.fulfill({
        json: {
          space: {
            spaceId: SPACE_ID,
            partner: { id: 'partner', displayName: 'Alex' },
          },
          viewerLocalDate: '2026-10-30',
          relationshipDuration: null,
          keepsake: null,
          recentShared: [
            {
              id: 'heart-coffee',
              type: 'HEART_MOMENT',
              titleOrText: fixtureCopy.wordsTitle,
              occurredOn: '2026-10-17',
              createdAt: null,
              scheduledAt: null,
              previewAttachmentId: null,
              previewIsSensitive: false,
            },
          ],
          upcoming: [],
          retrospective: null,
          thinkingOfYouAvailableAt: null,
          sharedStorySummary: { memories: 2, heartMoments: 1, milestones: 0 },
        },
      });
    }
    // Momente reads the same viewer day as Wir, so its Discover selection and
    // Dashboard day follow this spec's clock instead of the shared fixture.
    if (
      options.start === 'momente' &&
      path.endsWith('/dashboard') &&
      method === 'GET'
    ) {
      return route.fulfill({
        json: {
          space: {
            spaceId: SPACE_ID,
            partner: { id: 'partner', displayName: 'Alex' },
          },
          viewerLocalDate: '2026-10-30',
          relationshipDuration: null,
          recentShared: [],
          upcoming: [],
          retrospective: null,
        },
      });
    }
    if (
      options.start === 'momente' &&
      path.endsWith('/discover') &&
      method === 'GET'
    ) {
      const items = getTimelineItems();
      return route.fulfill({
        json: {
          selectionDate: '2026-10-30',
          lead: items[0] ?? null,
          items: items.slice(1),
          leadContext: null,
        },
      });
    }
    if (
      options.start === 'wir' &&
      path.endsWith('/activity') &&
      method === 'GET'
    ) {
      return route.fulfill({
        json: { items: [], hasMore: false, nextCursor: null },
      });
    }
    if (
      options.start === 'wir' &&
      path.endsWith('/dashboard/preferences') &&
      method === 'GET'
    ) {
      return route.fulfill({
        json: {
          items: options.hideMonthly
            ? [
                {
                  moduleKey: 'monthly_highlights',
                  visible: false,
                  position: 5,
                  selectedCollectionId: null,
                  upcomingLimit: null,
                },
              ]
            : [],
        },
      });
    }
    if (path === `${BASE}/prepare`) {
      prepares++;
      return route.fulfill({ status: 202, body: 'null' });
    }
    if (path.startsWith(BASE) && method === 'GET') {
      if (path.endsWith('/selection'))
        return route.fulfill({
          json: {
            items: month.sources,
            selectedKeys: month.sources.map((item) => item.key),
          },
        });
      const edition = [month, september, august, year].find(
        ({ id }) => path === `${BASE}/${id}`,
      );
      if (edition) return route.fulfill({ json: edition });
    }
    if (path.startsWith(BASE) && ['PUT', 'POST', 'DELETE'].includes(method)) {
      writes++;
      if (fail)
        return route.fulfill({
          status: 409,
          json: { title: 'Changed', status: 409, code: 'VERSION_CONFLICT' },
        });
      if (path.endsWith('/reflection')) {
        if (method === 'DELETE') {
          month.reflections = [];
          return route.fulfill({ status: 204 });
        }
        const body = req.postDataJSON();
        if (body.shared)
          month.reflections = [
            {
              id: 'words',
              ownerId: ACCOUNT_ID,
              displayName: 'Lea',
              text: body.text,
              version: 1,
            },
          ];
        else month.ownDraft = { text: body.text, version: 1 };
      }
      if (path.endsWith('/selection')) {
        expect(req.headers()['if-match']).toBe('"1"');
        const selected = req.postDataJSON().sourceKeys;
        month.sources = month.sources.filter((item) =>
          selected.includes(item.key),
        );
        month.version++;
      }
      return route.fulfill({ json: month });
    }
    if (path.endsWith('/entitlements'))
      return route.fulfill({
        json: {
          spaceId: SPACE_ID,
          tier: options.pro === false ? 'FREE' : 'PREMIUM',
          status: 'ACTIVE',
          effectiveUntil: null,
          isInGracePeriod: false,
          capabilities: options.pro === false ? [] : ['relationship.passport'],
        },
      });
    if (path.endsWith('/relationship-passport'))
      return route.fulfill({
        json: {
          partner: { id: 'partner', displayName: 'Alex' },
          relationshipDuration: null,
          memories: 2,
          heartMoments: 1,
          milestones: 0,
          completedPlans: 0,
          places: 0,
        },
      });
    if (path.includes('/attachments/') && path.endsWith('/content'))
      return route.fulfill({
        contentType: 'image/webp',
        body: VARIANTS[path.split('/attachments/')[1].split('/')[0]] ?? PHOTO,
      });
    return route.fallback();
  });
  await signIn(page);
  const state = {
    unexpected,
    allow: () => {
      fail = false;
    },
    writes: () => writes,
    prepares: () => prepares,
    finalise: () => {
      Object.assign(month, {
        savedAt: '2026-11-08T03:00:00Z',
        isPartial: false,
        throughOn: '2026-10-31',
        version: month.version + 1,
      });
    },
    finishEarlier: () => {
      earlierReady = true;
    },
    overviewReads: () => overviewReads,
    denyOverview: () => {
      deniedOverview = true;
    },
  };
  if (options.start === 'momente') {
    await page
      .locator(
        '.mobile-bottom-nav a[href="/story"], .shell-nav a[href="/story"]',
      )
      .filter({ visible: true })
      .click();
    await expect(page.locator('.momente-discover-page')).toBeVisible();
    return state;
  }
  if (options.start === 'wir') {
    await page
      .locator(
        '.mobile-bottom-nav a[href="/today"], .shell-nav a[href="/today"]',
      )
      .filter({ visible: true })
      .click();
    await expect(page.locator('.today-content')).toBeVisible();
    return state;
  }
  await page
    .locator('.mobile-bottom-nav a[href="/more"], .shell-nav a[href="/more"]')
    .filter({ visible: true })
    .click();
  // #1790 E1: Mehr opens years and recaps together; the years index leads on.
  await page
    .getByRole('link', {
      name: de.more.destinations.yearsAndRecaps,
      exact: true,
    })
    .click();
  await page
    .getByRole('link', { name: new RegExp(de.storyYears.recapsEntryTitle) })
    .click();
  await expect(
    page.getByRole('heading', { name: copy.shortTitle }),
  ).toBeVisible();
  return state;
}

for (const [width, theme] of [
  [360, 'light'],
  [390, 'dark'],
  [430, 'light'],
  [1280, 'dark'],
] as const) {
  test(`monthly Wir invitation at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(
      (value) => localStorage.setItem('eimir-theme', value),
      theme,
    );
    const state = await setup(page, { start: 'wir', pro: false });
    const invitation = page.locator('.monthly-recap-invitation');
    await expect(
      page.getByRole('link', { name: copy.allRecaps, exact: true }),
    ).toHaveCount(0);
    await expect(
      invitation.getByRole('link', { name: new RegExp(copy.watchNow) }),
    ).toBeVisible();
    await expect(invitation).toContainText(
      new Intl.DateTimeFormat('de-DE', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date('2026-10-01')),
    );
    await expect(invitation.locator('p')).toContainText(
      copy.partial.split('·')[1].trim(),
    );
    await expect(invitation.locator('img')).toBeVisible();
    await invitation
      .locator('img')
      .evaluate((img: HTMLImageElement) => img.decode());
    await captureScreenshot(page, info, `recaps-wir-${width}-${theme}.png`, {
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).include('.monthly-recap-entry').analyze())
        .violations,
    ).toEqual([]);
    expect(state.prepares()).toBe(0);
    expect(state.writes()).toBe(0);
    expect(state.unexpected).toEqual([]);
  });
}

test('Watch now advances automatically, resumes after a source, and finishes without looping', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install();
  const state = await setup(page, { start: 'wir', pro: false });
  const reader = page.locator('.recap-reader');
  const heading = page.locator('.recap-spread h1');
  async function advanceSpread(title: string) {
    await expect(heading).toHaveText(title);
    await expect(reader).toHaveAttribute('data-playing', 'true');
    const dwell = await reader.evaluate((element) =>
      Number.parseFloat(
        getComputedStyle(element).getPropertyValue('--recap-dwell'),
      ),
    );
    expect(Number.isFinite(dwell) && dwell > 0).toBe(true);
    // Run the current spread's reading time after its committed content is ready.
    // A fast-forward jump models suspension and can outrun the next timer's setup.
    await page.clock.runFor(dwell + 1);
  }
  await page.getByRole('link', { name: new RegExp(copy.watchNow) }).click();
  await expect(page).toHaveURL(/\/story\/recaps\/october$/);
  await expect(page.locator('.recap-reader')).toHaveAttribute(
    'data-playing',
    'true',
  );
  await reader
    .getByRole('button', { name: copy.pause, exact: true })
    .press('Space');
  await expect(reader).toHaveAttribute('data-playing', 'false');
  await reader
    .getByRole('button', { name: copy.play, exact: true })
    .press('Enter');
  await advanceSpread(fixtureCopy.monthHeadline);
  await expect(page).toHaveURL(/page=1/);
  await page.getByRole('link', { name: new RegExp(copy.source) }).click();
  await page
    .getByRole('button', { name: new RegExp(taskBoundary.back) })
    .first()
    .click();
  await expect(page).toHaveURL(/\/story\/recaps\/october\?page=1/);
  // Like a photo memory, playback resumes on the restored page after a source.
  await advanceSpread(fixtureCopy.photoTitle);
  await expect(page).toHaveURL(/page=2/);
  await expect(
    page.getByRole('button', { name: copy.pause, exact: true }),
  ).toBeVisible();
  await advanceSpread(fixtureCopy.wordsTitle);
  await expect(page.locator('.recap-spread h1')).toHaveText(copy.finishTitle);
  await expect(
    page.getByRole('button', { name: copy.replay, exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(90001);
  await expect(page.locator('.recap-spread h1')).toHaveText(copy.finishTitle);
  await page.locator('.recap-reader-top .task-back-control').click();
  await expect(page).toHaveURL(/\/today$/);
  expect(state.prepares()).toBe(0);
  expect(state.unexpected).toEqual([]);
});

test('reduced motion opens Watch now paused and playback pauses for editing', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.clock.install();
  await setup(page, { start: 'wir', pro: true });
  await page.getByRole('link', { name: new RegExp(copy.watchNow) }).click();
  await expect(
    page.getByRole('button', { name: copy.play, exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(90001);
  await expect(page).not.toHaveURL(/page=/);
  await page.getByRole('button', { name: copy.play, exact: true }).click();
  await page.clock.fastForward(90001);
  await expect(page).toHaveURL(/page=1/);
  await page.getByRole('button', { name: copy.ownWords, exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: copy.reflectionLabel }),
  ).toBeVisible();
  await expect(page.locator('.recap-reader')).toHaveAttribute(
    'data-playing',
    'false',
  );
  await page.clock.fastForward(90001);
  await expect(page).toHaveURL(/page=1/);
  await page
    .getByRole('button', { name: taskSheets.close, exact: true })
    .click();
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  // On a photo the toggle is an icon on the picture; large text must keep it
  // inside the stage and above the caption.
  const toggleClearsCaption = await page
    .locator('.recap-spread .recap-playback-overlay')
    .evaluate((button) => {
      const box = button.getBoundingClientRect();
      const spread = button.closest('.recap-spread')!;
      const stage = spread.getBoundingClientRect();
      const caption = spread
        .querySelector('.recap-scene-copy')!
        .getBoundingClientRect();
      return (
        box.left >= stage.left &&
        box.right <= stage.right &&
        box.top >= stage.top &&
        box.bottom <= caption.top
      );
    });
  expect(toggleClearsCaption).toBe(true);
  const controlsDoNotOverlap = await page
    .locator('.recap-page-controls button')
    .evaluateAll((buttons) => {
      const boxes = buttons.map((button) => button.getBoundingClientRect());
      return boxes.every((a, i) =>
        boxes
          .slice(i + 1)
          .every(
            (b) =>
              a.right <= b.left ||
              b.right <= a.left ||
              a.bottom <= b.top ||
              b.bottom <= a.top,
          ),
      );
    });
  expect(controlsDoNotOverlap).toBe(true);
  await page.getByRole('button', { name: copy.play, exact: true }).focus();
  // Capture the full reading surface from its top after the focus-induced scroll.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await captureScreenshot(
    page,
    info,
    'recaps-playback-360-dark-large-reduced.png',
    { fullPage: true },
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('hidden monthly highlights do not request or reveal a recap invitation', async ({
  page,
}) => {
  const state = await setup(page, { start: 'wir', hideMonthly: true });
  await expect(page.locator('.today-content')).toBeVisible();
  await expect(page.locator('.monthly-recap-entry')).toHaveCount(0);
  expect(state.overviewReads()).toBe(0);
});

test('an authoritative overview denial removes a previously visible recap cover', async ({
  page,
}) => {
  const state = await setup(page, { start: 'wir' });
  await expect(page.locator('.monthly-recap-invitation')).toBeVisible();
  state.denyOverview();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  await expect(page.locator('.monthly-recap-invitation')).toHaveCount(0);
  await expect(page.locator('.monthly-recap-library-link')).toHaveCount(0);
});

for (const [width, theme] of [
  [360, 'light'],
  [390, 'light'],
  [430, 'dark'],
  [1280, 'light'],
  [1280, 'dark'],
] as const) {
  test(`library and reader at ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(
      (value) => localStorage.setItem('eimir-theme', value),
      theme,
    );
    const state = await setup(page);
    await expect
      .poll(() =>
        page
          .locator('.recap-cover-featured img')
          .evaluate(
            (img: HTMLImageElement) =>
              img.complete && img.naturalWidth === 1536,
          ),
      )
      .toBe(true);
    await captureScreenshot(
      page,
      info,
      `recaps-library-${width}-${theme}.png`,
      { fullPage: true },
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const libraryAxe = await new AxeBuilder({ page })
      .include('.recap-library')
      .analyze();
    expect(libraryAxe.violations).toEqual([]);
    await page.getByRole('tab', { name: copy.years }).click();
    await expect(
      page.getByRole('heading', { name: fixtureCopy.yearHeadline }),
    ).toBeVisible();
    await page.getByRole('tab', { name: copy.months }).click();
    await expect(
      page.getByRole('heading', { name: fixtureCopy.monthHeadline }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: new RegExp(copy.open) })
      .first()
      .click();
    await expect(page.locator('.recap-spread h1')).toHaveText(
      fixtureCopy.monthHeadline,
    );
    await expect(page.locator('.mobile-bottom-nav')).toBeHidden();
    const next = page.getByRole('button', { name: copy.next, exact: true });
    await expect(next).toHaveText(copy.next);
    await expect(
      page.getByRole('button', { name: copy.previous, exact: true }),
    ).toHaveText(copy.previous);
    await next.click();
    await expect(page.locator('.recap-spread h1')).toHaveText(
      fixtureCopy.photoTitle,
    );
    await expect
      .poll(() =>
        page
          .locator('.recap-scene-media img')
          .evaluate(
            (img: HTMLImageElement) =>
              img.complete && img.naturalWidth === 1536,
          ),
      )
      .toBe(true);
    await page
      .locator('.recap-scene-media img')
      .evaluate((img: HTMLImageElement) => img.decode());
    // Capture decoded media before the full-page frame; Chromium lazily paints blob images.
    await page
      .locator('.recap-scene-media')
      .screenshot({ path: info.outputPath('decoded-photo.png') });
    await captureScreenshot(page, info, `recaps-reader-${width}-${theme}.png`, {
      fullPage: true,
    });
    expect(
      (await new AxeBuilder({ page }).include('.recap-reader').analyze())
        .violations,
    ).toEqual([]);
    const original = page.getByRole('link', { name: copy.source });
    await expect(original).toHaveText(copy.source);
    await original.click();
    await expect(page).toHaveURL(/\/story\/memories\/mem-canal/);
    await page
      .getByRole('button', {
        name: new RegExp(taskBoundary.back),
        exact: false,
      })
      .first()
      .click();
    await expect(page).toHaveURL(/\/story\/recaps\/october\?page=1/);
    await expect(page.locator('.recap-spread h1')).toHaveText(
      fixtureCopy.photoTitle,
    );
    expect(state.prepares()).toBe(1);
    expect(state.unexpected).toEqual([]);
  });
}

test('selection, private draft, explicit sharing, automatic retention and withdrawal keep confirmed state', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await setup(page, { fail: true });
  await page
    .getByRole('link', { name: new RegExp(copy.open) })
    .first()
    .click();
  await page.getByRole('button', { name: copy.edit, exact: true }).click();
  const selection = page.getByRole('dialog');
  await selection.getByRole('checkbox').last().uncheck();
  await selection.getByRole('button', { name: copy.apply }).click();
  await expect(selection.getByRole('alert')).toContainText(copy.conflict);
  await expect(selection.getByRole('checkbox').last()).not.toBeChecked();
  state.allow();
  await selection.getByRole('button', { name: copy.reload }).click();
  await selection.getByRole('button', { name: copy.apply }).click();
  await expect(selection).toBeHidden();
  await page.getByRole('button', { name: copy.ownWords, exact: true }).click();
  const words = page.getByRole('dialog');
  await words.getByRole('textbox').fill(fixtureCopy.reflection);
  await words.getByRole('button', { name: copy.draft, exact: true }).click();
  await expect(words).toBeHidden();
  await page.getByRole('button', { name: copy.ownWords, exact: true }).click();
  await expect(words.getByRole('textbox')).toHaveValue(fixtureCopy.reflection);
  await words.getByRole('button', { name: copy.share, exact: true }).click();
  await expect(words).toBeHidden();
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await expect(page.locator('blockquote')).toContainText(
    fixtureCopy.reflection,
  );
  // Nothing has to be kept by hand: the server retains a completed period.
  state.finalise();
  await page.reload();
  await expect(page.getByText(copy.savedHelp)).toBeVisible();
  await expect(
    page.getByRole('button', { name: copy.edit, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: copy.ownWords, exact: true }).first(),
  ).toBeVisible();
  await captureScreenshot(page, info, 'recaps-saved-reflections.png', {
    fullPage: true,
  });
  await page.getByRole('button', { name: copy.withdraw, exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: copy.withdraw, exact: true })
    .click();
  await expect(page.locator('blockquote')).toHaveCount(0);
  expect(state.writes()).toBe(5);
});

test('Free reads retained editions without preparing or exposing composition', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await setup(page, { pro: false });
  const archive = page.getByRole('region', { name: copy.archive });
  await expect(
    page.locator('.recap-cover-featured .recap-period-note'),
  ).toHaveText(copy.partialThrough.replace('{{date}}', '30. Okt. 2026'));
  await expect(page.locator('.recap-archive ~ .recap-gate')).toContainText(
    copy.gateBody,
  );
  await archive
    .getByRole('heading')
    .evaluate((heading) => heading.scrollIntoView({ block: 'center' }));
  await captureScreenshot(page, info, 'recaps-retained-library-390-light.png');
  await archive.getByRole('link', { name: /^September 2026/ }).click();
  await expect(page).toHaveURL(/\/story\/recaps\/september$/);
  await expect(page.locator('.recap-spread h1')).toHaveText(
    fixtureCopy.previousHeadline,
  );
  await expect(page.getByRole('button', { name: copy.edit })).toHaveCount(0);
  expect(state.prepares()).toBe(0);
});

for (const theme of ['light', 'dark'] as const) {
  test(`earlier periods appear by themselves at 390 ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(
      (value) => localStorage.setItem('eimir-theme', value),
      theme,
    );
    const state = await setup(page, { earlier: true });
    const month = (value: number) =>
      new Intl.DateTimeFormat('de-DE', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(2026, value - 1, 1)));
    const preparing = page
      .getByRole('region', { name: copy.otherPeriods })
      .getByRole('listitem');
    await expect(preparing).toHaveCount(2);
    await expect(preparing.first()).toContainText(month(8));
    await expect(preparing.first()).toContainText(copy.preparing);
    await expect(preparing.last()).toContainText(month(7));
    // Nothing has to be requested per period any more.
    await expect(
      page.locator('#recap-library-panel').getByRole('button'),
    ).toHaveCount(0);
    await expect(preparing.getByRole('link')).toHaveCount(0);
    await captureScreenshot(
      page,
      info,
      `recaps-immersive-library-preparing-390-${theme}.png`,
      { fullPage: true },
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).include('.recap-library').analyze())
        .violations,
    ).toEqual([]);

    // The years shelf only carries its own waiting period.
    await page.getByRole('tab', { name: copy.years }).click();
    await expect(preparing).toHaveCount(1);
    await expect(preparing).toContainText('2025');
    state.finishEarlier();
    await page.getByRole('tab', { name: copy.months }).click();
    await expect(preparing).toHaveCount(1);
    await expect(preparing).toContainText(month(7));
    const augustEntry = page
      .getByRole('region', { name: copy.archive })
      .getByRole('link', { name: new RegExp(`^${month(8)}`) });
    await expect(augustEntry).toBeVisible();
    await expect(augustEntry.locator('.recap-archive-art')).toHaveCount(0);
    expect(state.prepares()).toBe(1);
    expect(state.writes()).toBe(0);
    expect(state.unexpected).toEqual([]);
  });
}

test('empty periods do not invent shared events', async ({ page }) => {
  await setup(page, { empty: true });
  await page
    .getByRole('region', { name: copy.otherPeriods })
    .getByRole('link', { name: new RegExp(copy.emptyTitle) })
    .click();
  await expect(page.getByText(copy.emptyBody)).toBeVisible();
  await expect(page.locator('.recap-scene-media')).toHaveCount(0);
  await expect(
    page.getByText(
      copy.page.replace('{{page}}', '1').replace('{{count}}', '2'),
    ),
  ).toBeVisible();
});

test('large text and an unsaved offline draft preserve the editing task', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await captureScreenshot(page, info, 'recaps-large-text.png', {
    fullPage: true,
  });
  await page
    .getByRole('link', { name: new RegExp(copy.open) })
    .first()
    .click();
  await page.getByRole('button', { name: copy.ownWords, exact: true }).click();
  const words = page.getByRole('dialog');
  await words.getByRole('textbox').fill('An unfinished thought.');
  await page.route('**/recaps/*/reflection', (route) =>
    route.abort('internetdisconnected'),
  );
  await words.getByRole('button', { name: copy.draft, exact: true }).click();
  await expect(words.getByRole('textbox')).toHaveValue(
    'An unfinished thought.',
  );
  await expect(words.locator('.ui-state')).toBeVisible();
  await words
    .getByRole('button', { name: new RegExp(taskSheets.close) })
    .click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: copy.keep, exact: true }).click();
  await expect(words.getByRole('textbox')).toHaveValue(
    'An unfinished thought.',
  );
});

test('pending generation remains readable as a background task', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, { pending: true });
  await expect(
    page
      .getByRole('region', { name: copy.archive })
      .getByRole('link', { name: /^September 2026/ }),
  ).toBeVisible();
  await page
    .getByRole('region', { name: copy.otherPeriods })
    .getByRole('link', { name: /^Oktober 2026/ })
    .click();
  await expect(
    page.getByText(copy.pendingTitle, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(copy.pendingBody)).toBeVisible();
  await expect(page.locator('.recap-spread')).toHaveCount(0);
  await captureScreenshot(page, info, 'recaps-pending.png', { fullPage: true });
  await page.getByRole('button', { name: new RegExp(copy.back) }).click();
  await expect(
    page.getByRole('heading', { name: copy.shortTitle }),
  ).toBeVisible();
});

test('the previous month invitation expires on the fourth day and stays absent after reload', async ({
  page,
}) => {
  await setup(page, { start: 'wir' });
  await expect(page.locator('.monthly-recap-invitation')).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.monthly-recap-invitation')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.today-content')).toBeVisible();
  await expect(page.locator('.monthly-recap-invitation')).toHaveCount(0);
});

test('opening a monthly invitation consumes that edition on return', async ({
  page,
}) => {
  await setup(page, { start: 'wir' });
  await page
    .locator('.monthly-recap-invitation')
    .getByRole('link', { name: new RegExp(copy.watchNow) })
    .click();
  await expect(page).toHaveURL(new RegExp(recapDetailPath('october')));
  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('.today-content')).toBeVisible();
  await expect(page.locator('.monthly-recap-invitation')).toHaveCount(0);
});

for (const [width, theme] of [
  [390, 'light'],
  [430, 'dark'],
  [1280, 'dark'],
] as const) {
  test(`a dense month reads as typed scenes with counted facts and gestures at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(
      (value) => localStorage.setItem('eimir-theme', value),
      theme,
    );
    const state = await setup(page, { dense: true });
    const featured = page.locator('.recap-cover-featured');
    await expect(featured.locator('img')).toBeVisible();
    await featured
      .locator('img')
      .evaluate((img: HTMLImageElement) => img.decode());
    await captureScreenshot(
      page,
      info,
      `recaps-immersive-library-${width}-${theme}.png`,
      {
        fullPage: true,
      },
    );
    await page
      .getByRole('link', { name: new RegExp(copy.open) })
      .first()
      .click();
    const stage = page.locator('.recap-spread');
    const heading = stage.locator('h1');
    const settle = async () => {
      for (const image of await stage.locator('img').all())
        await image.evaluate((img: HTMLImageElement) => img.decode());
    };
    const shot = async (name: string) => {
      await settle();
      await captureScreenshot(
        page,
        info,
        `recaps-immersive-${name}-${width}-${theme}.png`,
      );
    };
    await expect(heading).toHaveText(fixtureCopy.dense.headline);
    await expect(stage.locator('.recap-mosaic-cell')).toHaveCount(4);
    await expect(stage.locator('.recap-mosaic img')).toHaveCount(4);
    // On photography the toggle sits on the picture, not in the control row.
    await expect(
      stage.locator('.recap-mosaic .recap-playback-overlay'),
    ).toBeVisible();
    await expect(
      page.locator('.recap-page-controls .recap-playback-toggle'),
    ).toHaveCount(0);
    await shot('cover');
    const next = page.getByRole('button', { name: copy.next, exact: true });
    await next.click();
    await expect(heading).toHaveText(copy.factsTitle);
    await expect(stage.locator('.recap-facts li')).toHaveCount(4);
    await expect(stage.locator('.recap-facts li').first()).toContainText('11');
    await shot('facts');
    // A tap on the right of the stage turns the page; a tap on the left returns.
    const frame = (await stage.boundingBox())!;
    await page.mouse.click(frame.x + frame.width * 0.8, frame.y + 200);
    await expect(heading).toHaveText(fixtureCopy.photoTitle);
    await expect(stage.locator('img')).toBeVisible();
    await shot('photo');
    await page.mouse.click(frame.x + frame.width * 0.1, frame.y + 200);
    await expect(heading).toHaveText(copy.factsTitle);
    await page.mouse.click(frame.x + frame.width * 0.8, frame.y + 200);
    await expect(heading).toHaveText(fixtureCopy.photoTitle);
    await page.keyboard.press('ArrowRight');
    await expect(heading).toHaveText(fixtureCopy.wordsTitle);
    await shot('words');
    await next.click();
    await expect(heading).toHaveText(fixtureCopy.dense.market);
    await expect(stage.locator('img')).toBeVisible();
    await shot('plan');
    await next.click();
    await expect(heading).toHaveText(fixtureCopy.dense.breakfast);
    await next.click();
    await expect(heading).toHaveText(fixtureCopy.dense.key);
    await shot('milestone');
    for (const title of [
      fixtureCopy.dense.jetty,
      fixtureCopy.dense.thanks,
      fixtureCopy.dense.chapter,
      copy.finishTitle,
    ]) {
      await next.click();
      await expect(heading).toHaveText(title);
    }
    await expect(page).toHaveURL(/page=10/);
    await shot('closing');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).include('.recap-reader').analyze())
        .violations,
    ).toEqual([]);
    expect(state.writes()).toBe(0);
    expect(state.unexpected).toEqual([]);
    if (width !== 390) return;
    // Large text keeps a photo scene readable and inside the viewport.
    for (let step = 0; step < 3; step++)
      await page
        .getByRole('button', { name: copy.previous, exact: true })
        .click();
    await expect(heading).toHaveText(fixtureCopy.dense.jetty);
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await settle();
    await captureScreenshot(stage, info, 'recaps-immersive-large-text-390.png');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test('the native app hides the page arrows and turns pages by touch', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const state = await setup(page, { dense: true, native: true });
  await page
    .getByRole('link', { name: new RegExp(copy.open) })
    .first()
    .click();
  const stage = page.locator('.recap-spread');
  await expect(stage.locator('h1')).toHaveText(fixtureCopy.dense.headline);
  // Assistive technology keeps the explicit path; nothing is painted.
  for (const name of [copy.previous, copy.next])
    await expect(page.getByRole('button', { name, exact: true })).toHaveClass(
      /sr-only/,
    );
  await expect(page.locator('.recap-gesture-hint')).toBeVisible();
  await expect(stage.locator('.recap-mosaic img')).toHaveCount(4);
  for (const image of await stage.locator('img').all())
    await image.evaluate((img: HTMLImageElement) => img.decode());
  await captureScreenshot(
    page,
    info,
    'recaps-immersive-native-cover-390-light.png',
  );
  const frame = (await stage.boundingBox())!;
  const right = { x: frame.x + frame.width * 0.85, y: frame.y + 60 };
  const left = { ...right, x: frame.x + frame.width * 0.15 };
  const tapRight = async () => {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [right],
    });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  };
  await tapRight();
  await tapRight();
  await expect(stage.locator('h1')).toHaveText(fixtureCopy.photoTitle);
  await expect(stage.locator('.recap-playback-overlay')).toBeVisible();
  await stage.locator('img').evaluate((img: HTMLImageElement) => img.decode());
  await captureScreenshot(
    page,
    info,
    'recaps-immersive-native-photo-390-light.png',
  );
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [left],
  });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [right],
  });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await touch.detach();
  await expect(stage.locator('h1')).toHaveText(copy.factsTitle);
  expect(state.unexpected).toEqual([]);
});

for (const [width, theme] of [
  [390, 'light'],
  [430, 'dark'],
  [1280, 'dark'],
] as const) {
  test(`quotes and the mutual-reaction line show the couple's own words at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(
      (value) => localStorage.setItem('eimir-theme', value),
      theme,
    );
    const words = fixtureCopy.ownWords;
    const state = await setup(page, { dense: true, ownWords: true });
    await page
      .getByRole('link', { name: new RegExp(copy.open) })
      .first()
      .click();
    const stage = page.locator('.recap-spread');
    const heading = stage.locator('h1');
    const next = page.getByRole('button', { name: copy.next, exact: true });
    const settle = async () => {
      for (const image of await stage.locator('img').all())
        await image.evaluate((img: HTMLImageElement) => img.decode());
    };
    const shot = async (name: string) => {
      await settle();
      await captureScreenshot(
        page,
        info,
        `recaps-own-words-${name}-${width}-${theme}.png`,
      );
    };
    await next.click();
    await next.click();
    // Photo scene: the newest foreign comment, quoted with its author and German marks.
    await expect(heading).toHaveText(fixtureCopy.photoTitle);
    await expect(stage.locator('.recap-quote')).toHaveText(
      `Ben: „${words.photoQuote}“`,
    );
    await expect(stage.locator('.recap-reaction-line')).toHaveCount(0);
    await shot('photo-quote');
    // Photo scene with a mutual reaction: one calm line, no quote.
    await next.click();
    await next.click();
    await next.click();
    await expect(heading).toHaveText(fixtureCopy.dense.breakfast);
    await expect(stage.locator('.recap-reaction-line')).toHaveText(
      words.reaction,
    );
    await expect(stage.locator('.recap-quote')).toHaveCount(0);
    await shot('photo-reaction');
    // Text-led scene with a quote.
    for (let step = 0; step < 3; step++) await next.click();
    await expect(heading).toHaveText(fixtureCopy.dense.thanks);
    await expect(stage.locator('.recap-quote')).toHaveText(
      `Anna: „${words.wordsQuote}“`,
    );
    await shot('words-quote');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).include('.recap-reader').analyze())
        .violations,
    ).toEqual([]);
    expect(state.writes()).toBe(0);
    expect(state.unexpected).toEqual([]);
  });
}

for (const [width, theme] of [
  [390, 'light'],
  [430, 'dark'],
  [1280, 'dark'],
] as const) {
  test(`good days together show as a quiet rhythm with text equivalents at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(
      (value) => localStorage.setItem('eimir-theme', value),
      theme,
    );
    const state = await setup(page, { dense: true, rhythm: true });
    await page
      .getByRole('link', { name: new RegExp(copy.open) })
      .first()
      .click();
    const stage = page.locator('.recap-spread');
    const next = page.getByRole('button', { name: copy.next, exact: true });
    await next.click();
    await expect(stage.locator('h1')).toHaveText(copy.factsTitle);
    await next.click();
    // The rhythm follows the counted facts and adds one page.
    await expect(stage.locator('h1')).toHaveText(copy.rhythm.title);
    await expect(
      page.getByText(fill(copy.page, { page: 3, count: 12 })),
    ).toBeVisible();
    await expect(stage.locator('.recap-reader-intro')).toHaveText(
      fill(copy.rhythm.summary_other, { count: 9 }),
    );
    const items = stage.locator('.recap-rhythm li');
    await expect(items).toHaveCount(5);
    await expect(items.locator('.recap-rhythm-label')).toHaveText(
      [1, 2, 3, 4, 5].map((count) => fill(copy.rhythm.week, { count })),
    );
    // Every bar has a text equivalent; only the leading week is marked.
    await expect(items.first()).toContainText(
      fill(copy.rhythm.days_other, { count: 3 }),
    );
    await expect(items.nth(3)).toContainText(
      fill(copy.rhythm.days_other, { count: 0 }),
    );
    await expect(
      stage.locator('.recap-rhythm li[data-leading="true"]'),
    ).toHaveCount(1);
    await expect(
      stage.locator(
        '.recap-rhythm li[data-leading="true"] .recap-rhythm-label',
      ),
    ).toHaveText(fill(copy.rhythm.week, { count: 3 }));
    await captureScreenshot(page, info, `recaps-rhythm-${width}-${theme}.png`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).include('.recap-reader').analyze())
        .violations,
    ).toEqual([]);
    expect(state.writes()).toBe(0);
    expect(state.unexpected).toEqual([]);
  });
}

for (const [width, theme] of [
  [390, 'light'],
  [430, 'dark'],
  [1280, 'dark'],
] as const) {
  test(`Momente leads with a new recap until it is opened and returns at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(
      (value) => localStorage.setItem('eimir-theme', value),
      theme,
    );
    const state = await setup(page, { start: 'momente' });
    // #1907 F4: two permanent experiences; the story overview lives on Wir
    // and More, and the new recap leads only until it is opened.
    const group = page.locator('.couple-experience-links');
    const rows = group.locator('.couple-experience-list > li');
    await expect(rows).toHaveCount(2);
    await expect(group.locator('a[href="/story/our-story"]')).toHaveCount(0);
    const lead = group.locator('a.recap-lead-card');
    await expect(lead).toBeVisible();
    await expect(lead).toContainText(copy.discoverNew);
    await expect(lead).toContainText(copy.shortTitle);
    await expect(lead.locator('img')).toBeVisible();
    await lead.locator('img').evaluate((img: HTMLImageElement) => img.decode());
    await group.evaluate((element) =>
      element.scrollIntoView({ block: 'center' }),
    );
    await captureScreenshot(
      page,
      info,
      `recaps-momente-entry-${width}-${theme}.png`,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .include('.couple-experience-links')
          .analyze()
      ).violations,
    ).toEqual([]);
    await lead.click();
    await expect(page).toHaveURL(
      // The reader starts playback and drops its one-time play request.
      new RegExp(`${recapDetailPath('october')}$`),
    );
    // The immersive reader names Momente as its Back destination and
    // returns there, where the card no longer leads.
    const back = page.getByRole('button', {
      name: navigation.story,
      exact: true,
    });
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/story$/);
    await expect(page.locator('.momente-discover-page')).toBeVisible();
    await expect(rows).toHaveCount(2);
    await expect(lead).toHaveCount(0);
    await captureScreenshot(
      page,
      info,
      `recaps-momente-after-${width}-${theme}.png`,
    );
    expect(state.writes()).toBe(0);
    expect(state.unexpected).toEqual([]);
  });
}

test('with motion the opened recap card collapses away after return', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await setup(page, { start: 'momente' });
  const lead = page.locator('.couple-experience-links a.recap-lead-card');
  await expect(lead).toBeVisible();
  await lead.click();
  await expect(page).toHaveURL(new RegExp(`${recapDetailPath('october')}$`));
  await page
    .getByRole('button', { name: navigation.story, exact: true })
    .click();
  await expect(page.locator('.momente-discover-page')).toBeVisible();
  // The card may play its short collapse, but it must not stay.
  await expect(page.locator('.recap-lead')).toHaveCount(0);
  await expect(page.locator('.couple-experience-list > li')).toHaveCount(2);
});

test('Free keeps both Discover experiences with Pro marks at 360 with large text', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const state = await setup(page, { start: 'momente', pro: false });
  const group = page.locator('.couple-experience-links');
  const rows = group.locator('.couple-experience-list > li');
  await expect(rows).toHaveCount(2);
  for (const row of await rows.all())
    await expect(row.locator('.pro-mark')).toBeVisible();
  await page.addStyleTag({
    content: 'html { font-size: 200% !important; }',
  });
  await group.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await captureScreenshot(page, info, 'recaps-momente-free-360-large.png');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(state.unexpected).toEqual([]);
});

test('the former More addresses of the recap library and reader redirect with their query', async ({
  page,
}) => {
  await setup(page, { start: 'momente' });
  const open = (path: string) =>
    page.evaluate((target) => {
      window.history.pushState({}, '', target);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
  // The bare address held the story overview, which is a page of its own
  // again (#1861); everything below it still opens the recap reader.
  await open('/more/passport?tab=years');
  await expect(page).toHaveURL(/\/story\/our-story\?tab=years$/);
  await open('/more/passport/october?page=2');
  await expect(page).toHaveURL(/\/story\/recaps\/october\?page=2$/);
});

// #1744 year film: month chapters with markers, the firsts, the climax and the
// month covers; progress orients by chapter instead of one bar per scene.
for (const [width, height, scheme, all] of [
  [390, 844, 'light', true],
  [430, 932, 'dark', false],
  [1280, 900, 'dark', false],
] as const) {
  test(`the year film plays its month chapters at ${width} px ${scheme}`, async ({
    page,
  }, info) => {
    // A year has dozens of scenes; each one is opened by address.
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const state = await setup(page, { yearFilm: true });
    await page.goto(recapDetailPath('year'));
    await expect(page.locator('.recap-film-frame').first()).toBeVisible();
    // Intro, ten month chapters and the finale.
    await expect(page.locator('.recap-progress-chapter')).toHaveCount(12);
    const total = await page.locator('.recap-progress-step').count();
    expect(total).toBeGreaterThan(30);
    const captured = new Set<string>();
    const wanted = all
      ? null
      : new Set(['cover', 'month', 'firsts', 'covers', 'climax']);
    for (let index = 0; index < total; index++) {
      await page.goto(`${recapDetailPath('year')}?page=${index}`);
      const spread = page.locator('.recap-spread').first();
      await expect(spread).toBeVisible();
      const type = (await spread.getAttribute('class'))?.match(
        /recap-scene-([a-z]+)/u,
      )?.[1];
      const name =
        (await spread.getAttribute('data-climax')) === 'true'
          ? 'climax'
          : (type ?? 'scene');
      if (captured.has(name) || (wanted && !wanted.has(name))) continue;
      captured.add(name);
      // Every picture of the scene is loaded before it is captured.
      await page.waitForFunction(() => {
        const pictures = document.querySelectorAll('.recap-film-picture');
        const loaded = [
          ...document.querySelectorAll<HTMLImageElement>(
            '.recap-film-picture img',
          ),
        ].filter((image) => image.complete && image.naturalWidth > 0);
        return loaded.length >= pictures.length;
      });
      await page.waitForTimeout(500);
      // A caption band never sits under a picture.
      const overlap = await page.evaluate(() => {
        const caption = document.querySelector('.recap-film-caption');
        if (!caption) return false;
        const box = caption.getBoundingClientRect();
        return [...document.querySelectorAll('.recap-film-picture')].some(
          (picture) => {
            const frame = picture.closest('[data-layout]');
            if (frame?.getAttribute('data-layout') === 'bleed') return false;
            const other = picture.getBoundingClientRect();
            return other.bottom > box.top + 2 && other.top < box.bottom;
          },
        );
      });
      expect(overlap).toBe(false);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await captureScreenshot(
        page,
        info,
        `recaps-year-film-${name}-${width}-${scheme}.png`,
      );
    }
    expect([...captured]).toEqual(
      expect.arrayContaining(['cover', 'month', 'firsts', 'covers', 'climax']),
    );
    expect(
      (await new AxeBuilder({ page }).include('.recap-reader').analyze())
        .violations,
    ).toEqual([]);
    expect(state.writes()).toBe(0);
    expect(state.unexpected).toEqual([]);
  });
}

test('the year film keeps browser-only arrows hidden in the native app', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await setup(page, { yearFilm: true, native: true });
  await page.goto(`${recapDetailPath('year')}?page=2`);
  await expect(page.locator('.recap-progress-chapter')).toHaveCount(12);
  await expect(page.locator('.recap-film-month')).toBeVisible();
  for (const name of [copy.previous, copy.next])
    await expect(page.getByRole('button', { name, exact: true })).toHaveClass(
      /sr-only/,
    );
  await captureScreenshot(page, info, 'recaps-year-film-native-390-light.png');
  expect(state.unexpected).toEqual([]);
});

// #1744 monthly film: every scene type of a curated month, captions never under a picture.
for (const [width, height, scheme, all] of [
  [390, 844, 'light', true],
  [430, 932, 'dark', false],
  [1280, 900, 'dark', false],
] as const) {
  test(`the monthly film presents its scenes at ${width} px ${scheme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const state = await setup(page, { film: true });
    await page.goto(recapDetailPath('october'));
    const reader = page.locator('.recap-reader');
    await expect(reader).toBeVisible();
    await expect(page.locator('.recap-film-frame').first()).toBeVisible();
    const total = await page.locator('.recap-progress > *').count();
    expect(total).toBeGreaterThan(8);
    for (let index = 0; index < total; index++) {
      if (!all && index !== 0 && index !== 4 && index !== total - 2) continue;
      await page.goto(`${recapDetailPath('october')}?page=${index}`);
      await expect(page.locator('.recap-spread').first()).toBeVisible();
      await page.waitForTimeout(500);
      // A caption band never sits under a picture.
      const overlap = await page.evaluate(() => {
        const caption = document.querySelector('.recap-film-caption');
        if (!caption) return false;
        const box = caption.getBoundingClientRect();
        return [...document.querySelectorAll('.recap-film-picture')].some(
          (picture) => {
            const frame = picture.closest('[data-layout]');
            if (frame?.getAttribute('data-layout') === 'bleed') return false;
            const other = picture.getBoundingClientRect();
            return other.bottom > box.top + 2 && other.top < box.bottom;
          },
        );
      });
      expect(overlap).toBe(false);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await captureScreenshot(
        page,
        info,
        `recaps-film-${String(index).padStart(2, '0')}-${width}-${scheme}.png`,
      );
    }
    expect(
      (await new AxeBuilder({ page }).include('.recap-reader').analyze())
        .violations,
    ).toEqual([]);
    expect(state.writes()).toBe(0);
    expect(state.unexpected).toEqual([]);
  });
}

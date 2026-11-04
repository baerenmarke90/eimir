import content from '../fixtures/locales/de';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import m5s3 from '../../src/i18n/locales/m5s3';
import de from '../../src/i18n/locales/de';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import {
  ACCOUNT_ID,
  SPACE_ID,
  ME,
  CAPABILITIES,
  getTimelineItems,
  installMocks,
  signIn,
  captureScreenshot,
} from '../support/storyTimelineFixture';

const NOW = '2026-10-20T10:00:00Z';
function chapter(
  id: string,
  title: string,
  startOn: string | null,
  endOn: string | null = null,
) {
  return {
    id,
    title,
    description: content.chapterExperience.description,
    startOn,
    endOn,
    placeId: null,
    spaceId: SPACE_ID,
    createdBy: ACCOUNT_ID,
    creator: ME,
    capabilities: { ...CAPABILITIES, canComment: false },
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  };
}
type Chapter = ReturnType<typeof chapter>;
async function installChapters(
  page: Page,
  seeds: Chapter[],
  onlyChapters = false,
) {
  const unexpected = await installMocks(page, { strict: true });
  const state = {
    chapters: new Map(seeds.map((entry) => [entry.id, entry])),
    links: new Map<string, string[]>(),
    createCalls: 0,
    failCreate: false,
    conflictUpdate: false,
    ifMatch: '',
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const root = `/api/v1/spaces/${SPACE_ID}`;
    const path = url.pathname;
    const method = request.method();
    if (path === `${root}/memories/mem-canal` && method === 'GET') {
      const source = getTimelineItems()[0].memory;
      return json(route, {
        ...source,
        spaceId: SPACE_ID,
        authorId: ACCOUNT_ID,
        updatedAt: '2026-05-12T08:30:00Z',
        version: 1,
      });
    }
    if (path === `${root}/chapters` && method === 'GET')
      return json(route, {
        items: [...state.chapters.values()],
        hasMore: false,
        nextCursor: null,
      });
    if (path === `${root}/chapters` && method === 'POST') {
      state.createCalls++;
      if (state.failCreate)
        return json(
          route,
          {
            status: 503,
            title: 'Temporarily unavailable',
            code: 'SERVICE_UNAVAILABLE',
          },
          503,
        );
      const body = request.postDataJSON();
      const saved = {
        ...chapter(`created-${state.createCalls}`, body.title, null),
        description: null,
        ...body,
      } as Chapter;
      state.chapters.set(saved.id, saved);
      return json(route, saved, 201);
    }
    const match = path.match(
      new RegExp(
        `^${root}/chapters/([^/]+)(?:/(content|memories|heart-moments|milestones)(?:/([^/]+))?)?$`,
      ),
    );
    if (match) {
      const saved = state.chapters.get(match[1]);
      if (!saved)
        return json(route, { status: 404, code: 'RESOURCE_NOT_FOUND' }, 404);
      if (!match[2]) {
        if (method === 'GET') return json(route, saved);
        state.ifMatch = request.headers()['if-match'];
        if (method === 'PATCH') {
          if (state.conflictUpdate)
            return json(
              route,
              {
                status: 409,
                code: 'RESOURCE_VERSION_CONFLICT',
                title: 'Changed elsewhere',
              },
              409,
            );
          Object.assign(saved, request.postDataJSON(), {
            version: saved.version + 1,
          });
          return json(route, saved);
        }
        if (method === 'DELETE') {
          state.chapters.delete(saved.id);
          return route.fulfill({ status: 204 });
        }
      }
      const links = state.links.get(saved.id) ?? [];
      if (match[2] === 'content')
        return json(route, {
          items: links.map((targetId) => ({ targetId, targetType: 'MEMORY' })),
        });
      if (method === 'PUT')
        state.links.set(saved.id, [...new Set([...links, match[3]])]);
      if (method === 'DELETE')
        state.links.set(
          saved.id,
          links.filter((id) => id !== match[3]),
        );
      return route.fulfill({ status: 204 });
    }
    if (path === `${root}/timeline` && method === 'GET') {
      const type = url.searchParams.get('type');
      const year = url.searchParams.get('year');
      const source = (onlyChapters ? [] : getTimelineItems()).filter(
        (item) => !type || item.kind === type,
      );
      const markers =
        url.searchParams.get('includeChapters') === 'true' && !type
          ? [...state.chapters.values()].filter((entry) => entry.startOn)
          : [];
      const all = [
        ...source.map((item) => ({
          date: item.effectiveDate.slice(0, 10),
          id:
            'memory' in item && item.memory
              ? item.memory.id
              : 'milestone' in item && item.milestone
                ? item.milestone.id
                : 'heartMoment' in item && item.heartMoment
                  ? item.heartMoment.id
                  : '',
          item,
          marker: null as Chapter | null,
        })),
        ...markers.map((marker) => ({
          date: marker.startOn as string,
          id: marker.id,
          item: null,
          marker,
        })),
      ];
      all.sort(
        (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
      );
      if (url.searchParams.get('order') !== 'ASC') all.reverse();
      const scoped = all.filter(
        (entry) => !year || entry.date.startsWith(`${year}-`),
      );
      const offset = Number(
        url.searchParams.get('cursor')?.replace('page-', '') ?? 0,
      );
      const limit = Number(url.searchParams.get('limit') ?? 25);
      const selected = scoped.slice(offset, offset + limit);
      const hasMore = scoped.length > offset + limit;
      return json(route, {
        items: selected.flatMap((entry) => (entry.item ? [entry.item] : [])),
        chapterMarkers: selected.flatMap((entry, position) =>
          entry.marker ? [{ ...entry.marker, position }] : [],
        ),
        availableYears: [
          ...new Set(all.map((entry) => Number(entry.date.slice(0, 4)))),
        ].sort((a, b) => b - a),
        hasMore,
        nextCursor: hasMore ? `page-${offset + limit}` : null,
      });
    }
    return route.fallback();
  });
  return { state, unexpected };
}
const seed = () =>
  chapter(
    'summer',
    content.chapterExperience.summerTitle,
    '2026-10-12',
    '2026-10-16',
  );
const back = (page: Page) =>
  page.getByRole('button', { name: taskBoundary.back, exact: true });
const edit = (page: Page) =>
  page.getByRole('button', { name: de.common.edit, exact: true });
const titleField = (page: Page) =>
  page.getByRole('textbox', { name: m5s3.common.title, exact: true });
async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
async function addMemory(page: Page) {
  await page.getByRole('button', { name: m5s3.relations.addLabel }).click();
  const picker = page.getByRole('dialog', { name: m5s3.relations.addLabel });
  await picker
    .getByRole('checkbox', { name: /Breakfast by the canal/ })
    .check();
  await picker
    .getByRole('button', {
      name: m5s3.relations.addSelected_one.replace('{{count}}', '1'),
    })
    .click();
  await expect(picker).not.toBeVisible();
}

test('complete Chapter create, linked-moment read/unlink, edit, diary return and delete journey', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { state, unexpected } = await installChapters(page, []);
  await signIn(page);
  await page.goto('/story/chapters');
  await page.getByRole('link', { name: m5s3.chapter.create }).click();
  await titleField(page).fill(content.chapterExperience.createdTitle);
  await page
    .getByLabel(m5s3.common.description, { exact: true })
    .fill(content.chapterExperience.createdDescription);
  await page.getByText(m5s3.chapter.addMoreDetails, { exact: true }).click();
  await page
    .getByLabel(m5s3.chapter.startOn, { exact: true })
    .fill('2026-10-12');
  await page.getByLabel(m5s3.chapter.endOn, { exact: true }).fill('2026-10-16');
  await page
    .getByRole('button', { name: m5s3.common.save, exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: content.chapterExperience.createdTitle,
      exact: true,
    }),
  ).toBeVisible();
  expect(state.createCalls).toBe(1);
  await addMemory(page);
  await page.getByRole('link', { name: /Breakfast by the canal/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Breakfast by the canal', exact: true }),
  ).toBeVisible();
  await back(page).click();
  await page
    .getByRole('button', {
      name: m5s3.relations.actions.replace(
        '{{title}}',
        'Breakfast by the canal',
      ),
    })
    .click();
  await expect(
    page.getByText(m5s3.relations.unlinkChapterConsequence),
  ).toBeVisible();
  await page
    .getByRole('button', { name: m5s3.relations.unlink, exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: /Breakfast by the canal/ }),
  ).toHaveCount(0);
  await page.goto('/story/memories/mem-canal');
  await expect(
    page.getByRole('heading', { name: 'Breakfast by the canal', exact: true }),
  ).toBeVisible();
  await page.goto('/story?tab=timeline&year=2026');
  const marker = page
    .locator('.chapter-diary-marker')
    .filter({ hasText: content.chapterExperience.createdTitle });
  await expect(marker).toHaveCount(1);
  await marker.click();
  await back(page).click();
  await expect(page).toHaveURL(/year=2026/);
  await expect(marker).toBeFocused();
  await marker.click();
  await edit(page).click();
  await page
    .getByLabel(m5s3.chapter.startOn, { exact: true })
    .fill('2025-09-01');
  await page.getByLabel(m5s3.chapter.endOn, { exact: true }).fill('2025-09-03');
  await page
    .getByRole('button', { name: m5s3.common.saveChanges, exact: true })
    .click();
  await expect(titleField(page)).toHaveCount(0);
  expect(state.ifMatch).toBe('1');
  await back(page).click();
  await expect(page.locator('.chapter-diary-marker')).toHaveCount(0);
  await page.goto('/story?tab=timeline&year=2025');
  await marker.click();
  await edit(page).click();
  await page
    .getByRole('button', { name: m5s3.common.delete, exact: true })
    .click();
  await page
    .getByRole('button', { name: m5s3.common.confirmDelete, exact: true })
    .click();
  await expect(page).toHaveURL(/year=2025/);
  await expect(page.locator('.chapter-diary-marker')).toHaveCount(0);
  expect(unexpected).toEqual([]);
});

test('marker-only progressive pages, overlapping starts, annual archive and content-type scope', async ({
  page,
}) => {
  const chapters = Array.from({ length: 27 }, (_, index) =>
    chapter(
      `chapter-${String(index).padStart(2, '0')}`,
      `${content.chapterExperience.section} ${index + 1}`,
      '2001-04-07',
    ),
  );
  const { unexpected } = await installChapters(page, chapters, true);
  await signIn(page);
  await page.goto('/story?tab=timeline&year=2001&order=ASC');
  await expect(page.locator('.chapter-diary-marker')).toHaveCount(25);
  await page.locator('.chapter-diary-marker').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.chapter-diary-marker')).toHaveCount(27);
  expect(
    new Set(
      await page
        .locator('.chapter-diary-marker')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))),
    ).size,
  ).toBe(27);
  const last = page.locator('.chapter-diary-marker').last();
  await last.click();
  await back(page).click();
  await expect(last).toBeFocused();
  await page.goto('/story?tab=timeline&type=MEMORY&year=2001');
  await expect(page.locator('.chapter-diary-marker')).toHaveCount(0);
  await page.goto('/story/years');
  await page.getByRole('link', { name: /2001/ }).click();
  await expect(page.locator('.chapter-diary-marker')).toHaveCount(25);
  await page
    .getByRole('button', { name: de.storyYears.loadMore, exact: true })
    .click();
  await expect(page.locator('.chapter-diary-marker')).toHaveCount(27);
  expect(unexpected).toEqual([]);
});

test('dirty Back, retained failed creation and If-Match conflict preserve authored words', async ({
  page,
}) => {
  const { state, unexpected } = await installChapters(page, []);
  await signIn(page);
  await page.goto('/plan/chapters/new');
  await titleField(page).fill(content.chapterExperience.pendingTitle);
  await back(page).click();
  await page.getByRole('button', { name: m5s3.common.keepEditing }).click();
  await expect(titleField(page)).toHaveValue(
    content.chapterExperience.pendingTitle,
  );
  state.failCreate = true;
  await page
    .getByRole('button', { name: m5s3.common.save, exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: m5s3.common.save, exact: true }),
  ).toBeEnabled();
  await expect(titleField(page)).toHaveValue(
    content.chapterExperience.pendingTitle,
  );
  state.failCreate = false;
  await page
    .getByRole('button', { name: m5s3.common.save, exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: content.chapterExperience.pendingTitle,
      exact: true,
    }),
  ).toBeVisible();
  state.conflictUpdate = true;
  await edit(page).click();
  await page
    .getByLabel(m5s3.common.description, { exact: true })
    .fill(content.chapterExperience.correction);
  await expect(page.locator('.product-shell')).toHaveAttribute(
    'data-focused-task',
    'true',
  );
  await expect(
    page.locator('.chapter-page [data-owner-kind="chapter"]'),
  ).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: de.navigation.primary }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: m5s3.common.saveChanges, exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: m5s3.common.saveChanges, exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByLabel(m5s3.common.description, { exact: true }),
  ).toHaveValue(content.chapterExperience.correction);
  expect(state.ifMatch).toBe('1');
  expect(unexpected).toEqual([]);
});

for (const viewport of [
  { width: 360, theme: 'light', large: false },
  { width: 390, theme: 'dark', large: false },
  { width: 430, theme: 'light', large: false },
  { width: 1280, theme: 'light', large: false },
  { width: 1280, theme: 'dark', large: false },
  { width: 320, theme: 'light', large: true },
] as const) {
  test(`Chapter reading and diary composition at ${viewport.width}px ${viewport.theme}${viewport.large ? ' large text and reduced motion' : ''}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: 900 });
    await page.emulateMedia({
      colorScheme: viewport.theme,
      reducedMotion: viewport.large ? 'reduce' : 'no-preference',
    });
    const second = {
      ...chapter('home', content.chapterExperience.homeTitle, '2025-03-01'),
      description: content.chapterExperience.homeDescription,
    };
    const { state, unexpected } = await installChapters(page, [seed(), second]);
    state.links.set('summer', ['mem-canal']);
    await signIn(page);
    await page.goto('/story/chapters');
    if (viewport.large)
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
    await expect(
      page.getByRole('link', {
        name: new RegExp(content.chapterExperience.summerTitle),
      }),
    ).toBeVisible();
    const prefix = `story-chapter-${viewport.width}-${viewport.theme}${viewport.large ? '-large-reduced' : ''}`;
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(page, testInfo, `${prefix}-overview.png`, {
      fullPage: true,
    });
    await page
      .getByRole('link', {
        name: new RegExp(content.chapterExperience.summerTitle),
      })
      .click();
    await expect(
      page.getByRole('link', { name: /Breakfast by the canal/ }),
    ).toBeVisible();
    await expect(
      page.getByText(m5s3.chapter.noPlace, { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(m5s3.chapter.noPeriod, { exact: true }),
    ).toHaveCount(0);
    const add = page.getByRole('button', { name: m5s3.relations.addLabel });
    const first = page.getByRole('link', { name: /Breakfast by the canal/ });
    await expect(first.locator('.relation-moment-art')).toHaveCount(1);
    if (!viewport.large) await expect(first.locator('img')).toBeVisible();
    expect((await add.boundingBox())?.y).toBeLessThan(
      (await first.boundingBox())?.y ?? 0,
    );
    const axe = await new AxeBuilder({ page })
      .include('.chapter-page')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(page, testInfo, `${prefix}-detail.png`, {
      fullPage: true,
    });
    await page.goto('/story?tab=timeline&year=2026');
    if (viewport.large)
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
    await expect(page.locator('.chapter-diary-marker')).toHaveCount(1);
    await captureScreenshot(page, testInfo, `${prefix}-diary.png`, {
      fullPage: true,
    });
    await expectNoHorizontalOverflow(page);
    expect(unexpected).toEqual([]);
  });
}

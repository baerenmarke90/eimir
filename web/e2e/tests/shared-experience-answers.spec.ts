import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import memoryProduct from '../../src/i18n/locales/memoryProduct';
import copy from '../../src/i18n/locales/coupleExperiences';
import photoPlaces from '../../src/i18n/locales/photoPlaces';
import storyProducts from '../../src/i18n/locales/storyProducts';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import localizedFixture from '../fixtures/locales/de';
import {
  installMocks,
  signIn,
  captureScreenshot,
  ME,
  PARTNER,
  SPACE_ID,
  DETAIL_COMMENTS,
} from '../support/storyTimelineFixture';

const fixture = localizedFixture.sharedExperience;

for (const [width, theme] of [
  [360, 'light'],
  [390, 'dark'],
  [430, 'light'],
  [1280, 'dark'],
] as const) {
  test(`shared answers retain authorship through own edit and chronological comments at ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const unknown = await installMocks(page, {
      strict: true,
      withDetailComments: true,
    });
    const question = fixture.question;
    let ownBody = fixture.ownInitial;
    let version = 3;
    const readonly = { canEdit: false, canDelete: false, canComment: true };
    const own = { canEdit: true, canDelete: true, canComment: true };
    const answers = () => [
      {
        id: 'mem-canal',
        author: PARTNER,
        body: fixture.partnerAnswer,
        version: 2,
        capabilities: readonly,
        attachments: [],
      },
      {
        id: 'mem-own-answer',
        author: ME,
        body: ownBody,
        version,
        capabilities: own,
        attachments: [],
      },
    ];
    const detail = (id: string) => ({
      id,
      spaceId: SPACE_ID,
      authorId: id === 'mem-canal' ? PARTNER.id : ME.id,
      author: id === 'mem-canal' ? PARTNER : ME,
      title: question,
      body: id === 'mem-canal' ? fixture.partnerAnswer : ownBody,
      happenedOn: '2026-09-16',
      happenedUntil: null,
      createdAt: '2026-09-16T08:00:00Z',
      updatedAt: '2026-09-16T08:00:00Z',
      tags: [],
      attachments: [],
      version: id === 'mem-canal' ? 2 : version,
      capabilities: id === 'mem-canal' ? readonly : own,
      experienceKind: 'HAPPINESS',
      experienceRootId: 'mem-canal',
      experienceAnswers: answers(),
    });
    await page.route(`**/api/v1/spaces/${SPACE_ID}/timeline*`, (route) =>
      route.fulfill({
        json: {
          items: [
            {
              kind: 'MEMORY',
              effectiveDate: '2026-09-16',
              memory: detail('mem-canal'),
            },
          ],
          hasMore: false,
          nextCursor: null,
          availableYears: [2026],
        },
      }),
    );
    const writes: string[] = [];
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/memories/*`,
      async (route) => {
        const url = new URL(route.request().url());
        const id = url.pathname.split('/').at(-1)!;
        if (id !== 'mem-canal' && id !== 'mem-own-answer')
          return route.fallback();
        if (route.request().method() === 'PATCH') {
          expect(id).toBe('mem-own-answer');
          expect(route.request().headers()['if-match']).toContain(
            String(version),
          );
          ownBody = route.request().postDataJSON().body;
          writes.push(ownBody);
          version++;
        }
        return route.fulfill({ json: detail(id) });
      },
    );
    await page.route(
      `**/api/v1/spaces/${SPACE_ID}/memories/mem-canal/comments*`,
      (route) =>
        route.fulfill({
          json: {
            items: [...DETAIL_COMMENTS].reverse(),
            hasMore: false,
            nextCursor: null,
          },
        }),
    );
    await signIn(page);
    const timeline = page.locator('.story-timeline');
    await expect(timeline.locator('.experience-answer')).toHaveCount(2);
    await expect(timeline).toContainText(ownBody);
    await expect(timeline).toContainText(fixture.partnerAnswer);
    await captureScreenshot(
      page,
      info,
      `shared-answers-journal-${width}-${theme}.png`,
      { fullPage: true },
    );
    await timeline.getByRole('link', { name: question }).click();
    await expect(page.locator('.experience-answer')).toHaveCount(2);
    await expect(
      page.getByRole('link', { name: copy.editOwnAnswer }),
    ).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: photoPlaces.add, exact: true }),
    ).toHaveCount(0);
    const comments = page.locator('.comment-card');
    await expect(comments.nth(0)).toContainText('Still smiling about this.');
    await expect(comments.nth(1)).toContainText('Me too.');
    await expect(page.locator('.comment-list')).not.toContainText(
      storyProducts.comments.authorSelf,
    );
    const violations = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(violations.violations).toEqual([]);
    await captureScreenshot(
      page,
      info,
      `shared-answers-detail-${width}-${theme}.png`,
      { fullPage: true },
    );
    await page.getByRole('link', { name: copy.editOwnAnswer }).click();
    await expect(
      page.getByRole('heading', { name: copy.editOwnAnswer, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel(de.memory.titleLabel, { exact: true }),
    ).not.toBeVisible();
    await page
      .getByLabel(de.memory.bodyLabel, { exact: true })
      .fill(fixture.ownEdited);
    await page
      .getByRole('button', { name: memoryProduct.save, exact: true })
      .click();
    await expect(page.locator('.experience-answer')).toContainText([
      fixture.partnerAnswer,
      fixture.ownEdited,
    ]);
    expect(writes).toEqual([fixture.ownEdited]);
    await page
      .getByRole('button', { name: taskBoundary.back, exact: true })
      .click();
    // The confirmed editor replaces itself with the actual result; Back restores the journal origin.
    await expect(
      page.getByRole('tab', { name: de.story.tabTimeline, exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(unknown).toEqual([]);
  });
}

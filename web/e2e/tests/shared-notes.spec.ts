import { expect, type Page, test } from '@playwright/test';
import composerCopy from '../../src/i18n/locales/composer';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import navigation from '../../src/i18n/locales/navigation';
import sharedNotesCopy from '../../src/i18n/locales/sharedNotes';
import { editViaMenu, itemMenuRow, openItemMenu } from '../support/itemMenu';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  installMocks,
  ME,
  PARTNER,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const copy = sharedNotesCopy.sharedNotes;
const base = `/api/v1/spaces/${SPACE_ID}`;
const stamp = '2026-11-09T10:00:00Z';
const CREATED_PLAN_ID = '44444444-4444-4444-8444-444444444444';

type NoteFixture = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  wirTitleOnly: boolean;
  version: number;
};

function note(
  id: string,
  title: string,
  body: string,
  extra: Partial<NoteFixture> = {},
): NoteFixture {
  return {
    id,
    title,
    body,
    pinned: false,
    wirTitleOnly: false,
    version: 1,
    ...extra,
  };
}

function detail(entry: NoteFixture, editedByMe = false) {
  return {
    ...entry,
    spaceId: SPACE_ID,
    createdBy: ACCOUNT_ID,
    createdAt: stamp,
    editedAt: stamp,
    editedBy: editedByMe ? ACCOUNT_ID : PARTNER.id,
    creator: ME,
    editor: editedByMe ? ME : PARTNER,
    capabilities: CAPABILITIES,
  };
}

/**
 * Mocks the shared-notes API on top of the shared product mocks. Notes live in
 * memory so a saved edit is visible when the read page reloads them (#1969).
 */
async function fixture(page: Page, initial: NoteFixture[]) {
  await page.addInitScript(
    ({ accountId, spaceId }) => {
      localStorage.setItem(
        `eimir:product-tour:v1:${accountId}:${spaceId}`,
        'seen',
      );
    },
    { accountId: ACCOUNT_ID, spaceId: SPACE_ID },
  );
  await installMocks(page, { strict: true });
  const store = new Map(initial.map((entry) => [entry.id, { ...entry }]));
  const edited = new Set<string>();
  const patches: Record<string, unknown>[] = [];
  // A Plan created in the browser: its notes are linked by separate calls.
  const plan = {
    id: CREATED_PLAN_ID,
    spaceId: SPACE_ID,
    title: '',
    description: null,
    status: 'IDEA',
    experiencedOn: null,
    plannedOn: null,
    plannedStart: null,
    plannedEnd: null,
    sourceWishId: null,
    placeId: null,
    attachments: [],
    createdBy: ACCOUNT_ID,
    creator: ME,
    capabilities: CAPABILITIES,
    createdAt: stamp,
    updatedAt: stamp,
    version: 1,
  };
  const planCalls = {
    creates: [] as Record<string, unknown>[],
    links: [] as string[],
    failLinks: false,
  };
  const linked = new Set<string>();
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === `${base}/plans` && method === 'POST') {
      const values = request.postDataJSON() as Record<string, unknown>;
      planCalls.creates.push(values);
      Object.assign(plan, values);
      return route.fulfill({ status: 201, json: plan });
    }
    if (path === `${base}/plans/${CREATED_PLAN_ID}` && method === 'GET')
      return route.fulfill({ json: plan });
    if (path === `${base}/plans/${CREATED_PLAN_ID}/notes` && method === 'GET') {
      return route.fulfill({
        json: [...store.values()]
          .filter((entry) => linked.has(entry.id))
          .map((entry) => detail(entry)),
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    const planLink = path.match(
      new RegExp(`^${base}/plans/${CREATED_PLAN_ID}/notes/([^/]+)$`),
    );
    if (planLink && method === 'PUT') {
      if (planCalls.failLinks)
        return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } });
      linked.add(planLink[1]);
      planCalls.links.push(planLink[1]);
      return route.fulfill({ status: 204 });
    }
    if (method === 'GET' && path === `${base}/shared-notes`) {
      const pinned = url.searchParams.get('pinned');
      const items = [...store.values()]
        .filter(
          (entry) => pinned === null || entry.pinned === (pinned === 'true'),
        )
        .map((entry) => detail(entry, edited.has(entry.id)));
      return route.fulfill({
        json: { items, nextCursor: null, hasMore: false },
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    const single = path.match(new RegExp(`^${base}/shared-notes/([^/]+)$`));
    if (single) {
      const entry = store.get(single[1]);
      if (!entry) return route.fulfill({ status: 404, json: {} });
      if (method === 'GET') {
        return route.fulfill({
          json: detail(entry, edited.has(entry.id)),
          headers: {
            ETag: `"${entry.version}"`,
            'Cache-Control': 'private, no-store',
          },
        });
      }
      if (method === 'PATCH') {
        const body = request.postDataJSON() as Record<string, unknown>;
        patches.push(body);
        if (typeof body.title === 'string') entry.title = body.title;
        if (typeof body.body === 'string') entry.body = body.body;
        entry.version += 1;
        edited.add(entry.id);
        return route.fulfill({
          json: detail(entry, true),
          headers: { ETag: `"${entry.version}"` },
        });
      }
    }
    return route.fallback();
  });
  return { patches, planCalls };
}

const holiday = note(
  'note-holiday',
  'Holiday flat',
  'Key box next to the door.\nCheck-in from 3 pm.\n• Bins on Monday\n• Washing machine under the sink',
  { pinned: true },
);
const places = note(
  'note-places',
  'Places to try',
  'The small cafe in the old town and the fish place by the harbour.',
);

test.use({ viewport: { width: 390, height: 844 } });

test('browse, read, edit and save a shared note on a phone', async ({
  page,
}, testInfo) => {
  const { patches } = await fixture(page, [holiday, places]);
  await signIn(page);
  await page.goto('/more/notes');
  // Notes share the Gemeinsam destination with Lists; the view is a tab.
  await expect(
    page.getByRole('heading', {
      name: navigation.sharedHeading,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: navigation.sharedNotes, exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('heading', { name: holiday.title }),
  ).toBeVisible();
  await captureScreenshot(
    page,
    testInfo,
    'shared-notes-overview-compact-light.png',
    { animations: 'disabled' },
  );

  await page.getByRole('heading', { name: holiday.title }).click();
  // One quiet author line replaces the audience badge: the note was written
  // by the viewer and last changed by the partner.
  await expect(
    page.getByText(copy.writtenByYou, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Bins on Monday')).toBeVisible();
  await captureScreenshot(
    page,
    testInfo,
    'shared-notes-read-compact-light.png',
    { animations: 'disabled' },
  );

  // Editing, pinning and deleting live in the one actions menu: Edit is first
  // and Delete is last.
  await openItemMenu(page);
  const menuRows = page.locator('.item-menu-option');
  await expect(menuRows.first()).toContainText(de.common.edit);
  await expect(menuRows.last()).toContainText(de.common.delete);
  await itemMenuRow(page, de.common.edit).click();
  const text = page.getByLabel(copy.edit.bodyLabel, { exact: true });
  await text.fill(
    'Key box next to the door.\nCheck-in from 3 pm.\n• Bins on Monday',
  );
  await captureScreenshot(
    page,
    testInfo,
    'shared-notes-editor-compact-light.png',
    { animations: 'disabled' },
  );
  await page.getByRole('button', { name: de.common.save, exact: true }).click();

  await expect(page.getByText(copy.toast.saved)).toBeVisible();
  await expect(page.getByText('Washing machine under the sink')).toHaveCount(0);
  expect(patches).toHaveLength(1);
});

test('the overview in the dark theme', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await fixture(page, [holiday, places]);
  await signIn(page);
  await page.goto('/more/notes');
  await expect(
    page.getByRole('heading', { name: holiday.title }),
  ).toBeVisible();
  await captureScreenshot(
    page,
    testInfo,
    'shared-notes-overview-compact-dark.png',
    { animations: 'disabled' },
  );
});

test('the first-use state explains the value and offers the next step', async ({
  page,
}, testInfo) => {
  await fixture(page, []);
  await signIn(page);
  await page.goto('/more/notes');
  await expect(page.getByText(copy.empty.title)).toBeVisible();
  await expect(
    page
      .getByRole('button', { name: copy.createFirst, exact: true })
      .or(page.getByRole('link', { name: copy.createFirst, exact: true })),
  ).toBeVisible();
  await captureScreenshot(
    page,
    testInfo,
    'shared-notes-empty-compact-light.png',
    { animations: 'disabled' },
  );
});

test.describe('expanded layout', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('the overview keeps its single reading column on a wide screen', async ({
    page,
  }, testInfo) => {
    await fixture(page, [holiday, places]);
    await signIn(page);
    await page.goto('/more/notes');
    await expect(
      page.getByRole('heading', { name: holiday.title }),
    ).toBeVisible();
    await captureScreenshot(
      page,
      testInfo,
      'shared-notes-overview-expanded-light.png',
      {
        animations: 'disabled',
      },
    );
  });
});

test.describe('reflow and reduced motion', () => {
  test.use({ viewport: { width: 320, height: 700 } });

  test('overview, reading and editing reflow at 320 px with 200% text and reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fixture(page, [holiday, places]);
    await signIn(page);
    const horizontalOverflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
    const largeText = () =>
      page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });

    await page.goto('/more/notes');
    await expect(
      page.getByRole('heading', { name: holiday.title }),
    ).toBeVisible();
    await largeText();
    expect(await horizontalOverflow()).toBe(false);

    await page.getByRole('heading', { name: holiday.title }).click();
    await expect(
      page.getByText('Bins on Monday', { exact: true }),
    ).toBeVisible();
    await largeText();
    expect(await horizontalOverflow()).toBe(false);

    await editViaMenu(page, de.common.edit);
    await expect(
      page.getByLabel(copy.edit.bodyLabel, { exact: true }),
    ).toBeVisible();
    await largeText();
    expect(await horizontalOverflow()).toBe(false);
    // With reduced motion the saved state is announced without relying on movement.
    await page
      .getByRole('button', { name: de.common.save, exact: true })
      .click();
    await expect(page.getByText(copy.toast.saved)).toBeVisible();
  });
});

test('a pinned note appears on Wir as a tile that opens the note', async ({
  page,
}, testInfo) => {
  await fixture(page, [holiday, places]);
  await signIn(page);
  await page.goto('/today');
  await expect(
    page.getByRole('heading', { name: copy.wir.titleOne, exact: true }),
  ).toBeVisible();
  await page
    .getByRole('heading', { name: copy.wir.titleOne })
    .scrollIntoViewIfNeeded();
  // The module alone: the surrounding Wir composition is unrelated to this change.
  await captureScreenshot(
    page.locator('section').filter({
      has: page.getByRole('heading', { name: copy.wir.titleOne, exact: true }),
    }),
    testInfo,
    'shared-notes-wir-module-compact-light.png',
    { animations: 'disabled' },
  );
  await page
    .getByRole('link', {
      name: copy.wir.open.replace('{{title}}', holiday.title),
    })
    .click();
  await expect(page.getByText('Bins on Monday', { exact: true })).toBeVisible();
});

test('a Plan is created with a shared note: chosen in the draft, linked after the save, retried honestly', async ({
  page,
}, testInfo) => {
  const { planCalls } = await fixture(page, [holiday, places]);
  await signIn(page);
  await page.goto('/plan/plans/new');
  await page.getByLabel(m5s3.plan.intentionLabel).fill('Weekend at the lake');
  await page.getByRole('button', { name: copy.plan.tool, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: copy.plan.choose });
  // A new note would leave the unsaved Plan behind, so the sheet does not offer it.
  await expect(
    dialog.getByRole('button', { name: copy.plan.createNew }),
  ).toHaveCount(0);
  await dialog
    .getByRole('checkbox', { name: new RegExp(holiday.title) })
    .check();
  await dialog
    .getByRole('button', { name: copy.plan.link, exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: holiday.title, exact: true }),
  ).toBeVisible();
  expect(planCalls.links).toEqual([]);
  await captureScreenshot(
    page,
    testInfo,
    'shared-notes-plan-create-compact-light.png',
    { animations: 'disabled' },
  );

  planCalls.failLinks = true;
  await page.getByRole('button', { name: de.common.save, exact: true }).click();
  await expect(page.getByText(composerCopy.planSavedLinkFailed)).toBeVisible();
  expect(planCalls.creates).toHaveLength(1);
  planCalls.failLinks = false;
  await page
    .getByRole('button', { name: de.common.retry, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/plan/plans/${CREATED_PLAN_ID}$`));
  expect(planCalls.creates).toHaveLength(1);
  expect(planCalls.links).toEqual([holiday.id]);
});

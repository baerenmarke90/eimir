import { expect, type Page, test } from '@playwright/test';
import m5s3 from '../../src/i18n/locales/m5s3';
import navigation from '../../src/i18n/locales/navigation';
import sharedNotesCopy from '../../src/i18n/locales/sharedNotes';
import { itemMenuTrigger, openItemMenu } from '../support/itemMenu';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  installMocks,
  ME,
  PARTNER,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

/*
 * The Listen destination (fifth primary tab): Lists and Notes are two views of
 * one place, entered from the bottom bar. The journeys cover the tab switch,
 * ticking an entry on its list card, opening the list from the card heading and
 * the single actions menu of a note.
 */

const copy = sharedNotesCopy.sharedNotes;
const base = `/api/v1/spaces/${SPACE_ID}`;
const stamp = '2026-11-09T10:00:00Z';
const LIST_ID = 'list-weekend';
const LIST_TITLE = 'Weekend packing';
const NOTE_ID = 'note-holiday';
const NOTE_TITLE = 'Holiday flat';
const ENTRY_TITLES = [
  'Sunscreen',
  'Swimwear',
  'Charger',
  'Book',
  'Snacks',
  'Umbrella',
] as const;

type Patch = {
  itemId: string;
  ifMatch: string | undefined;
  body: Record<string, unknown>;
};

const authored = {
  spaceId: SPACE_ID,
  createdBy: ACCOUNT_ID,
  creator: ME,
  createdAt: stamp,
  updatedAt: stamp,
  version: 1,
  capabilities: CAPABILITIES,
};

/** Shared product mocks plus one list with six entries and one shared note. */
async function fixture(page: Page) {
  await installMocks(page, { strict: true });
  const list = {
    ...authored,
    id: LIST_ID,
    title: LIST_TITLE,
    items: ENTRY_TITLES.map((title, position) => ({
      ...authored,
      id: `entry-${position}`,
      collectionId: LIST_ID,
      title,
      position,
      completed: false,
    })),
  };
  const note = {
    ...authored,
    id: NOTE_ID,
    title: NOTE_TITLE,
    body: 'Key box next to the door.\nCheck-in from 3 pm.',
    pinned: false,
    wirTitleOnly: false,
    editedAt: stamp,
    editedBy: PARTNER.id,
    editor: PARTNER,
  };
  const patches: Patch[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;
    if (method === 'GET' && path === `${base}/collections`) {
      return route.fulfill({ json: { items: [list], nextCursor: null } });
    }
    if (method === 'GET' && path === `${base}/collections/${LIST_ID}`) {
      return route.fulfill({ json: list });
    }
    const entry = path.match(
      new RegExp(`^${base}/collections/${LIST_ID}/items/([^/]+)$`),
    );
    if (method === 'PATCH' && entry) {
      const row = list.items.find((item) => item.id === entry[1]);
      if (!row) return route.fulfill({ status: 404, json: {} });
      const body = request.postDataJSON() as Record<string, unknown>;
      patches.push({
        itemId: row.id,
        ifMatch: request.headers()['if-match'],
        body,
      });
      row.completed = body.completed === true;
      row.version += 1;
      return route.fulfill({ json: row });
    }
    if (method === 'GET' && path === `${base}/shared-notes`) {
      return route.fulfill({
        json: { items: [note], nextCursor: null, hasMore: false },
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    if (method === 'GET' && path === `${base}/shared-notes/${NOTE_ID}`) {
      return route.fulfill({
        json: note,
        headers: {
          ETag: `"${note.version}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    return route.fallback();
  });
  return { patches };
}

test.use({ viewport: { width: 390, height: 844 } });

test('Listen opens from the bottom bar, switches between Listen and Notizen, ticks an entry on its card and opens the list', async ({
  page,
}) => {
  const { patches } = await fixture(page);
  await signIn(page);

  const dock = page.locator('.mobile-bottom-nav');
  const listen = dock.getByRole('link', {
    name: navigation.shared,
    exact: true,
  });
  await listen.click();
  await expect(page).toHaveURL(/\/more\/collections$/);
  await expect(listen).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: navigation.sharedHeading,
      exact: true,
    }),
  ).toBeVisible();
  const listsTab = page.getByRole('tab', {
    name: navigation.sharedLists,
    exact: true,
  });
  const notesTab = page.getByRole('tab', {
    name: navigation.sharedNotes,
    exact: true,
  });
  await expect(listsTab).toHaveAttribute('aria-selected', 'true');

  // Notizen are the second view of the same destination, and back again.
  await notesTab.click();
  await expect(page).toHaveURL(/\/more\/notes$/);
  await expect(notesTab).toHaveAttribute('aria-selected', 'true');
  await expect(listen).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: NOTE_TITLE })).toBeVisible();
  await listsTab.click();
  await expect(page).toHaveURL(/\/more\/collections$/);
  await expect(listsTab).toHaveAttribute('aria-selected', 'true');

  // The card shows the first entries; the rest unfold in place.
  const card = page.locator('.planning-card-item').filter({
    has: page.getByRole('heading', { name: LIST_TITLE }),
  });
  const entries = card.getByRole('checkbox');
  await expect(entries).toHaveCount(4);
  await card
    .getByRole('button', {
      name: m5s3.collection.previewMore.replace('{{count}}', '2'),
    })
    .click();
  await expect(entries).toHaveCount(ENTRY_TITLES.length);
  await expect(
    card.getByRole('button', { name: m5s3.collection.previewLess }),
  ).toHaveAttribute('aria-expanded', 'true');

  // An entry is ticked on the card and saved at once.
  const entry = card.getByRole('checkbox', {
    name: ENTRY_TITLES[0],
    exact: true,
  });
  await entry.click();
  await expect(entry).toBeChecked();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].itemId).toBe('entry-0');
  expect(patches[0].ifMatch).toBe('1');
  expect(patches[0].body).toHaveProperty('completed', true);

  // The card heading opens the list itself, still inside Listen.
  await card.getByRole('heading', { name: LIST_TITLE }).click();
  await expect(page).toHaveURL(new RegExp(`/plan/collections/${LIST_ID}$`));
  await expect(
    page.getByRole('heading', { level: 1, name: LIST_TITLE }),
  ).toBeVisible();
  await expect(listen).toHaveAttribute('aria-current', 'page');
});

test('a note searches by icon and its one actions menu lists Edit first and Delete last', async ({
  page,
}) => {
  await fixture(page);
  await signIn(page);
  await page
    .locator('.mobile-bottom-nav')
    .getByRole('link', { name: navigation.shared, exact: true })
    .click();
  await page
    .getByRole('tab', { name: navigation.sharedNotes, exact: true })
    .click();
  await expect(page).toHaveURL(/\/more\/notes$/);

  // The search rests as an icon and opens into one shared question.
  await page.getByRole('button', { name: copy.search, exact: true }).click();
  const search = page.getByRole('searchbox', { name: copy.search });
  await expect(search).toHaveAttribute('placeholder', navigation.searchPrompt);
  await search.fill(NOTE_TITLE);
  await page.getByRole('heading', { name: NOTE_TITLE }).click();
  await expect(page).toHaveURL(new RegExp(`/more/notes/${NOTE_ID}$`));
  await expect(
    page.getByRole('heading', { level: 1, name: NOTE_TITLE }),
  ).toBeVisible();

  // Editing is not a button on the page; it is the first row of the menu.
  await expect(
    page.getByRole('button', { name: copy.read.edit, exact: true }),
  ).toHaveCount(0);
  await expect(itemMenuTrigger(page)).toHaveCount(1);
  await openItemMenu(page);
  const rows = page.locator('.item-menu-option');
  await expect(rows.first()).toContainText(copy.read.edit);
  await expect(rows.last()).toContainText(copy.menu.delete);
});

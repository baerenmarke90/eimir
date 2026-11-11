import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import importantDates from '../../src/i18n/locales/importantDates';
import people from '../../src/i18n/locales/people';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import {
  expectFloatingAddAction,
  expectLabeledAddAction,
  expectOverviewActionPlacement,
} from '../support/addAction';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { mockEmptyPartnerNickname } from '../support/partnerNickname';
import { fulfillUnconfiguredPhotoSources } from '../support/photoSources';
import { fulfillEmptyPlanComments } from '../support/planComments';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '44444444-4444-4444-8444-444444444444';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const PARTNER_PROFILE_ID = '55555555-5555-4555-8555-555555555555';
const TEST_NOW = '2026-09-09T10:00:00Z';
const LONG_PERSON_NAME =
  'Alexandra Maximiliane Example-Surname With An Exceptionally Long Display Name';
const LONG_DATE_LABEL =
  'Our first shared seaside holiday and the beginning of an exceptionally long journey together';

async function expectNoWcagViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
      'wcag22a',
      'wcag22aa',
    ])
    .analyze();
  const summary = result.violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.nodes.length} node(s)`,
    )
    .join('\n');
  expect(result.violations, summary || 'No axe violations').toEqual([]);
}

async function expectHorizontalReflow(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>(
        '#main-content a[href], #main-content button, #main-content input:not(.visually-hidden-file-input), #main-content select, #main-content textarea, #main-content summary',
      ),
    )
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label:
            element.getAttribute('aria-label') ||
            element.getAttribute('name') ||
            element.textContent?.trim().slice(0, 80) ||
            element.tagName,
          left: rect.left,
          right: rect.right,
        };
      });

    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      clippedControls: controls.filter(
        (control) => control.left < -1 || control.right > root.clientWidth + 1,
      ),
    };
  });

  expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
  expect(result.clippedControls).toEqual([]);
}

async function installPeopleApiMocks(page: Page): Promise<string[]> {
  const unexpectedRequests: string[] = [];
  const avatar = readFileSync(
    new URL('../fixtures/recap-lake.webp', import.meta.url),
  );
  let personRows = [
    {
      id: 'person-1',
      displayName: LONG_PERSON_NAME,
      relationship: 'FRIEND',
      birthday: '1995-05-12',
      birthdayYearKnown: true,
      visibility: 'SHARED',
      showBirthdayOnDashboard: true,
      avatarAttachmentId: 'people-avatar',
      version: 3,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    },
    {
      id: 'person-2',
      displayName: 'Mara',
      relationship: 'SIBLING',
      birthday: null,
      birthdayYearKnown: false,
      visibility: 'SHARED',
      showBirthdayOnDashboard: false,
      avatarAttachmentId: null,
      version: 1,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    },
  ];
  let dateRows = [
    {
      id: 'date-1',
      label: LONG_DATE_LABEL,
      date: '2026-09-21',
      relatedPersonId: 'person-1',
      repeats: 'ANNUALLY',
      type: 'ANNIVERSARY',
      visibility: 'SHARED',
      version: 2,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    },
    {
      id: 'date-2',
      label: 'Mara birthday',
      date: '2026-11-03',
      relatedPersonId: 'person-2',
      repeats: 'ANNUALLY',
      type: 'BIRTHDAY',
      visibility: 'PRIVATE',
      version: 1,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    },
  ];

  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillUnconfiguredPhotoSources(route)) return;
    if (await fulfillEmptyPlanComments(route)) return;
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const fulfillJson = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/recaps`) {
      await fulfillJson({
        canCompose: false,
        editions: [],
        periods: [],
        hasMore: false,
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      await fulfillJson({
        maintenanceMode: false,
        registrationAvailable: true,
        registrationUnavailableReason: null,
        auth: {
          localPassword: true,
          passkey: true,
          magicLink: true,
          oidc: false,
        },
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await fulfillJson({
        account: { id: ACCOUNT_ID, displayName: 'Lea Summer' },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'people-e2e-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'people-e2e-refresh-token',
        },
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
      await fulfillJson({
        accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        accessToken: 'people-e2e-refreshed-token',
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        refreshToken: 'people-e2e-refresh-token-2',
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ id: ACCOUNT_ID, displayName: 'Lea Summer' });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      await fulfillJson({ serverAdmin: false });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      await fulfillJson([
        { role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' },
      ]);
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`) {
      await fulfillJson({
        id: SPACE_ID,
        createdAt: '2023-06-17T00:00:00Z',
        relationshipStartedOn: '2023-06-17',
        partners: [
          { id: ACCOUNT_ID, displayName: 'Lea Summer' },
          { id: PARTNER_ID, displayName: 'Alex Winter' },
        ],
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/configuration`
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: '"7"' },
        body: JSON.stringify({
          canManageSpaceConfiguration: true,
          dailyContextTimezone: null,
          dailyQuestionsEnabled: false,
          energyCheckInEnabled: false,
          energyVisibilityMode: 'IMMEDIATE',
          loveNotesEnabled: false,
          sharedAchievementsEnabled: false,
          spaceId: SPACE_ID,
          supportGesturesEnabled: true,
          version: 7,
          vibeCheckEnabled: false,
          vibeVisibilityMode: 'IMMEDIATE',
        }),
      });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: '2023-06-17',
        showRelationshipDuration: true,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profile-preferences`
    ) {
      await fulfillJson({ items: [] });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}`
    ) {
      await fulfillJson({
        accountId: ACCOUNT_ID,
        createdAt: TEST_NOW,
        displayName: 'Lea Summer',
        birthday: '1991-04-13',
        id: PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${PARTNER_ID}`
    ) {
      await fulfillJson({
        accountId: PARTNER_ID,
        createdAt: TEST_NOW,
        displayName: 'Alex Winter',
        birthday: '1990-05-14',
        id: PARTNER_PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await fulfillJson({
        items: [{ moduleKey: 'upcoming', itemLimit: 2 }],
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await fulfillJson({
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Alex Winter' },
        },
        relationshipDuration: {
          daysTogether: 1180,
          startedOn: '2023-06-17',
        },
        retrospective: null,
        recentShared: [],
        upcoming: [],
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
    ) {
      await fulfillJson({ unreadCount: 0 });
      return;
    }

    const personPath = `/api/v1/spaces/${SPACE_ID}/related-persons`;
    const datePath = `/api/v1/spaces/${SPACE_ID}/important-dates`;
    if (pathname === `${personPath}`) {
      if (method === 'GET') return fulfillJson(personRows);
      if (method === 'POST') {
        const row = {
          ...personRows[1],
          ...request.postDataJSON(),
          id: 'new-person',
          version: 1,
        };
        personRows = [...personRows, row];
        return fulfillJson(row, 201);
      }
    }
    if (pathname.startsWith(`${personPath}/`)) {
      const id = pathname.slice(personPath.length + 1);
      const row = personRows.find((p) => p.id === id);
      if (!row)
        return fulfillJson(
          { code: 'RELATED_PERSON_NOT_FOUND', status: 404 },
          404,
        );
      if (method === 'GET') return fulfillJson(row);
      if (method === 'PUT') {
        const updated = {
          ...row,
          ...request.postDataJSON(),
          version: row.version + 1,
        };
        personRows = personRows.map((p) => (p.id === id ? updated : p));
        return fulfillJson(updated);
      }
      if (method === 'DELETE') {
        personRows = personRows.filter((p) => p.id !== id);
        dateRows = dateRows.map((d) =>
          d.relatedPersonId === id ? { ...d, relatedPersonId: '' } : d,
        );
        return route.fulfill({ status: 204 });
      }
    }
    if (pathname === datePath) {
      if (method === 'GET') return fulfillJson(dateRows);
      if (method === 'POST') {
        const row = {
          ...dateRows[0],
          ...request.postDataJSON(),
          id: 'new-date',
          version: 1,
        };
        dateRows = [...dateRows, row];
        return fulfillJson(row, 201);
      }
    }
    if (pathname.startsWith(`${datePath}/`)) {
      const id = pathname.slice(datePath.length + 1);
      const row = dateRows.find((d) => d.id === id);
      if (!row)
        return fulfillJson(
          { code: 'IMPORTANT_DATE_NOT_FOUND', status: 404 },
          404,
        );
      if (method === 'GET') return fulfillJson(row);
      if (method === 'PUT') {
        const updated = {
          ...row,
          ...request.postDataJSON(),
          version: row.version + 1,
        };
        dateRows = dateRows.map((d) => (d.id === id ? updated : d));
        return fulfillJson(updated);
      }
      if (method === 'DELETE') {
        dateRows = dateRows.filter((d) => d.id !== id);
        return route.fulfill({ status: 204 });
      }
    }
    if (pathname.endsWith('/attachments/people-avatar/content'))
      return route.fulfill({ contentType: 'image/webp', body: avatar });
    if (pathname.endsWith('/attachments/people-avatar/read-access'))
      return fulfillJson({
        method: 'STREAM',
        url: `/api/v1/spaces/${SPACE_ID}/attachments/people-avatar/content`,
        mediaType: 'IMAGE',
      });

    if (
      method === 'GET' &&
      [
        `/api/v1/spaces/${SPACE_ID}/activity`,
        `/api/v1/spaces/${SPACE_ID}/notifications`,
        `/api/v1/spaces/${SPACE_ID}/search`,
        `/api/v1/spaces/${SPACE_ID}/collections`,
        `/api/v1/spaces/${SPACE_ID}/plans`,
        `/api/v1/spaces/${SPACE_ID}/places`,
        `/api/v1/spaces/${SPACE_ID}/wishes`,
      ].includes(pathname)
    ) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname ===
        `/api/v1/spaces/${SPACE_ID}/rules/relationship_anniversary_reminder/preference`
    ) {
      await fulfillJson({
        ruleKey: 'relationship_anniversary_reminder',
        enabled: true,
        parameters: { daysBefore: [7, 1], localTime: '09:00:00' },
      });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/invitations`
    ) {
      await fulfillJson([]);
      return;
    }

    if (
      (method === 'GET' || method === 'POST') &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await fulfillJson({ state: null });
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/entitlements`
    ) {
      await fulfillJson({
        spaceId: SPACE_ID,
        status: 'FREE',
        tier: 'FREE',
        capabilities: [],
        isInGracePeriod: false,
      });
      return;
    }

    unexpectedRequests.push(`${method} ${pathname}`);
    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `The People product test did not define ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  await mockEmptyPartnerNickname(page, SPACE_ID, PARTNER_ID);
  return unexpectedRequests;
}

async function signInAndOpenPeople(page: Page): Promise<void> {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  await expect(page).toHaveURL(/\/today$/);
  await page.goto('/more/people');
  await expect(page.getByRole('heading', { name: people.title })).toBeVisible();
  await expect(
    page.getByRole('link', { name: new RegExp(LONG_PERSON_NAME) }),
  ).toBeVisible();
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await page.screenshot({
    path: testInfo.outputPath(`shell-831-${name}.png`),
    fullPage: true,
  });
}

async function openPerson(page: Page) {
  await page.getByRole('link', { name: new RegExp(LONG_PERSON_NAME) }).click();
  await expect(
    page.getByRole('heading', { name: LONG_PERSON_NAME, exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(people.nameLabel, { exact: true })).toHaveCount(
    0,
  );
}
async function openEditor(page: Page) {
  await page.getByRole('link', { name: people.edit, exact: true }).click();
  await expect(
    page.getByLabel(people.nameLabel, { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(people.visibilityLabel)).toHaveCount(0);
  await expect(page.locator('.mobile-bottom-nav')).toBeHidden();
}
async function openDates(page: Page) {
  await page.goto('/plan#dates');
  await expect(
    page.getByRole('tab', { name: importantDates.heading }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('button', { name: new RegExp(LONG_DATE_LABEL) }),
  ).toBeVisible();
  const addDay = page.getByRole('button', {
    name: importantDates.create,
    exact: true,
  });
  const dock = page.locator('.mobile-bottom-shell');
  if (await dock.isVisible()) await expectFloatingAddAction(addDay, dock);
  else await expectLabeledAddAction(addDay);
}

test('People opens profiles and whole photos, saves the actual result and hands birthdays to Planning', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const unknown = await installPeopleApiMocks(page);
  await signInAndOpenPeople(page);
  await expect(
    page.getByText(people.visibility.SHARED, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(people.visibility.PRIVATE, { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(LONG_DATE_LABEL)).toHaveCount(0);
  const addPerson = page.getByRole('link', {
    name: people.addPersonAction,
    exact: true,
  });
  await expectFloatingAddAction(
    addPerson,
    page.locator('.mobile-bottom-shell'),
  );
  await expectHorizontalReflow(page);
  await expectNoWcagViolations(page);
  await capture(page, info, 'people-overview-390-light');
  await page
    .getByRole('button', {
      name: people.viewPhoto.replace('{{name}}', LONG_PERSON_NAME),
      exact: true,
    })
    .click();
  const gallery = page.getByRole('dialog');
  await expect(gallery).toBeVisible();
  await expect(addPerson).toBeHidden();
  await expect(gallery.locator('img')).toBeVisible();
  await expectNoWcagViolations(page);
  await capture(page, info, 'people-photo-390-light');
  await page.keyboard.press('Escape');
  await expect(gallery).toHaveCount(0);
  await expect(addPerson).toBeVisible();
  await openPerson(page);
  await capture(page, info, 'person-profile-390-light');
  await openEditor(page);
  await expect(
    page.getByLabel(people.nameLabel, { exact: true }),
  ).not.toBeFocused();
  await expect(page.getByLabel(people.optionalYear)).toHaveValue('1995');
  await capture(page, info, 'person-edit-390-light');
  await page.getByLabel(people.nameLabel, { exact: true }).fill('Lea Sommer');
  await page
    .getByRole('combobox', { name: people.relationshipLabel, exact: true })
    .selectOption('DAUGHTER');
  const note = 'Likes the sea.\nRemember the strawberry cake.';
  await page
    .getByRole('textbox', { name: people.noteLabel, exact: true })
    .fill(note);
  const noteBounds = await page
    .getByRole('textbox', { name: people.noteLabel, exact: true })
    .boundingBox();
  const footerBounds = await page
    .locator('.people-editor-footer')
    .boundingBox();
  if (!noteBounds || !footerBounds)
    throw new Error('Person note and completion are missing');
  expect(noteBounds.y + noteBounds.height).toBeLessThanOrEqual(footerBounds.y);
  await page
    .getByRole('button', { name: people.saveChanges, exact: true })
    .click();
  await expect(page).toHaveURL(/more\/people\/person-1$/);
  await expect(
    page.getByRole('heading', { name: 'Lea Sommer', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText(people.updated);
  await expect(page.locator('.people-profile-note')).toContainText(note);
  await expect(page.locator('.people-profile-hero')).toContainText(
    people.relationship.DAUGHTER,
  );
  await openEditor(page);
  await expect(
    page.getByRole('textbox', { name: people.noteLabel, exact: true }),
  ).toHaveValue(note);
  await expect(
    page.getByRole('combobox', { name: people.relationshipLabel, exact: true }),
  ).toHaveValue('DAUGHTER');
  await capture(page, info, 'person-note-edit-390-light');
  await page
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .click();
  await capture(page, info, 'person-saved-390-light');
  await page.locator('.people-birthday-link').click();
  await expect(
    page.getByRole('tab', { name: importantDates.heading }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('dialog')).toContainText('Lea Sommer');
  await expect(page.getByRole('dialog').getByRole('textbox')).toHaveCount(0);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Lea Sommer', exact: true })
    .click();
  await expect(page).toHaveURL(/more\/people\/person-1$/);
  await page.locator('.task-back-control[data-page-back]').click();
  await expect(
    page.getByRole('tab', { name: importantDates.heading }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('button', {
      name: new RegExp(
        importantDates.partnerBirthdayLabel.replace('{{name}}', 'Lea Sommer'),
      ),
    }),
  ).toBeFocused();
  await page.getByRole('button', { name: new RegExp(LONG_DATE_LABEL) }).click();
  const reader = page.getByRole('dialog');
  await expect(reader.getByRole('textbox')).toHaveCount(0);
  await reader
    .getByRole('button', { name: importantDates.edit, exact: true })
    .click();
  let editor = page.locator('.important-date-editor');
  await expect(editor).toBeVisible();
  await editor.getByLabel(importantDates.labelLabel).fill('Our anniversary');
  await editor
    .getByRole('button', { name: importantDates.saveChanges, exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('Our anniversary');
  await page.keyboard.press('Escape');
  const addDay = page.getByRole('button', {
    name: importantDates.create,
    exact: true,
  });
  const addDayStyle = await addDay.evaluate((node) => {
    const style = getComputedStyle(node);
    const bounds = node.getBoundingClientRect();
    return {
      background: style.backgroundColor,
      color: style.color,
      width: bounds.width,
      height: bounds.height,
    };
  });
  await expectFloatingAddAction(addDay, page.locator('.mobile-bottom-shell'));
  expect(addDayStyle.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(addDayStyle.background).not.toBe(addDayStyle.color);
  expect(addDayStyle.width).toBeGreaterThanOrEqual(44);
  expect(addDayStyle.height).toBeGreaterThanOrEqual(44);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    document.addEventListener('animationstart', ({ target, animationName }) => {
      if (
        target instanceof HTMLElement &&
        target.matches('.important-date-editor')
      )
        target.dataset.e2eEntryAnimation = animationName;
    });
  });
  await addDay.click();
  editor = page.locator('.important-date-editor');
  await expect(editor).toHaveAttribute(
    'data-e2e-entry-animation',
    'eimir-create-entry-rise',
  );
  await editor.getByLabel(importantDates.dateLabel).fill('2026-12-10');
  await editor.getByLabel(importantDates.labelLabel).fill('Winter evening');
  await expect(editor.getByLabel(importantDates.personLabel)).toHaveValue('');
  await editor
    .getByRole('button', { name: importantDates.create, exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('Winter evening');
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectHorizontalReflow(page);
  await expectNoWcagViolations(page);
  await capture(page, info, 'occasions-390-light');
  for (const name of ['Lea Summer', 'Alex Winter']) {
    await expect(
      page.getByRole('button', {
        name: new RegExp(
          importantDates.partnerBirthdayLabel.replace('{{name}}', name),
        ),
      }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole('button', {
      name: new RegExp(importantDates.relationshipAnniversary),
    }),
  ).toBeVisible();
  expect(unknown).toEqual([]);
});

test('People creation and dirty edit return to the originating control', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const unknown = await installPeopleApiMocks(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await signInAndOpenPeople(page);
  const addPerson = page.getByRole('link', {
    name: people.addPersonAction,
    exact: true,
  });
  await expectFloatingAddAction(
    addPerson,
    page.locator('.mobile-bottom-shell'),
  );
  await addPerson.press('Enter');
  await expect(
    page.getByLabel(people.nameLabel, { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/more\/people$/);
  await addPerson.click();
  await page.getByRole('button', { name: taskBoundary.back }).click();
  await expect(addPerson).toBeFocused();
  await openPerson(page);
  await openEditor(page);
  await page
    .getByLabel(people.nameLabel, { exact: true })
    .fill('Keep this draft');
  await page.goBack();
  await expect(page.getByText(people.discardTitle)).toBeVisible();
  await page
    .getByRole('button', { name: people.keepEditing, exact: true })
    .click();
  await expect(page.getByLabel(people.nameLabel, { exact: true })).toHaveValue(
    'Keep this draft',
  );
  await page.getByLabel(people.optionalYear).fill('');
  await page.goBack();
  await page
    .getByRole('button', { name: people.discardConfirm, exact: true })
    .click();
  await expect(page).toHaveURL(/more\/people\/person-1$/);
  await expect(
    page.getByRole('heading', { name: LONG_PERSON_NAME, exact: true }),
  ).toBeVisible();
  await expectHorizontalReflow(page);
  await capture(page, info, 'person-return-360-light');
  await page.locator('.task-back-control[data-page-back]').click();
  await expect(page).toHaveURL(/more\/people$/);
  await expect(
    page.getByRole('link', { name: new RegExp(LONG_PERSON_NAME) }),
  ).toBeFocused();
  await addPerson.click();
  await page.getByLabel(people.nameLabel, { exact: true }).fill('Nora Winter');
  await page
    .getByRole('button', { name: people.saveChanges, exact: true })
    .click();
  await expect(page).toHaveURL(/\/more\/people\/new-person$/);
  await expect(
    page.getByRole('heading', { name: 'Nora Winter', exact: true }),
  ).toBeVisible();
  await page.locator('.task-back-control[data-page-back]').click();
  await expect(page).toHaveURL(/more\/people$/);
  await expect(page.getByRole('link', { name: /Nora Winter/ })).toBeVisible();
  await expect(addPerson).toBeFocused();
  expect(unknown).toEqual([]);
});

test('People and occasions reflow at 1280 with 400 percent zoom', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('eimir.theme', 'system'));
  await page.setViewportSize({ width: 1280, height: 1024 });
  const unknown = await installPeopleApiMocks(page);
  await signInAndOpenPeople(page);
  const addPerson = page.getByRole('link', {
    name: people.addPersonAction,
    exact: true,
  });
  await expectLabeledAddAction(addPerson);
  await expectOverviewActionPlacement(addPerson);
  await capture(page, info, 'people-overview-1280-dark');
  await page.locator('html').evaluate((el) => {
    el.style.zoom = '4';
  });
  await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
  await expectHorizontalReflow(page);
  await capture(page, info, 'people-400-dark');
  await openPerson(page);
  await expectHorizontalReflow(page);
  await openEditor(page);
  await expectHorizontalReflow(page);
  await page
    .getByRole('button', { name: people.saveChanges, exact: true })
    .scrollIntoViewIfNeeded();
  await expectNoWcagViolations(page);
  await capture(page, info, 'person-edit-400-dark');
  await page.keyboard.press('Escape');
  await openDates(page);
  await page.locator('html').evaluate((el) => {
    el.style.zoom = '4';
  });
  await expectHorizontalReflow(page);
  await page
    .getByRole('button', { name: importantDates.create, exact: true })
    .click();
  await expectHorizontalReflow(page);
  await expectNoWcagViolations(page);
  await capture(page, info, 'occasion-create-400-dark');
  expect(unknown).toEqual([]);
});

test('People and occasions stay operable at 200 percent zoom and large text', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 780, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const unknown = await installPeopleApiMocks(page);
  await signInAndOpenPeople(page);
  await page.locator('html').evaluate((el) => {
    el.style.zoom = '2';
  });
  await expectHorizontalReflow(page);
  await openPerson(page);
  await openEditor(page);
  await expectHorizontalReflow(page);
  await page
    .getByRole('button', { name: people.saveChanges, exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole('button', { name: people.saveChanges, exact: true }),
  ).toBeVisible();
  await capture(page, info, 'person-edit-200-light');
  await page.keyboard.press('Escape');
  await openDates(page);
  await page.locator('html').evaluate((el) => {
    el.style.zoom = '2';
  });
  await page
    .getByRole('button', { name: importantDates.create, exact: true })
    .click();
  await expect(
    page
      .locator('.important-date-editor')
      .getByRole('button', { name: importantDates.create, exact: true }),
  ).toBeVisible();
  await expectHorizontalReflow(page);
  await expectNoWcagViolations(page);
  await capture(page, info, 'occasion-create-200-light');
  expect(unknown).toEqual([]);
});

test('focused completion stays reachable at small height and Expanded preserves the same task', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('eimir.theme', 'system'));
  await page.setViewportSize({ width: 430, height: 420 });
  const unknown = await installPeopleApiMocks(page);
  await signInAndOpenPeople(page);
  await expectFloatingAddAction(
    page.getByRole('link', { name: people.addPersonAction, exact: true }),
    page.locator('.mobile-bottom-shell'),
  );
  await capture(page, info, 'people-overview-430-dark');
  await openPerson(page);
  await openEditor(page);
  const save = page.getByRole('button', {
    name: people.saveChanges,
    exact: true,
  });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeVisible();
  await expectHorizontalReflow(page);
  await capture(page, info, 'person-edit-small-height-dark');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.layout-rail')).toHaveCount(0);
  await capture(page, info, 'person-profile-1440-dark');
  await openEditor(page);
  await expectHorizontalReflow(page);
  await expectNoWcagViolations(page);
  await capture(page, info, 'person-edit-1440-dark');
  await page.keyboard.press('Escape');
  await openDates(page);
  await page.getByRole('button', { name: new RegExp(LONG_DATE_LABEL) }).click();
  await expect(page.getByRole('dialog').getByRole('textbox')).toHaveCount(0);
  await expectNoWcagViolations(page);
  await capture(page, info, 'occasion-reader-1440-dark');
  expect(unknown).toEqual([]);
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import importantDates from '../../src/i18n/locales/importantDates';
import people from '../../src/i18n/locales/people';

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

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const fulfillJson = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

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

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/related-persons`
    ) {
      await fulfillJson([
        {
          id: 'person-1',
          displayName: LONG_PERSON_NAME,
          relationship: 'FRIEND',
          birthday: '1995-05-12',
          birthdayYearKnown: true,
          visibility: 'SHARED',
          showBirthdayOnDashboard: true,
          avatarAttachmentId: null,
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
          visibility: 'PRIVATE',
          showBirthdayOnDashboard: false,
          avatarAttachmentId: null,
          version: 1,
          createdAt: TEST_NOW,
          updatedAt: TEST_NOW,
        },
      ]);
      return;
    }

    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/important-dates`
    ) {
      await fulfillJson([
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
      ]);
      return;
    }

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

  return unexpectedRequests;
}

async function signInAndOpenPeople(page: Page): Promise<void> {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.goto('/more/people');
  await expect(page.getByRole('heading', { name: people.title })).toBeVisible();
  await expect(page.getByText(LONG_DATE_LABEL)).toBeVisible();
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

test('W50-W55 compact composition is relationship-led, keyboard-safe and axe-clean', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpectedRequests = await installPeopleApiMocks(page);
  await signInAndOpenPeople(page);

  const dateCard = page.getByRole('button', {
    name: new RegExp(LONG_DATE_LABEL.slice(0, 32), 'i'),
  });
  await expect(dateCard).toBeVisible();
  await expect(dateCard.locator('.important-date-marker')).toBeVisible();
  await expect(
    dateCard.getByText(importantDates.visibility.SHARED),
  ).toBeVisible();
  await expect(dateCard).toHaveAccessibleName(
    new RegExp(
      `${LONG_DATE_LABEL}.*${LONG_PERSON_NAME}.*${importantDates.visibility.SHARED}`,
    ),
  );
  await expectHorizontalReflow(page);
  await expectNoWcagViolations(page);
  await capture(page, testInfo, 'w50-important-dates-390-light');

  const dateCreate = page.getByRole('button', {
    name: importantDates.create,
  });
  await dateCreate.focus();
  await dateCreate.click();
  let dialog = page.getByRole('dialog');
  await expect(dialog).toHaveClass(/important-date-editor/);
  await expect(page.getByLabel(importantDates.dateLabel)).toBeFocused();
  await expect(page.getByLabel(importantDates.labelLabel)).toHaveAttribute(
    'maxlength',
    '120',
  );
  await dialog.getByRole('button', { name: importantDates.create }).click();
  await expect(page.locator('#important-date-date:invalid')).toHaveCount(1);
  await expect(page.locator('#important-date-label:invalid')).toHaveCount(1);
  await expectHorizontalReflow(page);
  await expectNoWcagViolations(page);
  await capture(page, testInfo, 'w51-date-create-390-light');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(dateCreate).toBeFocused();

  await dateCard.click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toHaveClass(/important-date-editor/);
  await expect(dialog.getByLabel(importantDates.labelLabel)).toHaveValue(
    LONG_DATE_LABEL,
  );
  await expect(
    dialog.locator('.focused-editor-danger-zone').getByRole('button', {
      name: importantDates.delete,
    }),
  ).toBeVisible();
  await expectHorizontalReflow(page);
  await expectNoWcagViolations(page);
  await capture(page, testInfo, 'w52-date-edit-390-light');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(dateCard).toBeFocused();

  const personCreate = page.getByRole('button', {
    name: people.addPersonAction,
  });
  await personCreate.focus();
  await personCreate.click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toHaveClass(/related-person-editor/);
  await expect(
    dialog.getByRole('textbox', { name: people.nameLabel, exact: true }),
  ).toBeFocused();
  await expect(
    dialog.locator('.focused-editor-disclosure'),
  ).not.toHaveAttribute('open');
  await expect(
    dialog.getByRole('combobox', { name: people.visibilityLabel }),
  ).toBeVisible();
  await expectHorizontalReflow(page);
  await expectNoWcagViolations(page);
  await capture(page, testInfo, 'w54-person-create-390-light');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(personCreate).toBeFocused();

  const personCard = page
    .locator('.people-card')
    .filter({ hasText: LONG_PERSON_NAME });
  await personCard.click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toHaveClass(/related-person-editor/);
  await expect(dialog.getByLabel(people.nameLabel)).toHaveValue(
    LONG_PERSON_NAME,
  );
  await expect(
    dialog.locator('.focused-editor-danger-zone').getByRole('button', {
      name: people.delete,
    }),
  ).toBeVisible();
  await expectHorizontalReflow(page);
  await expectNoWcagViolations(page);
  await capture(page, testInfo, 'w55-person-edit-390-light');

  expect(unexpectedRequests).toEqual([]);
});

test('editor Browser Back keeps dirty drafts and closes clean editors without a loop', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpectedRequests = await installPeopleApiMocks(page);
  await signInAndOpenPeople(page);

  const dateCreate = page.getByRole('button', {
    name: importantDates.create,
  });
  await dateCreate.focus();
  await dateCreate.click();
  let dialog = page.getByRole('dialog');
  const labelInput = dialog.getByLabel(importantDates.labelLabel);
  await labelInput.fill('A Back-safe date draft');

  await page.goBack();
  await expect(dialog.getByText(importantDates.discardTitle)).toBeVisible();
  await dialog
    .getByRole('button', { name: importantDates.keepEditing })
    .click();
  await expect(labelInput).toHaveValue('A Back-safe date draft');

  await page.goBack();
  await expect(dialog.getByText(importantDates.discardTitle)).toBeVisible();
  await dialog
    .getByRole('button', { name: importantDates.discardConfirm })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/more\/people$/);
  await expect(dateCreate).toBeFocused();

  const personCreate = page.getByRole('button', {
    name: people.addPersonAction,
  });
  await personCreate.focus();
  await personCreate.click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toHaveClass(/related-person-editor/);

  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/more\/people$/);
  await expect(personCreate).toBeFocused();
  expect(unexpectedRequests).toEqual([]);
});

test('W50-W55 reflow at the accepted 1280 at 400 percent method without clipped controls', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('eimir.theme', 'system'));
  await page.setViewportSize({ width: 1280, height: 1024 });
  const unexpectedRequests = await installPeopleApiMocks(page);
  await signInAndOpenPeople(page);
  await page.locator('html').evaluate((element) => {
    element.style.zoom = '4';
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  await expect(page.locator('.product-topbar .shell-nav')).toBeHidden();
  await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
  await expect(page.locator('.mobile-quick-create')).toBeVisible();
  await expectHorizontalReflow(page);
  await capture(page, testInfo, 'w50-400-percent-dark');

  const dateCreate = page.getByRole('button', { name: importantDates.create });
  await dateCreate.click();
  let dialog = page.getByRole('dialog');
  await expectHorizontalReflow(page);
  await capture(page, testInfo, 'w51-400-percent-dark');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  const dateCard = page.getByRole('button', {
    name: new RegExp(LONG_DATE_LABEL.slice(0, 32), 'i'),
  });
  await dateCard.click();
  dialog = page.getByRole('dialog');
  await expectHorizontalReflow(page);
  await capture(page, testInfo, 'w52-400-percent-dark');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  const personCreate = page.getByRole('button', {
    name: people.addPersonAction,
  });
  await personCreate.click();
  dialog = page.getByRole('dialog');
  await expectHorizontalReflow(page);
  await capture(page, testInfo, 'w54-400-percent-dark');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  const personCard = page
    .locator('.people-card')
    .filter({ hasText: LONG_PERSON_NAME });
  await personCard.click();
  dialog = page.getByRole('dialog');
  await expectHorizontalReflow(page);
  await capture(page, testInfo, 'w55-400-percent-dark');

  expect(unexpectedRequests).toEqual([]);
});

test('People and Important Dates remain usable at 200 percent zoom', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 780, height: 844 });
  const unexpectedRequests = await installPeopleApiMocks(page);
  await signInAndOpenPeople(page);
  await page.locator('html').evaluate((element) => {
    element.style.zoom = '2';
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  await expectHorizontalReflow(page);
  const dateCreate = page.getByRole('button', { name: importantDates.create });
  await dateCreate.click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('button', { name: importantDates.create }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: de.common.cancel }),
  ).toBeVisible();
  await expectHorizontalReflow(page);
  await expectNoWcagViolations(page);
  await capture(page, testInfo, 'w51-200-percent-light');

  expect(unexpectedRequests).toEqual([]);
});

test('focused editors keep completion reachable at small height and adapt without desktop density at 1440', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 520 });
  const unexpectedRequests = await installPeopleApiMocks(page);
  await signInAndOpenPeople(page);

  await page.getByRole('button', { name: people.addPersonAction }).click();
  let dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('button', { name: people.create }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: de.common.cancel }),
  ).toBeVisible();
  await expectHorizontalReflow(page);
  await capture(page, testInfo, 'w54-small-height-dark');
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole('button', {
      name: new RegExp(LONG_DATE_LABEL.slice(0, 32), 'i'),
    })
    .click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toHaveClass(/focused-editor-sheet/);
  await expect(dialog.locator('.focused-editor-actions')).toBeVisible();
  await expect(page.locator('.layout-split')).toHaveCount(0);
  await expect(page.locator('.layout-rail')).toHaveCount(0);
  await expectHorizontalReflow(page);
  await expectNoWcagViolations(page);
  await capture(page, testInfo, 'w52-expanded-1440-dark');

  expect(unexpectedRequests).toEqual([]);
});

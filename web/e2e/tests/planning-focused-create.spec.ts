import { expectFloatingAddAction } from '../support/addAction';
import { fulfillFreeEntitlements } from '../support/freeEntitlements';
import { fulfillUnconfiguredPhotoSources } from '../support/photoSources';
import { fulfillEmptyPlanComments } from '../support/planComments';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';
import composer from '../../src/i18n/locales/composer';
import contextTags from '../../src/i18n/locales/contextTags';
import storyProducts from '../../src/i18n/locales/storyProducts';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import { captureR3Evidence } from './r3-evidence';
import { expectLabeledComposerTool } from '../support/addAction';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const TEST_NOW = '2026-09-01T10:00:00Z';

type MockCalls = {
  wishCreates: number;
  wishUpdates: number;
  wishDeletes: number;
  planCreates: number;
  lastPlanBody?: Record<string, unknown>;
};

async function installPlanningMocks(
  page: Page,
  options: { failFirstPlanSave?: boolean } = {},
): Promise<MockCalls> {
  const calls: MockCalls = {
    wishCreates: 0,
    wishUpdates: 0,
    wishDeletes: 0,
    planCreates: 0,
  };
  let failFirstPlanSave = options.failFirstPlanSave ?? false;
  const wishesPath = `/api/v1/spaces/${SPACE_ID}/wishes`;
  let wishContent: {
    title: string;
    description?: string | null;
    tags?: string[];
  } | null = null;
  let wishVersion = 1;

  function wishResponse() {
    return wishContent
      ? {
          capabilities: { canDelete: true, canEdit: true, canComment: false },
          createdAt: TEST_NOW,
          createdBy: ACCOUNT_ID,
          creator: { accountId: ACCOUNT_ID, displayName: 'Anna' },
          description: null,
          id: 'wish-created',
          spaceId: SPACE_ID,
          status: 'OPEN',
          updatedAt: TEST_NOW,
          version: wishVersion,
          ...wishContent,
        }
      : null;
  }

  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillFreeEntitlements(route, SPACE_ID)) return;
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
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'planning-focused-create-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'planning-focused-create-refresh-token',
        },
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ displayName: 'Anna', id: ACCOUNT_ID });
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
      await fulfillJson({ id: SPACE_ID, createdAt: TEST_NOW, partners: [] });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: null,
        showRelationshipDuration: false,
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
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await fulfillJson({ items: [] });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await fulfillJson({
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner: null, spaceId: SPACE_ID },
        upcoming: [],
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}`
    ) {
      await fulfillJson({
        accountId: ACCOUNT_ID,
        createdAt: TEST_NOW,
        displayName: 'Anna',
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
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
    ) {
      await fulfillJson({ unreadCount: 0 });
      return;
    }
    if (method === 'GET' && pathname === wishesPath) {
      const wish = wishResponse();
      await fulfillJson({
        hasMore: false,
        items: wish ? [wish] : [],
        nextCursor: null,
      });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/plans`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      await fulfillJson({
        hasMore: false,
        nextCursor: null,
        items: [
          {
            address: null,
            capabilities: { canDelete: true, canEdit: true },
            createdAt: TEST_NOW,
            createdBy: ACCOUNT_ID,
            creator: { accountId: ACCOUNT_ID, displayName: 'Anna' },
            description: null,
            id: 'place-berlin',
            latitude: null,
            longitude: null,
            name: 'Berlin',
            spaceId: SPACE_ID,
            updatedAt: TEST_NOW,
            version: 1,
          },
        ],
      });
      return;
    }
    if (method === 'POST' && pathname === wishesPath) {
      calls.wishCreates += 1;
      wishContent = request.postDataJSON();
      await fulfillJson(wishResponse(), 201);
      return;
    }
    if (
      wishContent &&
      pathname === `${wishesPath}/wish-created` &&
      (method === 'GET' || method === 'PATCH' || method === 'DELETE')
    ) {
      if (method === 'DELETE') {
        expect(request.headers()['if-match']).toBe(String(wishVersion));
        calls.wishDeletes += 1;
        wishContent = null;
        await route.fulfill({ status: 204 });
        return;
      }
      if (method === 'PATCH') {
        expect(request.headers()['if-match']).toBe(String(wishVersion));
        calls.wishUpdates += 1;
        wishContent = { ...wishContent, ...request.postDataJSON() };
        wishVersion += 1;
      }
      await fulfillJson(wishResponse());
      return;
    }
    if (method === 'POST' && pathname === `/api/v1/spaces/${SPACE_ID}/plans`) {
      calls.planCreates += 1;
      const body = request.postDataJSON() as Record<string, unknown>;
      calls.lastPlanBody = body;
      if (failFirstPlanSave) {
        failFirstPlanSave = false;
        await fulfillJson(
          {
            code: 'PLAN_SAVE_FAILED',
            detail: 'Forced save failure.',
            status: 500,
            title: 'Save failed',
          },
          500,
        );
        return;
      }
      await fulfillJson(
        {
          capabilities: { canDelete: true, canEdit: true },
          createdAt: TEST_NOW,
          createdBy: ACCOUNT_ID,
          creator: { accountId: ACCOUNT_ID, displayName: 'Anna' },
          description: body.description ?? null,
          experiencedOn: null,
          id: 'plan-created',
          placeId: body.placeId ?? null,
          plannedEnd: null,
          plannedOn: null,
          plannedStart: null,
          sourceWishId: null,
          spaceId: SPACE_ID,
          status: 'IDEA',
          title: body.title,
          updatedAt: TEST_NOW,
          version: 1,
        },
        201,
      );
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await fulfillJson({ state: null });
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `Planning focused-create test does not define ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  return calls;
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const scenario of [
  { name: '320-light', width: 320, height: 720, theme: 'light' },
  { name: '390-dark', width: 390, height: 844, theme: 'dark' },
  { name: 'expanded', width: 1280, height: 900, theme: 'light' },
] as const) {
  test(`focused Plan creation remains calm and accessible: ${scenario.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    await page.addInitScript((theme) => {
      window.localStorage.setItem('eimir.theme', theme);
    }, scenario.theme);
    await installPlanningMocks(page);
    await signIn(page);
    await page.goto('/plan/plans/new');

    const intention = page.getByLabel(m5s3.plan.intentionLabel);
    await expect(intention).toBeVisible();
    await expect(intention).not.toBeFocused();
    await expect(page.locator('.product-topbar')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      scenario.theme,
    );
    await expectNoHorizontalOverflow(page);

    if (scenario.name === '320-light') {
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(result.violations).toEqual([]);
    }
    await captureR3Evidence(
      page,
      testInfo,
      `r3-create-plan-${scenario.name}.png`,
    );
  });
}

test('the Wish composer creates, edits and returns through the saved Wish', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const calls = await installPlanningMocks(page);
  await signIn(page);
  await page.goto('/plan');
  const wishes = page.getByRole('tab', { name: m5s3.overview.segmentWishes });
  await wishes.click();
  await page.getByRole('link', { name: m5s3.overview.addWish }).click();

  await expect(page.getByText(m5s3.wish.sharedBody)).toHaveCount(0);
  await expect(page.getByText(m5s3.plan.sharedBody)).toHaveCount(0);
  expect(
    await page
      .locator('#main-content')
      .evaluate((main) => main.getAnimations().length),
  ).toBe(0);
  const title = 'See the northern lights';
  const opening = 'Rent a small cabin by the lake and pack a thermos.';
  const ending = 'Have breakfast together by the lake the next morning.';
  const description = [
    opening,
    'Leave the cabin lights off after sunset.',
    'Walk down to the water for a clear view to the north.',
    'Stay outside for another cup of tea if clouds roll in.',
    'Bring the camera and take some time to look up first.',
    ending,
  ].join('\n\n');
  const titleField = page.getByLabel(m5s3.wish.intentionLabel);
  const descriptionField = page.getByLabel(m5s3.common.description);
  const writing = page.locator('.wish-composer .page-composer-writing');
  await expect(titleField).not.toBeFocused();
  await expect(descriptionField).toBeEditable();
  await expect(writing.getByLabel(m5s3.wish.intentionLabel)).toBeVisible();
  await expect(page.locator('.mobile-bottom-shell')).toBeHidden();
  const tagTool = page
    .locator('.composer-tool-row')
    .getByRole('button', { name: composer.tag, exact: true });
  await expectLabeledComposerTool(tagTool, 'tag');
  const emptyHeight = await descriptionField.evaluate(
    (field) => field.clientHeight,
  );
  await titleField.fill(title);
  await descriptionField.fill(description);
  expect(
    await descriptionField.evaluate((field) => field.clientHeight),
  ).toBeGreaterThan(emptyHeight);
  await page
    .getByRole('button', { name: taskBoundary.close, exact: true })
    .click();
  await page.getByRole('button', { name: taskBoundary.keepEditing }).click();
  await expect(descriptionField).toHaveValue(description);
  await captureR3Evidence(page, testInfo, 'r3-create-wish-390-light.png');

  await page
    .getByRole('button', { name: m5s3.common.save, exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan\/wishes\/wish-created$/);
  expect(calls.wishCreates).toBe(1);
  const prose = page.locator('.wish-detail .authored-text');
  await expect(prose).toContainText(opening);
  await expect(prose).not.toContainText(ending);
  const more = page.getByRole('button', {
    name: storyProducts.descriptionDisclosure.more,
  });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await captureR3Evidence(page, testInfo, 'wish-description-390-light.png');
  await more.click();
  await expect(prose).toContainText(ending);
  await page
    .getByRole('button', { name: storyProducts.descriptionDisclosure.less })
    .click();
  await expect(prose).not.toContainText(ending);

  await page
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .click();
  await expect(wishes).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(prose).toContainText(opening);

  const edit = page.getByRole('button', { name: de.common.edit, exact: true });
  await edit.click();
  const editTitle = writing.getByLabel(m5s3.common.title, { exact: true });
  const editDescription = writing.getByLabel(m5s3.common.description);
  const save = page.getByRole('button', { name: m5s3.common.saveChanges });
  await expect(editTitle).toHaveValue(title);
  await expect(editTitle).not.toBeFocused();
  await expect(save).toHaveText(m5s3.common.save);
  await expect(page.locator('.mobile-bottom-shell')).toBeHidden();
  await expect(page.getByText(m5s3.wish.actionsHeading)).toHaveCount(0);
  await expect(editDescription).toHaveValue(description);
  expect(
    await editDescription.evaluate(
      (field) => field.scrollHeight - field.clientHeight,
    ),
  ).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page);
  await captureR3Evidence(page, testInfo, 'wish-edit-390-light.png');

  await tagTool.click();
  const tagSheet = page.getByRole('dialog', { name: composer.tagsTitle });
  const tag = 'Gemeinsame Abenteuer';
  const tagField = tagSheet.getByLabel(contextTags.newLabel);
  await tagField.fill(tag);
  await tagField.press('Enter');
  await page.keyboard.press('Escape');
  await expect(tagSheet).toHaveCount(0);
  await expect(tagTool).toBeFocused();
  await expect(
    page.getByRole('button', {
      name: composer.editTag.replace('{{name}}', tag),
    }),
  ).toBeVisible();

  await editDescription.fill('');
  await page.goBack();
  const discard = page.getByRole('alertdialog', {
    name: taskBoundary.discardTitle,
  });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: taskBoundary.keepEditing }).click();
  await expect(discard).toHaveCount(0);
  await expect(editDescription).toHaveValue('');

  await page.context().setOffline(true);
  await save.click();
  await expect(page.getByText(de.states.offline.title)).toBeVisible();
  await expect(editDescription).toBeEditable();
  expect(calls.wishUpdates).toBe(0);
  await page.context().setOffline(false);
  await save.click();
  await expect(editDescription).toHaveCount(0);
  await expect(prose).toHaveCount(0);
  await expect(page.locator('.memory-tag-summary')).toContainText(tag);
  await expect(edit).toBeFocused();
  expect(calls.wishUpdates).toBe(1);

  await edit.click();
  const remove = page.getByRole('button', {
    name: m5s3.common.delete,
    exact: true,
  });
  const deleteConfirm = page.getByRole('alertdialog', {
    name: m5s3.common.deleteHeading,
  });
  await remove.click();
  await expect(deleteConfirm).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(deleteConfirm).toHaveCount(0);
  await expect(remove).toBeFocused();
  expect(calls.wishDeletes).toBe(0);
  await remove.click();
  await deleteConfirm
    .getByRole('button', { name: m5s3.common.confirmDelete })
    .click();
  await expect(page).toHaveURL(/\/plan#wishes$/);
  await expect(wishes).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(
    0,
  );
  expect(calls.wishDeletes).toBe(1);
});

test('contextual Plan and Wish actions open directly and browser Back restores the active segment', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await installPlanningMocks(page);
  await signIn(page);
  await page.goto('/plan');

  const main = page.locator('#main-content');
  await main.evaluate((element) => {
    let entries = 0;
    const animate = element.animate.bind(element);
    element.animate = (...args) => {
      const animation = animate(...args);
      if (!location.pathname.endsWith('/new')) return animation;
      entries += 1;
      element.setAttribute('data-e2e-create-entries', String(entries));
      // Hold the first entry open to check the viewport tools and rapid Back.
      if (entries === 1) {
        animation.pause();
        animation.currentTime = 0;
      }
      return animation;
    };
  });
  await page.getByRole('link', { name: m5s3.overview.addPlan }).click();
  await expect(page).toHaveURL(/\/plan\/plans\/new$/);
  await expect(main).toHaveAttribute('data-e2e-create-entries', '1');
  await expect(page.getByLabel(m5s3.plan.intentionLabel)).toBeEditable();
  expect(
    await page
      .locator('.composer-tool-row')
      .evaluate(
        (row) => window.innerHeight - row.getBoundingClientRect().bottom,
      ),
  ).toBeCloseTo(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/plan$/);
  await expect
    .poll(() => main.evaluate((element) => element.getAnimations().length))
    .toBe(0);

  await page.getByRole('tab', { name: m5s3.overview.segmentWishes }).click();
  const wishAction = page.getByRole('link', { name: m5s3.overview.addWish });
  await expectFloatingAddAction(
    wishAction,
    page.locator('.mobile-bottom-shell'),
  );
  const search = page.getByRole('searchbox', {
    name: m5s3.overview.searchWishes,
  });
  await search.focus();
  await expect(wishAction).toBeHidden();
  await search.blur();
  await expect(wishAction).toBeVisible();
  await wishAction.click();
  await expect(page).toHaveURL(/\/plan\/wishes\/new$/);
  await expect(page.getByLabel(m5s3.wish.intentionLabel)).not.toBeFocused();
  await expect(main).toHaveAttribute('data-e2e-create-entries', '2');
  await expect
    .poll(() => main.evaluate((element) => element.getAnimations().length))
    .toBe(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/plan(?:#wishes)?$/);
  await expect(
    page.getByRole('tab', { name: m5s3.overview.segmentWishes }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(wishAction).toBeVisible();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await wishAction.click();
  await expect(page).toHaveURL(/\/plan\/wishes\/new$/);
  await expect(page.getByLabel(m5s3.wish.intentionLabel)).toBeEditable();
  expect(await main.evaluate((element) => element.getAnimations().length)).toBe(
    0,
  );
  await expect(main).toHaveAttribute('data-e2e-create-entries', '2');
});

test('an undated Plan is valid while optional context remains available', async ({
  page,
}) => {
  const calls = await installPlanningMocks(page);
  await signIn(page);
  await page.goto('/plan/plans/new');

  await page.getByLabel(m5s3.plan.intentionLabel).fill('Weekend in Berlin');
  await page.getByLabel(m5s3.common.description).fill('Time just for us');
  const addPlace = page.locator('.composer-tool-row').getByRole('button', {
    name: composer.place,
    exact: true,
  });
  await expectLabeledComposerTool(addPlace, 'orte');
  await addPlace.click();
  await page
    .getByRole('dialog', { name: m5s3.common.place, exact: true })
    .getByRole('button', { name: 'Berlin', exact: true })
    .click();
  await page.getByRole('button', { name: m5s3.common.save }).click();

  await expect(page).toHaveURL(/\/plan\/plans\/plan-created$/);
  expect(calls.planCreates).toBe(1);
  expect(calls.lastPlanBody).toMatchObject({
    title: 'Weekend in Berlin',
    description: 'Time just for us',
    placeId: 'place-berlin',
  });
  expect(calls.lastPlanBody).not.toHaveProperty('schedule');
});

test('failed save preserves the focused task and dirty cancellation requires confirmation', async ({
  page,
}) => {
  await installPlanningMocks(page, { failFirstPlanSave: true });
  await signIn(page);
  await page.goto('/plan/plans/new');

  const intention = page.getByLabel(m5s3.plan.intentionLabel);
  await intention.fill('Our next adventure');
  await page.getByRole('button', { name: m5s3.common.save }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(intention).toHaveValue('Our next adventure');

  await page
    .locator('.composer-header')
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .click();
  await expect(
    page.getByRole('alertdialog', { name: taskBoundary.discardTitle }),
  ).toBeVisible();
  await page.getByRole('button', { name: taskBoundary.keepEditing }).click();
  await expect(intention).toHaveValue('Our next adventure');
});

test('the focused task remains reachable at 200% layout zoom', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installPlanningMocks(page);
  await signIn(page);
  await page.goto('/plan/plans/new');
  await page.locator('html').evaluate((element) => {
    element.style.zoom = '2';
  });
  await expectNoHorizontalOverflow(page);
  await expect(page.getByLabel(m5s3.plan.intentionLabel)).toBeVisible();
  await expect(
    page.getByRole('button', { name: m5s3.common.save }),
  ).toBeVisible();
  await captureR3Evidence(
    page,
    testInfo,
    'r3-create-plan-200pct-expanded.png',
    false,
  );
});

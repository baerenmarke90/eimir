import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import m5s3 from '../../src/i18n/locales/m5s3';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const TEST_NOW = '2026-09-01T10:00:00Z';
const PLAN_DRAFT_TITLE = 'Autumn weekend in Alsace';

type MockPlace = {
  id: string;
  name: string;
  address: string | null;
};

function placeDetail(place: MockPlace) {
  return {
    address: place.address,
    capabilities: { canEdit: true, canDelete: true },
    createdAt: TEST_NOW,
    createdBy: ACCOUNT_ID,
    creator: { accountId: ACCOUNT_ID, displayName: 'Anna' },
    description: null,
    id: place.id,
    latitude: null,
    longitude: null,
    name: place.name,
    spaceId: SPACE_ID,
    updatedAt: TEST_NOW,
    version: 1,
  };
}

/**
 * A focused mock harness for the Plan Create / inline Place Create flow.
 * Unlike product-accessibility.spec.ts's mocks, this tracks created Places
 * server-side so the Place picker can show a newly created Place immediately.
 */
async function installPlanningApiMocks(
  page: Page,
  options: { placeCreateFails?: boolean; seedPlaces?: MockPlace[] } = {},
): Promise<{
  createPlaceCalls: number;
  createPlanCalls: number;
  lastPlanBody: {
    title: string;
    description?: string;
    placeId?: string;
  } | null;
}> {
  const places: MockPlace[] = [...(options.seedPlaces ?? [])];
  const calls = {
    createPlaceCalls: 0,
    createPlanCalls: 0,
    lastPlanBody: null as {
      title: string;
      description?: string;
      placeId?: string;
    } | null,
  };

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
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'browser-e2e-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'browser-e2e-refresh-token',
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

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/wishes`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/plans`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (method === 'POST' && pathname === `/api/v1/spaces/${SPACE_ID}/plans`) {
      calls.createPlanCalls += 1;
      const body = request.postDataJSON() as {
        title: string;
        description?: string;
        placeId?: string;
      };
      calls.lastPlanBody = body;
      await fulfillJson(
        {
          id: 'plan-1',
          title: body.title,
          description: body.description ?? null,
          placeId: body.placeId ?? null,
          status: 'IDEA',
          plannedStart: null,
          plannedEnd: null,
          experiencedOn: null,
          createdAt: TEST_NOW,
          updatedAt: TEST_NOW,
          spaceId: SPACE_ID,
          createdBy: ACCOUNT_ID,
          creator: { accountId: ACCOUNT_ID, displayName: 'Anna' },
          version: 1,
          capabilities: { canEdit: true, canDelete: true },
        },
        201,
      );
      return;
    }

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      await fulfillJson({
        hasMore: false,
        items: places.map(placeDetail),
        nextCursor: null,
      });
      return;
    }

    if (method === 'POST' && pathname === `/api/v1/spaces/${SPACE_ID}/places`) {
      calls.createPlaceCalls += 1;
      if (options.placeCreateFails) {
        await fulfillJson(
          {
            type: 'bad_request',
            title: 'Bad request',
            status: 400,
            detail: 'Something about this place could not be saved.',
            code: 'PLACE_INVALID',
          },
          400,
        );
        return;
      }
      const body = request.postDataJSON() as { name: string; address?: string };
      const created: MockPlace = {
        id: `place-${places.length + 1}`,
        name: body.name,
        address: body.address ?? null,
      };
      places.push(created);
      await fulfillJson(placeDetail(created), 201);
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
        detail: `The browser test did not define this API request: ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  return calls;
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

function planCreateForm(page: Page) {
  return page.locator('.planning-create-task');
}

async function openPlanCreateForm(page: Page) {
  await page.goto('/plan/plans/new');
  const form = planCreateForm(page);
  await form.getByLabel(m5s3.plan.intentionLabel).fill(PLAN_DRAFT_TITLE);
  await form.getByText(m5s3.plan.addDetails).click();
  return form;
}

async function clickAddNewPlace(form: ReturnType<typeof planCreateForm>) {
  await form.getByRole('button', { name: m5s3.plan.addNewPlace }).click();
}

test('the optional enrichment offers no-place, existing Places, and a separate add-new-place action', async ({
  page,
}) => {
  await installPlanningApiMocks(page, {
    seedPlaces: [{ id: 'place-1', name: 'Berlin', address: null }],
  });
  await page.goto('/today');
  await signIn(page);
  const form = await openPlanCreateForm(page);

  const picker = form.getByLabel(m5s3.common.place);
  await expect(picker).toHaveValue('');
  await expect(picker.locator('option')).toHaveText([
    m5s3.common.noPlace,
    'Berlin',
  ]);
  await expect(
    form.getByRole('button', { name: m5s3.plan.addNewPlace }),
  ).toBeVisible();
  await picker.selectOption('place-1');
  await expect(picker).toHaveValue('place-1');
});

test('creating a new Place from the picker keeps the Plan draft and selects the new Place, without leaking a sentinel placeId', async ({
  page,
}) => {
  const calls = await installPlanningApiMocks(page);
  await page.goto('/today');
  await signIn(page);
  const form = await openPlanCreateForm(page);

  await clickAddNewPlace(form);
  await form.getByLabel(m5s3.place.name, { exact: true }).fill('Colmar');
  await form.getByRole('button', { name: m5s3.plan.newPlaceSave }).click();

  await expect(form.getByLabel(m5s3.common.place)).toHaveValue('place-1');

  await expect(form.getByLabel(m5s3.plan.intentionLabel)).toHaveValue(
    PLAN_DRAFT_TITLE,
  );

  await form.getByRole('button', { name: m5s3.common.save }).click();
  await expect(page).toHaveURL(/\/plan\/plans\/plan-1$/);
  expect(calls.lastPlanBody?.placeId).toBe('place-1');
});

test('an existing Place can be selected and the no-place option remains the default', async ({
  page,
}) => {
  await installPlanningApiMocks(page, {
    seedPlaces: [{ id: 'place-1', name: 'Berlin', address: null }],
  });
  await page.goto('/today');
  await signIn(page);
  const form = await openPlanCreateForm(page);

  const picker = form.getByLabel(m5s3.common.place);
  await expect(picker).toHaveValue('');
  await picker.selectOption('place-1');

  await form.getByRole('button', { name: m5s3.common.save }).click();
  await expect(page).toHaveURL(/\/plan\/plans\/plan-1$/);
});

test('a failed inline Place creation keeps the Plan draft and lets the user retry', async ({
  page,
}) => {
  const calls = await installPlanningApiMocks(page, { placeCreateFails: true });
  await page.goto('/today');
  await signIn(page);
  const form = await openPlanCreateForm(page);

  await clickAddNewPlace(form);
  await form.getByLabel(m5s3.place.name, { exact: true }).fill('Colmar');
  await form.getByRole('button', { name: m5s3.plan.newPlaceSave }).click();

  await expect(form.getByRole('alert')).toBeVisible();
  await expect(form.getByLabel(m5s3.plan.intentionLabel)).toHaveValue(
    PLAN_DRAFT_TITLE,
  );
  expect(calls.createPlaceCalls).toBe(1);

  await expect(form.getByLabel(m5s3.common.place)).toHaveValue('');
});

test('an open empty inline Place panel does not block saving the Plan and does not send a sentinel placeId', async ({
  page,
}) => {
  const calls = await installPlanningApiMocks(page);
  await page.goto('/today');
  await signIn(page);
  const form = await openPlanCreateForm(page);

  await clickAddNewPlace(form);
  await form.getByRole('button', { name: m5s3.common.save }).click();

  await expect(page).toHaveURL(/\/plan\/plans\/plan-1$/);
  expect(calls.createPlaceCalls).toBe(0);
  expect(calls.createPlanCalls).toBe(1);
  expect(calls.lastPlanBody?.placeId).toBeUndefined();
});

test('pressing Enter in inline Place fields does not submit the outer Plan', async ({
  page,
}) => {
  const calls = await installPlanningApiMocks(page);
  await page.goto('/today');
  await signIn(page);
  const form = await openPlanCreateForm(page);

  await clickAddNewPlace(form);
  const nameInput = form.getByLabel(m5s3.place.name, { exact: true });
  await nameInput.fill('Colmar');
  await nameInput.press('Enter');
  expect(calls.createPlaceCalls).toBe(0);
  expect(calls.createPlanCalls).toBe(0);

  const addressInput = form.getByLabel(m5s3.place.address, { exact: true });
  await addressInput.fill('12 Example Street');
  await addressInput.press('Enter');
  expect(calls.createPlaceCalls).toBe(0);
  expect(calls.createPlanCalls).toBe(0);
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const TEST_NOW = '2026-09-01T10:00:00Z';

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

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test.describe('Cloud Onboarding Entry Flow (#622)', () => {
  test('renders "Gemeinsam starten" CTA on Cloud and allows requesting signup proof', async ({
    page,
  }) => {
    let signupRequestSubmitted = false;

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

      if (method === 'POST' && pathname === '/api/v1/auth/instance-access') {
        await fulfillJson({
          maintenanceMode: false,
          registrationAvailable: true,
          accountCreation: 'self_service',
          selfServiceSignupAvailable: true,
          auth: {
            localPassword: false,
            magicLink: true,
            oidc: false,
            passkey: false,
          },
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/instance/status') {
        await fulfillJson({
          maintenanceMode: false,
          registrationAvailable: true,
          accountCreation: 'self_service',
          selfServiceSignupAvailable: true,
          auth: {
            localPassword: false,
            magicLink: true,
            oidc: false,
            passkey: false,
          },
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/auth/signup/request') {
        signupRequestSubmitted = true;
        route.fulfill({ status: 204 });
        return;
      }

      route.continue();
    });

    await page.goto('/');

    // Check mode switcher presence and accessibility
    const modeGroup = page.getByRole('group', {
      name: de.identity.entryModesAria,
    });
    await expect(modeGroup).toBeVisible();

    const startTogetherBtn = modeGroup.getByRole('button', {
      name: de.identity.startTogether,
    });
    await expect(startTogetherBtn).toBeVisible();
    await expect(startTogetherBtn).toHaveAttribute('aria-pressed', 'false');

    // Click "Gemeinsam starten"
    await startTogetherBtn.click();
    await expect(startTogetherBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(de.login.email)).toBeFocused();

    // Headings and explanation
    await expect(
      page.getByRole('heading', { name: de.identity.startTogetherTitle }),
    ).toBeVisible();
    await expect(page.getByText(de.identity.startTogetherBody)).toBeVisible();

    // Fill email
    await page.getByLabel(de.login.email).fill('couple@example.org');

    // Submit form
    const submitBtn = page
      .locator('form')
      .getByRole('button', { name: de.identity.startTogetherSubmit });
    await submitBtn.click();

    // Expect neutral mailbox confirmation with programmatic focus
    await expect(page.getByText(de.identity.mailRequestedTitle)).toBeVisible();
    await expect(page.getByText(de.identity.mailRequestedBody)).toBeVisible();
    await expect(page.getByRole('status')).toBeFocused();
    expect(signupRequestSubmitted).toBe(true);

    // Responsive check at 390px and 320px
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 320, height: 568 });
    await expectNoHorizontalOverflow(page);

    // Accessibility check
    await expectNoWcagViolations(page);
  });

  test('consumes signup token, displays FirstSpaceGate, creates space and hands off to settings connection', async ({
    page,
  }) => {
    let spacesCreated = false;

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

      if (method === 'POST' && pathname === '/api/v1/auth/instance-access') {
        await fulfillJson({
          maintenanceMode: false,
          registrationAvailable: true,
          accountCreation: 'self_service',
          selfServiceSignupAvailable: true,
          auth: {
            localPassword: false,
            magicLink: true,
            oidc: false,
            passkey: false,
          },
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/instance/status') {
        await fulfillJson({
          maintenanceMode: false,
          registrationAvailable: true,
          accountCreation: 'self_service',
          selfServiceSignupAvailable: true,
          auth: {
            localPassword: false,
            magicLink: true,
            oidc: false,
            passkey: false,
          },
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/auth/signup/consume') {
        await fulfillJson({
          account: { id: ACCOUNT_ID, displayName: 'Lea' },
          tokens: {
            accessToken: 'session-access-token',
            refreshToken: 'session-refresh-token',
            accessExpiresAt: '2026-09-01T12:00:00Z',
            refreshExpiresAt: '2026-09-08T12:00:00Z',
          },
          accountCreated: true,
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/auth/me') {
        await fulfillJson({ id: ACCOUNT_ID, displayName: 'Lea' });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
        await fulfillJson({ serverAdmin: false });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
        if (!spacesCreated) {
          await fulfillJson([]);
        } else {
          await fulfillJson([
            {
              accountId: ACCOUNT_ID,
              spaceId: SPACE_ID,
              createdAt: TEST_NOW,
            },
          ]);
        }
        return;
      }

      if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`) {
        await fulfillJson({
          id: SPACE_ID,
          createdAt: TEST_NOW,
          partners: [{ id: ACCOUNT_ID, displayName: 'Lea' }],
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/spaces') {
        if (!spacesCreated) {
          await fulfillJson([]);
        } else {
          await fulfillJson([
            {
              id: SPACE_ID,
              createdAt: TEST_NOW,
              partners: [{ id: ACCOUNT_ID, displayName: 'Lea' }],
            },
          ]);
        }
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/spaces') {
        spacesCreated = true;
        await fulfillJson({
          id: SPACE_ID,
          createdAt: TEST_NOW,
          partners: [{ id: ACCOUNT_ID, displayName: 'Lea' }],
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
        method === 'GET' &&
        pathname === `/api/v1/spaces/${SPACE_ID}/profile`
      ) {
        await fulfillJson({
          relationshipStartedOn: null,
          showRelationshipDuration: false,
        });
        return;
      }

      if (
        method === 'GET' &&
        pathname.startsWith(`/api/v1/spaces/${SPACE_ID}/profile-identity/`)
      ) {
        await fulfillJson({
          accountId: ACCOUNT_ID,
          displayName: 'Lea',
          profileAttachmentId: null,
          version: 1,
        });
        return;
      }

      if (
        method === 'GET' &&
        pathname.includes('/rules/relationship_anniversary_reminder/preference')
      ) {
        await fulfillJson({
          ruleKey: 'relationship_anniversary_reminder',
          enabled: false,
          parameters: { daysBefore: [30, 7, 1], localTime: '09:00:00' },
        });
        return;
      }

      if (
        method === 'GET' &&
        pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
      ) {
        await fulfillJson({ items: [] });
        return;
      }

      route.continue();
    });

    // Enter via verified signup URL
    await page.goto('/auth/signup?token=secret-signup-proof');

    // Sensitive token stripped immediately from URL
    expect(page.url()).not.toContain('secret-signup-proof');

    // FirstSpaceGate is displayed
    await expect(
      page.getByRole('heading', {
        name: de.spaceContext.createFirstSpaceTitle,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(de.spaceContext.createFirstSpaceBody),
    ).toBeVisible();

    // Accessibility on FirstSpaceGate
    await expectNoWcagViolations(page);

    // Click "Ort jetzt erstellen"
    await page
      .getByRole('button', { name: de.spaceContext.createFirstSpaceSubmit })
      .click();

    // Handoff to the focused relationship settings category
    await expect(page).toHaveURL(/.*\/more\/settings\/relationship/);
    await expect(page.locator('#settings-connection')).toBeVisible();
    expect(spacesCreated).toBe(true);
  });

  test('signup consume with existing account and existing membership enters existing space without FirstSpaceGate', async ({
    page,
  }) => {
    let spacesCreated = false;

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

      if (method === 'POST' && pathname === '/api/v1/auth/instance-access') {
        await fulfillJson({
          maintenanceMode: false,
          registrationAvailable: true,
          accountCreation: 'self_service',
          selfServiceSignupAvailable: true,
          auth: {
            localPassword: false,
            magicLink: true,
            oidc: false,
            passkey: false,
          },
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/instance/status') {
        await fulfillJson({
          maintenanceMode: false,
          registrationAvailable: true,
          accountCreation: 'self_service',
          selfServiceSignupAvailable: true,
          auth: {
            localPassword: false,
            magicLink: true,
            oidc: false,
            passkey: false,
          },
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/auth/signup/consume') {
        await fulfillJson({
          account: { id: ACCOUNT_ID, displayName: 'Lea' },
          tokens: {
            accessToken: 'session-access-token',
            refreshToken: 'session-refresh-token',
            accessExpiresAt: '2026-09-01T12:00:00Z',
            refreshExpiresAt: '2026-09-08T12:00:00Z',
          },
          accountCreated: false,
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/auth/me') {
        await fulfillJson({ id: ACCOUNT_ID, displayName: 'Lea' });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
        await fulfillJson({ serverAdmin: false });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
        await fulfillJson([
          {
            accountId: ACCOUNT_ID,
            spaceId: SPACE_ID,
            createdAt: TEST_NOW,
          },
        ]);
        return;
      }

      if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`) {
        await fulfillJson({
          id: SPACE_ID,
          createdAt: TEST_NOW,
          partners: [{ id: ACCOUNT_ID, displayName: 'Lea' }],
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/spaces') {
        await fulfillJson([
          {
            id: SPACE_ID,
            createdAt: TEST_NOW,
            partners: [{ id: ACCOUNT_ID, displayName: 'Lea' }],
          },
        ]);
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/spaces') {
        spacesCreated = true;
        await fulfillJson({
          id: SPACE_ID,
          createdAt: TEST_NOW,
          partners: [{ id: ACCOUNT_ID, displayName: 'Lea' }],
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
        method === 'GET' &&
        pathname === `/api/v1/spaces/${SPACE_ID}/profile`
      ) {
        await fulfillJson({
          relationshipStartedOn: null,
          showRelationshipDuration: false,
        });
        return;
      }

      if (
        method === 'GET' &&
        pathname.startsWith(`/api/v1/spaces/${SPACE_ID}/profile-identity/`)
      ) {
        await fulfillJson({
          accountId: ACCOUNT_ID,
          displayName: 'Lea',
          profileAttachmentId: null,
          version: 1,
        });
        return;
      }

      if (
        method === 'GET' &&
        pathname.includes('/rules/relationship_anniversary_reminder/preference')
      ) {
        await fulfillJson({
          ruleKey: 'relationship_anniversary_reminder',
          enabled: false,
          parameters: { daysBefore: [30, 7, 1], localTime: '09:00:00' },
        });
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
        pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
      ) {
        await fulfillJson({ unreadCount: 0 });
        return;
      }

      if (
        method === 'GET' &&
        pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
      ) {
        await fulfillJson({
          space: {
            id: SPACE_ID,
            partner: null,
            relationshipDuration: null,
          },
          upcoming: [],
          keepsake: null,
          retrospective: null,
          recentShared: [],
        });
        return;
      }

      if (
        method === 'GET' &&
        pathname === `/api/v1/spaces/${SPACE_ID}/activity`
      ) {
        await fulfillJson({ items: [] });
        return;
      }

      route.continue();
    });

    // Enter via verified signup URL
    await page.goto('/auth/signup?token=secret-signup-proof');

    // Sensitive token stripped immediately from URL
    expect(page.url()).not.toContain('secret-signup-proof');

    // FirstSpaceGate must NOT be displayed
    await expect(
      page.getByRole('heading', {
        name: de.spaceContext.createFirstSpaceTitle,
      }),
    ).toHaveCount(0);

    // Enters active space directly; POST /api/v1/spaces was never invoked
    await expect(page.locator('.product-shell')).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: de.navigation.primary }),
    ).toBeVisible();
    expect(spacesCreated).toBe(false);
  });

  test('does not show "Gemeinsam starten" on self-hosted invitation-only deployment', async ({
    page,
  }) => {
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

      if (method === 'POST' && pathname === '/api/v1/auth/instance-access') {
        await fulfillJson({
          maintenanceMode: false,
          registrationAvailable: false,
          accountCreation: 'invitation',
          selfServiceSignupAvailable: false,
          auth: {
            localPassword: true,
            magicLink: false,
            oidc: false,
            passkey: false,
          },
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/instance/status') {
        await fulfillJson({
          maintenanceMode: false,
          registrationAvailable: false,
          accountCreation: 'invitation',
          selfServiceSignupAvailable: false,
          auth: {
            localPassword: true,
            magicLink: false,
            oidc: false,
            passkey: false,
          },
        });
        return;
      }

      route.continue();
    });

    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: de.login.heading }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: de.identity.startTogether }),
    ).toHaveCount(0);
  });
});

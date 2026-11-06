import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import en from '../../src/i18n/locales/en.json' with { type: 'json' };
import legal from '../../src/i18n/locales/legal';
import { privacyPolicyDe } from '../../src/i18n/locales/legalDocuments/privacyPolicy.de.generated';
import { termsOfUseDe } from '../../src/i18n/locales/legalDocuments/termsOfUse.de.generated';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import {
  installMocks,
  ACCOUNT_ID as SHELL_ACCOUNT_ID,
  SPACE_ID as SHELL_SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const OWN_SPACE_ID = '33333333-3333-4333-8333-333333333333';
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

const CLOUD_STATUS_WITH_TERMS = {
  maintenanceMode: false,
  registrationAvailable: true,
  accountCreation: 'self_service',
  selfServiceSignupAvailable: true,
  termsOfUseVersion: termsOfUseDe.version,
  auth: { localPassword: false, magicLink: true, oidc: false, passkey: false },
};
const ACCEPTANCE_LABEL = legal.accept.replace(/<\/?termsLink>/g, '');
const PRIVACY_NOTICE_LINK =
  /<privacyLink>(.*)<\/privacyLink>/.exec(legal.privacyNotice)?.[1] ?? '';
// Derive headings and links from the generated texts so wording edits in
// legal/ never require test edits.
const textOf = (runs: { kind: string; text?: string }[]) =>
  runs.map((run) => run.text ?? '').join('');
const PRIVACY_SECTIONS = privacyPolicyDe.blocks.flatMap((block) =>
  block.kind === 'heading' ? [textOf(block.content)] : [],
);
const PRIVACY_FIRST_SECTION = PRIVACY_SECTIONS[1];
const PRIVACY_LAST_SECTION = PRIVACY_SECTIONS.at(-1) ?? '';
const TERMS_PRIVACY_REFERENCE =
  termsOfUseDe.blocks
    .flatMap((block) => (block.kind === 'paragraph' ? block.content : []))
    .flatMap((run) =>
      run.kind === 'link' && run.href === '/legal/privacy' ? [run.text] : [],
    )[0] ?? '';

async function routeCloudEntry(
  page: Page,
  onSignup?: (body: unknown) => void,
): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET' && pathname === '/api/v1/instance/status') {
      await route.fulfill({ json: CLOUD_STATUS_WITH_TERMS });
      return;
    }
    if (
      request.method() === 'POST' &&
      pathname === '/api/v1/auth/signup/request'
    ) {
      onSignup?.(request.postDataJSON());
      await route.fulfill({ status: 202 });
      return;
    }
    await route.continue();
  });
}

async function openSignup(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .getByRole('group', { name: de.identity.entryModesAria })
    .getByRole('button', { name: de.identity.startTogether })
    .click();
  await page.getByLabel(de.login.email).fill('couple@example.org');
}

test.describe('Terms of use at Cloud signup', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(TEST_NOW) });
  });

  test('requires the acceptance and keeps the typed address while the terms are read', async ({
    page,
  }) => {
    const signupBodies: unknown[] = [];
    await page.route('**/api/v1/**', async (route) => {
      if (await fulfillDefaultAppIcon(route)) return;
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (
        request.method() === 'GET' &&
        pathname === '/api/v1/instance/status'
      ) {
        await route.fulfill({ json: CLOUD_STATUS_WITH_TERMS });
        return;
      }
      if (
        request.method() === 'POST' &&
        pathname === '/api/v1/auth/signup/request'
      ) {
        signupBodies.push(request.postDataJSON());
        await route.fulfill({ status: 202 });
        return;
      }
      await route.continue();
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page
      .getByRole('group', { name: de.identity.entryModesAria })
      .getByRole('button', { name: de.identity.startTogether })
      .click();
    await page.getByLabel(de.login.email).fill('couple@example.org');
    const form = page.locator('form');
    const acceptance = form.getByRole('checkbox', { name: ACCEPTANCE_LABEL });
    const submit = form.getByRole('button', {
      name: de.identity.startTogetherSubmit,
    });

    await submit.click();
    await expect(acceptance).toBeFocused();
    expect(signupBodies).toEqual([]);

    await form.getByRole('link', { name: legal.termsLink }).click();
    const sheet = page.getByRole('dialog', { name: legal.termsSheetTitle });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole('heading', { name: '§ 1 Geltungsbereich' }),
    ).toBeVisible();
    await expectNoWcagViolations(page);
    await sheet.getByRole('button', { name: legal.sheetClose }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByLabel(de.login.email)).toHaveValue(
      'couple@example.org',
    );
    await expect(acceptance).not.toBeChecked();

    await acceptance.check();
    await submit.click();
    await expect(page.getByText(de.identity.mailRequestedTitle)).toBeVisible();
    expect(signupBodies).toEqual([
      {
        email: 'couple@example.org',
        acceptedTermsVersion: termsOfUseDe.version,
      },
    ]);
    for (const width of [360, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expectNoHorizontalOverflow(page);
    }
  });

  test('the public terms page needs no account and returns to the entry', async ({
    page,
  }) => {
    await page.route('**/api/v1/**', async (route) => {
      if (await fulfillDefaultAppIcon(route)) return;
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/v1/instance/status') {
        await route.fulfill({ json: CLOUD_STATUS_WITH_TERMS });
        return;
      }
      await route.continue();
    });

    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/legal/terms');
    await expect(
      page.getByRole('heading', { level: 1, name: termsOfUseDe.title }),
    ).toBeVisible();
    await expect(page.getByText(legal.draftBadge)).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: '§ 18 Schlussbestimmungen' }),
    ).toBeAttached();
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectNoWcagViolations(page);

    await page.getByRole('button', { name: taskBoundary.back }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('group', { name: de.identity.entryModesAria }),
    ).toBeVisible();
  });

  test('an opened link that would create an account asks for the terms first', async ({
    page,
  }) => {
    const consumeBodies: Record<string, unknown>[] = [];
    await page.route('**/api/v1/**', async (route) => {
      if (await fulfillDefaultAppIcon(route)) return;
      const request = route.request();
      const method = request.method();
      const pathname = new URL(request.url()).pathname;
      if (method === 'GET' && pathname === '/api/v1/instance/status') {
        await route.fulfill({ json: CLOUD_STATUS_WITH_TERMS });
        return;
      }
      if (method === 'POST' && pathname === '/api/v1/auth/signup/consume') {
        const body = request.postDataJSON() as Record<string, unknown>;
        consumeBodies.push(body);
        if (!body.acceptedTermsVersion) {
          await route.fulfill({
            status: 409,
            json: {
              type: 'conflict',
              title: 'Conflict',
              status: 409,
              detail: 'Terms acceptance required.',
              code: 'TERMS_ACCEPTANCE_REQUIRED',
            },
          });
          return;
        }
        await route.fulfill({
          json: {
            account: { id: ACCOUNT_ID, displayName: 'Lea' },
            tokens: {
              accessToken: 'session-access-token',
              refreshToken: 'session-refresh-token',
              accessExpiresAt: '2026-09-01T12:00:00Z',
              refreshExpiresAt: '2026-09-08T12:00:00Z',
            },
            accountCreated: true,
          },
        });
        return;
      }
      if (method === 'GET' && pathname === '/api/v1/auth/me') {
        await route.fulfill({ json: { id: ACCOUNT_ID, displayName: 'Lea' } });
        return;
      }
      if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
        await route.fulfill({ json: { serverAdmin: false } });
        return;
      }
      if (
        method === 'GET' &&
        (pathname === '/api/v1/auth/memberships' ||
          pathname === '/api/v1/spaces')
      ) {
        await route.fulfill({ json: [] });
        return;
      }
      await route.continue();
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/auth/signup?token=sign-in-form-proof');
    await expect(page).not.toHaveURL(/sign-in-form-proof/);
    await expect(
      page.getByRole('heading', { name: legal.pendingTitle }),
    ).toBeVisible();
    await expect(page.getByText(de.identity.signupFailedTitle)).toHaveCount(0);
    await expectNoWcagViolations(page);

    await page.getByRole('checkbox', { name: ACCEPTANCE_LABEL }).check();
    await page.getByRole('button', { name: legal.createAccount }).click();

    await expect(
      page.getByRole('heading', {
        name: de.spaceContext.createFirstSpaceTitle,
      }),
    ).toBeVisible();
    expect(consumeBodies.map((body) => body.acceptedTermsVersion)).toEqual([
      undefined,
      termsOfUseDe.version,
    ]);
    expect(
      consumeBodies.every((body) => body.token === 'sign-in-form-proof'),
    ).toBe(true);
  });
});

test.describe('Privacy policy on eimir. Cloud', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(TEST_NOW) });
  });

  test('the signup informs about the privacy policy without a second consent', async ({
    page,
  }) => {
    const signupBodies: unknown[] = [];
    await routeCloudEntry(page, (body) => signupBodies.push(body));
    await page.setViewportSize({ width: 390, height: 844 });
    await openSignup(page);

    const form = page.locator('form');
    await expect(form.getByRole('checkbox')).toHaveCount(1);
    const acceptance = form.getByRole('checkbox', { name: ACCEPTANCE_LABEL });
    await expect(acceptance).toBeVisible();
    const notice = form.locator('.privacy-notice');
    await expect(notice).toHaveText(
      legal.privacyNotice.replace(/<\/?privacyLink>/g, ''),
    );
    await expect(notice.locator('xpath=ancestor::label')).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: legal.eyebrow }).getByRole('link'),
    ).toHaveText([legal.termsLink, legal.privacyLink]);

    await notice.getByRole('link', { name: PRIVACY_NOTICE_LINK }).click();
    const sheet = page.getByRole('dialog', { name: legal.privacySheetTitle });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole('heading', { name: PRIVACY_FIRST_SECTION }),
    ).toBeVisible();
    await expect(sheet.getByText(legal.draftBadge)).toBeVisible();
    await expectNoWcagViolations(page);
    await sheet.getByRole('button', { name: legal.privacySheetClose }).click();
    await expect(sheet).toBeHidden();
    await expect(
      notice.getByRole('link', { name: PRIVACY_NOTICE_LINK }),
    ).toBeFocused();
    await expect(page.getByLabel(de.login.email)).toHaveValue(
      'couple@example.org',
    );

    for (const width of [320, 360, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await acceptance.check();
    await form
      .getByRole('button', { name: de.identity.startTogetherSubmit })
      .click();
    await expect(page.getByText(de.identity.mailRequestedTitle)).toBeVisible();
    expect(signupBodies).toEqual([
      {
        email: 'couple@example.org',
        acceptedTermsVersion: termsOfUseDe.version,
      },
    ]);
  });

  test('the terms open the privacy policy on top of their sheet and keep the form', async ({
    page,
  }) => {
    await routeCloudEntry(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openSignup(page);
    const acceptance = page
      .locator('form')
      .getByRole('checkbox', { name: ACCEPTANCE_LABEL });
    await acceptance.check();

    await page
      .locator('form')
      .getByRole('link', { name: legal.termsLink })
      .click();
    const terms = page.getByRole('dialog', { name: legal.termsSheetTitle });
    await expect(terms).toBeVisible();
    const reference = terms.getByRole('link', {
      name: TERMS_PRIVACY_REFERENCE,
    });
    await reference.scrollIntoViewIfNeeded();
    await reference.click();

    const privacy = page.getByRole('dialog', {
      name: legal.privacySheetTitle,
    });
    await expect(privacy).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await page.keyboard.press('Escape');
    await expect(privacy).toBeHidden();
    await expect(terms).toBeVisible();
    await expect(reference).toBeFocused();

    await terms.getByRole('button', { name: legal.sheetClose }).click();
    await expect(terms).toBeHidden();
    await expect(page.getByLabel(de.login.email)).toHaveValue(
      'couple@example.org',
    );
    await expect(acceptance).toBeChecked();
  });

  test('the public privacy page needs no account and returns to the entry', async ({
    page,
  }) => {
    await routeCloudEntry(page);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/legal/privacy');
    await expect(
      page.getByRole('heading', { level: 1, name: privacyPolicyDe.title }),
    ).toBeVisible();
    await expect(page).toHaveTitle(`${legal.privacySheetTitle} · eimir.`);
    await expect(page.getByText(legal.draftBadge)).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: PRIVACY_LAST_SECTION }),
    ).toBeAttached();
    await expectNoHorizontalOverflow(page);
    await expectNoWcagViolations(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectNoWcagViolations(page);

    await page.getByRole('button', { name: taskBoundary.back }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('group', { name: de.identity.entryModesAria }),
    ).toBeVisible();
  });

  test('More opens the privacy policy at its title and returns', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ accountId, spaceId }) => {
        localStorage.setItem(
          `eimir:product-tour:v1:${accountId}:${spaceId}`,
          'seen',
        );
      },
      { accountId: SHELL_ACCOUNT_ID, spaceId: SHELL_SPACE_ID },
    );
    await installMocks(page);
    // Registered after the shell mocks, so this Cloud status wins.
    await page.route('**/api/v1/instance/status', (route) =>
      route.fulfill({
        json: {
          maintenanceMode: false,
          registrationAvailable: true,
          registrationUnavailableReason: null,
          termsOfUseVersion: termsOfUseDe.version,
          auth: {
            localPassword: true,
            passkey: true,
            magicLink: true,
            oidc: false,
          },
        },
      }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto('/more');

    const legalLinks = page.getByRole('navigation', { name: legal.eyebrow });
    await expect(legalLinks.getByRole('link')).toHaveText([
      legal.termsLink,
      legal.privacyLink,
    ]);
    await legalLinks.getByRole('link', { name: legal.privacyLink }).click();

    await expect(page).toHaveURL(/\/legal\/privacy$/);
    const title = page.getByRole('heading', {
      level: 1,
      name: privacyPolicyDe.title,
    });
    await expect(title).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await page.getByRole('button', { name: taskBoundary.back }).click();
    await expect(page).toHaveURL(/\/more$/);
    await expect(legalLinks).toBeVisible();
  });
});

test.describe('Privacy policy in the English UI', () => {
  test.use({ locale: 'en-US' });

  test('keeps the German text and names German as binding', async ({
    page,
  }) => {
    await routeCloudEntry(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/legal/privacy');

    const article = page.getByRole('article');
    await expect(article).toHaveAttribute('lang', 'de-DE');
    await expect(
      article.getByRole('heading', { level: 1, name: privacyPolicyDe.title }),
    ).toBeVisible();
    const notice = page.getByText(
      en.legal.documentLanguageNotice.replace('{{language}}', 'German'),
    );
    await expect(notice).toHaveAttribute('lang', 'en');
    await expect(page.getByText(en.legal.draftBadge)).toBeVisible();
    await expect(page).toHaveTitle(`${en.legal.privacySheetTitle} · eimir.`);
    await expect(
      page.getByRole('button', { name: en.taskBoundary.back }),
    ).toBeVisible();
    await expectNoWcagViolations(page);
  });
});

test.describe('Cloud Onboarding Entry Flow (#622)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(TEST_NOW) });
  });

  test('renders "Gemeinsam starten" CTA on Cloud and allows requesting signup proof', async ({
    page,
  }) => {
    let signupRequestSubmitted = false;

    await page.route('**/api/v1/**', async (route) => {
      if (await fulfillDefaultAppIcon(route)) return;
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
      if (await fulfillDefaultAppIcon(route)) return;
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

    // Page load does not await React's passive entry cleanup. Await the actual
    // privacy outcome rather than sampling the URL before the app has booted.
    await expect(page).not.toHaveURL(/secret-signup-proof/);

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
  }, testInfo) => {
    await verifySignupEntry(page, false, testInfo);
  });

  test('an invited partner follows a proof-only mail/app callback into the shared space', async ({
    page,
  }, testInfo) => {
    await verifySignupEntry(page, true, testInfo);
  });

  test('a pre-upgrade invitation fragment still joins before loading memberships', async ({
    page,
  }, testInfo) => {
    await verifySignupEntry(page, true, testInfo, { legacyFragment: true });
  });

  test('invitation completion enters the joined space while preserving an existing own space', async ({
    page,
  }, testInfo) => {
    await verifySignupEntry(page, true, testInfo, { existingOwnSpace: true });
  });

  test('consumes a mail callback delivered through the running router', async ({
    page,
  }, testInfo) => {
    await verifySignupEntry(page, true, testInfo, { delivery: 'router' });
  });

  test('consumes a PWA launch callback while another session is already loaded', async ({
    page,
  }, testInfo) => {
    await verifySignupEntry(page, true, testInfo, {
      delivery: 'launch',
      existingSession: true,
      existingOwnSpace: true,
    });
  });

  test('a running-client callback cannot replace another active account', async ({
    page,
  }, testInfo) => {
    await verifySignupEntry(page, true, testInfo, {
      delivery: 'launch',
      existingSession: true,
      differentAccount: true,
    });
  });

  test('a cold mail callback restores and protects another active account', async ({
    page,
  }, testInfo) => {
    await verifySignupEntry(page, true, testInfo, {
      existingOwnSpace: true,
      existingSession: true,
      differentAccount: true,
    });
  });

  async function verifySignupEntry(
    page: Page,
    fromInvitation: boolean,
    testInfo: TestInfo,
    {
      legacyFragment = false,
      existingOwnSpace = false,
      delivery = 'reload',
      existingSession = false,
      differentAccount = false,
    }: {
      legacyFragment?: boolean;
      existingOwnSpace?: boolean;
      delivery?: 'reload' | 'router' | 'launch';
      existingSession?: boolean;
      differentAccount?: boolean;
    } = {},
  ) {
    await page.clock.setFixedTime(new Date(TEST_NOW));
    let spacesCreated = false;
    let invitationAccepted = false;
    let signedIn = existingSession;
    let signupConsumed = 0;
    let replacementSignOuts = 0;

    if (delivery === 'launch') {
      await page.addInitScript(() => {
        Object.defineProperty(window, 'launchQueue', {
          value: {
            setConsumer(consumer: (params: { targetURL: string }) => void) {
              Object.assign(window, { deliverTestLaunch: consumer });
            },
          },
        });
      });
    }
    if (existingSession) {
      await page.addInitScript(
        ({ accountId, spaceId }) => {
          sessionStorage.setItem(
            'eimir-session-v1',
            JSON.stringify({
              account: { id: accountId, displayName: 'Lea' },
              tokens: {
                accessToken: 'old-session-access-token',
                refreshToken: 'old-session-refresh-token',
                accessExpiresAt: new Date(
                  Date.now() + 15 * 60_000,
                ).toISOString(),
                refreshExpiresAt: new Date(
                  Date.now() + 7 * 86_400_000,
                ).toISOString(),
              },
              spaceId,
            }),
          );
        },
        { accountId: ACCOUNT_ID, spaceId: OWN_SPACE_ID },
      );
    }

    await page.route('**/api/v1/**', async (route) => {
      if (await fulfillDefaultAppIcon(route)) return;
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
        signupConsumed += 1;
        signedIn = true;
        if (fromInvitation && !legacyFragment) invitationAccepted = true;
        await fulfillJson({
          account: {
            id: differentAccount
              ? '44444444-4444-4444-8444-444444444444'
              : ACCOUNT_ID,
            displayName: 'Lea',
          },
          tokens: {
            accessToken: 'session-access-token',
            refreshToken: 'session-refresh-token',
            accessExpiresAt: '2026-09-01T12:00:00Z',
            refreshExpiresAt: '2026-09-08T12:00:00Z',
          },
          accountCreated: fromInvitation && !existingOwnSpace,
          ...(fromInvitation && !legacyFragment ? { spaceId: SPACE_ID } : {}),
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/auth/sign-out') {
        expect(request.headers().authorization).toBe(
          'Bearer session-access-token',
        );
        replacementSignOuts += 1;
        await route.fulfill({ status: 204 });
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
        await fulfillJson(
          signedIn && (!fromInvitation || invitationAccepted)
            ? [
                ...(existingOwnSpace
                  ? [
                      {
                        accountId: ACCOUNT_ID,
                        spaceId: OWN_SPACE_ID,
                        createdAt: TEST_NOW,
                      },
                    ]
                  : []),
                {
                  accountId: ACCOUNT_ID,
                  spaceId: SPACE_ID,
                  createdAt: TEST_NOW,
                },
              ]
            : [],
        );
        return;
      }

      if (method === 'GET' && pathname === `/api/v1/spaces/${OWN_SPACE_ID}`) {
        await fulfillJson({
          id: OWN_SPACE_ID,
          createdAt: TEST_NOW,
          partners: [{ id: ACCOUNT_ID, displayName: 'Lea' }],
        });
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

    if (fromInvitation && !existingSession) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.route('**/api/v1/auth/signup/request', async (route) => {
        expect(route.request().postDataJSON()).toEqual({
          email: 'partner@example.invalid',
          invitationToken: 'partner-invitation',
        });
        await route.fulfill({ status: 202 });
      });
      await page.route('**/api/v1/invitations/accept', async (route) => {
        expect(legacyFragment).toBe(true);
        expect(route.request().headers().authorization).toBe(
          'Bearer session-access-token',
        );
        expect(route.request().postDataJSON()).toEqual({
          token: 'partner-invitation',
        });
        invitationAccepted = true;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            spaceId: SPACE_ID,
            role: 'PARTNER',
            status: 'ACTIVE',
          }),
        });
      });
      await page.goto('/auth/invitation?token=partner-invitation');
      await page.getByLabel(de.login.email).fill('partner@example.invalid');
      await page
        .getByRole('button', { name: de.identity.magicLinkRequestSubmit })
        .click();
      await expect(
        page.getByText(de.identity.mailRequestedTitle),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('mail-confirmation-compact.png'),
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.screenshot({
        path: testInfo.outputPath('mail-confirmation-expanded.png'),
      });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    // New proof-only callbacks work even when the app ignores fragments.
    // Retain coverage for links issued before server-side binding existed.
    const callback =
      '/auth/signup?token=secret-signup-proof' +
      (legacyFragment ? '#invitationToken=partner-invitation' : '');
    if (delivery === 'reload') {
      await page.goto(callback);
    } else if (delivery === 'router') {
      await page.evaluate((url) => {
        window.history.pushState(null, '', url);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, callback);
    } else {
      await page.goto('/');
      await expect(
        page.getByRole('heading', {
          name: de.spaceContext.createFirstSpaceTitle,
        }),
      ).toBeVisible();
      await page.evaluate((path) => {
        const deliver = (
          window as unknown as {
            deliverTestLaunch: (params: { targetURL: string }) => void;
          }
        ).deliverTestLaunch;
        deliver({ targetURL: new URL(path, window.location.origin).href });
      }, callback);
    }

    await expect.poll(() => signupConsumed).toBe(1);

    if (differentAccount) {
      await expect(
        page.getByRole('alert').getByText(de.identity.activeAccountTitle),
      ).toBeVisible();
      await expect.poll(() => replacementSignOuts).toBe(1);
      const stored = await page.evaluate(() =>
        JSON.parse(sessionStorage.getItem('eimir-session-v1') || '{}'),
      );
      expect(stored.account.id).toBe(ACCOUNT_ID);
      expect(stored.tokens.accessToken).toBe('old-session-access-token');
      expect(spacesCreated).toBe(false);
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoWcagViolations(page);
      await page.screenshot({
        path: testInfo.outputPath('active-account-compact.png'),
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.screenshot({
        path: testInfo.outputPath('active-account-expanded.png'),
      });
      await page
        .getByRole('button', { name: de.identity.returnToActiveAccount })
        .click();
      await expect(
        page.getByRole('alert').getByText(de.identity.activeAccountTitle),
      ).toHaveCount(0);
      return;
    }

    // Page load does not await React's passive entry cleanup. Await the actual
    // privacy outcome rather than sampling the URL before the app has booted.
    await expect(page).not.toHaveURL(/secret-signup-proof|partner-invitation/);

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
    expect(invitationAccepted).toBe(fromInvitation);
    if (existingOwnSpace) {
      expect(
        await page.evaluate(
          () =>
            JSON.parse(sessionStorage.getItem('eimir-session-v1') || '{}')
              .spaceId,
        ),
      ).toBe(SPACE_ID);
    }
    expect(
      await page.evaluate(() => JSON.stringify(localStorage)),
    ).not.toContain('partner-invitation');
  }

  test('does not show "Gemeinsam starten" on self-hosted invitation-only deployment', async ({
    page,
  }) => {
    await page.route('**/api/v1/**', async (route) => {
      if (await fulfillDefaultAppIcon(route)) return;
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

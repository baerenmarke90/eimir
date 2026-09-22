import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import dailyVibe from '../../src/i18n/locales/dailyVibe';

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';

type VibePartnerState =
  | { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
  | { state: 'NO_CHECK_IN' }
  | { state: 'VISIBLE'; value: string };

async function installMocks(
  page: Page,
  initial: {
    ownVibe?: string | null;
    ownVibeNote?: string | null;
    partnerState?: VibePartnerState;
    partnerVibeNote?: string | null;
  } = {},
) {
  let ownVibe: string | null = initial.ownVibe ?? null;
  let ownVibeNote: string | null = initial.ownVibeNote ?? null;
  let partnerState: VibePartnerState = initial.partnerState ?? {
    state: 'HIDDEN_UNTIL_SELF_CHECK_IN',
  };
  const partnerVibeNote = initial.partnerVibeNote ?? null;
  let etag = '"2026-09-21:check-in-1:1"';
  let lastPatch: Record<string, unknown> | null = null;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const json = async (
      body: unknown,
      status = 200,
      headers: Record<string, string> = {},
    ) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(body),
      });

    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      await json({
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
      await json({
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'daily-vibe-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'daily-vibe-refresh-token',
        },
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      await json({ serverAdmin: false });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      await json([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`) {
      await json({
        id: SPACE_ID,
        createdAt: '2026-01-01T00:00:00Z',
        partners: [
          { id: ACCOUNT_ID, displayName: 'Anna' },
          { id: PARTNER_ID, displayName: 'Ben Winter' },
        ],
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/configuration`
    ) {
      await json(
        {
          canManageSpaceConfiguration: true,
          dailyContextTimezone: 'Europe/Berlin',
          dailyQuestionsEnabled: false,
          energyCheckInEnabled: false,
          energyVisibilityMode: 'MUTUAL_REVEAL',
          loveNotesEnabled: false,
          sharedAchievementsEnabled: false,
          spaceId: SPACE_ID,
          supportGesturesEnabled: true,
          version: 7,
          vibeCheckEnabled: true,
          vibeVisibilityMode: 'MUTUAL_REVEAL',
        },
        200,
        { ETag: '"7"' },
      );
      return;
    }
    if (
      method === 'GET' &&
      (pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}` ||
        pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${PARTNER_ID}`)
    ) {
      const partner = pathname.endsWith(PARTNER_ID);
      await json({
        accountId: partner ? PARTNER_ID : ACCOUNT_ID,
        createdAt: '2026-01-01T00:00:00Z',
        displayName: partner ? 'Ben' : 'Anna',
        id: partner
          ? '00000000-0000-0000-0000-000000000022'
          : '00000000-0000-0000-0000-000000000020',
        preferences: [],
        profileAttachmentId: null,
        updatedAt: '2026-01-01T00:00:00Z',
        version: 1,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await json({ items: [] });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await json({
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Ben Winter' },
        },
        relationshipDuration: { daysTogether: 250, startedOn: '2026-01-01' },
        retrospective: null,
        recentShared: [],
        upcoming: [
          {
            id: '00000000-0000-0000-0000-000000000040',
            type: 'PLAN',
            titleOrText: 'Gemeinsamer Abend',
            scheduledAt: '2026-09-22T18:00:00Z',
          },
        ],
        thinkingOfYouAvailableAt: null,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/activity`
    ) {
      await json({ hasMore: false, items: [], nextCursor: null });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
    ) {
      await json({ unreadCount: 0 });
      return;
    }
    if (
      (method === 'GET' || method === 'POST') &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await json({ state: 'ACTIVE' });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/daily-check-in/today`
    ) {
      await json(
        {
          checkedOn: '2026-09-21',
          dailyContextTimezone: 'Europe/Berlin',
          own: {
            energyLevel: 60,
            vibe: ownVibe,
            vibeNote: ownVibeNote,
            version: 1,
          },
          energy: null,
          vibe: {
            visibilityMode: 'MUTUAL_REVEAL',
            partner: partnerState,
            partnerNote:
              partnerState.state === 'VISIBLE' ? partnerVibeNote : null,
          },
        },
        200,
        { ETag: etag, 'Cache-Control': 'private, no-store' },
      );
      return;
    }
    if (
      method === 'PATCH' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/daily-check-in/today`
    ) {
      lastPatch = request.postDataJSON() as Record<string, unknown>;
      ownVibe = Object.hasOwn(lastPatch, 'vibe')
        ? (lastPatch.vibe as string | null)
        : ownVibe;
      if (ownVibe === null) {
        ownVibeNote = null;
      } else if (Object.hasOwn(lastPatch, 'vibeNote')) {
        ownVibeNote = (lastPatch.vibeNote as string | null) ?? null;
      }
      partnerState =
        ownVibe === null
          ? { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
          : { state: 'VISIBLE', value: 'STRESSED' };
      etag = '"2026-09-21:check-in-1:2"';
      await json(
        {
          checkedOn: '2026-09-21',
          dailyContextTimezone: 'Europe/Berlin',
          own: {
            energyLevel: 60,
            vibe: ownVibe,
            vibeNote: ownVibeNote,
            version: 2,
          },
          energy: null,
          vibe: {
            visibilityMode: 'MUTUAL_REVEAL',
            partner: partnerState,
            partnerNote:
              partnerState.state === 'VISIBLE' ? partnerVibeNote : null,
          },
        },
        200,
        { ETag: etag, 'Cache-Control': 'private, no-store' },
      );
      return;
    }

    await json(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `Unexpected ${method} ${pathname}`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });

  return { lastPatch: () => lastPatch };
}

async function signIn(page: Page) {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const overflowing = Array.from(
      document.querySelectorAll<HTMLElement>('body *'),
    )
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          className: element.className,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          minWidth: style.minWidth,
          maxWidth: style.maxWidth,
        };
      })
      .filter(
        (box) =>
          box.width > 0 && (box.left < -1 || box.right > root.clientWidth + 1),
      )
      .sort((a, b) => b.right - a.right)
      .slice(0, 8);
    const openDialog =
      document.querySelector<HTMLDialogElement>('dialog[open]');

    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      overflowing,
      dialog: openDialog
        ? {
            clientWidth: openDialog.clientWidth,
            scrollWidth: openDialog.scrollWidth,
          }
        : null,
    };
  });

  expect(
    result.overflowing,
    `Elements outside viewport: ${JSON.stringify(result.overflowing, null, 2)}`,
  ).toEqual([]);

  if (result.dialog) {
    expect(
      result.dialog.scrollWidth,
      'Open dialog must not contain horizontal scrolling or clipped content',
    ).toBeLessThanOrEqual(result.dialog.clientWidth);
    return;
  }

  expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
}

test('Daily Vibe lets one visible person fill the complete Vibe row', async ({
  page,
}) => {
  await installMocks(page, {
    ownVibe: 'OKAY',
    partnerState: { state: 'NO_CHECK_IN' },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page);

  const vibe = page.getByTestId('daily-vibe-checkin');
  const people = vibe.locator('.daily-vibe-people');
  const cards = people.locator('.daily-vibe-person');

  await expect(cards).toHaveCount(1);
  const [peopleBox, cardBox] = await Promise.all([
    people.boundingBox(),
    cards.first().boundingBox(),
  ]);
  expect(peopleBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  if (!peopleBox || !cardBox) {
    throw new Error('Missing single Vibe card geometry');
  }

  expect(Math.abs(cardBox.x - peopleBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(cardBox.width - peopleBox.width)).toBeLessThanOrEqual(1);
});

test('Daily Vibe stays relationship-first, uses the shared sheet, and preserves Energy', async ({
  page,
}, testInfo) => {
  const partnerNote =
    'My head feels a little empty today. A quiet evening would be nice.';
  const ownNote = "Today's appointment finally went better than expected.";
  const state = await installMocks(page, { partnerVibeNote: partnerNote });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  await signIn(page);

  const hero = page.locator('.today-hero');
  const vibe = page.getByTestId('daily-vibe-checkin');
  const upcoming = page.locator('.today-section-upcoming');
  await expect(hero).toBeVisible();
  await expect(hero.locator('.partner-presence-avatar-state')).toHaveCount(0);
  await expect(hero.locator('.couple-presence-indicator')).toHaveCount(0);
  await expect(hero).toHaveAttribute(
    'aria-labelledby',
    /couple-presence-title-/,
  );
  await expect(vibe).toBeVisible();
  await expect(upcoming).toBeVisible();

  const order = await page.evaluate(() => {
    const heroNode = document.querySelector('.today-hero');
    const vibeNode = document.querySelector(
      '[data-testid="daily-vibe-checkin"]',
    );
    const upcomingNode = document.querySelector('.today-section-upcoming');
    if (!heroNode || !vibeNode || !upcomingNode) return false;
    return (
      Boolean(
        heroNode.compareDocumentPosition(vibeNode) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ) &&
      Boolean(
        vibeNode.compareDocumentPosition(upcomingNode) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      )
    );
  });
  expect(order).toBe(true);
  await expect(page.getByTestId('daily-vibe-partner')).toHaveCount(0);
  await expect(page.getByText(dailyVibe.partnerHidden)).toHaveCount(0);
  await expect(vibe.getByText(dailyVibe.voluntary)).toHaveCount(0);

  await page.getByRole('button', { name: dailyVibe.chooseAria }).click();
  const sheet = page.getByRole('dialog', { name: dailyVibe.sheetTitle });
  await expect(sheet).toBeVisible();

  for (const label of Object.values(dailyVibe.values)) {
    await expect(sheet.getByRole('button', { name: label })).toBeVisible();
  }

  const intro = sheet.locator('.daily-vibe-sheet-intro');
  const introBox = await intro.boundingBox();
  expect(introBox).not.toBeNull();
  if (!introBox) throw new Error('Missing Vibe sheet content area');
  const contentX = introBox.x + introBox.width / 2;
  const contentY = introBox.y + introBox.height / 2;
  await page.mouse.move(contentX, contentY);
  await page.mouse.down();
  await page.mouse.move(contentX, contentY + 72, { steps: 4 });
  await page.mouse.up();
  await expect(sheet).toBeVisible();

  const grip = sheet.getByRole('button', { name: dailyVibe.close });
  const box = await grip.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error('Missing Vibe sheet grip');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 80, { steps: 4 });
  await page.mouse.move(x, y + 24, { steps: 3 });
  await page.mouse.up();
  await expect(sheet).toBeVisible();

  await sheet.getByRole('button', { name: dailyVibe.values.GOOD }).click();
  await sheet.getByPlaceholder(dailyVibe.notePlaceholder).fill(ownNote);
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: dailyVibe.share }).click();
  await expect(sheet).toHaveCount(0);
  const partnerCard = page.getByTestId('daily-vibe-partner');
  await expect(partnerCard.getByText(dailyVibe.values.STRESSED)).toBeVisible();
  await expect(partnerCard.getByText('Ben', { exact: true })).toBeVisible();
  await expect(
    partnerCard.getByText('Ben Winter', { exact: true }),
  ).toHaveCount(0);
  await expect(partnerCard).toHaveClass(/is-revealed/);
  await expect(
    page.getByRole('button', {
      name: dailyVibe.changeAria.replace('{{value}}', dailyVibe.values.GOOD),
    }),
  ).toHaveClass(/is-startup-reveal/);

  expect(state.lastPatch()).toEqual({
    vibe: 'GOOD',
    vibeNote: ownNote,
  });
  expect(state.lastPatch()).not.toHaveProperty('energyLevel');

  await expect(page.getByText(partnerNote)).toHaveCount(0);
  await partnerCard.click();
  const partnerSheet = page.getByRole('dialog', {
    name: dailyVibe.partnerNoteTitle.replace('{{name}}', 'Ben'),
  });
  await expect(partnerSheet).toBeVisible();
  await expect(partnerSheet.getByText(partnerNote)).toBeVisible();
  await expect(partnerSheet.getByText(dailyVibe.values.STRESSED)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const partnerSheetAxe = await new AxeBuilder({ page }).analyze();
  expect(partnerSheetAxe.violations).toEqual([]);
  await partnerSheet
    .getByRole('button', { name: dailyVibe.partnerNoteClose })
    .click();
  await expect(partnerSheet).toHaveCount(0);

  await expectNoHorizontalOverflow(page);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath('today-daily-vibe-390-light.png'),
    fullPage: true,
  });

  await page
    .getByRole('button', {
      name: dailyVibe.changeAria.replace('{{value}}', dailyVibe.values.GOOD),
    })
    .click();
  await page.getByRole('button', { name: dailyVibe.remove }).click();
  await expect(page.getByTestId('daily-vibe-partner')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: dailyVibe.chooseAria }),
  ).toBeVisible();
  expect(state.lastPatch()).toEqual({ vibe: null });
});

test('Daily Vibe reflows at 320px with large text and Reduced Motion', async ({
  page,
}, testInfo) => {
  await installMocks(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await signIn(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });

  await page.getByRole('button', { name: dailyVibe.chooseAria }).click();
  const sheet = page.getByRole('dialog', { name: dailyVibe.sheetTitle });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: dailyVibe.values.NEEDS_CONNECTION }),
  ).toBeVisible();

  await expectNoHorizontalOverflow(page);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath('today-daily-vibe-320-dark-large-text.png'),
    fullPage: true,
  });
});

test('Daily Vibe adapts the same interaction for Expanded Web', async ({
  page,
}, testInfo) => {
  await installMocks(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  await signIn(page);

  await page.getByRole('button', { name: dailyVibe.chooseAria }).click();
  const sheet = page.getByRole('dialog', { name: dailyVibe.sheetTitle });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: dailyVibe.close }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath('today-daily-vibe-1280-light.png'),
    fullPage: true,
  });
});

import { fulfillDefaultAppIcon } from '../support/appIcon';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import dailyVibe from '../../src/i18n/locales/dailyVibe';
import dailyEnergy from '../../src/i18n/locales/dailyEnergy';
import de from '../../src/i18n/locales/de';
import navigation from '../../src/i18n/locales/navigation';
import { writeFile } from 'node:fs/promises';

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
    holdFirstPatch?: boolean;
    holdFirstAck?: boolean;
    failFirstAck?: boolean;
    failFirstPatch?: boolean;
    energyEnabled?: boolean;
    // The daily projection can reflect a disable before cached configuration does.
    vibeProjectionDisabled?: boolean;
  } = {},
) {
  let ownVibe: string | null = initial.ownVibe ?? null;
  let ownEnergy: number | null = 60;
  let energyPartner:
    | { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
    | { state: 'VISIBLE'; value: number } = {
    state: 'HIDDEN_UNTIL_SELF_CHECK_IN',
  };
  let ownVibeNote: string | null = initial.ownVibeNote ?? null;
  let partnerState: VibePartnerState = initial.partnerState ?? {
    state: 'HIDDEN_UNTIL_SELF_CHECK_IN',
  };
  const partnerVibeNote = initial.partnerVibeNote ?? null;
  let etag = '"2026-10-12:check-in-1:1"';
  let lastPatch: Record<string, unknown> | null = null;
  let patchCount = 0;
  const unexpectedRequests: string[] = [];
  let dailyVersion = 1;
  let releaseFirstPatch = () => {};
  const firstPatchGate = new Promise<void>((resolve) => {
    releaseFirstPatch = resolve;
  });

  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
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

    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/recaps`) {
      await json({
        canCompose: false,
        editions: [],
        periods: [],
        hasMore: false,
      });
      return;
    }

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
          energyCheckInEnabled: initial.energyEnabled ?? false,
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
        relationshipDuration: { daysTogether: 284, startedOn: '2026-01-01' },
        retrospective: null,
        recentShared: [],
        upcoming: [
          {
            id: '00000000-0000-0000-0000-000000000040',
            type: 'PLAN',
            titleOrText: 'Gemeinsamer Abend',
            scheduledAt: '2026-10-13T18:00:00Z',
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
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/partner-nickname`
    ) {
      await json({ partnerId: PARTNER_ID, nickname: null, version: 0 });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/entitlements`
    ) {
      await json({
        spaceId: SPACE_ID,
        status: 'FREE',
        tier: 'FREE',
        capabilities: [],
        isInGracePeriod: false,
      });
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
          checkedOn: '2026-10-12',
          dailyContextTimezone: 'Europe/Berlin',
          own: {
            energyLevel: ownEnergy,
            vibe: ownVibe,
            vibeNote: ownVibeNote,
            version: dailyVersion,
          },
          energy: initial.energyEnabled
            ? { visibilityMode: 'MUTUAL_REVEAL', partner: energyPartner }
            : null,
          vibe: initial.vibeProjectionDisabled
            ? null
            : {
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
      patchCount += 1;
      lastPatch = request.postDataJSON() as Record<string, unknown>;
      if (patchCount === 1 && initial.holdFirstPatch) {
        await firstPatchGate;
      }
      if (patchCount === 1 && initial.failFirstPatch) {
        await json(
          {
            code: 'SERVICE_UNAVAILABLE',
            status: 503,
            title: 'Temporarily unavailable',
          },
          503,
        );
        return;
      }
      ownVibe = Object.hasOwn(lastPatch, 'vibe')
        ? (lastPatch.vibe as string | null)
        : ownVibe;
      if (Object.hasOwn(lastPatch, 'energyLevel')) {
        ownEnergy = lastPatch.energyLevel as number | null;
        energyPartner =
          ownEnergy === null
            ? { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
            : { state: 'VISIBLE', value: 40 };
      }
      if (ownVibe === null) {
        ownVibeNote = null;
      } else if (Object.hasOwn(lastPatch, 'vibeNote')) {
        ownVibeNote = (lastPatch.vibeNote as string | null) ?? null;
      }
      partnerState =
        ownVibe === null
          ? { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
          : { state: 'VISIBLE', value: 'STRESSED' };
      dailyVersion += 1;
      etag = `"2026-10-12:check-in-1:${dailyVersion}"`;
      if (patchCount === 1 && initial.holdFirstAck) await firstPatchGate;
      if (patchCount === 1 && initial.failFirstAck) {
        await json(
          {
            code: 'SERVICE_UNAVAILABLE',
            status: 503,
            title: 'Temporarily unavailable',
          },
          503,
        );
        return;
      }
      await json(
        {
          checkedOn: '2026-10-12',
          dailyContextTimezone: 'Europe/Berlin',
          own: {
            energyLevel: ownEnergy,
            vibe: ownVibe,
            vibeNote: ownVibeNote,
            version: dailyVersion,
          },
          energy: initial.energyEnabled
            ? { visibilityMode: 'MUTUAL_REVEAL', partner: energyPartner }
            : null,
          vibe: initial.vibeProjectionDisabled
            ? null
            : {
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

    unexpectedRequests.push(`${method} ${pathname}`);
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

  return {
    lastPatch: () => lastPatch,
    patchCount: () => patchCount,
    releaseFirstPatch,
    unexpectedRequests,
  };
}

async function signIn(page: Page) {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

for (const theme of ['light', 'dark'] as const) {
  test(`disabled Vibe cleanup keeps section spacing and clears only Vibe in ${theme}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const state = await installMocks(page, {
      ownVibe: 'GOOD',
      energyEnabled: true,
      vibeProjectionDisabled: true,
    });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      window.localStorage.setItem('eimir.theme', 'system');
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await signIn(page);
    const cleanup = page.getByTestId('daily-vibe-disabled-clear');
    const energy = page.getByTestId('daily-energy-own-battery');
    await expect(cleanup).toBeVisible();
    await expect(cleanup).toContainText(dailyVibe.values.GOOD);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByTestId('daily-vibe-partner')).toHaveCount(0);

    for (const viewport of [
      { width: 390, largeText: false },
      { width: 360, largeText: false },
      { width: 430, largeText: false },
      { width: 1440, largeText: false },
      { width: 320, largeText: true },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: 900 });
      await page.locator('html').evaluate((element, largeText) => {
        element.style.fontSize = largeText ? '200%' : '';
      }, viewport.largeText);
      const name = `vibe-cleanup-${viewport.width}-${theme}${viewport.largeText ? '-large' : ''}`;
      const geometry = await cleanup.evaluate((element) => {
        const style = getComputedStyle(element);
        const fontSize = Number.parseFloat(
          getComputedStyle(document.documentElement).fontSize,
        );
        const box = element.getBoundingClientRect();
        let next = element.nextElementSibling;
        while (next && next.getBoundingClientRect().height === 0)
          next = next.nextElementSibling;
        return {
          width: window.innerWidth,
          fontSize,
          top: Number.parseFloat(style.marginTop),
          bottom: Number.parseFloat(style.marginBottom),
          nextGap: next ? next.getBoundingClientRect().top - box.bottom : null,
          buttonHeight:
            element.querySelector('button')?.getBoundingClientRect().height ??
            0,
        };
      });
      await writeFile(
        testInfo.outputPath(`${name}.json`),
        JSON.stringify(geometry, null, 2),
      );
      await page.screenshot({
        path: testInfo.outputPath(`${name}.png`),
        fullPage: true,
      });
      expect.soft(geometry.top).toBeCloseTo(-0.75 * geometry.fontSize, 1);
      expect.soft(geometry.bottom).toBeCloseTo(2 * geometry.fontSize, 1);
      expect.soft(geometry.nextGap).not.toBeNull();
      expect
        .soft(geometry.nextGap ?? -1)
        .toBeGreaterThanOrEqual(geometry.bottom - 1);
      expect.soft(geometry.buttonHeight).toBeGreaterThanOrEqual(44);
      await expectNoHorizontalOverflow(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }

    await page
      .getByRole('link', { name: navigation.more, exact: true })
      .click();
    await expect(page).toHaveURL(/\/more$/);
    await expect(cleanup).toHaveCount(0);
    await page
      .getByRole('link', { name: navigation.today, exact: true })
      .click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(cleanup).toBeVisible();
    expect(state.patchCount()).toBe(0);
    await cleanup
      .getByRole('button', { name: dailyVibe.disabledRemove, exact: true })
      .click();
    await expect.poll(state.patchCount).toBe(1);
    expect(state.lastPatch()).toEqual({ vibe: null });
    await expect(cleanup).toHaveCount(0);
    await expect(energy).toHaveAttribute(
      'aria-label',
      dailyEnergy.badgeAriaValue.replace('{{value}}', '60'),
    );
    await page
      .getByRole('link', { name: navigation.more, exact: true })
      .click();
    await expect(page).toHaveURL(/\/more$/);
    await expect(energy).toHaveCount(0);
    await page
      .getByRole('link', { name: navigation.today, exact: true })
      .click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(cleanup).toHaveCount(0);
    await expect(energy).toHaveAttribute(
      'aria-label',
      dailyEnergy.badgeAriaValue.replace('{{value}}', '60'),
    );
    expect(state.patchCount()).toBe(1);
    await expectNoHorizontalOverflow(page);
    expect(state.unexpectedRequests).toEqual([]);
    await page.locator('html').evaluate((element) => {
      element.style.fontSize = '';
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({
      path: testInfo.outputPath(`vibe-cleaned-390-${theme}.png`),
      fullPage: true,
    });
  });
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

test('Daily Vibe keeps a visible partner Vibe without context non-interactive', async ({
  page,
}) => {
  await installMocks(page, {
    ownVibe: 'GOOD',
    partnerState: { state: 'VISIBLE', value: 'STRESSED' },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  const partnerCard = page.getByTestId('daily-vibe-partner');
  await expect(partnerCard).toBeVisible();
  expect(await partnerCard.evaluate((element) => element.tagName)).toBe('DIV');
  expect(await partnerCard.getAttribute('aria-haspopup')).toBeNull();
  await partnerCard.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
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
  await expect(page.getByText(partnerNote)).toHaveCount(0);
  await expect(vibe.locator('.daily-vibe-partner-context')).toHaveCount(0);

  const ownTrigger = page.getByRole('button', {
    name: dailyVibe.chooseAria,
  });
  await ownTrigger.click();
  const sheet = page.getByRole('dialog', { name: dailyVibe.sheetTitle });
  await expect(sheet).toBeVisible();
  const noteField = sheet.getByPlaceholder(dailyVibe.notePlaceholder);
  await expect(
    sheet.getByRole('button', { name: dailyVibe.values.GOOD }),
  ).toBeFocused();
  await expect(noteField).not.toBeFocused();

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(ownTrigger).toBeFocused();

  await ownTrigger.click();
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(ownTrigger).toBeFocused();
  await expect(page).toHaveURL(/\/today$/);

  await ownTrigger.click();
  await expect(sheet).toBeVisible();

  for (const [value, label] of Object.entries(dailyVibe.values)) {
    const option = sheet.getByRole('button', { name: label, exact: true });
    await expect(option).toBeVisible();
    await expect(option.locator('svg')).toHaveAttribute('data-vibe-icon', value);
    await expect(option.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  }
  await sheet.screenshot({
    path: testInfo.outputPath('vibe-six-labeled-symbols-390-light.png'),
    animations: 'disabled',
  });

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
  await page.keyboard.press('Escape');
  await expect(partnerSheet).toHaveCount(0);
  await expect(partnerCard).toBeFocused();

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

test('Daily Vibe immediately shows only the own pending Vibe and recovers a failed save', async ({
  page,
}, testInfo) => {
  const state = await installMocks(page, {
    holdFirstPatch: true,
    failFirstPatch: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await signIn(page);

  await page.getByRole('button', { name: dailyVibe.chooseAria }).click();
  const sheet = page.getByRole('dialog', { name: dailyVibe.sheetTitle });
  await sheet.getByRole('button', { name: dailyVibe.values.GOOD }).click();
  const note = 'A nice calm morning';
  await sheet.getByPlaceholder(dailyVibe.notePlaceholder).fill(note);
  await sheet.getByRole('button', { name: dailyVibe.share }).click();

  await expect(sheet).toHaveCount(0);
  const ownCard = page.getByTestId('daily-vibe-own');
  await expect(ownCard.getByText(dailyVibe.values.GOOD)).toBeVisible();
  await expect(ownCard).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText(dailyVibe.saving)).toBeVisible();
  await expect(page.getByTestId('daily-vibe-partner')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('today-daily-vibe-pending-390-light.png'),
    fullPage: true,
  });
  await ownCard.dispatchEvent('click');
  await expect(sheet).toHaveCount(0);
  expect(state.patchCount()).toBe(1);

  state.releaseFirstPatch();
  await expect(sheet).toBeVisible();
  await expect(ownCard.getByText(dailyVibe.values.GOOD)).toHaveCount(0);
  await expect(page.getByTestId('daily-vibe-partner')).toHaveCount(0);
  await expect(sheet.getByText(dailyVibe.saveError)).toBeVisible();
  await expect(sheet.getByPlaceholder(dailyVibe.notePlaceholder)).toHaveValue(
    note,
  );
  await expect(
    sheet.getByRole('button', { name: dailyVibe.values.GOOD }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({
    path: testInfo.outputPath('today-daily-vibe-save-error-390-light.png'),
    fullPage: true,
  });

  await sheet.getByRole('button', { name: dailyVibe.retry }).click();
  await expect(sheet).toHaveCount(0);
  await expect(ownCard.getByText(dailyVibe.values.GOOD)).toBeVisible();
  await expect(ownCard).toHaveAttribute('aria-disabled', 'false');
  await expect(page.getByText(dailyVibe.saving)).toHaveCount(0);
  await expect(
    page.getByTestId('daily-vibe-partner').getByText(dailyVibe.values.STRESSED),
  ).toBeVisible();
  expect(state.patchCount()).toBe(2);
  expect(state.lastPatch()).toEqual({ vibe: 'GOOD', vibeNote: note });
  await expectNoHorizontalOverflow(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

for (const viewport of [
  {
    width: 360,
    height: 800,
    theme: 'light',
    reducedMotion: 'no-preference',
    largeText: false,
  },
  {
    width: 390,
    height: 844,
    theme: 'light',
    reducedMotion: 'no-preference',
    largeText: false,
  },
  {
    width: 430,
    height: 932,
    theme: 'dark',
    reducedMotion: 'reduce',
    largeText: false,
  },
  {
    width: 1280,
    height: 900,
    theme: 'dark',
    reducedMotion: 'no-preference',
    largeText: false,
  },
  {
    width: 320,
    height: 640,
    theme: 'dark',
    reducedMotion: 'reduce',
    largeText: true,
  },
] as const) {
  for (const dimension of ['energy', 'vibe'] as const) {
    test(`DailyCheckIn retains ${dimension} ownership through route return, failure and retry at ${viewport.width}px ${viewport.theme}`, async ({
      page,
    }, testInfo) => {
      const state = await installMocks(page, {
        energyEnabled: true,
        holdFirstPatch: true,
        failFirstPatch: true,
      });
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.emulateMedia({
        colorScheme: viewport.theme,
        reducedMotion: viewport.reducedMotion,
      });
      await signIn(page);
      if (viewport.largeText)
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '200%';
        });
      const energy = page.getByTestId('daily-energy-own-battery');
      const sheet = page.getByRole('dialog', { name: dailyVibe.sheetTitle });
      const note = 'An own choice survives a brief interruption';
      if (dimension === 'energy') {
        await energy.click();
        const slider = page.getByRole('slider', {
          name: dailyEnergy.changeLegend,
        });
        await slider.focus();
        await slider.press('ArrowRight');
        await slider.press('ArrowRight');
        await slider.press('Tab');
        await expect(energy).toHaveAttribute('data-pending', 'true');
        await page.keyboard.press('Escape');
      } else {
        await page.getByRole('button', { name: dailyVibe.chooseAria }).click();
        await sheet
          .getByRole('button', { name: dailyVibe.values.GOOD })
          .click();
        await sheet.getByPlaceholder(dailyVibe.notePlaceholder).fill(note);
        await sheet.getByRole('button', { name: dailyVibe.share }).click();
        await expect(sheet).toHaveCount(0);
      }
      await expect.poll(state.patchCount).toBe(1);
      await page
        .getByRole('link', { name: navigation.more, exact: true })
        .click();
      await expect(energy).toHaveCount(0);
      await page
        .getByRole('link', { name: navigation.today, exact: true })
        .click();
      await expect(energy).toHaveAttribute(
        'aria-label',
        dailyEnergy.badgeAriaValue.replace(
          '{{value}}',
          dimension === 'energy' ? '80' : '60',
        ),
      );
      await expect(page.getByTestId('daily-vibe-partner')).toHaveCount(0);
      await expect(
        page.getByTestId('daily-energy-partner-battery'),
      ).toHaveCount(0);
      if (dimension === 'energy') {
        const choose = page.getByRole('button', { name: dailyVibe.chooseAria });
        await expect(choose).toHaveAttribute('aria-disabled', 'true');
        await expect(page.getByText(dailyVibe.otherSaving)).toBeVisible();
        await choose.dispatchEvent('click');
        await expect(sheet).toHaveCount(0);
        await energy.click();
        await expect(page.getByRole('slider')).toHaveValue('80');
        await expect(page.getByRole('slider')).toBeDisabled();
        await expect(page.getByText(dailyEnergy.saving)).toBeVisible();
      } else {
        const own = page.getByTestId('daily-vibe-own');
        await expect(own).toHaveAttribute('aria-disabled', 'true');
        await expect(own.getByText(dailyVibe.values.GOOD)).toBeVisible();
        await own.dispatchEvent('click');
        await expect(sheet).toHaveCount(0);
        await energy.click();
        await expect(page.getByRole('slider')).toBeDisabled();
        await expect(page.getByText(dailyEnergy.otherSaving)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(energy).toBeFocused();
      }
      expect(state.patchCount()).toBe(1);
      await expectNoHorizontalOverflow(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      const prefix = `today-daily-owner-${dimension}-${viewport.width}-${viewport.theme}`;
      await page.screenshot({
        path: testInfo.outputPath(`${prefix}-return.png`),
        fullPage: true,
        animations: 'disabled',
      });
      state.releaseFirstPatch();
      if (dimension === 'energy') {
        await expect(page.getByText(dailyEnergy.saveError)).toBeVisible();
        await expect(page.getByRole('slider')).toHaveValue('80');
      } else {
        await expect(sheet).toBeVisible();
        await expect(sheet.getByText(dailyVibe.saveError)).toBeVisible();
        await expect(
          sheet.getByPlaceholder(dailyVibe.notePlaceholder),
        ).toHaveValue(note);
        await sheet.getByText(dailyVibe.saveError).scrollIntoViewIfNeeded();
        await expect(sheet.getByText(dailyVibe.saveError)).toBeInViewport();
        await expect(
          sheet.getByRole('button', { name: dailyVibe.retry, exact: true }),
        ).toBeInViewport();
      }
      await expectNoHorizontalOverflow(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`${prefix}-error.png`),
        fullPage: true,
        animations: 'disabled',
      });
      await (dimension === 'energy'
        ? page.getByTestId('daily-energy-popover')
        : sheet
      )
        .getByRole('button', {
          name: dimension === 'energy' ? de.common.retry : dailyVibe.retry,
          exact: true,
        })
        .click();
      await expect.poll(state.patchCount).toBe(2);
      if (dimension === 'energy') {
        await expect(energy).not.toHaveAttribute('data-pending', 'true');
        await expect(
          page.getByTestId('daily-energy-partner-battery'),
        ).toBeVisible();
        expect(state.lastPatch()).toEqual({ energyLevel: 80 });
        await page.keyboard.press('Escape');
        await expect(energy).toBeFocused();
      } else {
        await expect(sheet).toHaveCount(0);
        await expect(page.getByTestId('daily-vibe-own')).toHaveAttribute(
          'aria-disabled',
          'false',
        );
        await expect(page.getByTestId('daily-vibe-partner')).toBeVisible();
        expect(state.lastPatch()).toEqual({ vibe: 'GOOD', vibeNote: note });
      }
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`${prefix}-confirmed.png`),
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
}

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

  await expect(page.locator('.daily-vibe-share')).toHaveClass(/button-link/);
  await page.locator('.daily-vibe-checkin').screenshot({
    path: testInfo.outputPath('vibe-primary-button-1280-light.png'),
  });
  await page.getByRole('button', { name: dailyVibe.chooseAria }).click();
  const sheet = page.getByRole('dialog', { name: dailyVibe.sheetTitle });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: dailyVibe.close }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  await expect
    .poll(() =>
      sheet.evaluate((dialog) => ({
        sheet: getComputedStyle(dialog).opacity,
        backdrop: getComputedStyle(dialog, '::backdrop').opacity,
      })),
    )
    .toEqual({ sheet: '1', backdrop: '1' });
  await page.screenshot({
    path: testInfo.outputPath('today-daily-vibe-1280-light.png'),
    fullPage: false,
  });
});

test('Daily Vibe keeps a committed clear pending through return and consumes a lost acknowledgement without replay', async ({
  page,
}, testInfo) => {
  const state = await installMocks(page, {
    ownVibe: 'GOOD',
    energyEnabled: true,
    holdFirstAck: true,
    failFirstAck: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await signIn(page);
  await page.getByTestId('daily-vibe-own').click();
  const sheet = page.getByRole('dialog', { name: dailyVibe.sheetTitle });
  await sheet.getByRole('button', { name: dailyVibe.remove }).click();
  await expect.poll(state.patchCount).toBe(1);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await page.getByRole('link', { name: navigation.more, exact: true }).click();
  await expect(page.getByTestId('daily-energy-own-battery')).toHaveCount(0);
  await page.getByRole('link', { name: navigation.today, exact: true }).click();
  const choose = page.getByRole('button', { name: dailyVibe.chooseAria });
  await expect(choose).toBeVisible();
  await expect(choose).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText(dailyVibe.saving, { exact: true })).toBeVisible();
  await choose.dispatchEvent('click');
  await expect(sheet).toHaveCount(0);
  expect(state.patchCount()).toBe(1);
  await expectNoHorizontalOverflow(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('today-daily-vibe-clear-pending-390-light.png'),
    fullPage: true,
  });
  state.releaseFirstPatch();
  await expect(choose).toHaveAttribute('aria-disabled', 'false');
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText(dailyVibe.saveError)).toHaveCount(0);
  await expect(page.getByText(dailyVibe.saving, { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByTestId('daily-vibe-partner')).toHaveCount(0);
  expect(state.lastPatch()).toEqual({ vibe: null });
  expect(state.patchCount()).toBe(1);
});


import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import dailyVibe from '../../src/i18n/locales/dailyVibe';
import de from '../../src/i18n/locales/de';
import onceMessages from '../../src/i18n/locales/onceMessages';
import relationshipComponents from '../../src/i18n/locales/relationshipComponents';
import wirCheckIn from '../../src/i18n/locales/wirCheckIn';
import fixtureCopy from '../fixtures/locales/de';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import AxeBuilder from '../support/axe';
import { fulfillNoOccasionSources } from '../support/occasionSources';

/**
 * Daily check-in on the couple avatars on Wir (#1790 slice A): badges on
 * the avatars, the "Dein Tag" bottom sheet, per-value deletion, and the
 * partner block on top of the unchanged partner quick-action sheet.
 */

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';
const quickActions = relationshipComponents.partnerQuickActions;

type Visibility = 'IMMEDIATE' | 'MUTUAL_REVEAL';

interface MockOptions {
  visibility?: Visibility;
  ownVibe?: string | null;
  ownEnergy?: number | null;
  ownNote?: string | null;
  partnerVibe?: string | null;
  partnerEnergy?: number | null;
  partnerNote?: string | null;
  failFirstPatch?: boolean;
  /** Hold every PATCH response, to observe the waiting state. */
  patchDelayMs?: number;
  /** #2072: the Space's relationship start (`YYYY-MM-DD`). */
  relationshipStartedOn?: string;
  /** #2072: the partner's profile birthday (`YYYY-MM-DD`). */
  partnerBirthday?: string;
}

async function installMocks(page: Page, options: MockOptions = {}) {
  const visibility = options.visibility ?? 'IMMEDIATE';
  let ownVibe = options.ownVibe ?? null;
  let ownEnergy = options.ownEnergy ?? null;
  let ownNote = options.ownNote ?? null;
  const partnerVibe = options.partnerVibe ?? null;
  const partnerEnergy = options.partnerEnergy ?? null;
  const partnerNote = options.partnerNote ?? null;
  let version = 1;
  const patches: Record<string, unknown>[] = [];
  const unexpectedRequests: string[] = [];

  const ownHasEntry = () =>
    ownVibe !== null || ownEnergy !== null || ownNote !== null;
  const partnerProjection = <T>(value: T | null) => {
    if (visibility === 'MUTUAL_REVEAL' && !ownHasEntry()) {
      return { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' };
    }
    return value === null
      ? { state: 'NO_CHECK_IN' }
      : { state: 'VISIBLE', value };
  };
  const today = () => ({
    checkedOn: '2026-11-13',
    dailyContextTimezone: 'Europe/Berlin',
    own: { energyLevel: ownEnergy, vibe: ownVibe, vibeNote: ownNote, version },
    energy: {
      visibilityMode: visibility,
      partner: partnerProjection(partnerEnergy),
    },
    vibe: {
      visibilityMode: visibility,
      partner: partnerProjection(partnerVibe),
      partnerNote:
        partnerProjection(partnerVibe).state === 'VISIBLE' ? partnerNote : null,
    },
  });

  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const space = `/api/v1/spaces/${SPACE_ID}`;
    const json = (body: unknown, status = 200, headers = {}) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(body),
      });

    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      return json({
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
    }
    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      return json({
        account: { displayName: 'Lea', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'wir-checkin-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'wir-checkin-refresh-token',
        },
      });
    }
    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      return json({ id: ACCOUNT_ID, displayName: 'Lea' });
    }
    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      return json({ serverAdmin: false });
    }
    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      return json([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
    }
    if (method === 'GET' && pathname === space) {
      return json({
        id: SPACE_ID,
        createdAt: '2023-08-23T00:00:00Z',
        partners: [
          { id: ACCOUNT_ID, displayName: 'Lea' },
          { id: PARTNER_ID, displayName: 'Alex' },
        ],
        ...(options.relationshipStartedOn
          ? { relationshipStartedOn: options.relationshipStartedOn }
          : {}),
      });
    }
    if (method === 'GET' && pathname === `${space}/configuration`) {
      return json(
        {
          canManageSpaceConfiguration: true,
          dailyContextTimezone: 'Europe/Berlin',
          dailyQuestionsEnabled: false,
          energyCheckInEnabled: true,
          energyVisibilityMode: visibility,
          loveNotesEnabled: false,
          sharedAchievementsEnabled: false,
          spaceId: SPACE_ID,
          supportGesturesEnabled: true,
          version: 7,
          vibeCheckEnabled: true,
          vibeVisibilityMode: visibility,
        },
        200,
        { ETag: '"7"' },
      );
    }
    if (
      method === 'GET' &&
      (pathname === `${space}/profiles/${ACCOUNT_ID}` ||
        pathname === `${space}/profiles/${PARTNER_ID}`)
    ) {
      const partner = pathname.endsWith(PARTNER_ID);
      return json({
        accountId: partner ? PARTNER_ID : ACCOUNT_ID,
        createdAt: '2026-01-01T00:00:00Z',
        displayName: partner ? 'Alex' : 'Lea',
        birthday: partner ? (options.partnerBirthday ?? null) : null,
        id: partner
          ? '00000000-0000-0000-0000-000000000022'
          : '00000000-0000-0000-0000-000000000020',
        preferences: [],
        profileAttachmentId: null,
        updatedAt: '2026-01-01T00:00:00Z',
        version: 1,
      });
    }
    if (method === 'GET' && pathname === `${space}/dashboard/preferences`) {
      return json({ items: [] });
    }
    if (method === 'GET' && pathname === `${space}/dashboard`) {
      return json({
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Alex' },
        },
        relationshipDuration: { daysTogether: 1178, startedOn: '2023-08-23' },
        retrospective: null,
        recentShared: [],
        upcoming: [],
        thinkingOfYouAvailableAt: null,
      });
    }
    if (method === 'GET' && pathname === `${space}/recaps`) {
      return json({
        canCompose: false,
        editions: [],
        periods: [],
        hasMore: false,
      });
    }
    if (method === 'GET' && pathname === `${space}/activity`) {
      return json({ hasMore: false, items: [], nextCursor: null });
    }
    if (
      method === 'GET' &&
      pathname === `${space}/notifications/unread-count`
    ) {
      return json({ unreadCount: 0 });
    }
    if (method === 'GET' && pathname === `${space}/partner-nickname`) {
      return json({ partnerId: PARTNER_ID, nickname: null, version: 0 });
    }
    if (method === 'GET' && pathname === `${space}/entitlements`) {
      return json({
        spaceId: SPACE_ID,
        status: 'FREE',
        tier: 'FREE',
        capabilities: [],
        isInGracePeriod: false,
      });
    }
    if (
      (method === 'GET' || method === 'POST') &&
      pathname === `${space}/presence`
    ) {
      return json({ state: 'UNKNOWN' });
    }
    if (pathname === `${space}/daily-check-in/today`) {
      if (method === 'PATCH') {
        const patch = request.postDataJSON() as Record<string, unknown>;
        patches.push(patch);
        if (options.patchDelayMs)
          await new Promise((resolve) =>
            setTimeout(resolve, options.patchDelayMs),
          );
        if (options.failFirstPatch && patches.length === 1) {
          return json(
            { code: 'SERVICE_UNAVAILABLE', status: 503, title: 'Unavailable' },
            503,
          );
        }
        if (Object.hasOwn(patch, 'energyLevel'))
          ownEnergy = patch.energyLevel as number | null;
        if (Object.hasOwn(patch, 'vibe')) {
          ownVibe = patch.vibe as string | null;
          if (ownVibe === null) ownNote = null;
        }
        if (Object.hasOwn(patch, 'vibeNote'))
          ownNote = (patch.vibeNote as string | null) ?? null;
        version += 1;
      }
      if (method === 'GET' || method === 'PATCH') {
        return json(today(), 200, {
          ETag: `"2026-11-13:check-in:${version}"`,
          'Cache-Control': 'private, no-store',
        });
      }
    }

    if (await fulfillNoOccasionSources(route)) return;
    unexpectedRequests.push(`${method} ${pathname}`);
    return json(
      { code: 'E2E_UNEXPECTED_REQUEST', status: 500, title: 'Unexpected' },
      500,
    );
  });

  return { patches, unexpectedRequests };
}

async function signIn(page: Page) {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
}

function ownAvatar(page: Page) {
  return page.getByRole('button', { name: /^Dein Tag:/ });
}

function partnerAvatar(page: Page) {
  return page.getByRole('button', {
    name: new RegExp(`^${quickActions.trigger.replace('{{partner}}', 'Alex')}`),
  });
}

async function saveEvidence(page: Page, name: string) {
  const exportDir = process.env.VISUAL_EVIDENCE_DIR;
  const output = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path: output, fullPage: false });
  if (exportDir) {
    fs.mkdirSync(exportDir, { recursive: true });
    fs.copyFileSync(output, path.join(exportDir, `${name}.png`));
  }
}

async function expectInsideViewport(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box).not.toBeNull();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
}

test('badges show vibe and battery without numbers; the partner sheet keeps every quick action', async ({
  page,
}) => {
  const state = await installMocks(page, {
    ownVibe: 'GOOD',
    ownEnergy: 80,
    partnerVibe: 'OKAY',
    partnerEnergy: 40,
    partnerNote: fixtureCopy.wirCheckIn.partnerShortNote,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  const ownBadge = page.getByTestId('wir-checkin-own-badge');
  const partnerBadge = page.getByTestId('wir-checkin-partner-badge');
  await expect(ownBadge.locator('[data-vibe-icon="GOOD"]')).toBeVisible();
  await expect(partnerBadge.locator('[data-vibe-icon="OKAY"]')).toBeVisible();
  await expect(ownBadge.locator('.daily-energy-battery-icon')).toBeVisible();
  await expect(
    partnerBadge.locator('.daily-energy-battery-icon'),
  ).toBeVisible();
  // Energy is a symbol only on Wir; the number lives in accessible names.
  await expect(page.locator('.today-hero')).not.toContainText(/\d+\s*%/);
  await expect(ownAvatar(page)).toHaveAccessibleName(
    'Dein Tag: Entspannt, Akku 80 Prozent. Ändern',
  );
  await expect(partnerAvatar(page)).toHaveAccessibleName(
    `${quickActions.trigger.replace('{{partner}}', 'Alex')}. Alex: Geht so, Akku 40 Prozent, neue Notiz`,
  );
  await expect(page.getByTestId('wir-checkin-note-dot')).toBeVisible();
  // The separate check-in section is gone from Wir.
  await expect(
    page.getByRole('heading', { name: dailyVibe.question }),
  ).toHaveCount(0);
  await expectInsideViewport(page, 'wir-checkin-own-badge');
  await expectInsideViewport(page, 'wir-checkin-partner-badge');

  await partnerAvatar(page).click();
  const sheet = page.getByRole('dialog', {
    name: quickActions.title.replace('{{partner}}', 'Alex'),
  });
  const block = sheet.getByTestId('wir-checkin-partner-block');
  await expect(block).toContainText('Geht so');
  await expect(block).toContainText(fixtureCopy.wirCheckIn.partnerShortNote);
  await expect(
    block.getByRole('img', { name: 'Akku 40 Prozent' }),
  ).toBeVisible();
  await expect(block).not.toContainText(/\d+\s*%/);
  for (const name of [
    quickActions.thinking,
    quickActions.kiss,
    quickActions.checkIn,
  ]) {
    await expect(sheet.getByRole('button', { name })).toBeVisible();
  }
  await expect(
    sheet.getByRole('link', { name: new RegExp(onceMessages.title) }),
  ).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  // Opening the note clears the dot locally; nothing is sent to the partner.
  await expect(page.getByTestId('wir-checkin-note-dot')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('wir-checkin-partner-badge')).toBeVisible();
  await expect(page.getByTestId('wir-checkin-note-dot')).toHaveCount(0);
  expect(state.patches).toEqual([]);
  expect(state.unexpectedRequests).toEqual([]);
});

test('Dein Tag saves vibe, energy and note independently and deletes each one', async ({
  page,
}) => {
  const state = await installMocks(page, {
    visibility: 'MUTUAL_REVEAL',
    partnerVibe: 'OKAY',
    partnerEnergy: 40,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page);

  const ownBadge = page.getByTestId('wir-checkin-own-badge');
  const partnerBadge = page.getByTestId('wir-checkin-partner-badge');
  await expect(ownBadge).toContainText(wirCheckIn.ownPrompt);
  await expect(partnerBadge).toHaveAttribute('data-state', 'hidden');
  await expect(ownAvatar(page)).toHaveAccessibleName(wirCheckIn.ownAriaEmpty);

  await ownAvatar(page).click();
  const panel = page.getByRole('dialog', { name: wirCheckIn.panelTitle });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('textbox')).toBeDisabled();

  // Vibe saves on tap and reveals both partner dimensions together.
  await panel.getByRole('button', { name: 'Entspannt', exact: true }).click();
  await expect.poll(() => state.patches.at(-1)).toEqual({ vibe: 'GOOD' });
  await expect(ownBadge.locator('[data-vibe-icon="GOOD"]')).toBeVisible();
  await expect(partnerBadge).toHaveAttribute('data-state', 'visible');
  await expect(partnerBadge.locator('[data-vibe-icon="OKAY"]')).toBeVisible();
  await expect(
    partnerBadge.locator('.daily-energy-battery-icon'),
  ).toBeVisible();

  // Energy saves on release, independent of the vibe.
  const slider = panel.getByRole('slider', {
    name: wirCheckIn.energySliderLabel,
  });
  await slider.focus();
  await page.keyboard.press('End');
  await expect.poll(() => state.patches.at(-1)).toEqual({ energyLevel: 100 });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => state.patches.at(-1)).toEqual({ energyLevel: 80 });
  await expect(ownAvatar(page)).toHaveAccessibleName(
    'Dein Tag: Entspannt, Akku 80 Prozent. Ändern',
  );
  await expect(panel).not.toContainText(/\d+\s*%/);

  // The note saves when leaving the field.
  const note = panel.getByRole('textbox', { name: wirCheckIn.noteLabel });
  await note.fill(fixtureCopy.wirCheckIn.ownShortNote);
  await expect(panel).toContainText('19/200');
  await note.blur();
  await expect
    .poll(() => state.patches.at(-1))
    .toEqual({
      vibeNote: fixtureCopy.wirCheckIn.ownShortNote,
    });
  await expect(panel).toContainText(wirCheckIn.vibeSelectedHintWithNote);

  // Note: delete, then undo from the snackbar.
  await panel.getByRole('button', { name: wirCheckIn.noteDelete }).click();
  await expect.poll(() => state.patches.at(-1)).toEqual({ vibeNote: null });
  await expect(note).toHaveValue('');
  await page.getByRole('button', { name: wirCheckIn.undo }).click();
  await expect
    .poll(() => state.patches.at(-1))
    .toEqual({
      vibeNote: fixtureCopy.wirCheckIn.ownShortNote,
    });
  await expect(note).toHaveValue(fixtureCopy.wirCheckIn.ownShortNote);

  // Energy: remove on its own.
  await panel
    .getByRole('button', { name: wirCheckIn.energyRemoveAria })
    .click();
  await expect.poll(() => state.patches.at(-1)).toEqual({ energyLevel: null });
  await expect(ownBadge.locator('.daily-energy-battery-icon')).toHaveCount(0);
  await expect(ownBadge.locator('[data-vibe-icon="GOOD"]')).toBeVisible();

  // Vibe: tapping the selected vibe removes it together with its note.
  await panel.getByRole('button', { name: 'Entspannt', exact: true }).click();
  await expect.poll(() => state.patches.at(-1)).toEqual({ vibe: null });
  await expect(ownBadge).toContainText(wirCheckIn.ownPrompt);
  await expect(note).toHaveValue('');
  await expect(partnerBadge).toHaveAttribute('data-state', 'hidden');

  await panel.getByRole('button', { name: wirCheckIn.done }).click();
  await expect(panel).toBeHidden();
  await expect(ownAvatar(page)).toBeFocused();
  expect(state.unexpectedRequests).toEqual([]);
});

test('a press on the backdrop closes Dein Tag, saves the open note and returns focus to the avatar', async ({
  page,
}) => {
  const state = await installMocks(page, {
    ownVibe: 'GOOD',
    ownEnergy: 80,
    partnerVibe: 'OKAY',
    partnerEnergy: 40,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  await ownAvatar(page).click();
  const panel = page.getByRole('dialog', { name: wirCheckIn.panelTitle });
  await expect(panel).toBeVisible();
  const note = panel.getByRole('textbox', { name: wirCheckIn.noteLabel });
  await note.fill(fixtureCopy.wirCheckIn.ownShortNote);
  await page.waitForTimeout(400);
  await saveEvidence(page, '1836-390-light-1-panel-open');

  // A press inside the sheet keeps it open.
  await panel.getByRole('heading', { name: wirCheckIn.panelTitle }).click();
  await expect(panel).toBeVisible();

  // A press on the scrim above the sheet closes it and saves the note.
  await page.mouse.click(195, 40);
  await expect(panel).toBeHidden();
  await expect
    .poll(() => state.patches.at(-1))
    .toEqual({ vibeNote: fixtureCopy.wirCheckIn.ownShortNote });
  await expect(ownAvatar(page)).toBeFocused();
  await expect(ownAvatar(page)).toHaveAttribute('aria-expanded', 'false');
  await page.waitForTimeout(400);
  await saveEvidence(page, '1836-390-light-2-closed-by-backdrop-press');

  // Escape closes it too, and the avatar reopens it.
  await ownAvatar(page).click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  expect(state.unexpectedRequests).toEqual([]);
});

test('Dein Tag is accessible and wraps its vibes at 200 % text on 360 px', async ({
  page,
}) => {
  await installMocks(page, {
    ownVibe: 'GOOD',
    ownEnergy: 80,
    ownNote: fixtureCopy.wirCheckIn.ownNote,
    partnerVibe: 'OKAY',
    partnerEnergy: 40,
    partnerNote: fixtureCopy.wirCheckIn.partnerShortNote,
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expectInsideViewport(page, 'wir-checkin-own-badge');
  await expectInsideViewport(page, 'wir-checkin-partner-badge');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(360);

  await ownAvatar(page).click();
  const panel = page.getByRole('dialog', { name: wirCheckIn.panelTitle });
  await expect(panel).toBeVisible();
  const boxes = await panel
    .locator('.wir-checkin-vibe')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().toJSON()),
    );
  expect(boxes).toHaveLength(5);
  for (const [index, a] of boxes.entries()) {
    expect(a.left).toBeGreaterThanOrEqual(0);
    expect(a.right).toBeLessThanOrEqual(360);
    for (const b of boxes.slice(index + 1)) {
      const overlap =
        a.left < b.right &&
        b.left < a.right &&
        a.top < b.bottom &&
        b.top < a.bottom;
      expect(overlap).toBe(false);
    }
  }
  const results = await new AxeBuilder({ page })
    .include('[data-testid="wir-checkin-panel"]')
    .analyze();
  expect(results.violations).toEqual([]);
});

test('a failed save stays honest and retries; offline blocks writes', async ({
  page,
  context,
}) => {
  const state = await installMocks(page, {
    partnerVibe: 'OKAY',
    partnerEnergy: 40,
    failFirstPatch: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  await ownAvatar(page).click();
  const panel = page.getByRole('dialog', { name: wirCheckIn.panelTitle });
  await panel.getByRole('button', { name: 'Fröhlich', exact: true }).click();
  await expect(panel.getByText(wirCheckIn.saveError)).toBeVisible();
  // No fake success: the badge falls back to the server state.
  await expect(page.getByTestId('wir-checkin-own-badge')).toContainText(
    wirCheckIn.ownPrompt,
  );
  await panel.getByRole('button', { name: wirCheckIn.retry }).click();
  await expect.poll(() => state.patches.length).toBe(2);
  expect(state.patches.at(-1)).toEqual({ vibe: 'VERY_GOOD' });
  await expect(
    page
      .getByTestId('wir-checkin-own-badge')
      .locator('[data-vibe-icon="VERY_GOOD"]'),
  ).toBeVisible();
  await expect(panel.getByText(wirCheckIn.saveError)).toHaveCount(0);

  await context.setOffline(true);
  await expect(panel.getByText(wirCheckIn.offline)).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Entspannt', exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByRole('slider', { name: wirCheckIn.energySliderLabel }),
  ).toBeDisabled();
  await context.setOffline(false);
  await expect(panel.getByText(wirCheckIn.offline)).toHaveCount(0);
  expect(state.patches).toHaveLength(2);
  expect(state.unexpectedRequests).toEqual([]);
});

for (const { width, theme, large, reduced } of [
  { width: 360, theme: 'light', large: false, reduced: false },
  { width: 360, theme: 'dark', large: false, reduced: false },
  { width: 390, theme: 'light', large: false, reduced: false },
  { width: 390, theme: 'dark', large: false, reduced: true },
  { width: 430, theme: 'light', large: false, reduced: false },
  { width: 360, theme: 'light', large: true, reduced: false },
  { width: 1280, theme: 'light', large: false, reduced: false },
] as const) {
  const label = `${width}-${theme}${large ? '-200-text' : ''}${reduced ? '-reduced-motion' : ''}`;
  test(`visual evidence ${label}: resting, Dein Tag, partner sheet, after deletion`, async ({
    page,
  }) => {
    await installMocks(page, {
      ownVibe: 'GOOD',
      ownEnergy: 80,
      ownNote: fixtureCopy.wirCheckIn.ownNote,
      partnerVibe: 'OKAY',
      partnerEnergy: 40,
      partnerNote: fixtureCopy.wirCheckIn.partnerNote,
    });
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({
      colorScheme: theme,
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    await signIn(page);
    if (large) {
      await page.addStyleTag({
        content: 'html { font-size: 200% !important; }',
      });
    }
    await expect(page.getByTestId('wir-checkin-partner-badge')).toBeVisible();
    await page.waitForTimeout(400);
    await saveEvidence(page, `1790a-${label}-1-resting`);

    await ownAvatar(page).click();
    const panel = page.getByRole('dialog', { name: wirCheckIn.panelTitle });
    await expect(panel).toBeVisible();
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const hero = document.querySelector('.today-hero');
      if (hero)
        window.scrollTo(0, hero.getBoundingClientRect().top + window.scrollY);
    });
    await page.waitForTimeout(400);
    await saveEvidence(page, `1790a-${label}-2-dein-tag`);
    await panel.getByRole('button', { name: wirCheckIn.done }).click();
    await page.evaluate(() => window.scrollTo(0, 0));

    await partnerAvatar(page).click();
    await expect(page.getByTestId('wir-checkin-partner-block')).toBeVisible();
    await page.waitForTimeout(500);
    await saveEvidence(page, `1790a-${label}-3-partner-sheet`);
    await page.keyboard.press('Escape');

    await ownAvatar(page).click();
    await panel.getByRole('button', { name: 'Entspannt', exact: true }).click();
    await panel
      .getByRole('button', { name: wirCheckIn.energyRemoveAria })
      .click();
    await expect(page.getByTestId('wir-checkin-own-badge')).toContainText(
      wirCheckIn.ownPrompt,
    );
    await panel.getByRole('button', { name: wirCheckIn.done }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await saveEvidence(page, `1790a-${label}-4-after-deletion`);
  });
}

/**
 * Send flight (Fertig): the chosen feeling, battery and note lift out of the
 * sheet, wait for the server, then fly to the own badge while the sheet
 * closes. The flight layer lives in the top layer, above the modal sheet.
 */
const flightGhosts = (page: Page) =>
  page.locator('.wir-checkin-flight-layer .wir-checkin-flight-ghost');

async function fillOwnDay(panel: ReturnType<Page['getByRole']>) {
  await panel.getByRole('button', { name: 'Entspannt', exact: true }).click();
  await panel
    .getByRole('slider', { name: wirCheckIn.energySliderLabel })
    .press('ArrowRight');
  await panel
    .getByRole('textbox', { name: wirCheckIn.noteLabel })
    .fill('Denk an dich');
}

for (const { width, theme } of [
  { width: 360, theme: 'light' },
  { width: 390, theme: 'dark' },
  { width: 430, theme: 'light' },
] as const) {
  test(`Fertig flies feeling, battery and note to the own badge (${width} ${theme})`, async ({
    page,
  }) => {
    const state = await installMocks(page, { patchDelayMs: 900 });
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ colorScheme: theme });
    await signIn(page);
    await ownAvatar(page).click();
    const panel = page.getByRole('dialog', { name: wirCheckIn.panelTitle });
    await fillOwnDay(panel);
    await panel.getByRole('button', { name: wirCheckIn.done }).click();

    // Waiting for the server: all three hover in the top layer above the
    // sheet, the sheet stays, and nothing has landed on the badge yet.
    await expect(flightGhosts(page)).toHaveCount(3);
    const layer = page.locator('.wir-checkin-flight-layer');
    await expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(await layer.evaluate((node) => node.matches(':popover-open'))).toBe(
      true,
    );
    const pointer = await flightGhosts(page)
      .first()
      .evaluate((node) => getComputedStyle(node).pointerEvents);
    expect(pointer).toBe('none');
    await expect(panel).toBeVisible();
    const badge = page.getByTestId('wir-checkin-own-badge');
    await expect(badge.locator('[data-flight-slot="vibe"]')).toHaveAttribute(
      'data-flight-hidden',
      'true',
    );
    await saveEvidence(page, `send-flight-${width}-${theme}-hover`);

    // Confirmed: the sheet closes and everything lands on the badge.
    await expect(panel).toBeHidden();
    await expect(flightGhosts(page)).toHaveCount(0);
    await expect(page.locator('.wir-checkin-flight-layer')).toHaveCount(0);
    await expect(
      badge.locator('[data-flight-slot="vibe"]'),
    ).not.toHaveAttribute('data-flight-hidden', 'true');
    await expect(badge.locator('[data-flight-slot="energy"]')).toBeVisible();
    await expect(badge.locator('[data-flight-slot="note"]')).toBeVisible();
    await expectInsideViewport(page, 'wir-checkin-own-badge');
    await saveEvidence(page, `send-flight-${width}-${theme}-landed`);
    expect(state.unexpectedRequests).toEqual([]);
    expect(state.patches.length).toBeGreaterThanOrEqual(3);
  });
}

test('a failed save returns the value and keeps Dein Tag open', async ({
  page,
}) => {
  await installMocks(page, { failFirstPatch: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await ownAvatar(page).click();
  const panel = page.getByRole('dialog', { name: wirCheckIn.panelTitle });
  await panel.getByRole('button', { name: 'Fröhlich', exact: true }).click();
  await panel.getByRole('button', { name: wirCheckIn.done }).click();
  await expect(panel.getByText(wirCheckIn.saveError)).toBeVisible();
  await expect(panel).toBeVisible();
  await expect(flightGhosts(page)).toHaveCount(0);
  await expect(page.locator('[data-flight-hidden="true"]')).toHaveCount(0);
  // The failed feeling is not on the badge.
  await expect(page.getByTestId('wir-checkin-own-badge')).toContainText(
    wirCheckIn.ownPrompt,
  );
});

test('reduced motion closes calmly: no flight layer is ever created', async ({
  page,
}) => {
  await installMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page);
  await ownAvatar(page).click();
  const panel = page.getByRole('dialog', { name: wirCheckIn.panelTitle });
  await fillOwnDay(panel);
  await panel.getByRole('button', { name: wirCheckIn.done }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator('.wir-checkin-flight-layer')).toHaveCount(0);
  const badge = page.getByTestId('wir-checkin-own-badge');
  await expect(badge.locator('[data-flight-slot="vibe"]')).toBeVisible();
  await expect(badge.locator('[data-flight-slot="note"]')).toBeVisible();
});

test('the daily invitation sits beside the plus and never holds the row under the names open', async ({
  page,
}) => {
  await installMocks(page);
  // The row belongs to the Verbunden stage; this spec otherwise renders the
  // Offen hero, which has no row that stays behind. Registered after the
  // mocks so it answers first.
  await page.route('**/api/v1/**/appearance/wir-design', (route) =>
    route.fulfill({ json: { designId: 'connected', version: 1 } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page);

  // The day has no value, so the line invites beside the plus. The row under
  // the portrait stays closed meanwhile: the stage already ends there, so
  // nothing below moves when the line leaves.
  const prompt = page.getByTestId('wir-checkin-own-prompt');
  await expect(prompt).toHaveText(wirCheckIn.ownPrompt);
  const badge = page.getByTestId('wir-checkin-own-badge');
  await expect(badge).toHaveAttribute('data-empty', 'true');
  await expect(badge).toHaveCSS('height', '0px');
  const stageEnd = async () => {
    const stage = await page.locator('.wir-stage').boundingBox();
    const portrait = await page
      .locator('.wir-stage .partner-avatar')
      .first()
      .boundingBox();
    expect(stage && portrait).toBeTruthy();
    if (stage && portrait)
      expect(
        stage.y + stage.height - (portrait.y + portrait.height),
      ).toBeLessThan(12);
    return stage ? stage.y + stage.height : 0;
  };
  const withPrompt = await stageEnd();
  const line = await prompt.boundingBox();
  const plus = await page.locator('.wir-stage-gesture-own').boundingBox();
  expect(line && plus).toBeTruthy();
  if (line && plus) {
    expect(line.x).toBeGreaterThanOrEqual(plus.x + plus.width);
    expect(
      Math.abs(line.y + line.height / 2 - (plus.y + plus.height / 2)),
    ).toBeLessThan(1);
  }

  // It retires into the plus (without a flight under reduced motion) and the
  // stage keeps its height.
  await expect(prompt).toHaveCount(0, { timeout: 8_000 });
  expect(await stageEnd()).toBeCloseTo(withPrompt, 0);

  // A later opening of the same day does not invite again.
  await page.reload();
  await expect(page.getByTestId('wir-checkin-own-badge')).toBeAttached();
  await page.waitForTimeout(600);
  await expect(prompt).toHaveCount(0);
});

test('the Wir opening ends on its own and returning to Wir replays no entrance', async ({
  page,
}) => {
  await installMocks(page);
  await page.route('**/api/v1/**/appearance/wir-design', (route) =>
    route.fulfill({ json: { designId: 'connected', version: 1 } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  // The opening (Enter `stage`, #2074) plays and hands over to the resting
  // state by itself on its own clock, without waiting for a later render:
  // the rings breathe (Ambient `breath` on the ring, opacity only).
  const stage = page.locator('.wir-stage');
  await expect(stage).not.toHaveAttribute('data-motion-stage', /.*/, {
    timeout: 6_000,
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .querySelector('.today-hero .partner-avatar-stack > *')
          ?.getAnimations({ subtree: true })
          .some(
            (item) =>
              (item.effect as KeyframeEffect | null)?.pseudoElement ===
              '::before',
          ),
      ),
    )
    .toBe(true);
  const ring = await page.evaluate(() => {
    const column = document.querySelector(
      '.today-hero .partner-avatar-stack > *',
    );
    const animation = column
      ?.getAnimations({ subtree: true })
      .find(
        (item) =>
          (item.effect as KeyframeEffect | null)?.pseudoElement === '::before',
      );
    const effect = animation?.effect as KeyframeEffect | undefined;
    const frames = effect
      ?.getKeyframes()
      .flatMap((frame) => Object.keys(frame));
    const timing = effect?.getComputedTiming();
    return {
      breathing: Boolean(animation),
      frames: frames ?? [],
      finite: Number.isFinite(timing?.iterations ?? Number.POSITIVE_INFINITY),
    };
  });
  expect(ring.breathing).toBe(true);
  expect(ring.finite).toBe(true);
  expect(ring.frames).toContain('opacity');
  expect(ring.frames).not.toContain('scale');

  const navigation = page.getByRole('navigation', { name: 'Hauptnavigation' });
  await navigation.getByRole('link', { name: 'Planen' }).click();
  await expect(page).toHaveURL(/\/plan/);
  // The first frame after Wir is shown again already has every entrance
  // finished; the breath continues where it paused (M4).
  const replaying = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const link = [
          ...document.querySelectorAll<HTMLAnchorElement>('nav a'),
        ].find((anchor) => anchor.textContent?.trim() === 'Wir');
        link?.click();
        requestAnimationFrame(() => {
          const panel = document.querySelector('[data-primary-tab="/today"]');
          resolve(
            (panel?.getAnimations({ subtree: true }) ?? [])
              .filter(
                (animation) =>
                  animation instanceof CSSAnimation &&
                  animation.playState === 'running' &&
                  animation.effect?.getComputedTiming().iterations === 1,
              )
              .map((animation) => (animation as CSSAnimation).animationName),
          );
        });
      }),
  );
  await expect(page).toHaveURL(/\/today$/);
  expect(replaying).toEqual([]);
});

test('Fertig without a change closes at once and flies nothing', async ({
  page,
}) => {
  await installMocks(page, { ownVibe: 'GOOD' });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await ownAvatar(page).click();
  const panel = page.getByRole('dialog', { name: wirCheckIn.panelTitle });
  await panel.getByRole('button', { name: wirCheckIn.done }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator('.wir-checkin-flight-layer')).toHaveCount(0);
});

/**
 * Partner arrival: the partner's revealed values that are new or changed since
 * this device last saw them rise out of the partner avatar together and fly
 * into the partner badge, once.
 */
const ARRIVAL_SEEN_KEY = `eimir.wir.partnerArrivalSeen:${ACCOUNT_ID}:${SPACE_ID}`;

/** Slows every animation down so the movement can be observed. */
async function slowAnimations(page: Page) {
  await page.addInitScript(() => {
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = original.apply(this, args);
      animation.playbackRate = 0.25;
      return animation;
    };
  });
}

const arrivalGhosts = (page: Page) =>
  page.locator('.wir-checkin-flight-layer .is-arrival');

for (const { width, theme } of [
  { width: 360, theme: 'light' },
  { width: 390, theme: 'dark' },
  { width: 430, theme: 'light' },
] as const) {
  test(`the partner's new day arrives once as one movement (${width} ${theme})`, async ({
    page,
  }) => {
    await slowAnimations(page);
    await installMocks(page, {
      ownVibe: 'GOOD',
      partnerVibe: 'OKAY',
      partnerEnergy: 40,
      partnerNote: fixtureCopy.wirCheckIn.partnerShortNote,
    });
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ colorScheme: theme });
    await signIn(page);

    await expect(arrivalGhosts(page)).toHaveCount(3);
    const layer = page.locator('.wir-checkin-flight-layer');
    await expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(await layer.evaluate((node) => node.matches(':popover-open'))).toBe(
      true,
    );
    const pointer = await arrivalGhosts(page)
      .first()
      .evaluate((node) => getComputedStyle(node).pointerEvents);
    expect(pointer).toBe('none');
    const badge = page.getByTestId('wir-checkin-partner-badge');
    await expect(badge.locator('[data-flight-slot="vibe"]')).toHaveAttribute(
      'data-flight-hidden',
      'true',
    );
    await saveEvidence(page, `partner-arrival-${width}-${theme}-rise`);

    // Everything landed: no flight element is left and the values are in place.
    await expect(arrivalGhosts(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('.wir-checkin-flight-layer')).toHaveCount(0);
    await expect(badge.locator('[data-vibe-icon="OKAY"]')).toBeVisible();
    await expect(badge.locator('.daily-energy-battery-icon')).toBeVisible();
    await expect(page.getByTestId('wir-checkin-note-dot')).toBeVisible();
    await expectInsideViewport(page, 'wir-checkin-partner-badge');
    await saveEvidence(page, `partner-arrival-${width}-${theme}-landed`);

    // Opening Wir again with nothing new plays nothing.
    await page.reload();
    await expect(badge.locator('[data-vibe-icon="OKAY"]')).toBeVisible();
    await expect(page.locator('.wir-checkin-flight-layer')).toHaveCount(0);
  });
}

test('only what changed since the last visit arrives again', async ({
  page,
}) => {
  await slowAnimations(page);
  await page.addInitScript(
    ([key]) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          day: '2026-11-13:Europe/Berlin',
          vibe: 'GOOD',
          energy: 40,
          note: null,
        }),
      );
    },
    [ARRIVAL_SEEN_KEY],
  );
  await installMocks(page, {
    ownVibe: 'GOOD',
    partnerVibe: 'OKAY',
    partnerEnergy: 40,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  // Only the feeling changed: one value travels, the battery stays in place.
  await expect(arrivalGhosts(page)).toHaveCount(1);
  const badge = page.getByTestId('wir-checkin-partner-badge');
  await expect(badge.locator('.daily-energy-battery-icon')).toBeVisible();
  // The old feeling waits in its place and shrinks away while the new one rises.
  await expect(badge.locator('[data-flight-farewell]')).toHaveCount(1);
  await expect(arrivalGhosts(page)).toHaveCount(0, { timeout: 15_000 });
  await expect(badge.locator('[data-flight-farewell]')).toHaveCount(0);
  await expect(badge.locator('[data-vibe-icon="OKAY"]')).toBeVisible();
});

test('a hidden partner value never arrives, reduced motion shows values at once', async ({
  page,
}) => {
  await installMocks(page, {
    visibility: 'MUTUAL_REVEAL',
    partnerVibe: 'OKAY',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await expect(page.getByTestId('wir-checkin-partner-badge')).toHaveAttribute(
    'data-state',
    'hidden',
  );
  await expect(page.locator('.wir-checkin-flight-layer')).toHaveCount(0);

  const reduced = await page.context().newPage();
  await installMocks(reduced, {
    ownVibe: 'GOOD',
    partnerVibe: 'OKAY',
    partnerEnergy: 40,
  });
  await reduced.emulateMedia({ reducedMotion: 'reduce' });
  await reduced.setViewportSize({ width: 390, height: 844 });
  await signIn(reduced);
  await expect(
    reduced
      .getByTestId('wir-checkin-partner-badge')
      .locator('[data-vibe-icon="OKAY"]'),
  ).toBeVisible();
  await expect(reduced.locator('.wir-checkin-flight-layer')).toHaveCount(0);
});

/**
 * #2072 / #2074: the important-day Moment on Wir. It plays once per local
 * day per device after the opening, then rests: no replay on a tab return or
 * a new app start the same day, and the final state at once with reduced
 * motion.
 */
function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return { year: now.getFullYear(), monthDay: `${month}-${day}` };
}

async function useConnectedDesign(page: Page) {
  await page.route('**/api/v1/**/appearance/wir-design', (route) =>
    route.fulfill({ json: { designId: 'connected', version: 1 } }),
  );
}

/** Counts the rising hearts the Moment adds to the flight layer. */
async function countRisingHearts(page: Page) {
  await page.addInitScript(() => {
    const record = window as unknown as { __risingHearts: number };
    record.__risingHearts = 0;
    new MutationObserver((mutations) => {
      for (const mutation of mutations)
        for (const node of mutation.addedNodes)
          if (
            node instanceof HTMLElement &&
            node.classList.contains('wir-important-day-heart')
          )
            record.__risingHearts += 1;
    }).observe(document, { childList: true, subtree: true });
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { __risingHearts: number }).__risingHearts,
    );
}

test('the important-day Moment plays once after the opening and rests for the day', async ({
  page,
}) => {
  const { year, monthDay } = localToday();
  await installMocks(page, {
    relationshipStartedOn: `${year - 3}-${monthDay}`,
  });
  await useConnectedDesign(page);
  const risingHearts = await countRisingHearts(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  const stage = page.locator('.wir-stage');
  await expect(stage).toHaveAttribute('data-important-day', 'final', {
    timeout: 10_000,
  });
  await expect(stage).not.toHaveAttribute('data-motion-stage', /.*/);
  expect(await risingHearts()).toBe(6);
  await expect(page.locator('.wir-bridge-occasion').first()).toHaveText(
    'Heute vor 3 Jahren',
  );
  await expect(page.locator('.wir-bridge-occasion').nth(1)).toHaveText(
    'An eurem 3. Jahrestag',
  );
  await expect(page.locator('a.wir-bridge')).toHaveAccessibleName(
    /^Heute vor 3 Jahren\./,
  );

  // A tab return shows the resting state at once and adds no hearts.
  const navigation = page.getByRole('navigation', { name: 'Hauptnavigation' });
  await navigation.getByRole('link', { name: 'Planen' }).click();
  await expect(page).toHaveURL(/\/plan/);
  await navigation.getByRole('link', { name: 'Wir' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(stage).toHaveAttribute('data-important-day', 'final');
  expect(await risingHearts()).toBe(6);

  // A new app start the same day: the final state, no Moment.
  await page.reload();
  await expect(stage).toHaveAttribute('data-important-day', 'final');
  await page.waitForTimeout(3_500);
  expect(await risingHearts()).toBe(0);
});

test('reduced motion shows the important day at once, without rising hearts', async ({
  page,
}) => {
  const { year, monthDay } = localToday();
  await installMocks(page, {
    relationshipStartedOn: '2023-08-23',
    partnerBirthday: `${year - 30}-${monthDay}`,
  });
  await useConnectedDesign(page);
  const risingHearts = await countRisingHearts(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  const stage = page.locator('.wir-stage');
  await expect(stage).toHaveAttribute('data-important-day', 'final');
  await expect(stage).toHaveAttribute('data-occasion-person', 'partner');
  await expect(page.locator('.wir-occasion-cake')).toHaveCount(1);
  await expect(page.locator('.wir-bridge-occasion').first()).toHaveText(
    'Alles Gute, Alex',
  );
  expect(await risingHearts()).toBe(0);
});

for (const { width, theme, large, reduced } of [
  { width: 360, theme: 'light', large: false, reduced: false },
  { width: 360, theme: 'dark', large: false, reduced: false },
  { width: 390, theme: 'light', large: false, reduced: false },
  { width: 390, theme: 'dark', large: false, reduced: false },
  { width: 430, theme: 'light', large: false, reduced: false },
  { width: 430, theme: 'dark', large: false, reduced: false },
  { width: 360, theme: 'light', large: true, reduced: false },
  { width: 390, theme: 'light', large: false, reduced: true },
] as const) {
  const label = `${width}-${theme}${large ? '-200-text' : ''}${reduced ? '-reduced-motion' : ''}`;
  test(`visual evidence 2074 ${label}: important day on the partner's birthday`, async ({
    page,
  }) => {
    const { year, monthDay } = localToday();
    await installMocks(page, {
      relationshipStartedOn: '2023-08-23',
      partnerBirthday: `${year - 30}-${monthDay}`,
    });
    await useConnectedDesign(page);
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({
      colorScheme: theme,
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    if (large) {
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = 'html { font-size: 200% !important; }';
          document.head.append(style);
        });
      });
    }
    await signIn(page);
    const stage = page.locator('.wir-stage');
    if (!reduced) {
      await expect(stage).toHaveAttribute('data-important-day', 'playing', {
        timeout: 10_000,
      });
      await page.waitForTimeout(450);
      await saveEvidence(page, `2074-${label}-1-moment`);
    }
    await expect(stage).toHaveAttribute('data-important-day', 'final', {
      timeout: 10_000,
    });
    await page.waitForTimeout(1_000);
    await saveEvidence(page, `2074-${label}-2-rest`);
    // The occasion copy stays inside the viewport. (At 360 px with 200 %
    // text the partner's send mark already reaches 9 px past the edge on
    // `main`, with or without an occasion; that is not this change.)
    const copy = await page.evaluate(() =>
      [...document.querySelectorAll('.wir-bridge-occasion')]
        .map((element) => element.getBoundingClientRect())
        .filter((box) => box.width > 0)
        .map((box) => ({ left: box.left, right: box.right })),
    );
    expect(copy.length).toBeGreaterThan(0);
    for (const box of copy) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
    }
  });
}

for (const { width, theme, large, reduced } of [
  { width: 360, theme: 'light', large: false, reduced: false },
  { width: 360, theme: 'dark', large: false, reduced: false },
  { width: 390, theme: 'light', large: false, reduced: false },
  { width: 390, theme: 'dark', large: false, reduced: false },
  { width: 430, theme: 'light', large: false, reduced: false },
  { width: 430, theme: 'dark', large: false, reduced: false },
  { width: 390, theme: 'light', large: true, reduced: false },
  { width: 390, theme: 'dark', large: false, reduced: true },
] as const) {
  const label = `${width}-${theme}${large ? '-200-text' : ''}${reduced ? '-reduced-motion' : ''}`;
  test(`visual evidence 2074 ${label}: the Wir opening and its rest on an ordinary day`, async ({
    page,
  }) => {
    await installMocks(page, { ownVibe: 'GOOD', partnerVibe: 'OKAY' });
    await useConnectedDesign(page);
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({
      colorScheme: theme,
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    if (large) {
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = 'html { font-size: 200% !important; }';
          document.head.append(style);
        });
      });
    }
    await signIn(page);
    const stage = page.locator('.wir-stage');
    await expect(stage).not.toHaveAttribute('data-important-day', /.*/);
    if (!reduced && (await stage.getAttribute('data-motion-stage'))) {
      await saveEvidence(page, `2074-ordinary-${label}-1-opening`);
    }
    await expect(stage).not.toHaveAttribute('data-motion-stage', /.*/, {
      timeout: 6_000,
    });
    await page.waitForTimeout(600);
    await saveEvidence(page, `2074-ordinary-${label}-2-rest`);
  });
}

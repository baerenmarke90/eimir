import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import dailyVibe from '../../src/i18n/locales/dailyVibe';
import de from '../../src/i18n/locales/de';
import onceMessages from '../../src/i18n/locales/onceMessages';
import relationshipComponents from '../../src/i18n/locales/relationshipComponents';
import wirCheckIn from '../../src/i18n/locales/wirCheckIn';
import fixtureCopy from '../fixtures/locales/de';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { renderedContrast } from '../support/renderedContrast';

/**
 * Daily check-in on the couple avatars on Wir (#1790 slice A): badges on
 * the avatars, the inline "Dein Tag" panel, per-value deletion, and the
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
  const panel = page.getByRole('region', { name: wirCheckIn.panelTitle });
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
  const panel = page.getByRole('region', { name: wirCheckIn.panelTitle });
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
  const panel = page.getByRole('region', { name: wirCheckIn.panelTitle });
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
      partnerVibe: 'SAD',
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
    for (const id of ['wir-checkin-own-badge', 'wir-checkin-partner-badge']) {
      const glyph = page.getByTestId(id).locator('.daily-vibe-icon');
      await expect(glyph).toBeVisible();
      expect((await glyph.boundingBox())?.width).toBeGreaterThanOrEqual(24);
      expect(
        (await renderedContrast(glyph, 'stroke')).ratio,
      ).toBeGreaterThanOrEqual(3);
      await expectInsideViewport(page, id);
    }
    await saveEvidence(page, `1790a-${label}-1-resting`);

    await ownAvatar(page).click();
    const panel = page.getByRole('region', { name: wirCheckIn.panelTitle });
    await expect(panel).toBeVisible();
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const hero = document.querySelector('.today-hero');
      if (hero)
        window.scrollTo(0, hero.getBoundingClientRect().top + window.scrollY);
    });
    await page.waitForTimeout(400);
    const choiceGlyphs = panel.locator('.daily-vibe-icon');
    await expect(choiceGlyphs).toHaveCount(5);
    const selectedGlyph = panel.locator('.is-selected .daily-vibe-icon');
    const selectedStroke = await selectedGlyph.evaluate(
      (icon) => getComputedStyle(icon).stroke,
    );
    await expect(selectedGlyph.locator('.accent')).not.toHaveCSS(
      'stroke',
      selectedStroke,
    );
    for (const glyph of await choiceGlyphs.all()) {
      expect((await glyph.boundingBox())?.width).toBeGreaterThanOrEqual(32);
      expect(
        (await renderedContrast(glyph, 'stroke')).ratio,
      ).toBeGreaterThanOrEqual(3);
    }
    await saveEvidence(page, `1790a-${label}-2-dein-tag`);
    await panel.getByRole('button', { name: wirCheckIn.done }).click();
    await page.evaluate(() => window.scrollTo(0, 0));

    await partnerAvatar(page).click();
    const partnerBlock = page.getByTestId('wir-checkin-partner-block');
    await expect(partnerBlock).toBeVisible();
    await page.waitForTimeout(500);
    const partnerGlyph = partnerBlock.locator('.daily-vibe-icon');
    expect((await partnerGlyph.boundingBox())?.width).toBeGreaterThanOrEqual(
      32,
    );
    expect(
      (await renderedContrast(partnerGlyph, 'stroke')).ratio,
    ).toBeGreaterThanOrEqual(3);
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

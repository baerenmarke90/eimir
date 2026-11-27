import fs from 'node:fs';
import path from 'node:path';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import de from '../../src/i18n/locales/de';
import proPaywall from '../../src/i18n/locales/proPaywall';
import serverAdmin from '../../src/i18n/locales/serverAdmin';
import AxeBuilder from '../support/axe';
import {
  installMocks,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

/*
 * ServerAdmin › Pro and eimir. gift codes (redesign part 5, #2328). The Pro
 * overview, batch and redemption routes are mocked with their generated
 * contract; append/refuse rules, rate limits, encryption and the Cloud-only
 * 404 are covered by the backend tests.
 */

const pro = serverAdmin.pro;
const areas = serverAdmin.areas;
const giftCode = proPaywall.giftCode;

/** Fills a locale template the way i18next does for these plain values. */
function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
    template,
  );
}

function months(count: number): string {
  return fill(
    count === 1
      ? serverAdmin.giftSheet.months_one
      : serverAdmin.giftSheet.months_other,
    { 'count, number': String(count) },
  );
}

function batchTitle(count: number, durationMonths: number): string {
  return fill(
    count === 1 ? pro.codes.batchTitle_one : pro.codes.batchTitle_other,
    { 'count, number': String(count), duration: months(durationMonths) },
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DAY = 86_400_000;
const GIFTED_SPACE_ID = '019b2e1a-7c3d-7f00-8a11-0123456789ab';
const CODE_GIFTED_SPACE_ID = '019b2e1a-7c3d-7f00-8a11-0123456789cd';

function overview(): Record<string, unknown> {
  return {
    accountCount: 4,
    accountsLast24h: 1,
    accountsLast30d: 9,
    accountsLast7d: 3,
    activeSessionCount: 2,
    activeSpaceCount: 2,
    applicationStatus: 'ok',
    buildRevision: 'e2e',
    databaseProvider: 'postgresql',
    databaseStatus: 'ok',
    demoMode: false,
    deployment: 'cloud',
    enabledAccountCount: 4,
    environment: 'test',
    expiringAdminGrantCount: 0,
    expiringAdminGrants: [],
    jobsFailed: 0,
    jobsPending: 0,
    jobsRunning: 0,
    lastSuccessfulJobAt: null,
    localPasswordAccountCount: 4,
    mailTransport: 'smtp',
    mediaObjectCount: 0,
    mediaStatus: 'not_probed',
    mediaStore: 'filesystem',
    mediaStoredBytes: 0,
    oidcAccountCount: 0,
    oidcConnectionCount: 0,
    oldestPendingJobAt: null,
    passkeyAccountCount: 0,
    processStartedAt: '2026-11-23T08:00:00Z',
    proAreaAvailable: true,
    publicBaseUrl: 'https://eimir.test',
    recentFailedJobs: [],
    serverAdminAllowlistCount: 1,
    serverAdminVerifiedMatchCount: 1,
    workerLastSeenAt: null,
    videoWorkerStatus: 'no_heartbeat_signal',
    emailFailuresLastHour: 0,
    pushFailuresLastHour: 0,
    backupStatus: 'ok',
    storagePressure: [],
    storagePressureCount: 0,
    supportReportsNew: 0,
    supportReportsOperatorAvailable: true,
    suspendedAccountCount: 0,
    unverifiedPrimaryEmailCount: 0,
    verifiedPrimaryEmailCount: 4,
    warningCodes: [],
    workerStatus: 'ok',
  };
}

type Code = {
  id: string;
  code: string;
  state: 'open' | 'handed_out' | 'redeemed' | 'revoked' | 'expired';
  handedOutAt: string | null;
  redeemedAt: string | null;
  redeemedSpaceId: string | null;
};

type Batch = {
  id: string;
  note: string | null;
  durationMonths: number;
  createdAt: string;
  redeemableUntil: string;
  revokedAt: string | null;
  codes: Code[];
};

function code(
  batchId: string,
  index: number,
  state: Code['state'] = 'open',
): Code {
  const at = new Date(Date.now() - 2 * DAY).toISOString();
  return {
    id: `${batchId}-code-${index}`,
    code: `EIMIR-${batchId.slice(0, 4).toUpperCase()}-${String(index).padStart(4, 'X')}`,
    state,
    handedOutAt: state === 'handed_out' || state === 'redeemed' ? at : null,
    redeemedAt: state === 'redeemed' ? at : null,
    redeemedSpaceId: state === 'redeemed' ? CODE_GIFTED_SPACE_ID : null,
  };
}

function batchView(batch: Batch, withCodes: boolean) {
  const count = (state: Code['state']) =>
    batch.codes.filter((entry) => entry.state === state).length;
  return {
    id: batch.id,
    note: batch.note,
    durationMonths: batch.durationMonths,
    createdAt: batch.createdAt,
    redeemableUntil: batch.redeemableUntil,
    revokedAt: batch.revokedAt,
    revoked: count('revoked'),
    expired: count('expired'),
    open: count('open'),
    handedOut: count('handed_out'),
    redeemed: count('redeemed'),
    total: batch.codes.length,
    ...(withCodes ? { codes: batch.codes } : {}),
  };
}

function existingBatch(): Batch {
  const id = 'b0a7c0de-0000-4000-8000-000000000001';
  return {
    id,
    note: 'Family',
    durationMonths: 12,
    createdAt: new Date(Date.now() - 10 * DAY).toISOString(),
    redeemableUntil: new Date(Date.now() + 300 * DAY).toISOString(),
    revokedAt: null,
    codes: [
      code(id, 1, 'redeemed'),
      code(id, 2, 'handed_out'),
      code(id, 3, 'open'),
    ],
  };
}

function proOverview(batches: Batch[], filled: boolean) {
  return {
    spacesTotal: filled ? 128 : 2,
    spacesPremium: filled ? 23 : 0,
    premiumByPlay: filled ? 17 : 0,
    premiumByGift: filled ? 6 : 0,
    cancellations30d: filled ? 2 : 0,
    play: filled
      ? { active: 14, paymentProblem: 1, cancelledRunning: 2, ended30d: 3 }
      : { active: 0, paymentProblem: 0, cancelledRunning: 0, ended30d: 0 },
    batches: [...batches].reverse().map((batch) => batchView(batch, false)),
    runningGifts: filled
      ? [
          {
            spaceId: CODE_GIFTED_SPACE_ID,
            origin: 'code',
            batchNote: 'Family',
            effectiveUntil: new Date(Date.now() + 200 * DAY).toISOString(),
          },
          {
            spaceId: GIFTED_SPACE_ID,
            origin: 'manual',
            batchNote: null,
            effectiveUntil: new Date(Date.now() + 20 * DAY).toISOString(),
          },
        ]
      : [],
    runningGiftsTotal: filled ? 2 : 0,
  };
}

async function installServerAdmin(
  page: Page,
  { filled = false }: { filled?: boolean } = {},
) {
  const recorded = {
    batches: filled ? [existingBatch()] : ([] as Batch[]),
    creates: [] as unknown[],
    copied: [] as string[],
  };
  // The clipboard is replaced, so the copied text is read back without a
  // permission prompt and never touches the runner's real clipboard.
  await page.exposeFunction('recordCopiedText', (text: string) => {
    recorded.copied.push(text);
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) =>
          (
            window as unknown as {
              recordCopiedText: (copied: string) => Promise<void>;
            }
          ).recordCopiedText(text),
      },
    });
  });
  await installMocks(page);
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const { pathname } = new URL(request.url());
    if (method === 'GET' && pathname === '/api/v1/auth/capabilities')
      return route.fulfill({ json: { serverAdmin: true } });
    if (method === 'GET' && pathname === '/api/v1/server-admin/overview')
      return route.fulfill({ json: overview() });
    if (method === 'GET' && pathname === '/api/v1/server-admin/pro/overview')
      return route.fulfill({ json: proOverview(recorded.batches, filled) });
    if (
      method === 'POST' &&
      pathname === '/api/v1/server-admin/pro/gift-code-batches'
    ) {
      const body = request.postDataJSON() as {
        count: number;
        durationMonths: number;
        note?: string;
      };
      recorded.creates.push(body);
      const id = `c4ea7ed0-0000-4000-8000-00000000000${recorded.batches.length + 2}`;
      const batch: Batch = {
        id,
        note: body.note ?? null,
        durationMonths: body.durationMonths,
        createdAt: new Date().toISOString(),
        redeemableUntil: new Date(Date.now() + 365 * DAY).toISOString(),
        revokedAt: null,
        codes: Array.from({ length: body.count }, (_, index) =>
          code(id, index + 1),
        ),
      };
      recorded.batches.push(batch);
      return route.fulfill({ status: 201, json: batchView(batch, true) });
    }
    const batchMatch = pathname.match(
      /^\/api\/v1\/server-admin\/pro\/gift-code-batches\/([^/]+)$/,
    );
    if (method === 'GET' && batchMatch) {
      const batch = recorded.batches.find(
        (entry) => entry.id === batchMatch[1],
      );
      return batch
        ? route.fulfill({ json: batchView(batch, true) })
        : route.fulfill({ status: 404, json: {} });
    }
    return route.fallback();
  });
  return recorded;
}

/** Opens a ServerAdmin route and signs in; the app returns to it afterwards. */
async function openSignedIn(page: Page, route: string) {
  await page.goto(route);
  await page.getByLabel(de.login.email).fill('operator@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
  await expect(
    page.getByRole('heading', { level: 1, name: serverAdmin.title }),
  ).toBeVisible();
}

function areaNavigation(page: Page) {
  // Only one of the two area navigations is visible at a time.
  return page
    .getByRole('navigation', { name: areas.aria, exact: true })
    .filter({ visible: true });
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => {
    localStorage.setItem('eimir.theme', value);
    window.dispatchEvent(new Event('storage'));
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

/** No horizontal page scrolling; the sub-page pills may scroll inside. */
async function expectReflow(page: Page) {
  const outside = await page.evaluate(() =>
    Array.from(document.querySelectorAll('body *'))
      .filter((element) => {
        const box = element.getBoundingClientRect();
        const scroller = element.parentElement?.closest('.server-admin-subnav');
        return (
          box.width > 1 &&
          (box.right > window.innerWidth + 1 || box.left < -1) &&
          getComputedStyle(element).visibility !== 'hidden' &&
          !element.closest('.sr-only, .skip-link') &&
          !(scroller && getComputedStyle(scroller).overflowX === 'auto')
        );
      })
      .map((element) => element.className),
  );
  expect(outside).toEqual([]);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectAccessible(page: Page, selector = '#server-admin-main') {
  const result = await new AxeBuilder({ page })
    .include(selector)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

async function capture(page: Page, info: TestInfo, name: string) {
  const directory = process.env.VISUAL_EVIDENCE_DIR;
  if (!directory) return;
  const output = info.outputPath(name);
  await page.screenshot({ path: output, animations: 'disabled' });
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(output, path.join(directory, name));
}

/**
 * Every rendered icon keeps an icon size: EimirIcon has no intrinsic size, and
 * an unsized one grows to fill its row until the labels next to it wrap
 * letter by letter.
 */
async function expectIconsSized(scope: Locator) {
  const widths = await scope
    .locator('.eimir-icon')
    .evaluateAll((icons) =>
      icons
        .map((icon) => icon.getBoundingClientRect().width)
        .filter((width) => width > 0),
    );
  expect(widths.length).toBeGreaterThan(0);
  expect(Math.max(...widths)).toBeLessThanOrEqual(32);
}

/** Each text keeps a readable width; single-line labels keep one line. */
async function expectReadable(
  locator: Locator,
  { minWidth, singleLine = false }: { minWidth: number; singleLine?: boolean },
) {
  const boxes = await locator.evaluateAll((elements) =>
    elements
      .map((element) => {
        const box = element.getBoundingClientRect();
        const lineHeight = Number.parseFloat(
          getComputedStyle(element).lineHeight,
        );
        return { width: box.width, height: box.height, lineHeight };
      })
      .filter((box) => box.width > 0),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(minWidth);
    if (singleLine)
      expect(box.height).toBeLessThan(
        (Number.isFinite(box.lineHeight) ? box.lineHeight : 24) * 1.5,
      );
  }
}

async function expectProAreaLegible(page: Page) {
  await expectIconsSized(page.locator('#server-admin-main'));
  await expectReadable(
    page.getByRole('heading', { level: 2, name: pro.title, exact: true }),
    { minWidth: 100 },
  );
  await expectReadable(page.locator('.server-admin-pro-figure dt'), {
    minWidth: 48,
  });
  await expectReadable(
    page
      .getByRole('button', { name: pro.codes.create, exact: true })
      .locator('.add-action-label > span'),
    { minWidth: 80, singleLine: true },
  );
  // The Pro entry's label in whichever area navigation is visible.
  await expectReadable(
    areaNavigation(page)
      .getByRole('link', { name: areas.pro, exact: true })
      .locator('span:not(.shell-nav-icon)')
      .filter({ hasText: areas.pro }),
    { minWidth: 16, singleLine: true },
  );
}

test('the operator creates gift codes, copies one and finds the batch again', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const recorded = await installServerAdmin(page);
  await openSignedIn(page, '/server-admin?section=pro');

  // Open: the Pro area is current and a fresh Cloud shows calm empty states.
  await expect(
    areaNavigation(page).getByRole('link', { name: areas.pro, exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('heading', { level: 2, name: pro.title, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(pro.play.empty)).toBeVisible();
  await expect(page.getByText(pro.codes.empty)).toBeVisible();

  // Interact: three 3-month codes with a private note.
  await expect(page.getByLabel(pro.codes.duration)).toHaveValue('3');
  await page.getByLabel(pro.codes.count).fill('3');
  await page.getByLabel(pro.codes.note).fill('Summer party');
  await page
    .getByRole('button', { name: pro.codes.create, exact: true })
    .click();

  // Save: one write, and the new batch opens in its sheet with the codes.
  await expect
    .poll(() => recorded.creates)
    .toEqual([{ count: 3, durationMonths: 3, note: 'Summer party' }]);
  const sheet = page.getByRole('dialog', {
    name: batchTitle(3, 3),
    exact: true,
  });
  await expect(sheet).toBeVisible();
  const [created] = recorded.batches;
  await expect(sheet.locator('code')).toHaveText(
    created.codes.map((entry) => entry.code),
  );
  await expectIconsSized(page.locator('#server-admin-main'));

  // Observe: copying one code confirms it in the shared snackbar.
  // Scoped to the first code row: "copy all open" also contains the word.
  await sheet
    .locator('.server-admin-pro-code')
    .first()
    .getByRole('button', { name: pro.batch.copy, exact: true })
    .click();
  await expect(page.locator('.snackbar-message')).toHaveText(pro.batch.copied);
  expect(recorded.copied).toEqual([created.codes[0].code]);

  // Return: the batch waits in the list and opens the same sheet again.
  await sheet
    .getByRole('button', { name: serverAdmin.sheet.close, exact: true })
    .click();
  await expect(sheet).toHaveCount(0);
  const row = page.getByRole('button', {
    name: new RegExp(`^${escapeRegExp(batchTitle(3, 3))}`),
  });
  await expect(row).toBeVisible();
  await row.click();
  await expect(
    page.getByRole('dialog', { name: batchTitle(3, 3), exact: true }),
  ).toBeVisible();
});

test('Pro area layout in Compact and Expanded, Light and Dark', async ({
  page,
}, info) => {
  await installServerAdmin(page, { filled: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await openSignedIn(page, '/server-admin?section=pro');
  await expect(
    page.getByRole('heading', { level: 2, name: pro.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: new RegExp(`^${escapeRegExp(batchTitle(3, 12))}`),
    }),
  ).toBeVisible();

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expectReflow(page);
    await expectProAreaLegible(page);
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await capture(page, info, `pro-compact-${width}-${theme}.png`);
      await expectAccessible(page);
    }
    await setTheme(page, 'light');
  }

  // The batch sheet with a redeemed, a handed-out and an open code.
  await page
    .getByRole('button', {
      name: new RegExp(`^${escapeRegExp(batchTitle(3, 12))}`),
    })
    .click();
  const sheet = page.getByRole('dialog', {
    name: batchTitle(3, 12),
    exact: true,
  });
  await expect(
    sheet.getByRole('button', { name: pro.batch.handedOut, exact: true }),
  ).toHaveCount(2);
  await expectIconsSized(sheet);
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await capture(page, info, `pro-batch-sheet-390-${theme}.png`);
    await expectAccessible(page, '.server-admin-sheet');
  }
  await setTheme(page, 'light');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 820 });
  await expect(page.locator('.server-admin-area-nav-side')).toBeVisible();
  await expectReflow(page);
  await expectProAreaLegible(page);
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await capture(page, info, `pro-expanded-1280-${theme}.png`);
    await expectAccessible(page);
  }
  await setTheme(page, 'light');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expectReflow(page);
  await capture(page, info, 'pro-compact-360-large-text.png');
  await expectAccessible(page);
});

type Redemption =
  | { status: 200; effectiveUntil: string; extended: boolean }
  | { status: 409; code: string };

async function installCouple(page: Page, answer: Redemption) {
  const recorded = { redeems: [] as unknown[], premium: false };
  await installMocks(page);
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const { pathname } = new URL(request.url());
    if (method === 'GET' && pathname === '/api/v1/instance/status')
      return route.fulfill({
        json: {
          maintenanceMode: false,
          registrationAvailable: true,
          registrationUnavailableReason: null,
          auth: {
            localPassword: true,
            passkey: true,
            magicLink: true,
            oidc: false,
          },
          giftCodesAvailable: true,
        },
      });
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/entitlements`
    )
      return route.fulfill({
        json: {
          spaceId: SPACE_ID,
          tier: recorded.premium ? 'PREMIUM' : 'FREE',
          status: 'ACTIVE',
          effectiveUntil:
            recorded.premium && answer.status === 200
              ? answer.effectiveUntil
              : null,
          isInGracePeriod: false,
          capabilities: ['core'],
        },
      });
    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/gift-codes/redeem`
    ) {
      recorded.redeems.push(request.postDataJSON());
      if (answer.status === 200) {
        recorded.premium = true;
        return route.fulfill({
          json: {
            effectiveUntil: answer.effectiveUntil,
            extended: answer.extended,
          },
        });
      }
      return route.fulfill({
        status: answer.status,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'https://eimir.test/problems/conflict',
          title: 'Conflict',
          status: answer.status,
          detail: 'This code was already redeemed.',
          code: answer.code,
        }),
      });
    }
    return route.fallback();
  });
  return recorded;
}

async function openProPage(page: Page) {
  await signIn(page);
  await page.goto('/more/pro');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: proPaywall.contexts.general.title,
    }),
  ).toBeVisible();
}

test('a couple redeems a gift code on the Pro page and sees Pro active', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const recorded = await installCouple(page, {
    status: 200,
    effectiveUntil: new Date(Date.now() + 90 * DAY).toISOString(),
    extended: false,
  });
  await openProPage(page);

  // Open: the quiet entry keeps an icon size and a one-line label.
  const entry = page.getByRole('button', { name: giftCode.title, exact: true });
  await expect(entry).toBeVisible();
  await expectIconsSized(entry);
  await expectReadable(entry.locator('span'), {
    minWidth: 80,
    singleLine: true,
  });
  await entry.click();
  const sheet = page.getByRole('dialog', { name: giftCode.title, exact: true });
  const field = sheet.getByLabel(giftCode.fieldLabel, { exact: true });
  await expect(field).toBeFocused();

  // Interact: the typed code is sent in capitals.
  await field.fill('eimir-abcd-efgh');
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await capture(page, info, `pro-redeem-sheet-390-${theme}.png`);
    await expectAccessible(page, '.short-task-sheet');
  }
  await setTheme(page, 'light');
  await sheet
    .getByRole('button', { name: giftCode.redeem, exact: true })
    .click();
  await expect
    .poll(() => recorded.redeems)
    .toEqual([{ code: 'EIMIR-ABCD-EFGH' }]);

  // Save: the sheet turns into the confirmation with the new end date.
  const confirmed = page.getByRole('dialog', {
    name: giftCode.success.new.title,
    exact: true,
  });
  await expect(confirmed).toBeVisible();
  const [bodyBeforeDate] = giftCode.success.new.body.split('{{date}}');
  await expect(confirmed.locator('.gift-code-redeem-result')).toContainText(
    bodyBeforeDate,
  );
  await expect(confirmed.locator('.gift-code-redeem-result')).toBeFocused();
  await capture(page, info, 'pro-redeem-success-390-light.png');
  // The audit waits for the success beat to settle before the icon is measured.
  await expectAccessible(page, '.short-task-sheet');
  await expectIconsSized(confirmed);

  // Return: closing shows the Pro page in its active state.
  await confirmed
    .getByRole('button', { name: giftCode.done, exact: true })
    .click();
  await expect(confirmed).toHaveCount(0);
  await expect(page.getByText(proPaywall.active.title)).toBeVisible();
});

test('an already redeemed code is explained next to the field and stays typed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const recorded = await installCouple(page, {
    status: 409,
    code: 'GIFT_CODE_USED',
  });
  await openProPage(page);

  await page.getByRole('button', { name: giftCode.title, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: giftCode.title, exact: true });
  const field = sheet.getByLabel(giftCode.fieldLabel, { exact: true });
  await field.fill('EIMIR-USED-CODE');
  await sheet
    .getByRole('button', { name: giftCode.redeem, exact: true })
    .click();
  await expect.poll(() => recorded.redeems).toHaveLength(1);

  // The explanation is tied to the field, takes focus and keeps the code.
  const problem = sheet.getByText(giftCode.errors.used);
  await expect(problem).toBeVisible();
  await expect(problem).toBeFocused();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription(
    new RegExp(escapeRegExp(giftCode.errors.used)),
  );
  await expect(field).toHaveValue('EIMIR-USED-CODE');
  await expect(page.getByText(proPaywall.active.title)).toHaveCount(0);
  await expectAccessible(page, '.short-task-sheet');
});

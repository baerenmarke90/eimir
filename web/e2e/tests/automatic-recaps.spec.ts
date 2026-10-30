import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import copy from '../../src/i18n/locales/recaps';
import {
  ACCOUNT_ID,
  SPACE_ID,
  captureScreenshot,
  installMocks,
  signIn,
} from '../support/storyTimelineFixture';

const BASE = `/api/v1/spaces/${SPACE_ID}/recaps`;
const PHOTO = readFileSync(
  fileURLToPath(new URL('../fixtures/recap-lake.webp', import.meta.url)),
);
const source = (id: string, title: string, kind = 'MEMORY') => ({
  key: `${kind}:${id}`,
  id,
  kind,
  occurredOn: '2026-10-17',
  version: 1,
  title,
  excerpt:
    'Wir sind einfach sitzen geblieben. Ohne Plan, ohne Eile. Genau das hat diesen Tag so schön gemacht.',
  previewAttachmentId: kind === 'MEMORY' ? 'recap-photo' : null,
  previewIsSensitive: false,
  available: true,
});
const initial = (id = 'october', year = false) => ({
  id,
  kind: year ? 'YEAR' : 'MONTH',
  year: 2026,
  month: year ? 0 : 10,
  variant: 0,
  version: 1,
  startsOn: year ? '2026-01-01' : '2026-10-01',
  throughOn: '2026-10-30',
  isPartial: true,
  status: 'READY',
  theme: 'MOMENTS',
  generatedAt: '2026-10-30T10:00:00Z',
  savedAt: null as string | null,
  locale: 'de-DE',
  headline: year
    ? 'Ein Jahr voller kleiner Anfänge.'
    : 'Einfach mal die Zeit vergessen.',
  introduction:
    'Ein Nachmittag am See und die kleinen Worte zwischendurch. Ein neuer Blick auf das, was ihr gemeinsam festgehalten habt.',
  sources: [
    source('mem-canal', 'Dieser Nachmittag am See'),
    source('heart-coffee', 'Deine Nachricht am Morgen', 'HEART_MOMENT'),
  ],
  reflections: [] as {
    id: string;
    ownerId: string;
    displayName: string;
    text: string;
    version: number;
  }[],
  ownDraft: null as { text: string; version: number } | null,
});
async function setup(
  page: Page,
  options: {
    pro?: boolean;
    fail?: boolean;
    empty?: boolean;
    pending?: boolean;
  } = {},
) {
  await page.addInitScript(
    ({ account, space }) =>
      localStorage.setItem(`eimir:product-tour:v1:${account}:${space}`, 'seen'),
    { account: ACCOUNT_ID, space: SPACE_ID },
  );
  const unexpected = await installMocks(page);
  const month = initial();
  const year = initial('year', true);
  if (options.empty) {
    month.sources = [];
    month.status = 'EMPTY';
    month.headline = '';
  }
  if (options.pending) month.status = 'PENDING';
  let fail = options.fail === true;
  let writes = 0;
  let prepares = 0;
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      method = req.method();
    if (path === BASE && method === 'GET')
      return route.fulfill({
        json: {
          canCompose: options.pro !== false,
          editions: [
            month,
            {
              ...initial('september'),
              month: 9,
              startsOn: '2026-09-01',
              throughOn: '2026-09-30',
              isPartial: false,
              headline: 'Ein Tag nur für uns.',
            },
            year,
          ],
          periods: [],
          hasMore: false,
        },
      });
    if (path === `${BASE}/prepare`) {
      prepares++;
      return route.fulfill({ status: 202, body: 'null' });
    }
    if (path.startsWith(BASE) && method === 'GET') {
      if (path.endsWith('/selection'))
        return route.fulfill({
          json: {
            items: month.sources,
            selectedKeys: month.sources.map((item) => item.key),
          },
        });
      return route.fulfill({ json: path.endsWith('/year') ? year : month });
    }
    if (path.startsWith(BASE) && ['PUT', 'POST', 'DELETE'].includes(method)) {
      writes++;
      if (fail)
        return route.fulfill({
          status: 409,
          json: { title: 'Changed', status: 409, code: 'VERSION_CONFLICT' },
        });
      if (path.endsWith('/reflection')) {
        if (method === 'DELETE') {
          month.reflections = [];
          return route.fulfill({ status: 204 });
        }
        const body = req.postDataJSON();
        if (body.shared)
          month.reflections = [
            {
              id: 'words',
              ownerId: ACCOUNT_ID,
              displayName: 'Lea',
              text: body.text,
              version: 1,
            },
          ];
        else month.ownDraft = { text: body.text, version: 1 };
      }
      if (path.endsWith('/selection')) {
        expect(req.headers()['if-match']).toBe('"1"');
        const selected = req.postDataJSON().sourceKeys;
        month.sources = month.sources.filter((item) =>
          selected.includes(item.key),
        );
        month.version++;
      }
      if (path.endsWith('/save')) {
        month.savedAt = '2026-10-30T12:00:00Z';
        month.version++;
      }
      return route.fulfill({ json: month });
    }
    if (path.endsWith('/entitlements'))
      return route.fulfill({
        json: {
          spaceId: SPACE_ID,
          tier: options.pro === false ? 'FREE' : 'PREMIUM',
          status: 'ACTIVE',
          effectiveUntil: null,
          isInGracePeriod: false,
          capabilities: options.pro === false ? [] : ['relationship.passport'],
        },
      });
    if (path.endsWith('/relationship-passport'))
      return route.fulfill({
        json: {
          partner: { id: 'partner', displayName: 'Alex' },
          relationshipDuration: null,
          memories: 2,
          heartMoments: 1,
          milestones: 0,
          completedPlans: 0,
          places: 0,
        },
      });
    if (path.includes('/attachments/') && path.endsWith('/content'))
      return route.fulfill({ contentType: 'image/webp', body: PHOTO });
    return route.fallback();
  });
  await signIn(page);
  await page
    .locator('.mobile-bottom-nav a[href="/more"], .shell-nav a[href="/more"]')
    .filter({ visible: true })
    .click();
  await page.getByRole('link', { name: /Beziehungs-Pass/ }).click();
  await expect(
    page.getByRole('heading', { name: copy.shortTitle }),
  ).toBeVisible();
  return {
    unexpected,
    allow: () => {
      fail = false;
    },
    writes: () => writes,
    prepares: () => prepares,
  };
}

for (const [width, theme] of [
  [360, 'light'],
  [390, 'light'],
  [430, 'dark'],
  [1280, 'light'],
  [1280, 'dark'],
] as const) {
  test(`library and reader at ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(
      (value) => localStorage.setItem('eimir-theme', value),
      theme,
    );
    const state = await setup(page);
    await expect
      .poll(() =>
        page
          .locator('.recap-cover-featured img')
          .evaluate(
            (img: HTMLImageElement) =>
              img.complete && img.naturalWidth === 1536,
          ),
      )
      .toBe(true);
    await captureScreenshot(
      page,
      info,
      `recaps-library-${width}-${theme}.png`,
      { fullPage: true },
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const libraryAxe = await new AxeBuilder({ page })
      .include('.recap-library')
      .analyze();
    expect(libraryAxe.violations).toEqual([]);
    await page.getByRole('tab', { name: copy.years }).click();
    await expect(
      page.getByRole('heading', { name: 'Ein Jahr voller kleiner Anfänge.' }),
    ).toBeVisible();
    await page.getByRole('tab', { name: copy.months }).click();
    await expect(
      page.getByRole('heading', { name: 'Einfach mal die Zeit vergessen.' }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: /Rückblick öffnen/ })
      .first()
      .click();
    await expect(page.locator('.recap-spread h1')).toHaveText(
      'Einfach mal die Zeit vergessen.',
    );
    await expect(page.locator('.mobile-bottom-nav')).toBeHidden();
    await page.getByRole('button', { name: copy.next, exact: true }).click();
    await expect(page.locator('.recap-spread h1')).toHaveText(
      'Dieser Nachmittag am See',
    );
    await expect
      .poll(() =>
        page
          .locator('.recap-reader-photo img')
          .evaluate(
            (img: HTMLImageElement) =>
              img.complete && img.naturalWidth === 1536,
          ),
      )
      .toBe(true);
    await page
      .locator('.recap-reader-photo img')
      .evaluate((img: HTMLImageElement) => img.decode());
    // Capture decoded media before the full-page frame; Chromium lazily paints blob images.
    await page
      .locator('.recap-reader-photo')
      .screenshot({ path: info.outputPath('decoded-photo.png') });
    await captureScreenshot(page, info, `recaps-reader-${width}-${theme}.png`, {
      fullPage: true,
    });
    expect(
      (await new AxeBuilder({ page }).include('.recap-reader').analyze())
        .violations,
    ).toEqual([]);
    await page.getByRole('link', { name: /Original öffnen/ }).click();
    await expect(page).toHaveURL(/\/story\/memories\/mem-canal/);
    await page
      .getByRole('button', { name: /Zurück/, exact: false })
      .first()
      .click();
    await expect(page).toHaveURL(/\/more\/passport\/october\?page=1/);
    await expect(page.locator('.recap-spread h1')).toHaveText(
      'Dieser Nachmittag am See',
    );
    expect(state.prepares()).toBe(1);
    expect(state.unexpected).toEqual([]);
  });
}

test('selection, private draft, explicit sharing, save and withdrawal keep confirmed state', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await setup(page, { fail: true });
  await page
    .getByRole('link', { name: /Rückblick öffnen/ })
    .first()
    .click();
  await page.getByRole('button', { name: copy.edit, exact: true }).click();
  const selection = page.getByRole('dialog');
  await selection.getByRole('checkbox').last().uncheck();
  await selection.getByRole('button', { name: copy.apply }).click();
  await expect(selection.getByRole('alert')).toContainText(
    'inzwischen verändert',
  );
  await expect(selection.getByRole('checkbox').last()).not.toBeChecked();
  state.allow();
  await selection.getByRole('button', { name: copy.reload }).click();
  await selection.getByRole('button', { name: copy.apply }).click();
  await expect(selection).toBeHidden();
  await page.getByRole('button', { name: copy.ownWords, exact: true }).click();
  const words = page.getByRole('dialog');
  await words.getByRole('textbox').fill('Das möchte ich für uns behalten.');
  await words.getByRole('button', { name: copy.draft, exact: true }).click();
  await expect(words).toBeHidden();
  await page.getByRole('button', { name: copy.ownWords, exact: true }).click();
  await expect(words.getByRole('textbox')).toHaveValue(
    'Das möchte ich für uns behalten.',
  );
  await words.getByRole('button', { name: copy.share, exact: true }).click();
  await expect(words).toBeHidden();
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await page.getByRole('button', { name: copy.next, exact: true }).click();
  await expect(page.locator('blockquote')).toContainText(
    'Das möchte ich für uns behalten.',
  );
  await page.getByRole('button', { name: copy.save, exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: copy.saveConfirm })
    .click();
  await expect(page.getByText(copy.savedHelp)).toBeVisible();
  await captureScreenshot(page, info, 'recaps-saved-reflections.png', {
    fullPage: true,
  });
  await page.getByRole('button', { name: copy.withdraw, exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: copy.withdraw, exact: true })
    .click();
  await expect(page.locator('blockquote')).toHaveCount(0);
  expect(state.writes()).toBe(6);
});

test('Free reads retained editions without preparing or exposing composition', async ({
  page,
}) => {
  const state = await setup(page, { pro: false });
  await expect(page.getByText(copy.gateBody)).toBeVisible();
  await page
    .getByRole('link', { name: /Rückblick öffnen/ })
    .first()
    .click();
  await expect(page.locator('.recap-spread h1')).toBeVisible();
  await expect(page.getByRole('button', { name: copy.edit })).toHaveCount(0);
  expect(state.prepares()).toBe(0);
});

test('empty periods do not invent shared events', async ({ page }) => {
  await setup(page, { empty: true });
  await page
    .getByRole('link', { name: /Rückblick öffnen/ })
    .first()
    .click();
  await expect(page.getByText(copy.emptyBody)).toBeVisible();
  await expect(page.locator('.recap-reader-photo')).toHaveCount(0);
  await expect(page.getByText('Seite 1 von 2')).toBeVisible();
});

test('large text and an unsaved offline draft preserve the editing task', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await captureScreenshot(page, info, 'recaps-large-text.png', {
    fullPage: true,
  });
  await page
    .getByRole('link', { name: /Rückblick öffnen/ })
    .first()
    .click();
  await page.getByRole('button', { name: copy.ownWords, exact: true }).click();
  const words = page.getByRole('dialog');
  await words.getByRole('textbox').fill('An unfinished thought.');
  await page.route('**/recaps/*/reflection', (route) =>
    route.abort('internetdisconnected'),
  );
  await words.getByRole('button', { name: copy.draft, exact: true }).click();
  await expect(words.getByRole('textbox')).toHaveValue(
    'An unfinished thought.',
  );
  await expect(words.locator('.ui-state')).toBeVisible();
  await words.getByRole('button', { name: /Schließen/ }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: copy.keep, exact: true }).click();
  await expect(words.getByRole('textbox')).toHaveValue(
    'An unfinished thought.',
  );
});

test('pending generation remains readable as a background task', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, { pending: true });
  await page.locator('.recap-cover-featured a').click();
  await expect(
    page.getByText(copy.pendingTitle, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(copy.pendingBody)).toBeVisible();
  await expect(page.locator('.recap-spread')).toHaveCount(0);
  await captureScreenshot(page, info, 'recaps-pending.png', { fullPage: true });
  await page.getByRole('button', { name: /Alle Rückblicke/ }).click();
  await expect(
    page.getByRole('heading', { name: copy.shortTitle }),
  ).toBeVisible();
});

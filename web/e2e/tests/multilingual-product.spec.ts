import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import en from '../../src/i18n/locales/en.json' with { type: 'json' };
import language from '../../src/i18n/locales/languageSettings';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import {
  ACCOUNT_ID,
  installMocks,
  PARTNER_ID,
  SPACE_ID,
} from '../support/storyTimelineFixture';

type Preference = {
  preference: string;
  effectiveLocale: string;
  version: number;
};

async function installLanguageJourney(page: Page) {
  const unexpected = await installMocks(page, { strict: true });
  const preferences = new Map<string, Preference>([
    [ACCOUNT_ID, { preference: 'auto', effectiveLocale: 'de', version: 0 }],
    [PARTNER_ID, { preference: 'de', effectiveLocale: 'de', version: 1 }],
  ]);
  const writes: { accountId: string; preference: string }[] = [];
  let accountId = ACCOUNT_ID;
  let savedMemory: Record<string, unknown> | null = null;
  const account = () => ({
    id: accountId,
    displayName: accountId === ACCOUNT_ID ? 'Lea' : 'Alex',
    languagePreference: preferences.get(accountId)?.preference,
    locale: preferences.get(accountId)?.effectiveLocale,
    languageVersion: preferences.get(accountId)?.version,
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    if (pathname === '/api/v1/account/language-preference') {
      const current = preferences.get(accountId);
      if (!current) throw new Error('Unknown language owner');
      if (method === 'PUT') {
        expect(request.headers()['if-match']).toBe(`"${current.version}"`);
        const body = request.postDataJSON() as {
          preference: string;
          deviceLanguages: string[];
        };
        expect(Object.keys(body).sort()).toEqual([
          'deviceLanguages',
          'preference',
        ]);
        current.preference = body.preference;
        current.effectiveLocale =
          body.preference === 'auto'
            ? (body.deviceLanguages
                .map((tag) => tag.split('-')[0])
                .find((tag) => ['de', 'en'].includes(tag)) ?? 'de')
            : body.preference;
        current.version++;
        writes.push({ accountId, preference: body.preference });
      } else expect(method).toBe('GET');
      return route.fulfill({
        json: current,
        headers: { ETag: `"${current.version}"` },
      });
    }
    if (pathname === '/api/v1/auth/sign-in' && method === 'POST') {
      accountId =
        request.postDataJSON().email === 'alex@example.org'
          ? PARTNER_ID
          : ACCOUNT_ID;
      return route.fulfill({
        json: {
          account: account(),
          tokens: {
            accessToken: `access-${accountId}`,
            refreshToken: `refresh-${accountId}`,
            accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
            refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          },
        },
      });
    }
    if (pathname === '/api/v1/auth/me')
      return route.fulfill({ json: account() });
    if (pathname === '/api/v1/auth/sign-out' && method === 'POST')
      return route.fulfill({ status: 204 });
    if (pathname.startsWith(`/api/v1/spaces/${SPACE_ID}/profiles/`)) {
      return route.fulfill({
        json: {
          ...account(),
          accountId,
          preferences: [],
          birthday: null,
          profileAttachmentId: null,
          version: 1,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      });
    }
    if (
      pathname === `/api/v1/spaces/${SPACE_ID}/memories` &&
      method === 'POST'
    ) {
      savedMemory = {
        ...request.postDataJSON(),
        id: 'saved-language-memory',
        spaceId: SPACE_ID,
        authorId: accountId,
        author: { accountId, displayName: 'Lea' },
        attachments: [],
        capabilities: { canEdit: true, canDelete: true, canComment: true },
        createdAt: '2026-11-01T12:00:00Z',
        updatedAt: '2026-11-01T12:00:00Z',
        version: 1,
      };
      return route.fulfill({ status: 201, json: savedMemory });
    }
    if (savedMemory && pathname.endsWith('/memories/saved-language-memory'))
      return route.fulfill({ json: savedMemory });
    if (pathname.endsWith('/memories/saved-language-memory/comments'))
      return route.fulfill({
        json: { items: [], hasMore: false, nextCursor: null },
      });
    if (pathname.endsWith('/presence') && method === 'POST')
      return route.fulfill({ json: { state: null } });
    return route.fallback();
  });
  return { preferences, writes, unexpected, savedMemory: () => savedMemory };
}

async function signIn(page: Page, email = 'lea@example.org') {
  await page.goto('/more/settings/appearance');
  await page.locator('input[type=email]').fill(email);
  await page
    .locator('input[type=password]')
    .fill('a-long-enough-test-password');
  await page
    .getByRole('button', { name: de.login.submit, exact: true })
    .click();
  await expect(
    page.getByRole('combobox', { name: language.title, exact: true }),
  ).toBeEnabled();
}

async function capture(page: Page, info: TestInfo, name: string) {
  const file = info.outputPath(name);
  await page.screenshot({ path: file, fullPage: true });
  if (process.env.VISUAL_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.VISUAL_EVIDENCE_DIR, { recursive: true });
    fs.copyFileSync(file, path.join(process.env.VISUAL_EVIDENCE_DIR, name));
  }
}

for (const [width, colorScheme] of [
  [360, 'light'],
  [390, 'dark'],
  [430, 'light'],
  [1280, 'dark'],
  [320, 'light'],
] as const) {
  test(`personal language saves, reloads and returns in place (${width} ${colorScheme})`, async ({
    page,
  }, info) => {
    const state = await installLanguageJourney(page);
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await signIn(page);
    if (width === 320)
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
    await page
      .getByRole('combobox', { name: language.title, exact: true })
      .focus();
    await page
      .getByRole('combobox', { name: language.title, exact: true })
      .selectOption('en');
    const select = page.getByRole('combobox', {
      name: en.languageSettings.title,
      exact: true,
    });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(select).toHaveValue('en');
    await expect(select).toBeFocused();
    await expect(
      page.getByText(en.languageSettings.saved, { exact: true }),
    ).toBeVisible();
    expect(state.preferences.get(PARTNER_ID)?.preference).toBe('de');
    expect(new URL(page.url()).pathname).toBe('/more/settings/appearance');
    await select.scrollIntoViewIfNeeded();
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
    await capture(page, info, `language-settings-${width}-${colorScheme}.png`);
    const accessibility = await new AxeBuilder({ page })
      .include('.settings-section')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(select).toHaveValue('en');
    await select.selectOption('auto');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(
      page.getByRole('combobox', { name: language.title, exact: true }),
    ).toHaveValue('auto');
    await page
      .getByRole('button', { name: taskBoundary.back, exact: true })
      .click();
    await expect(page).toHaveURL(/\/more\/settings$/);
    expect(state.writes.map((entry) => entry.preference)).toEqual([
      'en',
      'auto',
    ]);
    expect(state.unexpected).toEqual([]);
  });
}

test('an automatic device-language change preserves the real memory draft, focus, selection and dates', async ({
  page,
}, info) => {
  const state = await installLanguageJourney(page);
  await signIn(page);
  await page.goto('/story/memories/new');
  const body = page.getByRole('textbox', {
    name: de.memory.bodyLabel,
    exact: true,
  });
  const authored = 'Unser eigener Text remains exactly as we wrote it.';
  await body.fill(authored);
  await body.evaluate((input: HTMLTextAreaElement) => {
    input.focus();
    input.setSelectionRange(6, 18);
  });
  const before = await page.evaluate(() => ({
    path: location.pathname,
    scroll: window.scrollY,
    date: (
      document.querySelector('input[type=date]') as HTMLInputElement | null
    )?.value,
    input: document.activeElement?.id,
  }));
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: ['zz-ZZ', 'en-GB', 'de-DE'],
    });
    window.dispatchEvent(new Event('languagechange'));
  });
  const translatedBody = page.getByRole('textbox', {
    name: en.memory.bodyLabel,
    exact: true,
  });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(translatedBody).toHaveValue(authored);
  await expect(translatedBody).toBeFocused();
  expect(
    await translatedBody.evaluate((input: HTMLTextAreaElement) => [
      input.selectionStart,
      input.selectionEnd,
    ]),
  ).toEqual([6, 18]);
  expect(
    await page.evaluate(() => ({
      path: location.pathname,
      scroll: window.scrollY,
      date: (
        document.querySelector('input[type=date]') as HTMLInputElement | null
      )?.value,
      input: document.activeElement?.id,
    })),
  ).toEqual(before);
  await expect
    .poll(() => state.preferences.get(ACCOUNT_ID)?.effectiveLocale)
    .toBe('en');
  await capture(page, info, 'language-draft-390-english.png');
  await translatedBody.press('!');
  await expect(translatedBody).toHaveValue(
    `${authored.slice(0, 6)}!${authored.slice(18)}`,
  );
  expect(state.unexpected).toEqual([]);
});

test('sign-out and another partner never inherit the previous personal override', async ({
  page,
}) => {
  const state = await installLanguageJourney(page);
  await signIn(page);
  await page
    .getByRole('combobox', { name: language.title, exact: true })
    .selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/more');
  await page
    .getByRole('button', { name: en.header.logout, exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await signIn(page, 'alex@example.org');
  await expect(
    page.getByRole('combobox', { name: language.title, exact: true }),
  ).toHaveValue('de');
  expect(state.preferences.get(ACCOUNT_ID)?.preference).toBe('en');
  expect(state.preferences.get(PARTNER_ID)?.preference).toBe('de');
  expect(state.unexpected).toEqual([]);
});

test('a failed offline choice remains a deliberate retry and never replays on reconnect', async ({
  page,
  context,
}, info) => {
  const state = await installLanguageJourney(page);
  await signIn(page);
  await context.setOffline(true);
  await page
    .getByRole('combobox', { name: language.title, exact: true })
    .selectOption('en');
  await expect(page.getByRole('alert')).toContainText(language.offline);
  await capture(page, info, 'language-offline-390.png');
  await context.setOffline(false);
  await expect(page.getByRole('alert')).toContainText(language.offline);
  expect(state.writes).toEqual([]);
  await page.getByRole('button', { name: language.retry, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(state.writes).toEqual([{ accountId: ACCOUNT_ID, preference: 'en' }]);
});

for (const [languages, expected] of [
  [['en-US', 'de-CH'], 'en'],
  [['zz-ZZ', 'de-CH', 'en-GB'], 'de'],
  [['zz-ZZ', 'qaa'], 'de'],
] as const) {
  test(`signed-out detection uses the complete ordered device list (${languages.join(',')})`, async ({
    page,
  }) => {
    await installLanguageJourney(page);
    await page.addInitScript((languages) => {
      Object.defineProperty(navigator, 'languages', {
        configurable: true,
        value: languages,
      });
    }, languages);
    await page.goto('/today');
    await expect(page.locator('html')).toHaveAttribute('lang', expected);
    await expect(
      page.getByRole('button', {
        name: expected === 'en' ? en.login.submit : de.login.submit,
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((name) => /\/locales\/|\/translations\//.test(name)),
      ),
    ).toEqual([]);
  });
}

test('the cached static offline page follows the active session and falls back after sign-out', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: ['en-US'],
    });
    if (sessionStorage.getItem('offline-fixture-installed')) return;
    sessionStorage.setItem('offline-fixture-installed', '1');
    sessionStorage.setItem(
      'eimir-session-v1',
      JSON.stringify({
        account: { id: 'own', languagePreference: 'de' },
        tokens: { refreshToken: 'fixture', refreshExpiresAt: '2099-01-01' },
      }),
    );
  });
  await page.goto('/offline.html');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.evaluate(() => {
    sessionStorage.setItem(
      'eimir-session-v1',
      JSON.stringify({
        account: { id: 'previous', languagePreference: 'de' },
        tokens: { refreshToken: 'expired', refreshExpiresAt: '2000-01-01' },
      }),
    );
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.evaluate(() => sessionStorage.removeItem('eimir-session-v1'));
  // The first-paint script must not see any stale preference once signed out.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', { name: en.offlinePage.title }),
  ).toBeVisible();
});

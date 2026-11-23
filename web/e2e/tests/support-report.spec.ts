import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import supportReport from '../../src/i18n/locales/supportReport';
import taskSheets from '../../src/i18n/locales/taskSheets';
import AxeBuilder from '../support/axe';
import { fulfillDefaultProductContext } from '../support/productContext';
import {
  ACCOUNT_ID,
  installMocks,
  SPACE_ID,
} from '../support/storyTimelineFixture';

/*
 * Support reports (#2189): a person reports a problem from the error state or
 * sends feedback from More, and later reads the operator's one-way reply as a
 * notification. The API is mocked with its live contract; the server behavior
 * is covered by the backend tests.
 */

const copy = supportReport;
const REPORT_ID = '44444444-4444-4444-8444-444444444444';
const NOTIFICATION_ID = '55555555-5555-4555-8555-555555555555';
const REQUEST_ID = 'e2e-notifications-1';
const FAILURE_REFERENCE =
  'GET:/api/v1/spaces/{id}/notifications:500:E2E_UNAVAILABLE:web';
const REPLY_TEXT = '<b>hi</b> Thanks, we fixed it.';
const DRAFT_KEY = `eimir.supportReportDraft.v1.${ACCOUNT_ID}`;

interface Flags {
  /** `/instance/status.supportReportsAvailable`. */
  available: boolean;
  /** The notification list answers 500 while true. */
  notificationsFail: boolean;
  /** Whether the list carries the operator's reply. */
  withReply: boolean;
}

interface Recorded {
  posts: Array<{ body: Record<string, unknown>; authorization?: string }>;
  replyReads: number;
  statusReads: number;
}

type SupportBody = {
  clientRequestId: string;
  kind: string;
  note?: string;
  failure?: { reference: string; requestId?: string };
  client: Record<string, unknown>;
};

/**
 * The one mocked API the journeys share. Support-report endpoints and the
 * notification list are stateful; everything else comes from the common
 * fixtures. Unlisted reads answer an empty object, as in neighbouring journeys.
 */
async function install(page: Page, initial: Partial<Flags> = {}) {
  const flags: Flags = {
    available: true,
    notificationsFail: false,
    withReply: false,
    ...initial,
  };
  const recorded: Recorded = { posts: [], replyReads: 0, statusReads: 0 };
  await page.addInitScript(
    ({ accountId, spaceId }) => {
      localStorage.setItem(
        `eimir:product-tour:v1:${accountId}:${spaceId}`,
        'seen',
      );
    },
    { accountId: ACCOUNT_ID, spaceId: SPACE_ID },
  );
  await installMocks(page);
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultProductContext(route)) return;
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;

    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      recorded.statusReads += 1;
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
          supportReportsAvailable: flags.available,
        },
      });
    }
    if (pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`)
      return route.fulfill({ json: { unreadCount: flags.withReply ? 1 : 0 } });
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications`
    ) {
      if (flags.notificationsFail)
        return route.fulfill({
          status: 500,
          headers: { 'x-request-id': REQUEST_ID },
          json: {
            type: 'internal_error',
            title: 'Unavailable',
            status: 500,
            code: 'E2E_UNAVAILABLE',
          },
        });
      return route.fulfill({
        json: {
          items: flags.withReply
            ? [
                {
                  id: NOTIFICATION_ID,
                  sourceEventId: REPORT_ID,
                  kind: 'SUPPORT_REPLY',
                  actorId: null,
                  targetId: REPORT_ID,
                  targetType: 'SUPPORT_REPORT',
                  target: null,
                  createdAt: '2026-11-23T09:30:00Z',
                  readAt: null,
                },
              ]
            : [],
          nextCursor: null,
        },
      });
    }
    if (method === 'POST' && pathname === '/api/v1/support-reports') {
      recorded.posts.push({
        body: request.postDataJSON() as Record<string, unknown>,
        authorization: request.headers().authorization,
      });
      return route.fulfill({
        status: 201,
        json: {
          id: REPORT_ID,
          state: 'NEW',
          createdAt: '2026-11-23T09:00:00Z',
        },
      });
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/support-reports/${REPORT_ID}/reply`
    ) {
      recorded.replyReads += 1;
      return route.fulfill({
        json: {
          text: REPLY_TEXT,
          reportedAt: '2026-11-20T12:00:00Z',
          repliedAt: '2026-11-23T09:30:00Z',
        },
      });
    }
    return route.fallback();
  });
  return { flags, recorded };
}

/** Opens a route and signs in; the app returns to it after the sign-in. */
async function openSignedIn(page: Page, route: string) {
  await page.goto(route);
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

/** The form fields the sheet exposes; scoped to the open dialog. */
function sheetOf(page: Page) {
  const dialog = page.getByRole('dialog');
  return {
    dialog,
    send: dialog.getByRole('button', { name: copy.send, exact: true }),
    done: dialog.getByRole('button', {
      name: copy.success.done,
      exact: true,
    }),
    handle: dialog.getByRole('button', {
      name: taskSheets.close,
      exact: true,
    }),
    problemNote: dialog.getByLabel(copy.noteLabel.PROBLEM, { exact: true }),
    feedbackNote: dialog.getByLabel(copy.noteLabel.FEEDBACK, { exact: true }),
    problemKind: dialog.getByRole('radio', { name: copy.kinds.PROBLEM }),
    feedbackKind: dialog.getByRole('radio', { name: copy.kinds.FEEDBACK }),
  };
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => {
    localStorage.setItem('eimir.theme', value);
    // ThemeControl responds to storage through its existing theme event.
    window.dispatchEvent(new Event('storage'));
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** The sheet is the only open dialog; axe audits it after motion settles. */
async function expectAccessibleSheet(page: Page) {
  const result = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

/** Names the files so they sort by state; copies them when evidence is wanted. */
async function capture(page: Page, info: TestInfo, name: string) {
  const directory = process.env.VISUAL_EVIDENCE_DIR;
  if (!directory) return;
  const output = info.outputPath(name);
  await page.screenshot({ path: output, animations: 'disabled' });
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(output, path.join(directory, name));
}

/** The same state in Light and Dark; the page ends in Light. */
async function captureThemes(
  page: Page,
  info: TestInfo,
  name: string,
  options: { axe?: boolean } = {},
) {
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await capture(page, info, `${name}-${theme}.png`);
    if (options.axe) await expectAccessibleSheet(page);
  }
  await setTheme(page, 'light');
}

/**
 * Where the choice and the note field sit inside the open sheet, measured from
 * its top edge. A message must not push them down. (The Compact sheet grows
 * from the bottom, so its top edge itself rises with any taller content.)
 */
async function formPositions(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    const sheetTop = dialog?.getBoundingClientRect().top ?? NaN;
    const offset = (selector: string) =>
      (dialog?.querySelector(selector)?.getBoundingClientRect().top ?? NaN) -
      sheetTop;
    return {
      kinds: offset('.support-report-kinds'),
      note: offset('.support-report-note'),
    };
  });
}

function assertAllowedPayload(body: Record<string, unknown>) {
  const keys = (value: unknown) => Object.keys(value as object).sort();
  const allowed = [
    'client',
    'clientRequestId',
    'failure',
    'kind',
    'note',
  ].filter((key) => key in body);
  expect(keys(body)).toEqual(allowed);
  expect(keys(body.client)).toEqual(
    [
      'appVersion',
      'build',
      'engine',
      'locale',
      'localTime',
      'online',
      'os',
      'platform',
      'theme',
      'timeZone',
    ].sort(),
  );
  if (body.failure)
    expect(
      keys(body.failure).every((key) =>
        ['reference', 'requestId'].includes(key),
      ),
    ).toBe(true);
  const serialized = JSON.stringify(body);
  // No URL, query, token or id of the person's account or space leaves the app.
  expect(serialized).not.toMatch(
    /https?:|\?|Bearer|access-token|refresh-token/i,
  );
  expect(serialized).not.toContain(ACCOUNT_ID);
  expect(serialized).not.toContain(SPACE_ID);
}

test('report_a_problem_from_error_state_and_receive_reply', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { flags, recorded } = await install(page, { notificationsFail: true });
  await openSignedIn(page, '/more/notifications');

  // Open: the notification list failed and says so with the quiet action.
  const problem = page.getByText(de.states.server.title, { exact: true });
  await expect(problem).toBeVisible();
  const report = page.getByRole('button', { name: copy.action, exact: true });
  await expect(report).toBeVisible();

  // Interact: the sheet lists what is sent, including the failure shown here.
  await report.click();
  const sheet = sheetOf(page);
  await expect(sheet.dialog).toBeVisible();
  await expect(
    sheet.dialog.getByRole('heading', { name: copy.title.PROBLEM }),
  ).toBeVisible();
  await expect(sheet.problemKind).toBeChecked();
  // The failure line: its label, then the raw reference exactly as sent.
  const failureLine = sheet.dialog.locator('.support-report-failure');
  await expect(failureLine.locator('.support-report-failure-label')).toHaveText(
    copy.items.failureLabel,
  );
  await expect(failureLine.locator('.support-report-failure-token')).toHaveText(
    FAILURE_REFERENCE,
  );
  // The sheet shows no Close icon; the labeled handle remains the close target.
  await expect(sheet.handle).toBeVisible();
  await expect(
    sheet.dialog.locator('.short-task-sheet-close-icon'),
  ).toHaveCount(0);
  // A problem needs no text, and nothing was sent yet.
  await expect(sheet.send).toBeEnabled();
  expect(recorded.posts).toHaveLength(0);
  await sheet.problemNote.fill('The list does not load.');
  await sheet.send.click();

  // Complete: exactly the allowed fields went out, once, with the failure.
  await expect(
    sheet.dialog.getByRole('heading', { name: copy.success.title }),
  ).toBeVisible();
  await expect(sheet.dialog.getByText(copy.success.body)).toBeVisible();
  await expect(sheet.done).toBeFocused();
  expect(recorded.posts).toHaveLength(1);
  const sent = recorded.posts[0]?.body as SupportBody;
  assertAllowedPayload(sent as unknown as Record<string, unknown>);
  expect(sent.kind).toBe('PROBLEM');
  expect(sent.note).toBe('The list does not load.');
  expect(sent.failure).toEqual({
    reference: FAILURE_REFERENCE,
    requestId: REQUEST_ID,
  });
  expect(sent.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(sent.client.platform).toBe('web');
  expect(recorded.posts[0]?.authorization).toMatch(/^Bearer /);

  // Return: Done closes the sheet and the originating screen is still there,
  // and a received report leaves no draft behind.
  await sheet.done.click();
  await expect(sheet.dialog).toBeHidden();
  await expect(problem).toBeVisible();
  await expect(page).toHaveURL(/\/more\/notifications$/);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY),
  ).toBeNull();

  // Later: the operator's reply arrives as a notification, as plain text.
  flags.notificationsFail = false;
  flags.withReply = true;
  await page
    .getByRole('button', { name: de.common.retry, exact: true })
    .click();
  const notice = page.locator('.support-reply');
  await expect(page.getByText(copy.reply.title, { exact: true })).toBeVisible();
  const contextPrefix = copy.reply.contextDated.replace('{{date}}', '');
  await expect(notice.locator('.support-reply-context')).toHaveText(
    new RegExp(`^${contextPrefix}\\d{1,2}\\. Nov`),
  );
  // The literal characters show; nothing was parsed as markup.
  await expect(notice.locator('.support-reply-text')).toHaveText(REPLY_TEXT);
  await expect(page.getByText('<b>hi</b>', { exact: false })).toBeVisible();
  await expect(page.locator('.m4-notification-copy b')).toHaveCount(0);
  await expect(notice.locator('a')).toHaveCount(0);
  expect(recorded.replyReads).toBe(1);
  expect(recorded.posts).toHaveLength(1);
});

test('feedback_from_more_requires_text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { flags, recorded } = await install(page, { available: false });
  await openSignedIn(page, '/more');

  // The row exists only while the instance accepts reports.
  const row = page.getByRole('button', {
    name: copy.entry.title,
    exact: true,
  });
  await expect(page.locator('.more-page')).toBeVisible();
  await expect(row).toHaveCount(0);
  expect(recorded.statusReads).toBeGreaterThan(0);
  flags.available = true;
  await page.reload();
  await expect(row).toBeVisible();

  // Feedback is preselected, needs text and attaches no failure.
  await row.click();
  const sheet = sheetOf(page);
  await expect(sheet.dialog).toBeVisible();
  await expect(
    sheet.dialog.getByRole('heading', { name: copy.title.FEEDBACK }),
  ).toBeVisible();
  await expect(sheet.feedbackKind).toBeChecked();
  await expect(sheet.send).toBeDisabled();
  await expect(sheet.dialog.locator('.support-report-failure')).toHaveCount(0);
  await expect(sheet.dialog.getByText(copy.feedbackNoCode)).toBeVisible();
  await expect(sheet.dialog.getByText(copy.noteRequired)).toBeVisible();
  await expectAccessibleSheet(page);
  await setTheme(page, 'dark');
  await expectAccessibleSheet(page);
  await setTheme(page, 'light');
  // Whitespace is not text.
  await sheet.feedbackNote.fill('   ');
  await expect(sheet.send).toBeDisabled();
  await sheet.feedbackNote.fill('I would like a weekly plan.');
  await expect(sheet.send).toBeEnabled();
  await expect(sheet.dialog.getByText(copy.noteRequired)).toHaveCount(0);

  // Offline: the note is kept and the sheet says so; nothing is sent.
  await page.context().setOffline(true);
  await expect(sheet.dialog.getByText(copy.offline.title)).toBeVisible();
  const later = sheet.dialog.getByRole('button', {
    name: copy.sendLater,
    exact: true,
  });
  await later.click();
  await expect(
    sheet.dialog.getByRole('button', { name: copy.sendNow, exact: true }),
  ).toBeVisible();
  await expect(sheet.dialog.getByText(copy.offline.body)).toBeVisible();
  await expect(sheet.feedbackNote).toHaveValue('I would like a weekly plan.');
  expect(recorded.posts).toHaveLength(0);
  const draft = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null'),
    DRAFT_KEY,
  );
  expect(draft).toMatchObject({
    kind: 'FEEDBACK',
    note: 'I would like a weekly plan.',
  });

  // The note survives closing and reopening the sheet.
  await page.keyboard.press('Escape');
  await expect(sheet.dialog).toBeHidden();
  await row.click();
  await expect(sheet.feedbackNote).toHaveValue('I would like a weekly plan.');

  // Back online: the one queued report is delivered once, without a failure.
  await page.context().setOffline(false);
  await expect(
    sheet.dialog.getByRole('heading', { name: copy.success.title }),
  ).toBeVisible();
  expect(recorded.posts).toHaveLength(1);
  const sent = recorded.posts[0]?.body as SupportBody;
  assertAllowedPayload(sent as unknown as Record<string, unknown>);
  expect(sent.kind).toBe('FEEDBACK');
  expect(sent.note).toBe('I would like a weekly plan.');
  expect(sent).not.toHaveProperty('failure');
  expect(sent.client.online).toBe(true);
  await sheet.done.click();
  await expect(sheet.dialog).toBeHidden();
  await expect(row).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY),
  ).toBeNull();
  expect(recorded.posts).toHaveLength(1);
});

test('sheet_survives_problem_state_replacement', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { flags, recorded } = await install(page, { notificationsFail: true });
  await openSignedIn(page, '/more/notifications');
  const problem = page.getByText(de.states.server.title, { exact: true });
  await expect(problem).toBeVisible();
  await page.getByRole('button', { name: copy.action, exact: true }).click();
  const sheet = sheetOf(page);
  await expect(sheet.dialog).toBeVisible();
  await sheet.problemNote.fill('Mid-sentence');

  // A reconnect refetches the failed list while the person is typing; the
  // list recovers and its content replaces the error state behind the sheet.
  flags.notificationsFail = false;
  await page.context().setOffline(true);
  await page.context().setOffline(false);
  await expect(problem).toBeHidden();
  await expect(
    page.getByRole('button', { name: copy.action, exact: true }),
  ).toHaveCount(0);

  // The sheet is still open with the note and the failure it was opened with.
  await expect(sheet.dialog).toBeVisible();
  await expect(sheet.problemNote).toHaveValue('Mid-sentence');
  await expect(
    sheet.dialog.locator('.support-report-failure-token'),
  ).toHaveText(FAILURE_REFERENCE);
  await sheet.problemNote.press('End');
  await sheet.problemNote.pressSequentially(', and more.');
  await expect(sheet.problemNote).toHaveValue('Mid-sentence, and more.');
  expect(recorded.posts).toHaveLength(0);

  // Closing keeps the draft for the next report, as before.
  await page.keyboard.press('Escape');
  await expect(sheet.dialog).toBeHidden();
  const draft = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null'),
    DRAFT_KEY,
  );
  expect(draft).toMatchObject({
    kind: 'PROBLEM',
    note: 'Mid-sentence, and more.',
  });
});

test.describe('states at 2x', () => {
  // Crisp captures: small glyphs and borders are unreadable at 1x.
  test.use({ deviceScaleFactor: 2 });

  test('support report states reflow in Compact and Expanded, Light, Dark and reduced motion', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { flags } = await install(page, { notificationsFail: true });
    await openSignedIn(page, '/more/notifications');
    const report = page.getByRole('button', { name: copy.action, exact: true });
    await expect(report).toBeVisible();
    // The report action is the quiet tertiary one: smaller than the retry.
    const fontSize = (name: string) =>
      page
        .getByRole('button', { name, exact: true })
        .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(await fontSize(copy.action)).toBeLessThan(
      await fontSize(de.common.retry),
    );
    await captureThemes(page, info, '01-error-state-390');

    // The problem sheet with its failure line, at every Compact width.
    await report.click();
    const sheet = sheetOf(page);
    await expect(sheet.dialog).toBeVisible();
    await expect(sheet.dialog.locator('.support-report-failure')).toBeVisible();
    // No native resize grip on the note field.
    await expect(sheet.problemNote).toHaveCSS('resize', 'none');
    await captureThemes(page, info, '03-problem-sheet-390', {
      axe: true,
    });
    for (const width of [360, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expectNoHorizontalOverflow(page);
      await expect(sheet.send).toBeInViewport();
      await capture(page, info, `03-problem-sheet-${width}-light.png`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await capture(page, info, '03-problem-sheet-390-light-reduced-motion.png');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(sheet.dialog).toBeVisible();
    await expect(
      sheet.dialog.locator('.short-task-sheet-close-icon'),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await capture(page, info, '03-problem-sheet-1280-light.png');
    await page.setViewportSize({ width: 390, height: 844 });

    // The success state, then the reply on the originating screen.
    await sheet.problemNote.fill('The list does not load.');
    await sheet.send.click();
    await expect(sheet.done).toBeVisible();
    // One centered column: check above the title, title above the body.
    await expect(
      sheet.dialog.getByRole('heading', { name: copy.success.title }),
    ).toHaveCSS('text-align', 'center');
    const successOrder = await sheet.dialog.evaluate((dialog) => {
      const top = (selector: string) =>
        dialog.querySelector(selector)?.getBoundingClientRect().top ?? NaN;
      return [
        top('.support-report-success-mark'),
        top('.short-task-sheet-title'),
        top('.support-report-success-body'),
      ];
    });
    expect(successOrder).toEqual([...successOrder].sort((a, b) => a - b));
    await captureThemes(page, info, '06-success-390', { axe: true });
    await sheet.done.click();
    await expect(sheet.dialog).toBeHidden();
    flags.notificationsFail = false;
    flags.withReply = true;
    // A fresh visit reads the list and the unread count together.
    await page.goto('/more/notifications');
    await expect(page.locator('.support-reply-text')).toHaveText(REPLY_TEXT);
    // The reply is the content; its timestamp is smaller and set apart.
    const replyStyle = await page
      .locator('.support-reply')
      .evaluate((reply) => {
        const time = reply.nextElementSibling as HTMLElement;
        const text = reply.querySelector('.support-reply-text') as HTMLElement;
        return {
          text: parseFloat(getComputedStyle(text).fontSize),
          time: parseFloat(getComputedStyle(time).fontSize),
          gap:
            time.getBoundingClientRect().top -
            text.getBoundingClientRect().bottom,
        };
      });
    expect(replyStyle.time).toBeLessThan(replyStyle.text);
    expect(replyStyle.gap).toBeGreaterThanOrEqual(8);
    await expectNoHorizontalOverflow(page);
    await captureThemes(page, info, '07-reply-notification-390');
    for (const width of [360, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 390, height: 844 });

    // More, the feedback sheet and the queued state.
    await page.goto('/more');
    const row = page.getByRole('button', {
      name: copy.entry.title,
      exact: true,
    });
    await expect(row).toBeVisible();
    await row.evaluate((element) =>
      element.scrollIntoView({ block: 'center' }),
    );
    await captureThemes(page, info, '02-more-row-390');
    await row.click();
    await expect(sheet.send).toBeDisabled();
    await captureThemes(page, info, '04-feedback-sheet-empty-390');
    await sheet.feedbackNote.fill('I would like a weekly plan.');
    await captureThemes(page, info, '05-feedback-filled-390');
    const idle = await formPositions(page);
    await page.context().setOffline(true);
    await sheet.dialog.getByRole('button', { name: copy.sendLater }).click();
    await expect(sheet.dialog.getByText(copy.offline.body)).toBeVisible();
    // The message appears below the note: the choice and the field stay put.
    // Within a pixel: the sheet's top edge lands on sub-pixel positions.
    const queued = await formPositions(page);
    expect(Math.abs(queued.kinds - idle.kinds)).toBeLessThanOrEqual(1);
    expect(Math.abs(queued.note - idle.note)).toBeLessThanOrEqual(1);
    await captureThemes(page, info, '05-queued-offline-390');
    await page.context().setOffline(false);
  });
});

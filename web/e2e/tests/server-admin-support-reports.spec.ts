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
import serverAdmin from '../../src/i18n/locales/serverAdmin';
import AxeBuilder from '../support/axe';
import { installMocks } from '../support/storyTimelineFixture';

const reports = serverAdmin.reports;

/*
 * The operator's support reports section in the ServerAdmin area (#2189).
 * The admin plugin's routes are mocked with their live contract; the server
 * behaviour (recent authentication, one reply, tracker calls) is covered by
 * the plugin's backend tests. Every write first answers that the recent
 * authentication is stale, so the step-up retry is part of the journey.
 */

const PROBLEM_ID = '66666666-6666-4666-8666-666666666666';
const FEEDBACK_ID = '77777777-7777-4777-8777-777777777777';
const REPORTER_ID = '88888888-8888-4888-8888-888888888888';
const NOTE = 'Since the update our memories no longer load.';
const FEEDBACK_NOTE = 'A weekly plan for both of us would be nice.';
const REPLY = 'Thanks for the report, we found the cause.';
const TICKET_BODY = 'Timeline request fails with 500 after 1.4.0.';
const TICKET_URL = 'https://github.com/example/eimir-support/issues/42';
const TEST_PASSWORD = 'operator-step-up-test-password';

type State = 'NEW' | 'IN_PROGRESS' | 'CLOSED';

interface Ticket {
  state: 'PENDING' | 'CREATED';
  tracker: string;
  number: number | null;
  url: string | null;
  createdAt: string;
}

interface Report {
  id: string;
  kind: 'PROBLEM' | 'FEEDBACK';
  state: State;
  createdAt: string;
  archivedAt: string | null;
  note: string | null;
  failureReference: string | null;
  requestId: string | null;
  reply: { text: string; repliedAt: string } | null;
  ticket: Ticket | null;
}

interface Recorded {
  /** Every write, in order, with its body; stale ones included. */
  writes: Array<{ method: string; path: string; body: unknown }>;
  stepUps: number;
}

function problemDetail(status: number, code: string, title: string) {
  return {
    type: `https://eimir.app/problems/${code.toLowerCase()}`,
    title,
    status,
    detail: title,
    code,
  };
}

function overview() {
  return {
    accountCount: 4,
    accountsLast24h: 0,
    accountsLast30d: 1,
    accountsLast7d: 0,
    activeSessionCount: 2,
    activeSpaceCount: 2,
    applicationStatus: 'ok',
    buildRevision: 'e2e',
    databaseProvider: 'postgresql',
    databaseStatus: 'ok',
    demoMode: false,
    deployment: 'self_hosted',
    enabledAccountCount: 4,
    environment: 'test',
    jobsFailed: 0,
    jobsPending: 0,
    jobsRunning: 0,
    lastSuccessfulJobAt: null,
    localPasswordAccountCount: 4,
    mailTransport: 'smtp',
    mediaObjectCount: 0,
    mediaStatus: 'ok',
    mediaStore: 'filesystem',
    mediaStoredBytes: 0,
    oidcAccountCount: 0,
    oidcConnectionCount: 0,
    oldestPendingJobAt: null,
    passkeyAccountCount: 0,
    processStartedAt: '2026-11-23T08:00:00Z',
    publicBaseUrl: 'https://eimir.test',
    recentFailedJobs: [],
    serverAdminAllowlistCount: 1,
    serverAdminVerifiedMatchCount: 1,
    supportReportsNew: 1,
    supportReportsOperatorAvailable: true,
    suspendedAccountCount: 0,
    unverifiedPrimaryEmailCount: 0,
    verifiedPrimaryEmailCount: 4,
    warningCodes: [],
    workerStatus: 'ok',
  };
}

function initialReports(): Report[] {
  return [
    {
      id: PROBLEM_ID,
      kind: 'PROBLEM',
      state: 'NEW',
      createdAt: '2026-11-24T08:15:00Z',
      archivedAt: null,
      note: NOTE,
      failureReference:
        'GET:/api/v1/spaces/{id}/story:500:STORY_UNAVAILABLE:web',
      requestId: 'req-e2e-1',
      reply: null,
      ticket: null,
    },
    {
      id: FEEDBACK_ID,
      kind: 'FEEDBACK',
      state: 'IN_PROGRESS',
      createdAt: '2026-11-22T19:40:00Z',
      archivedAt: null,
      note: FEEDBACK_NOTE,
      failureReference: null,
      requestId: null,
      reply: null,
      // The tracker call never answered: older than five minutes, uncertain.
      ticket: {
        state: 'PENDING',
        tracker: 'github',
        number: null,
        url: null,
        createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      },
    },
  ];
}

function listItem(report: Report) {
  return {
    id: report.id,
    kind: report.kind,
    state: report.state,
    createdAt: report.createdAt,
    archivedAt: report.archivedAt,
    appVersion: '1.4.0',
    build: '412',
    failureReference: report.failureReference,
    hasReply: report.reply !== null,
    ticket: report.ticket,
  };
}

function detail(report: Report) {
  return {
    ...listItem(report),
    accountId: REPORTER_ID,
    client: {
      appVersion: '1.4.0',
      build: '412',
      engine: 'Blink',
      localTime: '2026-11-24T09:15:00+01:00',
      locale: 'de-DE',
      online: true,
      os: 'Android 16',
      platform: 'web',
      theme: 'light',
      timeZone: 'Europe/Berlin',
    },
    note: report.note,
    requestId: report.requestId,
    reply: report.reply,
    ticketAvailable: true,
  };
}

/**
 * The ServerAdmin account, the overview with the operator flag and the eight
 * plugin routes. `recentAuthentication` starts stale: the first write answers
 * RECENT_AUTHENTICATION_REQUIRED until the step-up succeeded.
 */
async function install(page: Page, options: { fresh?: boolean } = {}) {
  const data = initialReports();
  const recorded: Recorded = { writes: [], stepUps: 0 };
  let recent = options.fresh === true;
  await installMocks(page);
  // Registered after the shared fixture, so these answer first.
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (method === 'GET' && pathname === '/api/v1/auth/capabilities')
      return route.fulfill({ json: { serverAdmin: true } });
    if (method === 'GET' && pathname === '/api/v1/server-admin/overview')
      return route.fulfill({
        json: {
          ...overview(),
          supportReportsNew: data.filter(
            (report) => report.state === 'NEW' && !report.archivedAt,
          ).length,
        },
      });
    if (
      method === 'GET' &&
      pathname === '/api/v1/auth/recent-authentication/server-admin'
    )
      return route.fulfill({
        json: {
          expiresInSeconds: 300,
          localPassword: true,
          oidcConnections: [],
          passkey: false,
        },
      });
    if (
      method === 'POST' &&
      pathname === '/api/v1/auth/recent-authentication/server-admin/password'
    ) {
      recorded.stepUps += 1;
      recent = true;
      return route.fulfill({
        json: {
          achievedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          method: 'password',
          purpose: 'server-admin',
        },
      });
    }

    const prefix = '/api/v1/server-admin/support-reports';
    if (!pathname.startsWith(prefix)) return route.fallback();
    if (method === 'GET' && pathname === prefix) {
      const state = url.searchParams.get('state');
      const archived = url.searchParams.get('archived') === 'true';
      const items = data
        .filter((report) => (report.archivedAt !== null) === archived)
        .filter((report) => !state || report.state === state)
        .map(listItem);
      return route.fulfill({
        json: {
          items,
          hasMore: false,
          nextCursor: null,
          newCount: data.filter(
            (report) => report.state === 'NEW' && !report.archivedAt,
          ).length,
        },
      });
    }
    const [, id, action] =
      /^\/api\/v1\/server-admin\/support-reports\/([^/]+)(?:\/(\w+))?$/.exec(
        pathname,
      ) ?? [];
    const report = data.find((candidate) => candidate.id === id);
    if (!report)
      return route.fulfill({
        status: 404,
        json: problemDetail(404, 'SUPPORT_REPORT_NOT_FOUND', 'Not found'),
      });
    if (method === 'GET' && !action)
      return route.fulfill({ json: detail(report) });

    // Writes: reads need ServerAdmin only, writes a recent authentication.
    const body = request.postData() ? request.postDataJSON() : null;
    recorded.writes.push({ method, path: pathname, body });
    if (!recent)
      return route.fulfill({
        status: 403,
        json: problemDetail(
          403,
          'RECENT_AUTHENTICATION_REQUIRED',
          'Recent authentication required',
        ),
      });
    if (method === 'PUT' && action === 'state') {
      report.state = (body as { state: State }).state;
      return route.fulfill({ json: detail(report) });
    }
    if (method === 'PUT' && action === 'archive') {
      report.archivedAt = (body as { archived: boolean }).archived
        ? new Date().toISOString()
        : null;
      return route.fulfill({ json: detail(report) });
    }
    if (method === 'DELETE' && !action) {
      data.splice(data.indexOf(report), 1);
      return route.fulfill({ status: 204, body: '' });
    }
    if (method === 'POST' && action === 'reply') {
      if (report.reply)
        return route.fulfill({
          status: 409,
          json: problemDetail(409, 'SUPPORT_REPORT_ALREADY_REPLIED', 'Replied'),
        });
      report.reply = {
        text: (body as { text: string }).text,
        repliedAt: new Date().toISOString(),
      };
      return route.fulfill({ json: detail(report) });
    }
    if (method === 'POST' && action === 'ticket') {
      report.ticket = {
        state: 'CREATED',
        tracker: 'github',
        number: 42,
        url: TICKET_URL,
        createdAt: new Date().toISOString(),
      };
      return route.fulfill({ status: 201, json: report.ticket });
    }
    if (method === 'DELETE' && action === 'ticket') {
      report.ticket = null;
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fallback();
  });
  return { data, recorded };
}

/** Opens a route and signs in; the app returns to it after the sign-in. */
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

function sectionOf(page: Page) {
  const section = page.locator('section.server-admin-reports');
  return {
    section,
    heading: section.getByRole('heading', { name: reports.title, level: 2 }),
    list: section.getByRole('list', { name: reports.listLabel }),
    row: (kind: 'PROBLEM' | 'FEEDBACK') =>
      section
        .getByRole('list', { name: reports.listLabel })
        .getByRole('button', { name: new RegExp(`^${reports.kinds[kind]}`) }),
    filter: (value: 'NEW' | 'IN_PROGRESS' | 'CLOSED' | 'all' | 'archived') =>
      section
        .locator('.server-admin-reports-browse')
        .getByRole('button', { name: reports.filter[value], exact: true }),
    detail: section.locator('article.server-admin-report-detail'),
  };
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => {
    localStorage.setItem('eimir.theme', value);
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

/**
 * No horizontal page scrolling, and no visible element reaches past the
 * viewport. Links inside the Compact section navigation, a deliberate
 * horizontal scroller, may sit beyond its edge; the scroller itself may not.
 */
async function expectReflow(page: Page) {
  const outside = await page.evaluate(() =>
    Array.from(document.querySelectorAll('body *'))
      .filter((element) => {
        const box = element.getBoundingClientRect();
        const scroller = element.parentElement?.closest(
          '.server-admin-section-nav',
        );
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
  // The offending elements first: they name the cause of an overflow.
  expect(outside).toEqual([]);
  await expectNoHorizontalOverflow(page);
}

async function expectAccessible(page: Page, selector: string) {
  const result = await new AxeBuilder({ page })
    .include(selector)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

/** Names the files so they sort by state; copies them when evidence is wanted. */
async function capture(
  page: Page,
  info: TestInfo,
  name: string,
  top?: Locator,
) {
  const directory = process.env.VISUAL_EVIDENCE_DIR;
  if (!directory) return;
  // The state of interest sits below the admin header: bring it to the top.
  if (top)
    await top.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  const output = info.outputPath(name);
  await page.screenshot({ path: output, animations: 'disabled' });
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(output, path.join(directory, name));
}

/** The same state in Light and Dark with axe on each; the page ends in Light. */
async function captureThemes(
  page: Page,
  info: TestInfo,
  name: string,
  axeSelector: string,
  top?: Locator,
) {
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await capture(page, info, `${name}-${theme}.png`, top);
    await expectAccessible(page, axeSelector);
  }
  await setTheme(page, 'light');
}

test('operator_triages_a_report_replies_once_and_creates_a_ticket', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { data, recorded } = await install(page);
  await openSignedIn(page, '/server-admin');

  // Open: the Reports section is offered because the plugin is installed.
  const navigation = page.getByRole('navigation', {
    name: serverAdmin.navigation.aria,
  });
  await navigation
    .getByRole('link', { name: serverAdmin.navigation.reports, exact: true })
    .click();
  await expect(page).toHaveURL(/[?&]section=reports\b/);
  const reportsSection = sectionOf(page);
  await expect(reportsSection.heading).toBeVisible();
  await expect(reportsSection.section).toContainText(
    reports.newCount.replace('{{count}}', '1'),
  );
  // The queue starts at new reports and never shows the person's note.
  await expect(reportsSection.filter('NEW')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(reportsSection.row('PROBLEM')).toBeVisible();
  await expect(reportsSection.row('FEEDBACK')).toHaveCount(0);
  await expect(reportsSection.list).not.toContainText(NOTE);

  // Interact: the report opens in place of the list on Compact.
  await reportsSection.row('PROBLEM').click();
  const report = reportsSection.detail;
  await expect(report.getByRole('heading', { level: 3 })).toBeFocused();
  await expect(reportsSection.list).toBeHidden();
  await expect(report.locator('.server-admin-report-text')).toHaveText(NOTE);
  await expect(report).toContainText(reports.detail.privacy);

  // A stale authentication asks for the step-up and retries the same write.
  await report
    .getByRole('button', { name: reports.states.IN_PROGRESS, exact: true })
    .click();
  const stepUp = page.getByRole('dialog', { name: serverAdmin.stepUp.title });
  await expect(stepUp).toBeVisible();
  await stepUp
    .getByLabel(serverAdmin.stepUp.passwordLabel, { exact: true })
    .fill(TEST_PASSWORD);
  await stepUp
    .getByRole('button', { name: serverAdmin.stepUp.passwordAction })
    .click();
  await expect(stepUp).toBeHidden();
  await expect(report.getByRole('status')).toHaveText(
    reports.detail.stateSaved.replace('{{state}}', reports.states.IN_PROGRESS),
  );
  await expect(
    report.getByRole('button', {
      name: reports.states.IN_PROGRESS,
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(recorded.stepUps).toBe(1);
  expect(recorded.writes).toEqual([
    {
      method: 'PUT',
      path: `/api/v1/server-admin/support-reports/${PROBLEM_ID}/state`,
      body: { state: 'IN_PROGRESS' },
    },
    {
      method: 'PUT',
      path: `/api/v1/server-admin/support-reports/${PROBLEM_ID}/state`,
      body: { state: 'IN_PROGRESS' },
    },
  ]);

  // Save: the one reply, with its visible counter, then shown read-only.
  const replyField = report.getByLabel(reports.reply.label, { exact: true });
  await replyField.fill(REPLY);
  await expect(report.locator('.server-admin-report-counter')).toContainText(
    `${REPLY.length} / 500`,
  );
  await report
    .getByRole('button', { name: reports.reply.send, exact: true })
    .click();
  await expect(report.getByText(reports.reply.sent)).toBeVisible();
  await expect(
    report.getByText(reports.reply.sentTitle, { exact: true }),
  ).toBeVisible();
  await expect(report.getByText(REPLY, { exact: true })).toBeVisible();
  await expect(replyField).toHaveCount(0);
  await expect(
    report.getByRole('button', { name: reports.reply.send }),
  ).toHaveCount(0);

  // Complete: the ticket dialog sends only what the operator typed.
  await report
    .getByRole('button', { name: reports.ticket.create, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: reports.ticketDialog.title });
  await expect(dialog).toBeVisible();
  const titleField = dialog.getByLabel(reports.ticketDialog.titleLabel, {
    exact: true,
  });
  await expect(titleField).toBeFocused();
  await expect(titleField).toHaveValue(
    reports.ticketDialog.titleTemplate
      .replace('{{kind}}', reports.kinds.PROBLEM)
      .replace('{{appVersion}}', '1.4.0'),
  );
  await expect(dialog.locator('.server-admin-report-footer')).toContainText(
    `- Report: \`${PROBLEM_ID}\``,
  );
  await expect(dialog).not.toContainText(NOTE);
  await dialog
    .getByLabel(reports.ticketDialog.bodyLabel, { exact: true })
    .fill(TICKET_BODY);
  await dialog
    .getByRole('button', { name: reports.ticketDialog.submit, exact: true })
    .click();
  await expect(dialog).toBeHidden();

  // Observe: the link to the tracker, focused, opening outside the app.
  const link = report.getByRole('link', {
    name: new RegExp(`^${reports.ticket.open.replace('{{number}}', '#42')}`),
  });
  await expect(link).toBeFocused();
  await expect(link).toHaveAttribute('href', TICKET_URL);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(report.getByText(reports.ticket.createdNotice)).toBeVisible();
  const ticketWrite = recorded.writes.at(-1);
  expect(ticketWrite).toEqual({
    method: 'POST',
    path: `/api/v1/server-admin/support-reports/${PROBLEM_ID}/ticket`,
    body: {
      title: `${reports.kinds.PROBLEM} in Version 1.4.0`,
      body: TICKET_BODY,
    },
  });
  // Neither the person's note nor the reply leaves the server in a ticket.
  expect(JSON.stringify(ticketWrite?.body)).not.toContain(NOTE);
  expect(JSON.stringify(ticketWrite?.body)).not.toContain(REPLY);
  expect(recorded.stepUps).toBe(1);
  expect(data[0]?.state).toBe('IN_PROGRESS');

  // Return: the list comes back. The report left the "new" filter, so the
  // section heading takes focus; "all" shows it with its reply and ticket.
  await report
    .getByRole('button', { name: reports.detail.back, exact: true })
    .click();
  await expect(reportsSection.detail).toHaveCount(0);
  await expect(reportsSection.heading).toBeFocused();
  await expect(reportsSection.section).toContainText(reports.emptyNewBody);
  await reportsSection.filter('all').click();
  const row = reportsSection.row('PROBLEM');
  await expect(row).toContainText(reports.item.replied);
  await expect(row).toContainText(reports.item.ticket);
  await expect(row).toContainText(reports.states.IN_PROGRESS);
  await expect(reportsSection.list).not.toContainText(NOTE);
});

test('operator_archives_restores_and_permanently_deletes_a_report', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { data, recorded } = await install(page);
  await openSignedIn(page, '/server-admin?section=reports');
  const reportsSection = sectionOf(page);
  await expect(reportsSection.row('PROBLEM')).toBeVisible();

  // Open, then archive: the stale authentication asks for the step-up once and
  // the same write is retried.
  await reportsSection.row('PROBLEM').click();
  const report = reportsSection.detail;
  await expect(report.locator('.server-admin-report-text')).toHaveText(NOTE);
  await report
    .getByRole('button', { name: reports.manage.archive, exact: true })
    .click();
  const stepUp = page.getByRole('dialog', { name: serverAdmin.stepUp.title });
  await stepUp
    .getByLabel(serverAdmin.stepUp.passwordLabel, { exact: true })
    .fill(TEST_PASSWORD);
  await stepUp
    .getByRole('button', { name: serverAdmin.stepUp.passwordAction })
    .click();
  await expect(report.getByText(reports.manage.archived)).toBeVisible();
  await expect(report.locator('.server-admin-report-badges')).toContainText(
    reports.item.archived,
  );
  expect(recorded.stepUps).toBe(1);
  expect(recorded.writes.map((write) => [write.method, write.body])).toEqual([
    ['PUT', { archived: true }],
    ['PUT', { archived: true }],
  ]);
  // The triage state is kept.
  expect(data[0]?.state).toBe('NEW');

  // Return: the report left the new queue and "all", and sits in the archive.
  await report
    .getByRole('button', { name: reports.detail.back, exact: true })
    .click();
  await expect(reportsSection.heading).toBeFocused();
  await expect(reportsSection.section).toContainText(reports.emptyNewBody);
  await expect(reportsSection.section).toContainText(
    reports.newCount.replace('{{count}}', '0'),
  );
  await reportsSection.filter('all').click();
  await expect(reportsSection.row('PROBLEM')).toHaveCount(0);
  await expect(reportsSection.row('FEEDBACK')).toBeVisible();
  await reportsSection.filter('archived').click();
  const archivedRow = reportsSection.row('PROBLEM');
  await expect(archivedRow).toContainText(reports.item.archived);
  await expect(archivedRow).toContainText(reports.states.NEW);

  // Bring it back from the archive: it is a new report again.
  await archivedRow.click();
  await report
    .getByRole('button', { name: reports.manage.unarchive, exact: true })
    .click();
  await expect(report.getByText(reports.manage.unarchived)).toBeVisible();
  await report
    .getByRole('button', { name: reports.detail.back, exact: true })
    .click();
  await expect(reportsSection.section).toContainText(reports.emptyArchivedBody);
  await reportsSection.filter('NEW').click();
  await expect(reportsSection.row('PROBLEM')).toBeVisible();

  // Delete: the dialog names the consequence; cancelling deletes nothing.
  await reportsSection.row('PROBLEM').click();
  await report
    .getByRole('button', { name: reports.manage.delete, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: reports.deleteDialog.title });
  await expect(dialog).toContainText(reports.deleteDialog.consequence);
  await expect(dialog).not.toContainText(reports.deleteDialog.ticketStays);
  await expect(
    dialog.getByRole('button', { name: reports.deleteDialog.cancel }),
  ).toBeFocused();
  await dialog
    .getByRole('button', { name: reports.deleteDialog.cancel })
    .click();
  await expect(dialog).toBeHidden();
  expect(data).toHaveLength(2);

  // Confirm: the report is gone, the list says so and the audit-relevant
  // write is exactly one DELETE of that report.
  const writesBefore = recorded.writes.length;
  await report
    .getByRole('button', { name: reports.manage.delete, exact: true })
    .click();
  await dialog
    .getByRole('button', { name: reports.deleteDialog.confirm })
    .click();
  await expect(reportsSection.detail).toHaveCount(0);
  await expect(reportsSection.section).toContainText(reports.manage.deleted);
  await expect(reportsSection.row('PROBLEM')).toHaveCount(0);
  await expect(reportsSection.heading).toBeFocused();
  expect(recorded.writes.slice(writesBefore)).toEqual([
    {
      method: 'DELETE',
      path: `/api/v1/server-admin/support-reports/${PROBLEM_ID}`,
      body: null,
    },
  ]);
  expect(data.map((candidate) => candidate.id)).toEqual([FEEDBACK_ID]);
});

test('delete_dialog_says_a_linked_ticket_stays', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page, { fresh: true });
  await openSignedIn(page, '/server-admin?section=reports&state=IN_PROGRESS');
  const reportsSection = sectionOf(page);
  await reportsSection.row('FEEDBACK').click();
  await reportsSection.detail
    .getByRole('button', { name: reports.manage.delete, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: reports.deleteDialog.title });
  await expect(dialog).toContainText(reports.deleteDialog.ticketStays);
});

test('uncertain_pending_ticket_is_cleared_only_after_confirmation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { recorded } = await install(page, { fresh: true });
  await openSignedIn(page, '/server-admin?section=reports&state=IN_PROGRESS');
  const reportsSection = sectionOf(page);
  await expect(reportsSection.filter('IN_PROGRESS')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await reportsSection.row('FEEDBACK').click();
  const report = reportsSection.detail;
  await expect(report.getByText(reports.ticket.uncertain)).toBeVisible();
  await expect(report.getByText(reports.ticket.uncertainHint)).toBeVisible();
  const clear = report.getByRole('button', {
    name: reports.ticket.clear,
    exact: true,
  });

  // Dismissing the duplicate warning keeps the link.
  const prompts: string[] = [];
  page.once('dialog', (prompt) => {
    prompts.push(prompt.message());
    void prompt.dismiss();
  });
  await clear.click();
  await expect.poll(() => prompts.length).toBe(1);
  expect(prompts[0]).toBe(reports.ticket.confirmClear);
  expect(recorded.writes).toHaveLength(0);
  await expect(clear).toBeVisible();

  // Confirming removes it; a new ticket can then be created.
  page.once('dialog', (prompt) => void prompt.accept());
  await clear.click();
  await expect(report.getByText(reports.ticket.cleared)).toBeVisible();
  await expect(
    report.getByRole('button', { name: reports.ticket.create, exact: true }),
  ).toBeVisible();
  expect(recorded.writes).toEqual([
    {
      method: 'DELETE',
      path: `/api/v1/server-admin/support-reports/${FEEDBACK_ID}/ticket`,
      body: null,
    },
  ]);
});

test.describe('states at 2x', () => {
  // Crisp captures: small glyphs and borders are unreadable at 1x.
  test.use({ deviceScaleFactor: 2 });

  test('reports section reflows in Compact and Expanded, Light, Dark and reduced motion with axe', async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await install(page, { fresh: true });
    await openSignedIn(page, '/server-admin?section=reports');
    const reportsSection = sectionOf(page);
    await expect(reportsSection.row('PROBLEM')).toBeVisible();
    await page.mouse.move(0, 0);

    // Compact list, in Light and Dark, then at 360 and 430.
    const sectionTop = reportsSection.heading;
    await captureThemes(
      page,
      info,
      '01-list-390',
      'section.server-admin-reports',
      sectionTop,
    );
    for (const width of [360, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expectReflow(page);
      await capture(page, info, `01-list-${width}-light.png`, sectionTop);
    }
    await page.setViewportSize({ width: 390, height: 844 });

    // Compact detail of the new problem report.
    await reportsSection.row('PROBLEM').click();
    const report = reportsSection.detail;
    await expect(report.locator('.server-admin-report-text')).toHaveText(NOTE);
    const detailTop = report.locator('.server-admin-report-detail-head');
    await captureThemes(
      page,
      info,
      '02-detail-390',
      'section.server-admin-reports',
      detailTop,
    );
    await page.setViewportSize({ width: 360, height: 844 });
    await expectReflow(page);
    await capture(page, info, '02-detail-360-light.png', detailTop);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await capture(
      page,
      info,
      '02-detail-390-light-reduced-motion.png',
      detailTop,
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // The ticket dialog on Compact, with its read-only server footer.
    await report
      .getByRole('button', { name: reports.ticket.create, exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: reports.ticketDialog.title,
    });
    await expect(dialog).toBeVisible();
    await page.mouse.move(0, 0);
    await captureThemes(page, info, '03-ticket-dialog-390', '[role="dialog"]');
    await page.setViewportSize({ width: 360, height: 844 });
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Expanded: the list stays beside the open report, marked as selected.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(reportsSection.list).toBeVisible();
    await expect(reportsSection.detail).toBeVisible();
    await expect(reportsSection.row('PROBLEM')).toHaveAttribute(
      'aria-current',
      'true',
    );
    const [listBox, detailBox] = await Promise.all([
      reportsSection.list.boundingBox(),
      reportsSection.detail.boundingBox(),
    ]);
    expect(detailBox?.x ?? 0).toBeGreaterThan(
      (listBox?.x ?? 0) + (listBox?.width ?? 0) - 1,
    );
    await expectNoHorizontalOverflow(page);
    await captureThemes(
      page,
      info,
      '04-expanded-1440',
      'section.server-admin-reports',
      sectionTop,
    );

    // The uncertain ticket state, Expanded and Compact.
    await reportsSection.filter('all').click();
    await reportsSection.row('FEEDBACK').click();
    await expect(
      reportsSection.detail.getByText(reports.ticket.uncertain),
    ).toBeVisible();
    await page.mouse.move(0, 0);
    const ticketTop = reportsSection.detail.getByRole('heading', {
      name: reports.ticket.title,
      exact: true,
    });
    await captureThemes(
      page,
      info,
      '05-uncertain-1440',
      'section.server-admin-reports',
      ticketTop,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await captureThemes(
      page,
      info,
      '05-uncertain-390',
      'section.server-admin-reports',
      ticketTop,
    );
    // The archive and delete actions at the end of the report, Compact.
    await reportsSection.detail
      .getByRole('button', { name: reports.detail.back, exact: true })
      .click();
    await reportsSection.row('PROBLEM').click();
    const manageTop = reportsSection.detail.getByRole('heading', {
      name: reports.manage.title,
      exact: true,
    });
    await manageTop.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await captureThemes(
      page,
      info,
      '09-manage-390',
      'section.server-admin-reports',
      manageTop,
    );

    // The permanent-delete confirmation, Compact and Expanded.
    await reportsSection.detail
      .getByRole('button', { name: reports.manage.delete, exact: true })
      .click();
    const deleteDialog = page.getByRole('dialog', {
      name: reports.deleteDialog.title,
    });
    await expect(deleteDialog).toBeVisible();
    await page.mouse.move(0, 0);
    await captureThemes(page, info, '10-delete-dialog-390', '[role="dialog"]');
    await page.setViewportSize({ width: 360, height: 844 });
    await expectNoHorizontalOverflow(page);
    await capture(page, info, '10-delete-dialog-360-light.png');
    await page.setViewportSize({ width: 1440, height: 900 });
    await captureThemes(page, info, '10-delete-dialog-1440', '[role="dialog"]');
    await page.keyboard.press('Escape');
    await expect(deleteDialog).toBeHidden();

    // The archived view with an archived report, Expanded.
    await reportsSection.detail
      .getByRole('button', { name: reports.manage.archive, exact: true })
      .click();
    await expect(
      reportsSection.detail.getByText(reports.manage.archived),
    ).toBeVisible();
    await reportsSection.filter('archived').click();
    await expect(reportsSection.row('PROBLEM')).toContainText(
      reports.item.archived,
    );
    await page.mouse.move(0, 0);
    await captureThemes(
      page,
      info,
      '11-archived-1440',
      'section.server-admin-reports',
      sectionTop,
    );
  });

  test('large_text_keeps_the_reports_section_usable', async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await install(page, { fresh: true });
    await openSignedIn(page, '/server-admin?section=reports&state=all');
    const reportsSection = sectionOf(page);
    await expect(reportsSection.row('PROBLEM')).toBeVisible();
    // The root font size at 200 %, so every rem-based size scales.
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await page.mouse.move(0, 0);
    await expectReflow(page);
    const row = await reportsSection.row('PROBLEM').boundingBox();
    expect(row?.height).toBeGreaterThanOrEqual(44);
    await capture(
      page,
      info,
      '06-large-text-list-390-light.png',
      reportsSection.heading,
    );

    await reportsSection.row('PROBLEM').click();
    const report = reportsSection.detail;
    await expect(report.locator('.server-admin-report-text')).toHaveText(NOTE);
    await expectReflow(page);
    const send = report.getByRole('button', {
      name: reports.reply.send,
      exact: true,
    });
    await report.getByLabel(reports.reply.label, { exact: true }).fill(REPLY);
    // Centered: an edge-aligned scroll lands on a sub-pixel position.
    await send.evaluate((element) =>
      element.scrollIntoView({ block: 'center' }),
    );
    await expect(send).toBeInViewport({ ratio: 1 });
    expect((await send.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await capture(page, info, '07-large-text-detail-390-light.png');
    await page.setViewportSize({ width: 360, height: 800 });
    await expectReflow(page);
    await capture(page, info, '07-large-text-detail-360-light.png');

    await report
      .getByRole('button', { name: reports.ticket.create, exact: true })
      .scrollIntoViewIfNeeded();
    await report
      .getByRole('button', { name: reports.ticket.create, exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: reports.ticketDialog.title,
    });
    await expect(dialog).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const submit = dialog.getByRole('button', {
      name: reports.ticketDialog.submit,
      exact: true,
    });
    await submit.evaluate((element) =>
      element.scrollIntoView({ block: 'center' }),
    );
    await expect(submit).toBeInViewport({ ratio: 1 });
    await capture(page, info, '08-large-text-ticket-dialog-360-light.png');
  });
});

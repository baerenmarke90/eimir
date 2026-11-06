import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  ACCOUNT_ID,
  PARTNER_ID,
  SPACE_ID,
  TINY_PNG,
  installMocks,
  signIn,
  captureScreenshot,
} from '../support/storyTimelineFixture';
import copy from '../../src/i18n/locales/onceMessages';

const ROOT = '/today/only-you';
const MESSAGE = '77777777-7777-4777-8777-777777777777';
const WORDS = 'Heute Abend denke ich an dich.';
type Device = { id: string; publicJwk: object };

function server() {
  const keys = new Map<string, Device>();
  let record:
    | {
        envelope: object;
        requestId: string;
        recipientId: string;
        senderId: string;
      }
    | undefined;
  let claimed: string | undefined;
  let opens = 0;
  let sends = 0;
  let failNextSend = false;
  const expiresAt = () => new Date(Date.now() + 86400_000).toISOString();
  async function connect(page: Page, own: string) {
    await installMocks(page, { asPartner: own === PARTNER_ID });
    await page.route('**/dashboard/preferences', route => route.fulfill({ json: { items: [{ moduleKey: 'daily_quote', visible: false }] } }));
    await page.route('**/dashboard', route => route.fulfill({ json: {
      space: { spaceId: SPACE_ID, partner: { id: own === ACCOUNT_ID ? PARTNER_ID : ACCOUNT_ID, displayName: own === ACCOUNT_ID ? 'Alex' : 'Lea' } },
      keepsake: { id: 'mem-canal', type: 'MEMORY', titleOrText: 'Unser Spaziergang am Wasser', occurredOn: '2026-11-05', createdAt: '2026-11-05T17:00:00Z', scheduledAt: null },
      recentShared: [], relationshipDuration: null, retrospective: null, sharedStorySummary: null, thinkingOfYouAvailableAt: null,
      upcoming: [{ id: 'next-plan', type: 'PLAN', titleOrText: 'Unser Wochenende', scheduledAt: null, scheduledOn: '2026-11-07', occurredOn: null, createdAt: '2026-11-01T12:00:00Z' }],
    } }));

    await page.route('**/api/v1/spaces/*/once-messages**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const other = own === ACCOUNT_ID ? PARTNER_ID : ACCOUNT_ID;
      const status = () => ({
        receptionVersion: keys.has(own) ? 1 : 0, ownEnabled: keys.has(own),
        partnerEnabled: keys.has(other),
        canSend: true,
        partner: {
          id: other,
          displayName: other === ACCOUNT_ID ? 'Lea' : 'Alex',
        },
        ownDeviceIds: keys.has(own) ? [keys.get(own)!.id] : [],
        recipientDevices:
          keys.has(own) && keys.has(other) ? [keys.get(other)] : [],
      });
      const sealed = () => ({
        id: MESSAGE,
        requestId: record!.requestId,
        sender: {
          id: record!.senderId,
          displayName: record!.senderId === ACCOUNT_ID ? 'Lea' : 'Alex',
        },
        expiresAt: expiresAt(),
      });
      const json = (body: unknown, statusCode = 200) =>
        route.fulfill({
          status: statusCode,
          json: body,
          headers: { 'Cache-Control': 'private, no-store' },
        });
      if (path.endsWith('/status')) return json(status());
      if (path.endsWith('/reception') && method === 'PUT') {
        const body = request.postDataJSON();
        if (body.enabled)
          keys.set(own, { id: body.deviceId, publicJwk: body.publicJwk });
        else {
          keys.delete(own);
          record = undefined;
        }
        return json(status());
      }
      if (path.endsWith('/once-messages') && method === 'POST') {
        const body = request.postDataJSON();
        expect(JSON.stringify(body)).not.toContain(WORDS);
        if (record) expect(body.requestId).toBe(record.requestId);
        else {
          record = { ...body, senderId: own };
          sends++;
        }
        if (failNextSend) {
          failNextSend = false;
          return route.abort('failed');
        }
        return json({ id: MESSAGE, expiresAt: expiresAt() }, 201);
      }
      if (path.endsWith('/once-messages') && method === 'GET')
        return json({
          items:
            record && !claimed && record.recipientId === own ? [sealed()] : [],
        });
      if (path.endsWith('/open') && method === 'POST') {
        opens++;
        const body = request.postDataJSON();
        if (
          !record ||
          record.recipientId !== own ||
          (claimed && claimed !== body.token)
        )
          return json({ code: 'ONCE_MESSAGE_UNAVAILABLE' }, 404);
        claimed = body.token;
        return json({
          envelope: record.envelope,
          viewUntil: new Date(Date.now() + 300_000).toISOString(),
        });
      }
      if (path.endsWith('/acknowledge')) {
        if (record) record.envelope = {};
        return route.fulfill({ status: 204 });
      }
      if (path.endsWith(`/${MESSAGE}`) && method === 'DELETE') {
        record = undefined;
        return route.fulfill({ status: 204 });
      }
      if (
        path.endsWith(`/${MESSAGE}`) &&
        method === 'GET' &&
        record &&
        !claimed &&
        record.recipientId === own
      )
        return json(sealed());
      return json({ code: 'ONCE_MESSAGE_UNAVAILABLE' }, 404);
    });
  }
  return {
    connect,
    get opens() {
      return opens;
    },
    get sends() {
      return sends;
    },
    loseSendResponse: () => {
      failNextSend = true;
    },
  };
}

async function enable(
  page: Page,
  context: BrowserContext,
  app: ReturnType<typeof server>,
  own: string,
) {
  await app.connect(page, own);
  await signIn(
    page,
    own === ACCOUNT_ID ? 'lea@example.org' : 'alex@example.org',
  );
  await page.goto(ROOT);
  await page.getByRole('button', { name: copy.enable }).click();
  await expect(page.getByText(copy.enabled, { exact: true })).toBeVisible();
  expect(await context.cookies()).toEqual([]);
}

test('two devices exchange actual encrypted content, deliberately reveal once and clear it on leaving', async ({
  browser,
}, info) => {
  const senderContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'de-DE',
  });
  const receiverContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'de-DE',
  });
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  const app = server();
  try {
    await enable(sender, senderContext, app, ACCOUNT_ID);
    await enable(receiver, receiverContext, app, PARTNER_ID);
    await sender.goto(`${ROOT}/new`);
    await sender.getByLabel(copy.message, { exact: true }).fill(WORDS);
    await captureScreenshot(sender, info, 'once-composer-390-light.png');
    app.loseSendResponse();
    await sender.getByRole('button', { name: copy.send, exact: true }).click();
    await expect(sender.getByText(copy.errors.uncertain)).toBeVisible();
    await expect(sender.getByLabel(copy.message, { exact: true })).toHaveValue(
      WORDS,
    );
    await sender.getByRole('button', { name: copy.checkSend }).click();
    await expect(
      sender.getByRole('heading', { name: copy.sent, exact: true }),
    ).toBeVisible();
    expect(app.sends).toBe(1);
    await sender.getByRole('button', { name: copy.back }).click();
    await expect(sender).toHaveURL('/today');

    await receiver.goto('/today');
    await expect(
      receiver.getByRole('heading', { name: copy.title, exact: true }),
    ).toBeVisible();
    await captureScreenshot(receiver, info, 'once-incoming-390-light.png');
    expect(app.opens).toBe(0);
    await receiver.locator('.once-sealed-link').click();
    await expect(
      receiver.getByRole('button', { name: copy.open, exact: true }),
    ).toBeVisible();
    expect(app.opens).toBe(0);
    await expect(receiver.getByText(WORDS, { exact: true })).toHaveCount(0);
    await captureScreenshot(receiver, info, 'once-sealed-390-light.png');
    await receiver
      .getByRole('button', { name: copy.open, exact: true })
      .click();
    await expect(receiver.getByText(WORDS, { exact: true })).toBeVisible();
    expect(app.opens).toBe(1);
    await captureScreenshot(receiver, info, 'once-open-390-light.png');
    const stored = await receiver.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    );
    expect(stored).not.toContain(WORDS);
    await receiver.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent('pagehide')),
    );
    await expect(receiver.getByText(WORDS, { exact: true })).toHaveCount(0);
    await expect(receiver.getByText(copy.ended, { exact: true })).toBeVisible();
    await receiver.reload();
    await expect(receiver.getByText(copy.unavailable)).toBeVisible();
    expect(app.opens).toBe(1);

    for (const width of [360, 430, 1280]) {
      await sender.setViewportSize({ width, height: 844 });
      await sender.evaluate(() => localStorage.setItem('eimir.theme', 'dark'));
      await sender.goto(`${ROOT}/new`);
      await expect(
        sender.getByLabel(copy.message, { exact: true }),
      ).toBeVisible();
      await captureScreenshot(sender, info, `once-composer-${width}-dark.png`);
    }
    await sender.setViewportSize({ width: 320, height: 844 });
    await sender.emulateMedia({ reducedMotion: 'reduce' });
    await sender.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    const geometry = await sender.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      overflowing: Array.from(document.querySelectorAll('body *'))
        .map((element) => ({
          tag: element.tagName,
          cls: element.className,
          width: element.getBoundingClientRect().width,
          right: element.getBoundingClientRect().right,
        }))
        .filter(
          (item) =>
            item.right > document.documentElement.clientWidth + 1 &&
            item.width > 1,
        )
        .slice(-20),
    }));
    await captureScreenshot(
      sender,
      info,
      'once-composer-320-large-reduced-full.png',
      { fullPage: true },
    );
    expect(
      geometry.scroll,
      JSON.stringify(geometry.overflowing),
    ).toBeLessThanOrEqual(geometry.client);
    await captureScreenshot(
      sender,
      info,
      'once-composer-320-large-reduced.png',
    );
    const accessibility = await new AxeBuilder({ page: sender })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  } finally {
    await senderContext.close();
    await receiverContext.close();
  }
});

test('temporary audio uses the shared player and stays outside durable HeartMoments', async ({
  browser,
}, info) => {
  const a = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'de-DE',
  });
  const b = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'de-DE',
  });
  const sender = await a.newPage(),
    receiver = await b.newPage();
  const app = server();
  try {
    await enable(sender, a, app, ACCOUNT_ID);
    await enable(receiver, b, app, PARTNER_ID);
    await sender.goto(`${ROOT}/new`);
    const wav = Buffer.alloc(44 + 16000);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(16000, 40);
    await sender
      .getByLabel(copy.importVoice, { exact: true })
      .setInputFiles({ name: 'voice.wav', mimeType: 'audio/wav', buffer: wav });
    await expect(sender.locator('.voice-player')).toBeVisible();
    await sender.getByRole('button', { name: copy.send, exact: true }).click();
    await expect(
      sender.getByRole('heading', { name: copy.sent, exact: true }),
    ).toBeVisible();
    await receiver.goto(`${ROOT}/${MESSAGE}`);
    await receiver
      .getByRole('button', { name: copy.open, exact: true })
      .click();
    await expect(receiver.locator('.voice-player')).toBeVisible();
    await captureScreenshot(receiver, info, 'once-voice-390-light.png');
    await receiver
      .getByRole('button', { name: copy.close, exact: true })
      .click();
    await expect(receiver.locator('audio')).toHaveCount(0);
    expect(app.sends).toBe(1);
  } finally {
    await a.close();
    await b.close();
  }
});

test('photo-only messages are normalized locally and revealed with their description', async ({
  browser,
}, info) => {
  const a = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'de-DE',
  });
  const b = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'de-DE',
  });
  const sender = await a.newPage(),
    receiver = await b.newPage();
  const app = server();
  try {
    await enable(sender, a, app, ACCOUNT_ID);
    await enable(receiver, b, app, PARTNER_ID);
    await sender.goto(`${ROOT}/new`);
    await sender
      .getByLabel(copy.photo, { exact: true })
      .setInputFiles({
        name: 'moment.png',
        mimeType: 'image/png',
        buffer: TINY_PNG,
      });
    await expect(sender.locator('.once-media-draft img')).toBeVisible();
    await sender.getByLabel(copy.description).fill('Ein kleiner Farbpunkt');
    expect(
      await sender
        .locator('.once-media-draft img')
        .evaluate(async (image) =>
          (await fetch((image as HTMLImageElement).src)).headers.get(
            'content-type',
          ),
        ),
    ).toBe('image/jpeg');
    await sender.getByRole('button', { name: copy.send, exact: true }).click();
    await expect(
      sender.getByRole('heading', { name: copy.sent, exact: true }),
    ).toBeVisible();
    await receiver.goto(`${ROOT}/${MESSAGE}`);
    await receiver
      .getByRole('button', { name: copy.open, exact: true })
      .click();
    await expect(
      receiver.getByRole('img', { name: 'Ein kleiner Farbpunkt' }),
    ).toBeVisible();
    await captureScreenshot(receiver, info, 'once-photo-390-light.png');
    await receiver
      .getByRole('button', { name: copy.close, exact: true })
      .click();
    await expect(receiver.locator('.once-photo')).toHaveCount(0);
  } finally {
    await a.close();
    await b.close();
  }
});

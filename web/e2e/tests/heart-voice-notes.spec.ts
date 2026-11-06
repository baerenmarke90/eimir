import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import copy from '../../src/i18n/locales/storyProducts';
import voice from '../../src/i18n/locales/voiceNotes';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  installMocks,
  ME,
  SPACE_ID,
  signIn,
} from '../support/storyTimelineFixture';

const input = new URL(
  '../../../backend/tests/fixtures/media/voice/short.ogg',
  import.meta.url,
);
const output = readFileSync(
  new URL(
    '../../../backend/tests/fixtures/media/voice/short.m4a',
    import.meta.url,
  ),
);
const base = `/api/v1/spaces/${SPACE_ID}`;

async function setup(page: Page, failSave = false) {
  const unknown = await installMocks(page, { strict: true });
  let saves = 0;
  let saved: Record<string, unknown> | undefined;
  const attachment = {
    id: 'voice-upload',
    status: 'READY',
    mediaType: 'AUDIO',
    mimeType: 'audio/mp4',
    size: output.length,
    durationSeconds: 1,
    width: null,
    height: null,
    hasThumbnail: false,
    version: 1,
    isSensitive: false,
    position: 0,
  };
  await page.route('**/api/v1/auth/capabilities', (route) =>
    route.fulfill({
      json: { serverAdmin: false, audioProcessingEnabled: true },
    }),
  );
  await page.route(`**${base}/attachments`, async (route) => {
    expect(route.request().postDataJSON().mediaType).toBe('AUDIO');
    return route.fulfill({
      status: 201,
      json: {
        attachment: { ...attachment, status: 'PENDING' },
        method: 'STREAM',
        uploadUrl: `${base}/attachments/voice-upload/content`,
        requiredHeaders: {},
      },
    });
  });
  await page.route(`**${base}/attachments/voice-upload`, (route) =>
    route.fulfill({ json: attachment }),
  );
  await page.route(`**${base}/attachments/voice-upload/finalize`, (route) =>
    route.fulfill({
      status: 202,
      json: { ...attachment, status: 'PROCESSING' },
    }),
  );
  await page.route(`**${base}/attachments/voice-upload/read-access`, (route) =>
    route.fulfill({
      json: {
        mediaType: 'AUDIO',
        method: 'STREAM',
        url: `${base}/attachments/voice-upload/content`,
      },
    }),
  );
  await page.route(`**${base}/attachments/voice-upload/content`, (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 204 })
      : route.fulfill({ contentType: 'audio/mp4', body: output }),
  );
  await page.route(`**${base}/heart-moments`, async (route) => {
    if (route.request().method() !== 'POST')
      return route.fulfill({
        json: { items: [], hasMore: false, nextCursor: null },
      });
    saves++;
    if (failSave && saves === 1)
      return route.fulfill({
        status: 503,
        json: { title: 'Unavailable', status: 503 },
      });
    const data = route.request().postDataJSON();
    expect(data.attachments).toEqual([
      { attachmentId: 'voice-upload', position: 0, isSensitive: false },
    ]);
    saved = {
      ...data,
      id: 'voice-heart',
      spaceId: SPACE_ID,
      authorId: ACCOUNT_ID,
      author: ME,
      capabilities: {
        ...CAPABILITIES,
        canComment: data.visibility === 'SHARED',
      },
      version: 1,
      createdAt: '2026-11-06T10:00:00Z',
      updatedAt: '2026-11-06T10:00:00Z',
      attachment,
      attachments: [attachment],
    };
    return route.fulfill({ status: 201, json: saved });
  });
  await page.route(`**${base}/heart-moments/voice-heart`, async (route) => {
    if (route.request().method() === 'PATCH')
      saved = { ...saved, ...route.request().postDataJSON(), version: 2 };
    return route.fulfill({ json: saved });
  });
  await page.route(`**${base}/heart-moments/voice-heart/comments**`, (route) =>
    route.fulfill({ json: { items: [], hasMore: false, nextCursor: null } }),
  );
  await signIn(page);
  await page.goto('/story/heart-moments/new');
  await expect(
    page.getByRole('heading', {
      name: copy.heartMomentProduct.createHeading,
      level: 1,
    }),
  ).toBeVisible();
  return { unknown, saves: () => saves };
}
async function importFile(page: Page) {
  await page.getByRole('button', { name: voice.title, exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: voice.choose, exact: true }).click();
  await (await chooser).setFiles(input.pathname);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: voice.audioTitle }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: copy.heartMomentProduct.save,
      exact: true,
    }),
  ).toBeEnabled();
}
async function saveAndPlay(page: Page) {
  await page
    .getByRole('textbox', { name: voice.audioTitle })
    .fill('Dein Gute-Nacht-Gruß');
  await page.getByRole('textbox', { name: voice.speaker }).fill('Alex');
  await page
    .getByRole('button', { name: copy.heartMomentProduct.save, exact: true })
    .click();
  await expect(page).toHaveURL(/heart-moments\/voice-heart$/);
  await expect(
    page.getByRole('heading', { name: 'Dein Gute-Nacht-Gruß' }),
  ).toBeVisible();
  await expect(page.getByText('Stimme von Alex')).toBeVisible();
  const audio = page.locator('.voice-player audio');
  expect(
    await audio.evaluate((element: HTMLAudioElement) => element.paused),
  ).toBe(true);
  await page.getByRole('button', { name: voice.play, exact: true }).click();
  await expect
    .poll(() =>
      audio.evaluate((element: HTMLAudioElement) => element.currentTime),
    )
    .toBeGreaterThan(0);
}

for (const scenario of [
  { width: 360, theme: 'light' },
  { width: 390, theme: 'dark' },
  { width: 430, theme: 'light' },
  { width: 1280, theme: 'dark' },
  { width: 320, theme: 'light', large: true },
] as const) {
  test(`imports, reviews, saves and plays at ${scenario.width} ${scenario.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: scenario.width, height: 900 });
    await page.emulateMedia({
      colorScheme: scenario.theme,
      reducedMotion: 'reduce',
    });
    const state = await setup(page);
    await importFile(page);
    await page
      .getByRole('textbox', { name: voice.audioTitle })
      .fill('Dein Gute-Nacht-Gruß');
    if ('large' in scenario)
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await captureScreenshot(
      page,
      info,
      `voice-review-${scenario.width}-${scenario.theme}.png`,
      { fullPage: true },
    );
    await saveAndPlay(page);
    await captureScreenshot(
      page,
      info,
      `voice-reading-${scenario.width}-${scenario.theme}.png`,
      { fullPage: true },
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(state.unknown).toEqual([]);
  });
}

test('encodes a synthetic microphone stream with the real browser MediaRecorder, reviews and saves', async ({
  page,
}, info) => {
  // This environment has no browser microphone driver (getUserMedia reports
  // NotSupportedError even with Chromium's fake-device flag). Supply only the
  // audio source; production MediaRecorder, callbacks, Blob and upload stay real.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      gain.gain.value = 0.1;
      const destination = audio.createMediaStreamDestination();
      oscillator.connect(gain).connect(destination);
      oscillator.start();
      for (const track of destination.stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          stop();
          oscillator.stop();
          void audio.close();
        };
      }
      return destination.stream;
    };
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await setup(page);
  await page.getByRole('button', { name: voice.title, exact: true }).click();
  await captureScreenshot(page, info, 'voice-source-choice-390.png');
  await page.getByRole('button', { name: voice.record, exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: voice.recording }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: voice.stop, exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(450); // Capture actual audio bytes before stopping.
  await captureScreenshot(page, info, 'voice-recording-390.png');
  await page.getByRole('button', { name: voice.stop, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: voice.audioTitle }),
  ).toBeVisible();
  await saveAndPlay(page);
});

test('permission denial retains the thought and allows file import', async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole('textbox', {
      name: copy.heartMomentProduct.textLabel,
      exact: true,
    })
    .fill('Keep this thought');
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.getByRole('button', { name: voice.title, exact: true }).click();
  await page.getByRole('button', { name: voice.record, exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText(voice.permission),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Abbrechen', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', {
      name: copy.heartMomentProduct.textLabel,
      exact: true,
    }),
  ).toHaveValue('Keep this thought');
  await importFile(page);
});

test('failed Save retains voice, labels and audience for the deliberate retry', async ({
  page,
}) => {
  const state = await setup(page, true);
  await importFile(page);
  await page
    .getByRole('textbox', { name: voice.audioTitle })
    .fill('Keep my voice');
  await expect(
    page.getByRole('textbox', { name: voice.audioTitle }),
  ).toHaveValue('Keep my voice');
  await page.getByRole('radio', { name: /Nur für mich/ }).check();
  await expect(
    page.getByRole('textbox', { name: voice.audioTitle }),
  ).toHaveValue('Keep my voice');
  const save = page.getByRole('button', {
    name: copy.heartMomentProduct.save,
    exact: true,
  });
  await save.click();
  await expect(page).toHaveURL(/heart-moments\/new$/);
  await expect(
    page.getByRole('textbox', { name: voice.audioTitle }),
  ).toHaveValue('Keep my voice');
  await expect(page.getByRole('radio', { name: /Nur für mich/ })).toBeChecked();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page).toHaveURL(/heart-moments\/voice-heart$/);
  expect(state.saves()).toBe(2);
});

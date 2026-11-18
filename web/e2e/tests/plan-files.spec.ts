import { expect, type Page, test } from '@playwright/test';
import composer from '../../src/i18n/locales/composer';
import copy from '../../src/i18n/locales/m5s3';
import fileCopy from '../../src/i18n/locales/planFiles';
import { installNativeAppLifecycle } from '../support/nativeAppLifecycle';
import { fulfillDefaultProductContext } from '../support/productContext';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  captureScreenshot,
  installMocks,
  ME,
  signIn,
  SPACE_ID,
} from '../support/storyTimelineFixture';

test.use({ channel: 'chromium' });

const root = `/api/v1/spaces/${SPACE_ID}`;
const planId = '0ab6230c-8b6c-45f1-aa0e-5b51e438d400';
const planRoute = `/plan/plans/${planId}`;
const attachmentId = '7aa71de7-2da2-438a-bce2-d315c48d05ae';
const content = `${root}/attachments/${attachmentId}/content`;
const stamp = '2026-11-11T12:00:00Z';

const pdf = (() => {
  let text = '%PDF-1.7\n';
  const entries = ['0000000000 65535 f \n'];
  for (const [index, object] of [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>',
  ].entries()) {
    entries.push(`${String(text.length).padStart(10, '0')} 00000 n \n`);
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  return Buffer.from(
    `${text}xref\n0 4\n${entries.join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${text.length}\n%%EOF\n`,
  );
})();

const file = { id: attachmentId, name: 'Reservierung.pdf', size: pdf.length };
const planContent = {
  title: 'A weekend by the sea',
  description: 'The stay is already booked.',
};

async function installPlanFileApi(page: Page, existing: boolean) {
  let plan = {
    id: planId,
    ...planContent,
    createdBy: ACCOUNT_ID,
    creator: ME,
    spaceId: SPACE_ID,
    capabilities: CAPABILITIES,
    status: 'IDEA',
    version: 1,
    createdAt: stamp,
    updatedAt: stamp,
    attachments: [],
    tags: [],
    fileAttachments: [] as (typeof file)[],
  };
  let created = existing;
  let uploads = 0;
  let reads = 0;
  let patch: unknown;
  const attachment = {
    id: attachmentId,
    mediaType: 'DOCUMENT',
    mimeType: 'application/pdf',
    size: file.size,
    version: 1,
    hasThumbnail: false,
    createdAt: stamp,
  };
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
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === `${root}/attachments` && method === 'POST') {
      expect(request.postDataJSON()).toMatchObject({
        mediaType: 'DOCUMENT',
        expectedMimeType: 'application/pdf',
        expectedSize: file.size,
        originalName: file.name,
      });
      return route.fulfill({
        status: 201,
        json: {
          method: 'STREAM',
          uploadUrl: content,
          requiredHeaders: { 'Content-Type': 'application/octet-stream' },
          attachment: { ...attachment, status: 'PENDING' },
        },
      });
    }
    if (path === content && method === 'PUT') {
      expect(request.postDataBuffer()).toEqual(pdf);
      uploads++;
      return route.fulfill({ status: !existing && uploads === 1 ? 503 : 204 });
    }
    if (path === `${root}/attachments/${attachmentId}/finalize`)
      return route.fulfill({
        status: 202,
        json: { ...attachment, status: 'PROCESSING' },
      });
    if (path === `${root}/attachments/${attachmentId}`)
      return route.fulfill({ json: { ...attachment, status: 'READY' } });
    if (path === content && method === 'GET') {
      expect(request.headers().authorization).toMatch(/^Bearer /);
      reads++;
      return route.fulfill({ contentType: 'application/pdf', body: pdf });
    }
    if (path === `${root}/plans` && method === 'POST') {
      const body = request.postDataJSON();
      expect(body.fileAttachmentIds).toEqual([attachmentId]);
      created = true;
      plan = {
        ...plan,
        title: body.title,
        description: body.description,
        fileAttachments: [file],
      };
      return route.fulfill({ status: 201, json: plan });
    }
    if (path === `${root}/plans/${planId}` && created) {
      if (method === 'PATCH') {
        const changes = request.postDataJSON().fileAttachmentChanges;
        expect(request.headers()['if-match']).toContain(String(plan.version));
        patch = changes;
        plan = {
          ...plan,
          version: plan.version + 1,
          fileAttachments: changes.add.length ? [file] : [],
        };
      }
      return route.fulfill({ json: plan });
    }
    if (await fulfillDefaultProductContext(route)) return;
    return route.fallback();
  });
  return { uploads: () => uploads, reads: () => reads, patch: () => patch };
}

async function selectPdf(page: Page) {
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: fileCopy.add, exact: true }).click();
  await (await picker).setFiles({
    name: file.name,
    mimeType: 'application/pdf',
    buffer: pdf,
  });
}

test('a browser Plan saves a retried PDF, opens and downloads it, then removes it', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await installPlanFileApi(page, false);
  await signIn(page);
  await page.goto('/plan/plans/new');
  await page.getByLabel(copy.plan.intentionLabel).fill(planContent.title);
  await page.getByLabel(copy.common.description).fill(planContent.description);
  await selectPdf(page);
  await expect(page.getByText(fileCopy.uploadFailed)).toBeVisible();
  await expect(
    page.getByRole('button', { name: copy.common.save, exact: true }),
  ).toBeDisabled();
  await page.locator('.plan-file-feedback button').click();
  const save = page.getByRole('button', {
    name: copy.common.save,
    exact: true,
  });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page).toHaveURL(new RegExp(`${planRoute}$`));
  await expect(page.getByText(file.name, { exact: true })).toBeVisible();
  expect(api.uploads()).toBe(2);
  const savedStatus = page.locator('.composer-saved-status');
  await expect(savedStatus).toHaveText(composer.saved);
  expect((await savedStatus.boundingBox())?.height).toBeLessThan(40);
  await captureScreenshot(page, testInfo, 'plan-files-browser-390-light.png', {
    fullPage: true,
  });

  const openFile = page.getByRole('button', {
    name: fileCopy.openNamed.replace('{{name}}', file.name),
  });
  const downloadFile = page.getByRole('button', {
    name: fileCopy.downloadNamed.replace('{{name}}', file.name),
  });
  const [openTarget, downloadTarget] = await Promise.all([
    openFile.boundingBox(),
    downloadFile.boundingBox(),
  ]);
  expect(openTarget).toMatchObject({ width: 48, height: 48 });
  expect(downloadTarget).toMatchObject({ width: 48, height: 48 });
  expect(openTarget?.y).toBe(downloadTarget?.y);

  const popupEvent = page.context().waitForEvent('page');
  await openFile.click();
  const popup = await popupEvent;
  await expect.poll(api.reads).toBe(1);
  await popup.waitForURL(/^blob:/);
  await popup.close();

  const downloadEvent = page.waitForEvent('download');
  await downloadFile.click();
  expect((await downloadEvent).suggestedFilename()).toBe(file.name);
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await captureScreenshot(page, testInfo, 'plan-files-browser-1280-dark.png', {
    fullPage: true,
  });

  await page
    .getByRole('button', { name: copy.common.edit, exact: true })
    .click();
  await page
    .getByRole('button', {
      name: fileCopy.removeNamed.replace('{{name}}', file.name),
    })
    .click();
  await page
    .getByRole('button', { name: copy.common.saveChanges, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: fileCopy.heading }),
  ).toHaveCount(0);
  expect(api.patch()).toEqual({ add: [], remove: [attachmentId] });
});

test('the Android runtime stages a PDF and opens it through the system handoff', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await installNativeAppLifecycle(page, { planFiles: true });
  const api = await installPlanFileApi(page, true);
  await signIn(page);
  await page.goto(planRoute);
  await page
    .getByRole('button', { name: copy.common.edit, exact: true })
    .click();
  await selectPdf(page);
  const save = page.getByRole('button', {
    name: copy.common.saveChanges,
    exact: true,
  });
  await expect(save).toBeEnabled();
  await captureScreenshot(
    page,
    testInfo,
    'plan-files-android-editor-360-light.png',
    { fullPage: true },
  );
  await save.click();
  await expect(
    page.getByRole('button', { name: copy.common.edit, exact: true }),
  ).toBeVisible();
  expect(api.patch()).toEqual({ add: [attachmentId], remove: [] });
  await captureScreenshot(
    page,
    testInfo,
    'plan-files-android-detail-360-light.png',
    { fullPage: true },
  );
  await page.setViewportSize({ width: 1280, height: 960 });
  await expect(
    page.getByRole('button', {
      name: fileCopy.downloadNamed.replace('{{name}}', file.name),
    }),
  ).toHaveCount(0);
  await page
    .getByRole('button', {
      name: fileCopy.openNamed.replace('{{name}}', file.name),
    })
    .click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'openedPlanPdf')))
    .toBe(file.name);
  expect(api.reads()).toBe(0);
});

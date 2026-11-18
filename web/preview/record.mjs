// Re-record the read-only demo answers that the eimir.de preview replays (data/api.json, data/media).
//
//   node preview/record.mjs [https://demo.example] [out-dir]
//
// It signs in to the public demo Space as the persona Lea (the demo holds fictional data only),
// opens Wir, Momente (Erinnerungen, Tagebuch) and Eure Geschichte, and stores every GET answer.
// Run it with the Playwright of web/e2e (`cd web/e2e && node ../preview/record.mjs`).
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'https://demo.sbs.ur-cloud.de';
const OUT = process.argv[3] ?? 'preview/data';
fs.mkdirSync(`${OUT}/media`, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'de-DE',
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const recorded = new Map();
const images = [];
let authorization = null;

page.on('response', async (response) => {
  const request = response.request();
  const url = new URL(response.url());
  if (!url.pathname.startsWith('/api/v1/') || response.status() >= 500) return;
  if (request.headers().authorization)
    authorization ??= request.headers().authorization;
  const method = request.method();
  if (!['GET', 'POST', 'PUT'].includes(method) || response.status() === 304)
    return;
  const key = `${method} ${url.pathname}${url.search}`;
  if (recorded.has(key)) return;
  const contentType = response.headers()['content-type'] ?? '';
  const entry = { status: response.status(), contentType };
  if (response.headers().etag) entry.etag = response.headers().etag;
  if (contentType.startsWith('image/')) images.push(key);
  else
    entry.text = (await response.body().catch(() => Buffer.alloc(0))).toString(
      'utf8',
    );
  recorded.set(key, entry);
});

const go = (path) =>
  page.evaluate((target) => {
    history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);

await page.goto(`${BASE}/?demo=true`);
await page.getByRole('button', { name: 'Als Lea beitreten' }).click();
await page.waitForURL('**/today');
await page.waitForTimeout(4000);

await go('/story');
await page.waitForTimeout(3000);
await page.getByRole('tab', { name: 'Tagebuch' }).click();
for (let i = 0; i < 40; i++) {
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(700);
}
for (let index = 0; index < 6; index++) {
  await go('/story');
  await page.waitForTimeout(1500);
  await page.getByRole('tab', { name: 'Tagebuch' }).click();
  await page.waitForTimeout(1500);
  const links = page.locator(
    'a[href^="/story/memories/"], a[href^="/story/heart-moments/"], a[href^="/story/milestones/"]',
  );
  if ((await links.count()) <= index) break;
  await links
    .nth(index)
    .click()
    .catch(() => {});
  await page.waitForTimeout(2500);
}
await go('/story');
await page.getByRole('tab', { name: 'Erinnerungen' }).click();
await page.waitForTimeout(2500);

await go('/story/our-story');
await page.waitForTimeout(3500);
const slider = page.getByRole('slider').first();
await slider.focus();
for (let i = 0; i < 24; i++) {
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(350);
}
await go('/today');
await page.waitForTimeout(2500);

let counter = 0;
for (const key of images) {
  const response = await ctx.request.get(BASE + key.slice(4), {
    headers: { authorization },
  });
  if (!response.ok()) continue;
  const file = `m${String(counter++).padStart(4, '0')}.jpg`;
  fs.writeFileSync(`${OUT}/media/${file}`, await response.body());
  Object.assign(recorded.get(key), { file, contentType: 'image/jpeg' });
}

// The sign-in answer carries the account but also tokens: keep the account only.
const signIn = recorded.get('POST /api/v1/auth/magic-link/consume');
const account = JSON.parse(signIn.text).account;
recorded.delete('POST /api/v1/auth/magic-link/consume');
const memberships = JSON.parse(
  recorded.get('GET /api/v1/auth/memberships').text,
);
fs.writeFileSync(
  `${OUT}/session.json`,
  JSON.stringify({ account, spaceId: memberships[0].spaceId }),
);
fs.writeFileSync(
  `${OUT}/api.json`,
  JSON.stringify(Object.fromEntries(recorded)),
);
console.log(
  `Recorded ${recorded.size} answers and ${counter} images. Shrink the photos before committing (see README.md).`,
);
await browser.close();

const http = require('http');
const fs = require('fs');
const path = require('path');
let chromium;
try {
  chromium = require('playwright').chromium;
} catch {
  try {
    chromium = require('../../../../web/e2e/node_modules/playwright').chromium;
  } catch {
    const fallback = require.resolve('playwright', {
      paths: [path.resolve(__dirname, '../../../../web/e2e/node_modules'), '/Users/philipp/Projekte/eimir/web/e2e/node_modules'],
    });
    chromium = require(fallback).chromium;
  }
}

const ROOT_DIR = path.resolve(__dirname, '../../../../');
const OUTPUT_DIR = path.resolve(__dirname, '../screenshots');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// MIME types map
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

// Simple HTTP server
const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/docs/design/eimir/previews/direction-a-today.html';
  
  const cleanPath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.resolve(ROOT_DIR, '.' + cleanPath);
  
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found: ' + reqPath);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

async function run() {
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`Local preview server listening on http://localhost:${port}`);

  const browser = await chromium.launch();

  const pagesToCapture = [
    {
      name: 'direction-a-today',
      url: `/docs/design/eimir/previews/direction-a-today.html`,
    },
    {
      name: 'direction-b-today',
      url: `/docs/design/eimir/previews/direction-b-today.html`,
    },
    {
      name: 'direction-a-story',
      url: `/docs/design/eimir/previews/direction-a-story.html`,
    },
    {
      name: 'direction-b-story',
      url: `/docs/design/eimir/previews/direction-b-story.html`,
    },
    {
      name: 'direction-a-create',
      url: `/docs/design/eimir/previews/direction-a-create.html`,
    },
    {
      name: 'direction-b-create',
      url: `/docs/design/eimir/previews/direction-b-create.html`,
    },
  ];

  for (const item of pagesToCapture) {
    // 1. Desktop View (1440x900) - Light Mode
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: 'light',
    });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto(`http://localhost:${port}${item.url}`, { waitUntil: 'networkidle' });
    const desktopOut = path.join(OUTPUT_DIR, `${item.name}-desktop.png`);
    await desktopPage.screenshot({ path: desktopOut, fullPage: true });
    console.log(`Captured: ${desktopOut}`);
    await desktopContext.close();

    // 2. Mobile View (390x844) - Light Mode
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: 'light',
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`http://localhost:${port}${item.url}`, { waitUntil: 'networkidle' });
    const mobileOut = path.join(OUTPUT_DIR, `${item.name}-mobile.png`);
    await mobilePage.screenshot({ path: mobileOut, fullPage: true });
    console.log(`Captured: ${mobileOut}`);
    await mobileContext.close();

    // 3. Desktop Dark Mode sanity check
    const darkContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
    });
    const darkPage = await darkContext.newPage();
    await darkPage.goto(`http://localhost:${port}${item.url}`, { waitUntil: 'networkidle' });
    await darkPage.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    const darkOut = path.join(OUTPUT_DIR, `${item.name}-desktop-dark.png`);
    await darkPage.screenshot({ path: darkOut, fullPage: true });
    console.log(`Captured: ${darkOut}`);
    await darkContext.close();

    // 4. Mobile Dark Mode
    const mobileDarkContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
    });
    const mobileDarkPage = await mobileDarkContext.newPage();
    await mobileDarkPage.goto(`http://localhost:${port}${item.url}`, { waitUntil: 'networkidle' });
    await mobileDarkPage.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    const mobileDarkOut = path.join(OUTPUT_DIR, `${item.name}-mobile-dark.png`);
    await mobileDarkPage.screenshot({ path: mobileDarkOut, fullPage: true });
    console.log(`Captured: ${mobileDarkOut}`);
    await mobileDarkContext.close();
  }

  await browser.close();
  server.close();
  console.log('All screenshots captured successfully!');
}

run().catch((err) => {
  console.error('Error during capture:', err);
  process.exit(1);
});

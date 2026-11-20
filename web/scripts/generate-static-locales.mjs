import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
// The notice compares the WebView with the same floor Capacitor enforces.
const capacitorConfig = await readFile(`${webRoot}capacitor.config.ts`, 'utf8');
const floorMatch = /minWebViewVersion:\s*(\d+)/.exec(capacitorConfig);
if (!floorMatch)
  throw new Error('capacitor.config.ts must set minWebViewVersion.');
const WEBVIEW_FLOOR = Number(floorMatch[1]);
const bundle = await rolldown({
  input: `${webRoot}src/i18n/resources.ts`,
  platform: 'node',
});
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const { localeRegistry } = await import(
  `data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`
);
const messages = Object.fromEntries(
  Object.entries(localeRegistry).map(([locale, pack]) => [
    locale,
    { ...pack.translation.offlinePage, direction: pack.direction },
  ]),
);
const generated =
  `// Generated from the bundled locale registry. Run npm run i18n:generate.\n` +
  `(() => {\n  const messages = ${JSON.stringify(messages)};\n` +
  `  const resolve = (value) => {\n    let tag = String(value || '').trim().toLowerCase().replaceAll('_', '-');\n    while (tag) {\n      const supported = Object.keys(messages).find((locale) => locale.toLowerCase() === tag);\n      if (supported) return supported;\n      tag = tag.slice(0, tag.lastIndexOf('-') < 0 ? 0 : tag.lastIndexOf('-'));\n    }\n    return null;\n  };\n` +
  `  let explicit;\n  try {\n    const stored = JSON.parse(sessionStorage.getItem('eimir-session-v1') || 'null');\n    if (stored?.account?.id && stored?.tokens?.refreshToken && new Date(stored.tokens.refreshExpiresAt).getTime() > Date.now() && stored.account.languagePreference && stored.account.languagePreference !== 'auto') explicit = resolve(stored.account.languagePreference) || 'de';\n  } catch {}\n` +
  `  const locale = explicit || (navigator.languages?.length ? navigator.languages : [navigator.language]).map(resolve).find(Boolean) || 'de';\n  document.documentElement.lang = locale;\n` +
  `  const copy = messages[locale];\n  document.documentElement.dir = copy.direction;\n  document.querySelector('h1').textContent = copy.title;\n  document.querySelector('[data-offline-description]').textContent = copy.body;\n  document.querySelector('main a').textContent = copy.retry;\n})();\n`;
// Capacitor loads public/webview-unsupported.html (server.errorPath) when the
// installed WebView is below android.minWebViewVersion, and also after a
// failed main-frame load. That page must run on the oldest WebViews, so this
// script is ES5: no arrow functions, block scoping, template literals,
// optional chaining or newer library methods (#1613).
const noticeMessages = Object.fromEntries(
  Object.entries(localeRegistry).map(([locale, pack]) => [
    locale,
    { ...pack.translation.webViewNotice, direction: pack.direction },
  ]),
);
const noticeGenerated =
  `// Generated from the bundled locale registry. Run npm run i18n:generate.\n` +
  `// ES5 only: this page must run on WebViews below the supported floor.\n` +
  `(function () {\n  var floor = ${WEBVIEW_FLOOR};\n  var messages = ${JSON.stringify(noticeMessages)};\n` +
  `  var explicit = null;\n  var stored, account, tokens, candidates, locale, index, version, outdated, copy, store, retry;\n` +
  `  function resolve(value) {\n    var tag = String(value || '').replace(/^\\s+|\\s+$/g, '').toLowerCase().split('_').join('-');\n    var key, cut;\n    while (tag) {\n      for (key in messages) {\n        if (Object.prototype.hasOwnProperty.call(messages, key) && key.toLowerCase() === tag) return key;\n      }\n      cut = tag.lastIndexOf('-');\n      tag = cut < 0 ? '' : tag.slice(0, cut);\n    }\n    return null;\n  }\n` +
  `  try {\n    stored = JSON.parse(window.sessionStorage.getItem('eimir-session-v1') || 'null');\n    account = stored && stored.account;\n    tokens = stored && stored.tokens;\n    if (account && account.id && tokens && tokens.refreshToken && new Date(tokens.refreshExpiresAt).getTime() > Date.now() && account.languagePreference && account.languagePreference !== 'auto') explicit = resolve(account.languagePreference) || 'de';\n  } catch (_error) {}\n` +
  `  candidates = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];\n  locale = explicit;\n  for (index = 0; !locale && index < candidates.length; index += 1) locale = resolve(candidates[index]);\n  locale = locale || 'de';\n` +
  `  version = /Chrome\\/(\\d+)/.exec(navigator.userAgent || '');\n  outdated = Boolean(version) && Number(version[1]) < floor;\n` +
  `  copy = messages[locale];\n  document.documentElement.lang = locale;\n  document.documentElement.dir = copy.direction;\n  document.documentElement.setAttribute('data-webview-notice', outdated ? 'outdated' : 'load-failed');\n` +
  `  document.querySelector('h1').textContent = outdated ? copy.outdatedTitle : copy.loadTitle;\n  document.querySelector('[data-notice-description]').textContent = outdated ? copy.outdatedBody : copy.loadBody;\n` +
  `  store = document.querySelector('[data-notice-store]');\n  retry = document.querySelector('[data-notice-retry]');\n  store.textContent = copy.outdatedAction;\n  retry.textContent = copy.retry;\n  store.hidden = !outdated;\n  retry.hidden = outdated;\n})();\n`;

async function emit(file, generated, label) {
  const path = `${webRoot}public/${file}`;
  const formatted = execFileSync(
    process.execPath,
    [
      `${webRoot}node_modules/@biomejs/biome/bin/biome`,
      'format',
      '--vcs-enabled=false',
      `--stdin-file-path=public/${file}`,
    ],
    { input: generated, encoding: 'utf8', cwd: webRoot },
  );
  if (process.argv.includes('--check')) {
    if ((await readFile(path, 'utf8')) !== formatted)
      throw new Error(
        'Static locale resources are stale. Run npm run i18n:generate.',
      );
    console.log(`Static ${label} resources match the bundled registry.`);
  } else {
    await writeFile(path, formatted);
    console.log(`Generated ${label} resources.`);
  }
}

await emit('offline-language.js', generated, 'offline language');
await emit('webview-unsupported.js', noticeGenerated, 'WebView notice');

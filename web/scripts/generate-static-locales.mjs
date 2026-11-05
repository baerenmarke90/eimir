import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
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
  `  let explicit;\n  try {\n    const stored = JSON.parse(sessionStorage.getItem('eimir-session-v1') || 'null');\n    if (stored?.account?.id && stored?.tokens?.refreshToken && stored.account.languagePreference && stored.account.languagePreference !== 'auto') explicit = resolve(stored.account.languagePreference) || 'de';\n  } catch {}\n` +
  `  const locale = explicit || (navigator.languages?.length ? navigator.languages : [navigator.language]).map(resolve).find(Boolean) || 'de';\n  document.documentElement.lang = locale;\n` +
  `  const copy = messages[locale];\n  document.documentElement.dir = copy.direction;\n  document.querySelector('h1').textContent = copy.title;\n  document.querySelector('[data-offline-description]').textContent = copy.body;\n  document.querySelector('main a').textContent = copy.retry;\n})();\n`;
const path = `${webRoot}public/offline-language.js`;
const formatted = execFileSync(
  process.execPath,
  [
    `${webRoot}node_modules/@biomejs/biome/bin/biome`,
    'format',
    '--stdin-file-path=public/offline-language.js',
  ],
  { input: generated, encoding: 'utf8', cwd: webRoot },
);
if (process.argv.includes('--check')) {
  if ((await readFile(path, 'utf8')) !== formatted)
    throw new Error(
      'Static locale resources are stale. Run npm run i18n:generate.',
    );
  console.log('Static locale resources match the bundled registry.');
} else {
  await writeFile(path, formatted);
  console.log('Generated offline language resources.');
}

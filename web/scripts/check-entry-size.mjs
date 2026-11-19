import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve(process.argv[2] ?? 'dist');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const paths = new Set();
for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
  const url = /\b(?:src|href)="(\/[^"]+\.(?:js|css))"/.exec(tag)?.[1];
  if (url) paths.add(url);
}
if (
  ![...paths].some((p) => p.endsWith('.js')) ||
  ![...paths].some((p) => p.endsWith('.css'))
) {
  throw new Error('The built entry must include JavaScript and CSS.');
}
let bytes = 0;
for (const path of paths)
  bytes += gzipSync(readFileSync(resolve(root, path.slice(1)))).length;
console.log(
  `HTML entry, including module preloads: ${bytes} gzip bytes in ${paths.size} files.`,
);
if (bytes >= 800_000) process.exitCode = 1;

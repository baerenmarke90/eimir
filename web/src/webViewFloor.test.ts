import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The supported WebView floor is set in three places (#1613, #1931): the Vite
// build target, Capacitor's minimum WebView version and the static notice
// page that Capacitor shows below it.
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('supported WebView floor', () => {
  const capacitor = read('../capacitor.config.ts');
  const vite = read('../vite.config.ts');
  const notice = read('../public/webview-unsupported.js');
  const floor = Number(/minWebViewVersion:\s*(\d+)/.exec(capacitor)?.[1]);

  it('is the same in the build target, Capacitor and the notice', () => {
    expect(floor).toBeGreaterThan(0);
    expect(vite).toContain(`'chrome${floor}'`);
    expect(notice).toContain(`var floor = ${floor};`);
    expect(capacitor).toMatch(/errorPath:\s*'webview-unsupported\.html'/);
  });

  it('keeps the notice script free of syntax newer than ES5', () => {
    const code = notice
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
      // Copy strings may contain any characters; inspect only the code.
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    for (const pattern of [
      /=>/,
      /\b(const|let|class|async|await|of)\s/,
      /`/,
      /\?\./,
      /\?\?/,
      /\.\.\./,
      /,\s*\)/,
      /\b(replaceAll|includes|startsWith|endsWith|padStart|fromEntries|hasOwn)\(/,
      /catch\s*\{/,
    ]) {
      expect(code).not.toMatch(pattern);
    }
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'DailyInsights.css'), 'utf8');

describe('Pro insights stylesheet contract', () => {
  it('runs every animation only when reduced motion is not requested', () => {
    const animated = css.match(/animation(-name)?\s*:/g) ?? [];
    expect(animated.length).toBeGreaterThan(0);
    const guardStart = css.indexOf(
      '@media (prefers-reduced-motion: no-preference)',
    );
    expect(guardStart).toBeGreaterThan(-1);
    const beforeGuard = css.slice(0, guardStart);
    expect(beforeGuard).not.toMatch(/animation(-name)?\s*:/);
  });

  it('keeps chart text on rem-based sizes so it reflows with large text', () => {
    const chartText = css.match(/font-size:\s*[\d.]+px/g) ?? [];
    expect(chartText).toEqual([]);
  });

  it('only fixes touch targets in pixels and never a chart or card width', () => {
    const fixedWidths = [...css.matchAll(/(?<![-\w])width:\s*(\d+)px/g)].map(
      (match) => Number(match[1]),
    );
    // 44 CSS px is the product touch-target size; nothing wider is allowed.
    expect(Math.max(0, ...fixedWidths)).toBeLessThanOrEqual(44);
    expect(css).not.toMatch(/min-width:\s*\d{3,}px/);
  });

  it('defines both dark-theme paths for the person palette', () => {
    expect(css).toContain(':root[data-theme="dark"] .daily-insights');
    expect(css).toContain(':root:not([data-theme]) .daily-insights');
  });
});

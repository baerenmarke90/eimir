// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DailyVibe } from '../api/generated/models/DailyVibe';
import { DailyVibeIcon } from './DailyVibeIcon';

const vibes = Object.values(DailyVibe);

function renderIcon(value: DailyVibe) {
  const { container } = render(<DailyVibeIcon value={value} />);
  const svg = container.querySelector('svg');
  if (!svg) throw new Error(`no glyph for ${value}`);
  return svg;
}

afterEach(cleanup);

describe('DailyVibeIcon', () => {
  it('draws a face for every vibe, including the two needs vibes', () => {
    expect(vibes).toHaveLength(7);
    for (const value of vibes) {
      const svg = renderIcon(value);
      expect(svg.getAttribute('data-vibe-icon')).toBe(value);
      expect(svg.querySelectorAll('path, circle').length).toBeGreaterThan(1);
      cleanup();
    }
  });

  it('gives every vibe a distinct drawing', () => {
    const drawings = new Set(
      vibes.map((value) => {
        const markup = renderIcon(value).innerHTML;
        cleanup();
        return markup;
      }),
    );
    expect(drawings.size).toBe(vibes.length);
  });

  it('has distinct compact expressions while retaining the detailed drawings', () => {
    const drawings = new Set<string>();
    for (const value of vibes) {
      const detailed = renderIcon(value).innerHTML;
      cleanup();
      const { container } = render(<DailyVibeIcon value={value} compact />);
      const svg = container.querySelector('svg');
      if (!svg) throw new Error(`no compact glyph for ${value}`);
      expect(svg.classList.contains('eimir-icon-compact')).toBe(true);
      expect(svg.innerHTML).not.toBe(detailed);
      drawings.add(svg.innerHTML);
      cleanup();
    }
    expect(drawings.size).toBe(vibes.length);
  });

  it('follows the shared icon contract and stays decorative', () => {
    for (const value of vibes) {
      const svg = renderIcon(value);
      expect(svg.classList.contains('eimir-icon')).toBe(true);
      expect(svg.classList.contains('daily-vibe-icon')).toBe(true);
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.getAttribute('stroke-width')).toBe('1.65');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
      cleanup();
    }
  });

  it('colors accents only through identity tokens', () => {
    for (const value of vibes) {
      const svg = renderIcon(value);
      for (const element of svg.querySelectorAll('[fill]')) {
        const fill = element.getAttribute('fill');
        expect(
          fill === 'none' ||
            fill === 'currentColor' ||
            fill?.startsWith('var(--identity-icon-'),
        ).toBe(true);
      }
      cleanup();
    }
  });

  it('keeps a caller class next to the shared classes', () => {
    const svg = renderIcon(DailyVibe.GOOD);
    expect(svg.getAttribute('class')).toBe('eimir-icon daily-vibe-icon');
    cleanup();
    const { container } = render(
      <DailyVibeIcon value={DailyVibe.SAD} className="badge-glyph" />,
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toBe(
      'eimir-icon daily-vibe-icon badge-glyph',
    );
  });
});

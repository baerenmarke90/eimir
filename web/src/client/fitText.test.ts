// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { fitTextInto, shortenAtWord } from './fitText';

/**
 * jsdom has no layout: the box measures its text with a simple model (one
 * line per `charsPerLine` characters at 16px, lines of 1.2 x the font size,
 * scaled with the font size), which is enough to drive the fitting steps.
 */
function fixture({
  height,
  width = 100,
  charsPerLine = 20,
  longestWordFits = true,
}: {
  height: number;
  width?: number;
  charsPerLine?: number;
  longestWordFits?: boolean;
}) {
  const box = document.createElement('span');
  const text = document.createElement('span');
  box.append(text);
  document.body.append(box);
  const size = () => Number.parseFloat(text.style.fontSize) || 16;
  const lines = () => {
    const perLine = Math.max(1, Math.floor((charsPerLine * 16) / size()));
    return Math.ceil((text.textContent ?? '').length / perLine);
  };
  Object.defineProperties(box, {
    clientHeight: { get: () => height },
    scrollHeight: { get: () => Math.ceil(lines() * size() * 1.2) },
    clientWidth: { get: () => width },
    scrollWidth: { get: () => width },
  });
  Object.defineProperties(text, {
    clientWidth: { get: () => width },
    scrollWidth: {
      get: () =>
        longestWordFits || text.style.overflowWrap === 'break-word'
          ? width
          : width + 40,
    },
  });
  return { box, text };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('fitTextInto', () => {
  it('leaves a text that fits at its own size', () => {
    const { box, text } = fixture({ height: 100 });
    expect(fitTextInto(box, text, 'Kurz', 10)).toBe('fits');
    expect(text.textContent).toBe('Kurz');
    expect(text.style.fontSize).toBe('');
    expect(text.hasAttribute('aria-label')).toBe(false);
  });

  it('shrinks a longer text, but not below the minimum', () => {
    const { box, text } = fixture({ height: 30 });
    const copy = 'An evening at the lake with the two of you';
    expect(fitTextInto(box, text, copy, 10)).toBe('shrunk');
    const size = Number.parseFloat(text.style.fontSize);
    expect(size).toBeLessThan(16);
    expect(size).toBeGreaterThanOrEqual(10);
    expect(text.textContent).toBe(copy);
  });

  it('lets a long word wrap before it shortens anything', () => {
    const { box, text } = fixture({ height: 100, longestWordFits: false });
    expect(fitTextInto(box, text, 'Donaudampfschifffahrt', 12)).toBe('wrapped');
    expect(text.style.overflowWrap).toBe('break-word');
  });

  it('shortens at a word boundary and keeps the full text accessible', () => {
    const { box, text } = fixture({ height: 20 });
    const copy = 'We set off in the morning and only came back late at night.';
    expect(fitTextInto(box, text, copy, 14)).toBe('shortened');
    expect(text.textContent?.endsWith(' …')).toBe(true);
    expect(copy.startsWith((text.textContent ?? '').slice(0, -2))).toBe(true);
    expect(text.getAttribute('aria-label')).toBe(copy);
  });

  it('writes the plain text into a box without layout', () => {
    const { box, text } = fixture({ height: 0 });
    expect(fitTextInto(box, text, 'Later', 10)).toBe('skipped');
    expect(text.textContent).toBe('Later');
  });
});

describe('shortenAtWord', () => {
  it('drops trailing punctuation before the ellipsis', () => {
    expect(shortenAtWord(['Eins,', 'zwei', 'drei'], 1)).toBe('Eins …');
    expect(shortenAtWord(['Eins', 'zwei –', 'drei'], 2)).toBe('Eins zwei …');
  });
});

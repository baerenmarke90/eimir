import { describe, expect, it } from 'vitest';
import { textExcerpt } from './textExcerpt';

describe('Planning overview excerpts', () => {
  it('bounds lengthy descriptions for visual and assistive readers', () => {
    const original = 'A long plan. '.repeat(100);
    expect(textExcerpt(original).length).toBeLessThanOrEqual(181);
    expect(textExcerpt(original).endsWith('…')).toBe(true);
    expect(original.length).toBe(1300);
  });
  it('normalizes line breaks without truncating a short description', () => {
    expect(textExcerpt('  Walk\n\nby the\tsea  ')).toBe('Walk by the sea');
    expect(textExcerpt('')).toBe('');
  });
  it('keeps combined emoji and graphemes intact at the truncation boundary', () => {
    expect(textExcerpt('👩🏽‍❤️‍👩🏻'.repeat(4), 2)).toBe('👩🏽‍❤️‍👩🏻👩🏽‍❤️‍👩🏻…');
  });
});

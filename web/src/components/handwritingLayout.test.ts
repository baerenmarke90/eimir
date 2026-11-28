import { describe, expect, it } from 'vitest';
import {
  HANDWRITING_MAX_CHARACTERS,
  layoutHandwriting,
} from './handwritingLayout';

describe('layoutHandwriting (#2372)', () => {
  it('writes a short message as pen strokes in pen order', () => {
    const layout = layoutHandwriting('Thinking of you tonight, my love.', 6000);
    expect(layout).not.toBeNull();
    let expected = 0;
    for (const stroke of layout?.strokes ?? []) {
      expect(stroke.start).toBeCloseTo(expected, 6);
      expect(stroke.share).toBeGreaterThan(0);
      expect(stroke.d.startsWith('M')).toBe(true);
      expected += stroke.share;
    }
    expect(expected).toBeCloseTo(1, 6);
    expect(layout?.length).toBeGreaterThan(0);
  });

  it('wraps words to the available width and keeps explicit line breaks', () => {
    const wide = layoutHandwriting('Thinking of you tonight, my love.', 20_000);
    const narrow = layoutHandwriting('Thinking of you tonight, my love.', 3000);
    const lines = layoutHandwriting('See\nyou', 20_000);
    const oneLine = layoutHandwriting('See you', 20_000);
    expect(narrow?.height).toBeGreaterThan(wide?.height ?? 0);
    // Flourishes and the padding reach a little past the wrap width.
    expect(narrow?.width).toBeLessThanOrEqual(3000 + 400);
    expect(lines?.height).toBeGreaterThan(oneLine?.height ?? 0);
  });

  it('writes umlauts and replaces quote marks and ellipses the font lacks', () => {
    expect(
      layoutHandwriting('Crème brûlée in Zürich, naïve as ever', 6000),
    ).not.toBeNull();
    expect(
      layoutHandwriting('„See you soon…“ – with love', 6000),
    ).not.toBeNull();
  });

  it('keeps the normal type for emoji, other scripts and long messages', () => {
    expect(layoutHandwriting('Love you ❤️', 6000)).toBeNull();
    expect(layoutHandwriting('Привет', 6000)).toBeNull();
    expect(
      layoutHandwriting('a'.repeat(HANDWRITING_MAX_CHARACTERS + 1), 6000),
    ).toBeNull();
    expect(layoutHandwriting('   ', 6000)).toBeNull();
  });
});

export interface GraphemeSplit {
  first: string;
  rest: string;
}

/**
 * Splits off the first user-perceived character (grapheme cluster) of a
 * string, e.g. for a drop cap. Never uses a raw `text[0]`/UTF-16 index
 * split, which would break a surrogate pair, combining mark, or ZWJ emoji
 * sequence at the start of the text.
 */
export function splitFirstGrapheme(text: string): GraphemeSplit {
  if (!text) return { first: '', rest: '' };

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segments = new Intl.Segmenter(undefined, {
      granularity: 'grapheme',
    }).segment(text);
    const firstSegment = segments[Symbol.iterator]().next();
    if (!firstSegment.done) {
      const { segment } = firstSegment.value;
      return { first: segment, rest: text.slice(segment.length) };
    }
  }

  // Graceful fallback where Intl.Segmenter is unavailable: string iteration
  // (unlike a raw index) is code-point aware, so it still keeps a surrogate
  // pair (e.g. most emoji) intact, though not combining marks or ZWJ
  // sequences.
  const [first = ''] = text;
  return { first, rest: text.slice(first.length) };
}

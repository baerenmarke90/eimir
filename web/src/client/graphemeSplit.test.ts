import { describe, expect, it } from 'vitest';
import { splitFirstGrapheme } from './graphemeSplit';

describe('splitFirstGrapheme', () => {
  it('splits a plain ASCII first letter from the rest', () => {
    expect(splitFirstGrapheme('Samstagmorgen war ruhig.')).toEqual({
      first: 'S',
      rest: 'amstagmorgen war ruhig.',
    });
  });

  it('splits a German umlaut/eszett-containing first letter correctly', () => {
    expect(splitFirstGrapheme('Über den Dächern.')).toEqual({
      first: 'Ü',
      rest: 'ber den Dächern.',
    });
  });

  it('keeps a surrogate-pair emoji intact as the first grapheme', () => {
    // U+1F600 GRINNING FACE is a surrogate pair in UTF-16.
    expect(splitFirstGrapheme('😀 war der Tag.')).toEqual({
      first: '😀',
      rest: ' war der Tag.',
    });
  });

  it('keeps a base letter plus combining mark as one grapheme', () => {
    // "S" (U+0053) followed by COMBINING ACUTE ACCENT (U+0301): two code
    // points that render as one glyph. A naive code-point split (the
    // fallback path) would tear the accent off into `rest`; Intl.Segmenter
    // keeps them together as a single grapheme.
    const sWithCombiningAccent = `S${String.fromCharCode(0x0301)}`;
    const combining = `${sWithCombiningAccent}amstag`;
    expect(splitFirstGrapheme(combining)).toEqual({
      first: sWithCombiningAccent,
      rest: 'amstag',
    });
  });

  it('keeps a ZWJ emoji sequence intact as one grapheme', () => {
    // Family emoji built from four code points joined by ZWJ.
    const family = '👨‍👩‍👧‍👦 im Park.';
    expect(splitFirstGrapheme(family)).toEqual({
      first: '👨‍👩‍👧‍👦',
      rest: ' im Park.',
    });
  });

  it('returns empty strings for empty input', () => {
    expect(splitFirstGrapheme('')).toEqual({ first: '', rest: '' });
  });

  it('handles a single-character string', () => {
    expect(splitFirstGrapheme('A')).toEqual({ first: 'A', rest: '' });
  });
});

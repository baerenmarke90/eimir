import { describe, expect, it } from 'vitest';
import { entry } from './__fixtures__/stories';
import { keyHash } from './model';
import {
  BONUS_KIND,
  bonusFor,
  CLEARED_ALPHA,
  COIN_REVEAL,
  cardFit,
  clearedShare,
  coinSymbols,
  HEART_D,
  HEART_REVEAL,
  heartPathIn,
  isRevealed,
  sampleOffsets,
  shorten,
  ticketSerial,
  tripleOf,
} from './scratchTicket';

/** Builds RGBA data whose alpha is `alpha` at every pixel. */
function rgba(width: number, height: number, alpha: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 3; index < data.length; index += 4) data[index] = alpha;
  return data;
}

/** A hash whose coins come out as a triple (or as mixed coins). */
function hashWhere(triple: boolean): number {
  for (let hash = 1; hash < 1_000_000; hash += 7919)
    if ((tripleOf(coinSymbols(hash)) !== null) === triple) return hash;
  throw new Error('no hash found');
}

describe('the Rubbellos reveal threshold', () => {
  it('samples only the points inside the shape, as alpha offsets', () => {
    const all = sampleOffsets(10, 10, 5, () => true);
    expect(all).toHaveLength(25);
    // The first sample sits at (1, 1): the alpha byte of that pixel.
    expect(all[0]).toBe((1 * 10 + 1) * 4 + 3);
    const left = sampleOffsets(10, 10, 5, (x) => x < 5);
    expect(left).toHaveLength(10);
  });

  it('counts a sample as scratched only below the cleared alpha', () => {
    const offsets = sampleOffsets(4, 4, 4, () => true);
    expect(clearedShare(rgba(4, 4, 255), offsets)).toBe(0);
    expect(clearedShare(rgba(4, 4, CLEARED_ALPHA - 1), offsets)).toBe(1);
    expect(clearedShare(rgba(4, 4, CLEARED_ALPHA), offsets)).toBe(0);
    const half = rgba(4, 4, 255);
    for (let index = 0; index < offsets.length / 2; index += 1)
      half[offsets[index]] = 0;
    expect(clearedShare(half, offsets)).toBe(0.5);
    // Without samples (no layout yet) nothing is ever revealed.
    expect(clearedShare(half, [])).toBe(0);
  });

  it('dissolves the heart at 55 % and a coin at 45 %', () => {
    expect(isRevealed(0.54, HEART_REVEAL)).toBe(false);
    expect(isRevealed(0.55, HEART_REVEAL)).toBe(true);
    expect(isRevealed(0.44, COIN_REVEAL)).toBe(false);
    expect(isRevealed(0.45, COIN_REVEAL)).toBe(true);
  });
});

describe('the Rubbellos bonus coins', () => {
  it('derives three symbols from the hash, as a triple or mixed', () => {
    const triple = hashWhere(true);
    const symbols = coinSymbols(triple);
    expect(symbols).toHaveLength(3);
    expect(new Set(symbols).size).toBe(1);
    expect(tripleOf(symbols)).toBe(symbols[0]);
    expect(coinSymbols(triple)).toEqual(symbols);
    expect(tripleOf(['heart', 'kiss', 'heart'])).toBeNull();
    const mixed = coinSymbols(hashWhere(false));
    expect(mixed).toHaveLength(3);
    expect(tripleOf(mixed)).toBeNull();
  });

  it('brings an extra memory of the matching kind when there is one', () => {
    const won = entry('won', { kind: 'photo' });
    const heart = entry('heart', { kind: 'heart' });
    const photo = entry('photo', { kind: 'photo' });
    const milestone = entry('milestone', { kind: 'milestone' });
    const pool = [won, heart, photo, milestone];
    expect(BONUS_KIND).toEqual({
      heart: 'heart',
      kiss: 'photo',
      star: 'milestone',
    });
    expect(bonusFor(pool, won, 'heart', 123)).toBe(heart);
    // Never the memory that was just won.
    expect(bonusFor(pool, won, 'kiss', 123)).toBe(photo);
    expect(bonusFor(pool, won, 'star', 123)).toBe(milestone);
  });

  it('falls back to any other memory, or to none on a roll of one', () => {
    const won = entry('won', { kind: 'words' });
    const other = entry('other', { kind: 'words' });
    expect(bonusFor([won, other], won, 'star', 5)).toBe(other);
    expect(bonusFor([won], won, 'heart', 5)).toBeNull();
  });
});

describe('the Rubbellos ticket texts', () => {
  it('shortens at a word boundary without trailing punctuation', () => {
    expect(shorten('  A   short  title ', 40)).toBe('A short title');
    expect(shorten('An evening by the lake, with friends', 26)).toBe(
      'An evening by the lake…',
    );
    expect(shorten('Supercalifragilistic', 10)).toBe('Supercali…');
  });

  it('picks the handwriting size by length and shortens to the room', () => {
    expect(cardFit({ kind: 'heart', title: 'Thank you' }).size).toBe('short');
    expect(
      cardFit({ kind: 'milestone', title: 'We moved into our first flat' })
        .size,
    ).toBe('medium');
    const long = 'word '.repeat(30);
    expect(cardFit({ kind: 'heart', title: long }).text.length).toBeLessThan(
      56,
    );
    expect(cardFit({ kind: 'words', title: long }).text.length).toBeLessThan(
      70,
    );
    expect(cardFit({ kind: 'words', title: long }).size).toBe('long');
  });

  it('prints a stable four-digit serial per memory', () => {
    expect(ticketSerial('memory-1')).toMatch(/^\d{4}$/u);
    expect(ticketSerial('memory-1')).toBe(ticketSerial('memory-1'));
    expect(Number(ticketSerial('memory-1'))).toBe(keyHash('memory-1') % 10000);
  });

  it('draws the heart in its box and scaled into another', () => {
    expect(HEART_D.startsWith('M0.5 0.97 C')).toBe(true);
    expect(HEART_D.endsWith('Z')).toBe(true);
    expect(heartPathIn(0, 0, 100, 100).startsWith('M50.00 97.00 C')).toBe(true);
  });
});

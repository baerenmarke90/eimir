import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PERSON_COLOUR_PAIRS, personColourPair } from './client/personColours';

interface Tone {
  accent: string;
  surface: string;
}
interface Tokens {
  identity: {
    colorWorlds: Record<
      string,
      Record<'light' | 'dark', { text: string; page: string; surface: string }>
    >;
    personColors: {
      defaultPair: { own: string; partner: string };
      tones: Record<string, Record<'light' | 'dark', Tone>>;
    };
  };
}

const tokens = JSON.parse(
  readFileSync(new URL('../../design/tokens.json', import.meta.url), 'utf8'),
) as Tokens;
const { tones, defaultPair } = tokens.identity.personColors;
const modes = ['light', 'dark'] as const;

function channel(value: number) {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) =>
    channel(Number.parseInt(hex.slice(i, i + 2), 16)),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe('person colours (Product Owner decision 2026-11-16)', () => {
  it('offers exactly the tones the colour pairs use', () => {
    const used = new Set(
      PERSON_COLOUR_PAIRS.flatMap((id) => {
        const pair = personColourPair(id);
        return [pair.own, pair.partner];
      }),
    );
    expect([...used].sort()).toEqual(Object.keys(tones).sort());
  });

  it('keeps the default pair as the blue and rose people already know', () => {
    expect(defaultPair).toEqual({ own: 'blue', partner: 'rose' });
  });

  for (const mode of modes) {
    const identity = tokens.identity.colorWorlds.original[mode];
    describe(`${mode} theme`, () => {
      for (const [name, tone] of Object.entries(tones)) {
        it(`${name}: initials are readable on the marker fill (4.5:1)`, () => {
          expect(
            contrast(identity.text, tone[mode].surface),
          ).toBeGreaterThanOrEqual(4.5);
        });
        it(`${name}: the accent is visible on the surface and the page (3:1)`, () => {
          expect(
            contrast(tone[mode].accent, identity.surface),
          ).toBeGreaterThanOrEqual(3);
          expect(
            contrast(tone[mode].accent, identity.page),
          ).toBeGreaterThanOrEqual(3);
        });
      }

      it('keeps the two colours of every pair clearly apart by lightness', () => {
        for (const id of PERSON_COLOUR_PAIRS) {
          const pair = personColourPair(id);
          expect(pair.own).not.toBe(pair.partner);
          const own = tones[pair.own][mode].accent;
          const partner = tones[pair.partner][mode].accent;
          const sameFamily =
            pair.own.replace('deep', '') === pair.partner.replace('deep', '');
          if (sameFamily)
            expect(contrast(own, partner)).toBeGreaterThanOrEqual(2);
        }
      });
    });
  }
});

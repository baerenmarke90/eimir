import { describe, expect, it } from 'vitest';
import type { RediscoveryContext } from '../api/generated/models/RediscoveryContext';
import { i18n } from '../i18n';
import {
  availableVariants,
  phraseVariant,
  type RediscoverySource,
  type RediscoveryVariant,
  rediscoveryWording,
  relativeTimeLine,
  selectVariant,
} from './rediscoverySelection';

const de = i18n.getFixedT('de');
const en = i18n.getFixedT('en');

const richContext: RediscoveryContext = {
  placeName: 'Phoenix-See',
  chapterTitle: 'Sommerurlaub',
  tag: 'Sonnenuntergang',
  excerpt: 'Wir sind einfach losgefahren',
  excerptTruncated: true,
  photoCount: 12,
  videoCount: 0,
  partOfDay: 'AFTERNOON',
};

function source(overrides: Partial<RediscoverySource> = {}): RediscoverySource {
  return {
    cardKey: 'MEMORY:01a1d43b-0d24',
    // 2025-11-16 was a Sunday.
    day: '2025-11-16',
    authoredHeadline: '',
    context: richContext,
    ...overrides,
  };
}

function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

describe('rediscovery variant selection', () => {
  it('is deterministic for one day and card', () => {
    const available = availableVariants(source(), { today: '2026-11-13' });
    const first = selectVariant(available, 'MEMORY:a', '2026-11-13');
    for (let index = 0; index < 5; index += 1) {
      expect(selectVariant(available, 'MEMORY:a', '2026-11-13')).toBe(first);
    }
    const wording = () =>
      rediscoveryWording(source(), { today: '2026-11-13' }, de, 'de');
    expect(wording()).toEqual(wording());
  });

  it('never repeats the previous day for the same card and visits every variant', () => {
    for (const cardKey of ['MEMORY:a', 'HEART_MOMENT:b', 'MILESTONE:c']) {
      const available = availableVariants(source({ cardKey }), {
        today: '2026-11-13',
      });
      const seen = new Set<RediscoveryVariant | null>();
      let previous: RediscoveryVariant | null = null;
      for (let offset = 0; offset < 40; offset += 1) {
        const today = addDays('2026-11-13', offset);
        const chosen = selectVariant(available, cardKey, today);
        expect(chosen).not.toBe(previous);
        seen.add(chosen);
        previous = chosen;
      }
      expect(seen).toEqual(new Set(available));
    }
  });

  it('also avoids yesterday across a month and year boundary', () => {
    const available = availableVariants(source(), { today: '2026-12-31' });
    expect(selectVariant(available, 'MEMORY:x', '2026-12-31')).not.toBe(
      selectVariant(available, 'MEMORY:x', '2027-01-01'),
    );
  });

  it('falls back to relative time when no other variant remains', () => {
    const wording = rediscoveryWording(
      source(),
      {
        today: '2026-11-16',
        exclude: [
          'place',
          'excerpt',
          'relativeTime',
          'weekday',
          'season',
          'chapter',
          'tag',
          'mediaCount',
        ],
      },
      de,
      'de',
    );
    expect(wording.variant).toBe('relativeTime');
    expect(wording.headline).toBe('Heute vor einem Jahr');
  });

  it('honours an exclusion such as an "on this day" kicker', () => {
    const available = availableVariants(source(), {
      today: '2026-11-16',
      exclude: ['relativeTime'],
    });
    expect(available).not.toContain('relativeTime');
  });
});

describe('rediscovery privacy filtering', () => {
  it('offers only date-derived variants without a viewer-safe context', () => {
    // The server omits the context for owner-only sources.
    expect(
      availableVariants(source({ context: null }), { today: '2026-11-13' }),
    ).toEqual(['relativeTime', 'weekday', 'season']);
  });

  it('ignores blank facts and single media items', () => {
    expect(
      availableVariants(
        source({
          context: {
            placeName: '  ',
            chapterTitle: '',
            tag: null,
            excerpt: ' ',
            photoCount: 1,
            videoCount: 0,
          },
        }),
        { today: '2026-11-13' },
      ),
    ).toEqual(['relativeTime', 'weekday', 'season']);
  });

  it('never phrases a part of day the server did not provide', () => {
    expect(
      phraseVariant(
        'weekday',
        source({ context: { ...richContext, partOfDay: null } }),
        de,
        'de',
        '2026-11-13',
      ),
    ).toBe('Ein Sonntag');
  });
});

describe('rediscovery headline rules', () => {
  it('keeps an authored title as the headline and varies the secondary line', () => {
    const wording = rediscoveryWording(
      source({ authoredHeadline: 'Dieser Tag am See' }),
      { today: '2026-11-13' },
      de,
      'de',
    );
    expect(wording.headline).toBe('Dieser Tag am See');
    expect(wording.headlineIsVariant).toBe(false);
    expect(wording.variantLine).toBeTruthy();
  });

  it('turns a variant into the headline for an untitled entry', () => {
    const wording = rediscoveryWording(
      source({ authoredHeadline: '   ' }),
      { today: '2026-11-13' },
      de,
      'de',
    );
    expect(wording.headlineIsVariant).toBe(true);
    expect(wording.variantLine).toBeNull();
    expect(wording.variant).not.toBeNull();
    expect(wording.headline).toBe(
      phraseVariant(
        wording.variant as RediscoveryVariant,
        source(),
        de,
        'de',
        '2026-11-13',
      ),
    );
  });
});

describe('rediscovery phrasing', () => {
  const phrase = (variant: RediscoveryVariant, t = de, locale = 'de') =>
    phraseVariant(variant, source(), t, locale, '2026-11-13');

  it('phrases every variant in German', () => {
    expect(phrase('place')).toBe('Phoenix-See');
    expect(phrase('excerpt')).toBe('„Wir sind einfach losgefahren …“');
    expect(phrase('weekday')).toBe('Ein Sonntagnachmittag');
    expect(phrase('season')).toBe('Herbst 2025');
    expect(phrase('chapter')).toBe('Aus „Sommerurlaub“');
    expect(phrase('tag')).toBe('Unter „Sonnenuntergang“');
    expect(phrase('mediaCount')).toBe('12 Fotos von diesem Tag');
  });

  it('phrases every variant in English', () => {
    expect(phrase('weekday', en, 'en')).toBe('A Sunday afternoon');
    expect(phrase('season', en, 'en')).toBe('Autumn 2025');
    expect(phrase('mediaCount', en, 'en')).toBe('12 photos from this day');
    expect(phrase('chapter', en, 'en')).toBe('From “Sommerurlaub”');
  });

  it('starts a generated English line with a capital', () => {
    expect(
      phraseVariant(
        'relativeTime',
        source({ day: '2026-10-23' }),
        en,
        'en',
        '2026-11-13',
      ),
    ).toBe('Three weeks ago today');
  });

  it('pluralizes media and mixes photos with videos', () => {
    const media = (photoCount: number, videoCount: number) =>
      phraseVariant(
        'mediaCount',
        source({ context: { ...richContext, photoCount, videoCount } }),
        de,
        'de',
        '2026-11-13',
      );
    expect(media(3, 0)).toBe('3 Fotos von diesem Tag');
    expect(media(0, 2)).toBe('2 Videos von diesem Tag');
    expect(media(4, 1)).toBe('5 Fotos und Videos von diesem Tag');
  });

  it('phrases relative time exactly when the day matches', () => {
    expect(relativeTimeLine(de, '2025-11-13', '2026-11-13')).toBe(
      'Heute vor einem Jahr',
    );
    expect(relativeTimeLine(de, '2023-11-13', '2026-11-13')).toBe(
      'Heute vor drei Jahren',
    );
    expect(relativeTimeLine(de, '2026-10-23', '2026-11-13')).toBe(
      'Heute vor drei Wochen',
    );
    expect(relativeTimeLine(de, '2026-10-20', '2026-11-13')).toBe(
      'Vor drei Wochen',
    );
    expect(relativeTimeLine(de, '2026-08-13', '2026-11-13')).toBe(
      'Heute vor drei Monaten',
    );
    expect(relativeTimeLine(de, '2024-02-01', '2026-11-13')).toBe(
      'Vor zwei Jahren',
    );
    expect(relativeTimeLine(de, '2026-11-12', '2026-11-13')).toBe('Gestern');
    expect(relativeTimeLine(en, '2025-11-13', '2026-11-13')).toBe(
      'One year ago today',
    );
    expect(relativeTimeLine(en, '2010-11-13', '2026-11-13')).toBe(
      '16 years ago today',
    );
  });
});

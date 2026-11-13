import { describe, expect, it } from 'vitest';
import type { RediscoveryContext } from '../api/generated/models/RediscoveryContext';
import { i18n } from '../i18n';
import copy from '../i18n/locales/rediscovery';
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
  placeName: 'Lake Phoenix',
  chapterTitle: 'Summer holiday',
  tag: 'Sunset',
  excerpt: 'We just drove off',
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

/** Fill a German template from the locale module, as i18next would. */
function fill(template: string, values: Record<string, string | number> = {}) {
  return template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) =>
    String(values[key]),
  );
}

const sundayDe = new Intl.DateTimeFormat('de', {
  weekday: 'long',
  timeZone: 'UTC',
}).format(new Date(Date.UTC(2025, 10, 16)));

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
      en,
      'en',
    );
    expect(wording.variant).toBe('relativeTime');
    expect(wording.headline).toBe('One year ago today');
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
    ).toBe(fill(copy.weekday.plain, { weekday: sundayDe }));
  });
});

describe('rediscovery headline rules', () => {
  it('keeps an authored title as the headline and varies the secondary line', () => {
    const wording = rediscoveryWording(
      source({ authoredHeadline: 'That day by the lake' }),
      { today: '2026-11-13' },
      de,
      'de',
    );
    expect(wording.headline).toBe('That day by the lake');
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

  it('phrases every variant through the German locale templates', () => {
    expect(phrase('place')).toBe('Lake Phoenix');
    expect(phrase('excerpt')).toBe(
      fill(copy.excerptTruncated, { text: 'We just drove off' }),
    );
    expect(phrase('weekday')).toBe(
      fill(copy.weekday.AFTERNOON, { weekday: sundayDe }),
    );
    expect(phrase('season')).toBe(
      fill(copy.season.line, { season: copy.season.autumn, year: 2025 }),
    );
    expect(phrase('chapter')).toBe(
      fill(copy.chapter, { chapter: 'Summer holiday' }),
    );
    expect(phrase('tag')).toBe(fill(copy.tag, { tag: 'Sunset' }));
    expect(phrase('mediaCount')).toBe(
      fill(copy.media.photos_other, { count: 12 }),
    );
  });

  it('phrases every variant in English', () => {
    expect(phrase('weekday', en, 'en')).toBe('A Sunday afternoon');
    expect(phrase('season', en, 'en')).toBe('Autumn 2025');
    expect(phrase('mediaCount', en, 'en')).toBe('12 photos from this day');
    expect(phrase('chapter', en, 'en')).toBe('From “Summer holiday”');
    expect(phrase('tag', en, 'en')).toBe('Tagged “Sunset”');
    expect(phrase('excerpt', en, 'en')).toBe('“We just drove off …”');
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
        en,
        'en',
        '2026-11-13',
      );
    expect(media(3, 0)).toBe('3 photos from this day');
    expect(media(0, 2)).toBe('2 videos from this day');
    expect(media(4, 1)).toBe('5 photos and videos from this day');
  });

  it('phrases relative time exactly when the day matches', () => {
    const three = copy.numberWords[3];
    expect(relativeTimeLine(de, '2025-11-13', '2026-11-13')).toBe(
      copy.relative.yearsExact_one,
    );
    expect(relativeTimeLine(de, '2023-11-13', '2026-11-13')).toBe(
      fill(copy.relative.yearsExact_other, { countText: three }),
    );
    expect(relativeTimeLine(de, '2026-10-23', '2026-11-13')).toBe(
      fill(copy.relative.weeksExact_other, { countText: three }),
    );
    expect(relativeTimeLine(de, '2026-10-20', '2026-11-13')).toBe(
      fill(copy.relative.weeks_other, { countText: three }),
    );
    expect(relativeTimeLine(de, '2026-08-13', '2026-11-13')).toBe(
      fill(copy.relative.monthsExact_other, { countText: three }),
    );
    expect(relativeTimeLine(de, '2024-02-01', '2026-11-13')).toBe(
      fill(copy.relative.years_other, { countText: copy.numberWords[2] }),
    );
    expect(relativeTimeLine(de, '2026-11-12', '2026-11-13')).toBe(
      copy.relative.yesterday,
    );
    expect(relativeTimeLine(en, '2025-11-13', '2026-11-13')).toBe(
      'One year ago today',
    );
    expect(relativeTimeLine(en, '2026-10-20', '2026-11-13')).toBe(
      'three weeks ago',
    );
    expect(relativeTimeLine(en, '2010-11-13', '2026-11-13')).toBe(
      '16 years ago today',
    );
  });
});

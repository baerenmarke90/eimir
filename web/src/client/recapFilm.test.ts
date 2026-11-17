import { describe, expect, it } from 'vitest';
import { RecapViewFromJSON } from '../api/generated/models/RecapView';
import {
  FILM_INLINE_ANSWER_CHARS,
  type FilmScene,
  filmChapters,
  filmExcerpt,
  isFallbackTitle,
  recapFilmScenes,
} from './recapFilm';

const look = {
  mood: 'rose',
  transitions: ['wipe', 'zoom'],
  cover: 'mosaic',
  motions: ['drift-left', 'zoom-in', 'parallax'],
  layouts: {
    photo: ['bleed', 'polaroid', 'split', 'inset', 'tilted'],
    duo: ['stacked', 'side', 'overlap'],
    words: ['centered', 'letter', 'lines', 'on-photo'],
    title: ['stamp', 'band', 'outline'],
    answers: ['dialog', 'stacked'],
    place: ['marker', 'list'],
    fact: ['large', 'row'],
  },
  highlightKey: 'MEMORY:birthday',
  tags: [] as { label: string; count: number }[],
};

const image = (id: string, parentId = id) => ({
  attachmentId: `${id}-photo`,
  parentId,
  kind: 'IMAGE',
});

const source = (
  key: string,
  day: number,
  overrides: Record<string, unknown> = {},
) => {
  const [kind, id] = key.split(':');
  return {
    key,
    id,
    kind,
    title: `Title ${id}`,
    excerpt: null,
    available: true,
    occurredOn: `2026-10-${String(day).padStart(2, '0')}`,
    version: 1,
    previewAttachmentId: null,
    previewIsSensitive: false,
    media: [],
    answers: [],
    placeName: null,
    ...overrides,
  };
};

const edition = (
  sources: Record<string, unknown>[],
  overrides: Record<string, unknown> = {},
  film: Record<string, unknown> | null = {},
) =>
  RecapViewFromJSON({
    id: 'edition-1',
    kind: 'MONTH',
    year: 2026,
    month: 10,
    variant: 0,
    version: 1,
    startsOn: '2026-10-01',
    throughOn: '2026-10-31',
    isPartial: false,
    status: 'READY',
    theme: 'MOMENTS',
    generatedAt: '2026-11-01T00:00:00Z',
    savedAt: null,
    locale: 'de-DE',
    headline: null,
    introduction: null,
    facts: {
      memories: 4,
      heartMoments: 1,
      milestones: 1,
      chapters: 0,
      plans: 0,
      activeDays: 10,
      busiestMonth: null,
    },
    sources,
    film: film === null ? null : { ...look, ...film },
    reflections: [],
    ownDraft: null,
    ...overrides,
  });

const month = () =>
  edition([
    source('MILESTONE:first', 3),
    source('MEMORY:walk', 5, { media: [image('walk')] }),
    source('MEMORY:birthday', 17, {
      media: [image('b1', 'birthday'), image('b2', 'birthday')],
      placeName: 'Villa',
    }),
    source('HEART_MOMENT:note', 21, {
      title: 'Such a message',
      excerpt: 'Such a message right after waking up is a dream.',
    }),
    source('MEMORY:halloween', 31, {
      media: [image('h')],
      placeName: 'Schlossplatz',
    }),
  ]);

const types = (scenes: FilmScene[]) => scenes.map((scene) => scene.type);

describe('monthly recap film', () => {
  it('keeps the established reader when an edition has no film', () => {
    expect(recapFilmScenes(edition([], {}, null))).toBe(null);
    expect(recapFilmScenes(edition([], { kind: 'YEAR', month: 0 }, null))).toBe(
      null,
    );
  });

  it('opens calmly, keeps chronology and ends with the closing scene', () => {
    const scenes = recapFilmScenes(month()) ?? [];
    expect(types(scenes)).toEqual([
      'cover',
      'place',
      'title',
      'photo',
      'duo',
      'words',
      'photo',
      'closing',
    ]);
    expect(scenes.at(-1)?.key).toBe('reflections');
  });

  it('names the cover after the highlight and leads with its picture', () => {
    const [cover] = recapFilmScenes(month()) ?? [];
    expect(cover.type).toBe('cover');
    if (cover.type !== 'cover') return;
    expect(cover.title).toBe('Title birthday');
    expect(cover.media[0].attachmentId).toBe('b1-photo');
    expect(cover.layout).toBe('mosaic');
  });

  it('marks the highlight as the climax with more time and the second transition', () => {
    const scenes = recapFilmScenes(month()) ?? [];
    const climax = scenes.find((scene) => scene.climax);
    expect(climax?.key).toBe('MEMORY:birthday');
    expect(climax?.transition).toBe('zoom');
    expect(climax?.ms).toBe(4_600 + 1_200);
    expect(scenes[0].transition).toBe('wipe');
  });

  it('uses the counted days when fewer than two places are known', () => {
    const value = edition([
      source('MEMORY:a', 1),
      source('MEMORY:b', 2, { placeName: 'Köln' }),
      source('MEMORY:c', 3),
    ]);
    const scenes = recapFilmScenes(value) ?? [];
    expect(scenes[1]).toMatchObject({ type: 'fact', days: 10 });
    // A sparse month has no opener at all.
    expect(
      types(recapFilmScenes(edition([source('MEMORY:a', 1)])) ?? []),
    ).toEqual(['cover', 'title', 'closing']);
  });

  it('shows a heart moment with a photo as a photo scene with its words', () => {
    const value = edition([
      source('HEART_MOMENT:sun', 4, {
        title: 'Sunflowers',
        excerpt: 'Sunflowers for you.',
        media: [image('sun')],
      }),
    ]);
    const scene = recapFilmScenes(value)?.find((item) =>
      item.key.includes('sun'),
    );
    expect(scene).toMatchObject({
      type: 'photo',
      words: 'Sunflowers for you.',
    });
  });

  it('keeps short answers in the picture and gives long ones a scene of their own', () => {
    const answer = (text: string, author = 'Ronja') => ({
      text,
      authorId: author,
      authorName: author,
    });
    const short = recapFilmScenes(
      edition([
        source('MEMORY:happy', 3, {
          media: [image('happy')],
          answers: [answer('The coffee.'), answer('Your laugh.', 'Philipp')],
        }),
      ]),
    );
    expect(short?.find((scene) => scene.key === 'MEMORY:happy')).toMatchObject({
      type: 'photo',
      answers: [{ text: 'The coffee.' }, { text: 'Your laugh.' }],
    });
    const long = 'x'.repeat(FILM_INLINE_ANSWER_CHARS + 1);
    const split = recapFilmScenes(
      edition([
        source('MEMORY:happy', 3, {
          media: [image('happy')],
          answers: [answer(long)],
        }),
      ]),
    );
    expect(types(split ?? [])).toEqual([
      'cover',
      'photo',
      'answers',
      'closing',
    ]);
    const textOnly = recapFilmScenes(
      edition([
        source('MEMORY:question', 3, {
          answers: [answer('The sunrise.')],
        }),
      ]),
    );
    expect(types(textOnly ?? [])).toEqual(['cover', 'answers', 'closing']);
  });

  it('never plays the same scene type twice in a row', () => {
    const value = edition([
      source('MEMORY:a', 1, { media: [image('a1', 'a'), image('a2', 'a')] }),
      source('MEMORY:b', 2, { media: [image('b1', 'b'), image('b2', 'b')] }),
      source('MEMORY:c', 3, { media: [image('c1', 'c'), image('c2', 'c')] }),
    ]);
    const scenes = recapFilmScenes(value) ?? [];
    for (let index = 1; index < scenes.length; index += 1)
      expect(scenes[index].type).not.toBe(scenes[index - 1].type);
  });

  it('adds the tag scene only from three tags, right before the closing', () => {
    const tags = [
      { label: 'travel', count: 3 },
      { label: 'Köln', count: 2 },
      { label: 'Festival', count: 1 },
    ];
    const scenes = recapFilmScenes(
      edition([source('MEMORY:a', 1)], {}, { tags }),
    );
    expect(types(scenes ?? []).slice(-2)).toEqual(['tags', 'closing']);
    expect(
      types(
        recapFilmScenes(
          edition([source('MEMORY:a', 1)], {}, { tags: tags.slice(0, 2) }),
        ) ?? [],
      ),
    ).not.toContain('tags');
  });

  it('times scenes by content and lets a video clip finish', () => {
    const value = edition([
      source('MEMORY:clip', 9, {
        media: [
          {
            attachmentId: 'v',
            parentId: 'clip',
            kind: 'VIDEO',
            clipStartSeconds: 17,
            clipSeconds: 5,
          },
        ],
      }),
      source('HEART_MOMENT:long', 10, {
        title: 'Long',
        excerpt: 'One sentence. '.repeat(30),
      }),
    ]);
    const scenes = recapFilmScenes(value) ?? [];
    expect(scenes[0].ms).toBe(5_000);
    expect(scenes.find((scene) => scene.key === 'MEMORY:clip')?.ms).toBe(5_600);
    const words = scenes.find((scene) => scene.type === 'words');
    // An excerpt of about 140 characters reads within the approved minimum.
    expect(words?.ms).toBe(4_500);
    expect(scenes.at(-1)?.ms).toBe(5_500);
  });

  it('cycles layouts from the look per scene type', () => {
    const value = edition([
      source('MEMORY:a', 1, { media: [image('a')] }),
      source('MILESTONE:m', 2),
      source('MEMORY:b', 3, { media: [image('b')] }),
    ]);
    const photos = (recapFilmScenes(value) ?? []).filter(
      (scene) => scene.type === 'photo',
    );
    expect(photos.map((scene) => scene.layout)).toEqual(['bleed', 'polaroid']);
  });

  it('hides automatic fallback titles and never rewords text', () => {
    expect(isFallbackTitle('Erinnerung vom 24.10.2026')).toBe(true);
    expect(isFallbackTitle('Memory from 10/24/2026')).toBe(true);
    expect(isFallbackTitle('Ronjas Geburtstag')).toBe(false);
    const value = edition([
      source('MEMORY:a', 26, {
        title: 'Erinnerung vom 26.10.2026',
        media: [image('a')],
      }),
    ]);
    const [cover] =
      recapFilmScenes({
        ...value,
        film: { ...look, highlightKey: 'MEMORY:a' },
      }) ?? [];
    expect(cover.type === 'cover' && cover.title).toBe(null);
    const text =
      'First sentence here. A second one follows soon. The third is too long for the excerpt.';
    const cut = filmExcerpt(text, 50);
    expect(cut).toBe('First sentence here. A second one follows soon. …');
    expect(filmExcerpt('kurz')).toBe('kurz');
  });
});

const yearSource = (
  key: string,
  month: number,
  day: number,
  overrides: Record<string, unknown> = {},
) =>
  source(key, day, {
    occurredOn: `2025-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    ...overrides,
  });

const year = (overrides: Record<string, unknown> = {}) => {
  const sources = [];
  const monthHighlights = [];
  for (let month = 1; month <= 12; month += 1) {
    const top = `MEMORY:top${month}`;
    sources.push(
      yearSource(top, month, 4, {
        media: [image(`top${month}`)],
        placeName: month % 2 ? 'See' : 'Stadt',
      }),
      yearSource(`MEMORY:more${month}`, month, 18),
    );
    monthHighlights.push({ month, key: top });
  }
  sources.push(
    yearSource('MILESTONE:keys', 3, 9),
    yearSource('MILESTONE:move', 9, 1),
  );
  sources.sort((a, b) =>
    String(a.occurredOn).localeCompare(String(b.occurredOn)),
  );
  return edition(
    sources,
    {
      kind: 'YEAR',
      month: 0,
      year: 2025,
      startsOn: '2025-01-01',
      throughOn: '2025-12-31',
    },
    {
      highlightKey: 'MEMORY:top7',
      monthHighlights,
      tags: [
        { label: 'See', count: 9 },
        { label: 'Stadt', count: 4 },
        { label: 'Herbst', count: 2 },
      ],
      ...overrides,
    },
  );
};

describe('year recap film', () => {
  it('plays month chapters with markers, then the firsts, the climax and the covers', () => {
    const scenes = recapFilmScenes(year()) ?? [];
    const markers = scenes.filter((scene) => scene.type === 'month');
    expect(
      markers.map((scene) => scene.type === 'month' && scene.month),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(scenes[0].type).toBe('cover');
    const finale = scenes.slice(
      scenes.findIndex((scene) => scene.type === 'firsts'),
    );
    expect(types(finale)).toEqual([
      'firsts',
      'tags',
      'photo',
      'covers',
      'closing',
    ]);
    const climax = finale[2];
    expect(climax.climax && 'source' in climax && climax.source?.key).toBe(
      'MEMORY:top7',
    );
    // The year highlight plays once: as the climax, not in July.
    expect(
      scenes
        .filter(
          (scene) => 'source' in scene && scene.source?.key === 'MEMORY:top7',
        )
        .filter((scene) => scene.type !== 'cover'),
    ).toHaveLength(1);
    // Milestones play only in the firsts sequence.
    expect(
      scenes.some(
        (scene) => 'source' in scene && scene.source?.kind === 'MILESTONE',
      ),
    ).toBe(false);
    const firsts = finale[0];
    expect(
      firsts.type === 'firsts' && firsts.sources.map((item) => item.key),
    ).toEqual(['MILESTONE:keys', 'MILESTONE:move']);
    const covers = finale[3];
    expect(
      covers.type === 'covers' && covers.covers.map((item) => item.month),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (let index = 1; index < scenes.length; index += 1)
      expect(scenes[index].type).not.toBe(scenes[index - 1].type);
  });

  it('groups the progress by chapter and orients by month', () => {
    const scenes = recapFilmScenes(year()) ?? [];
    const chapters = filmChapters(scenes) ?? [];
    expect(chapters.map((chapter) => chapter.chapter)).toEqual([
      'intro',
      ...Array.from({ length: 12 }, (_, index) => `m${index + 1}`),
      'finale',
    ]);
    expect(chapters.reduce((sum, chapter) => sum + chapter.count, 0)).toBe(
      scenes.length,
    );
    // July lost its highlight to the finale but keeps its other moment.
    expect(chapters.find((chapter) => chapter.chapter === 'm7')?.count).toBe(2);
    expect(filmChapters(recapFilmScenes(month()))).toBe(null);
  });

  it('keeps a lone milestone as a title scene and skips a thin cover montage', () => {
    const value = edition(
      [
        yearSource('MEMORY:spring', 4, 2, { media: [image('spring')] }),
        yearSource('MILESTONE:keys', 5, 9),
        yearSource('MEMORY:summer', 7, 2, { media: [image('summer')] }),
      ],
      { kind: 'YEAR', month: 0, year: 2025 },
      {
        highlightKey: 'MEMORY:summer',
        monthHighlights: [
          { month: 4, key: 'MEMORY:spring' },
          { month: 7, key: 'MEMORY:summer' },
        ],
      },
    );
    const scenes = recapFilmScenes(value) ?? [];
    expect(types(scenes)).toEqual([
      'cover',
      'fact',
      'month',
      'photo',
      'title',
      'photo',
      'closing',
    ]);
    expect(scenes.at(-2)?.climax).toBe(true);
  });
});

const shaped = (id: string, shape: string, parentId = id) => ({
  ...image(id, parentId),
  shape,
  focusX: 0.6,
  focusY: 0.4,
});

const variety = {
  transitions: ['blinds', 'flip'],
  accents: ['light', 'match', 'focus'],
  motions: ['pan-up', 'drift-left', 'zoom-out', 'parallax', 'diagonal'],
  pace: 'even',
  layouts: {
    photo: ['pano', 'bleed', 'mat', 'corner', 'polaroid', 'split', 'inset'],
    duo: ['diptych', 'crossfade', 'stacked', 'side', 'overlap', 'scatter'],
    collage: ['scatter', 'grid', 'strip'],
    words: ['reveal', 'margin', 'centered'],
    title: ['rule', 'stamp'],
    answers: ['cards', 'dialog'],
    place: ['route', 'postcard'],
    fact: ['counter', 'large'],
    month: ['numeral', 'line'],
    firsts: ['cards', 'timeline'],
    covers: ['calendar', 'grid'],
    closing: ['fade', 'tiles'],
  },
};

const run = (count: number, shape = 'portrait', prefix = 'p', from = 1) =>
  Array.from({ length: count }, (_, index) =>
    source(`MEMORY:${prefix}${index}`, from + index, {
      media: [shaped(`${prefix}${index}`, shape)],
    }),
  );

describe('film variety', () => {
  it('plays three pictures of one moment as a collage, never two collages in a row', () => {
    const three = (id: string, day: number) =>
      source(`MEMORY:${id}`, day, {
        media: ['1', '2', '3'].map((n) => image(`${id}${n}`, id)),
      });
    const scenes =
      recapFilmScenes(
        edition([three('a', 1), three('b', 2)], {}, { ...variety }),
      ) ?? [];
    const body = scenes.filter((scene) => scene.key.startsWith('MEMORY:'));
    expect(types(body)).toEqual(['collage', 'duo']);
    const collage = body[0];
    expect(collage.type === 'collage' && collage.media).toHaveLength(3);
    expect(collage.ms).toBe(5_200);
  });

  it('fits layouts and camera motion to the format and never repeats a neighbour', () => {
    const value = edition(
      [
        ...run(2, 'landscape', 'l', 1),
        source('MILESTONE:m', 10),
        ...run(2, 'portrait', 'q', 20),
      ],
      {},
      { ...variety, highlightKey: null },
    );
    const scenes = recapFilmScenes(value) ?? [];
    for (const scene of scenes) {
      if (scene.type !== 'photo') continue;
      if (scene.media.shape === 'landscape') {
        expect(['bleed', 'corner']).not.toContain(scene.layout);
        expect(['pan-up', 'pan-down', 'parallax']).not.toContain(scene.motion);
      } else {
        expect(scene.layout).not.toBe('pano');
        expect(['drift-left', 'drift-right', 'diagonal']).not.toContain(
          scene.motion,
        );
      }
    }
    const photos = scenes.filter((scene) => scene.type === 'photo');
    expect(photos[0].layout).toBe('pano');
    for (let index = 1; index < scenes.length; index += 1) {
      if (scenes[index].layout)
        expect(scenes[index].layout).not.toBe(scenes[index - 1].layout);
      expect(scenes[index].motion).not.toBe(scenes[index - 1].motion);
    }
  });

  it('opens the highlight with its accent in the most generous form', () => {
    const value = edition(
      [
        ...run(2),
        source('MEMORY:top', 12, { media: [shaped('top', 'portrait')] }),
      ],
      {},
      { ...variety, highlightKey: 'MEMORY:top' },
    );
    const scenes = recapFilmScenes(value) ?? [];
    const climax = scenes.find((scene) => scene.climax);
    expect(climax?.transition).toBe('light');
    expect(climax?.layout).toBe('bleed');
    expect(climax?.ms).toBe(3_400 + 1_200);
    // The light leak belongs to the highlight alone.
    expect(scenes.filter((scene) => scene.transition === 'light')).toHaveLength(
      1,
    );
    expect(scenes[0].transition).toBe('blinds');
  });

  it('beats a photo run long-short-short-long and keeps match cuts between pictures', () => {
    const scenes =
      recapFilmScenes(
        edition(run(5), {}, { ...variety, highlightKey: null }),
      ) ?? [];
    const photos = scenes.filter((scene) => scene.type === 'photo');
    expect(photos.map((scene) => scene.beat)).toEqual([
      'long',
      'short',
      'short',
      'long',
      'long',
    ]);
    expect(photos.map((scene) => scene.ms)).toEqual([
      3_910, 2_720, 2_720, 3_910, 3_910,
    ]);
    scenes.forEach((scene, index) => {
      if (scene.transition !== 'match') return;
      expect(['photo', 'duo', 'collage']).toContain(scene.type);
      expect(['photo', 'duo', 'collage']).toContain(scenes[index - 1].type);
    });
    expect(scenes.some((scene) => scene.transition === 'match')).toBe(true);
    for (let index = 2; index < scenes.length; index += 1)
      expect(
        scenes[index].transition === scenes[index - 1].transition &&
          scenes[index].transition === scenes[index - 2].transition,
      ).toBe(false);
  });

  it('follows the pace for pictures but never shortens the words of the couple', () => {
    const value = (pace: string) =>
      recapFilmScenes(
        edition(
          [
            source('MEMORY:a', 1, { media: [image('a')] }),
            source('HEART_MOMENT:w', 2, {
              excerpt: 'One sentence. '.repeat(20),
            }),
          ],
          {},
          { ...variety, pace, highlightKey: null },
        ),
      ) ?? [];
    const photo = (scenes: FilmScene[]) =>
      scenes.find((scene) => scene.type === 'photo')?.ms;
    const words = (scenes: FilmScene[]) =>
      scenes.find((scene) => scene.type === 'words')?.ms;
    expect(photo(value('calm'))).toBe(3_910);
    expect(photo(value('lively'))).toBe(2_890);
    expect(words(value('lively'))).toBe(words(value('calm')));
  });

  it('falls back to the calm defaults for names this reader does not know', () => {
    const scenes =
      recapFilmScenes(
        edition(
          [
            source('MEMORY:a', 1, { media: [image('a')] }),
            source('MILESTONE:m', 2),
          ],
          {},
          {
            transitions: ['sparkle', 'swirl'],
            accents: ['glitter'],
            motions: ['spin'],
            cover: 'hologram',
            layouts: { photo: ['bubble'], title: ['neon'] },
            highlightKey: null,
          },
        ),
      ) ?? [];
    expect(scenes.every((scene) => scene.transition === 'fade')).toBe(true);
    expect(scenes.every((scene) => scene.motion === 'zoom-in')).toBe(true);
    expect(scenes[0].layout).toBe('mosaic');
    expect(scenes.find((scene) => scene.type === 'photo')?.layout).toBe(
      'bleed',
    );
    expect(scenes.find((scene) => scene.type === 'title')?.layout).toBe(
      'stamp',
    );
    expect(scenes.at(-1)?.layout).toBe('tiles');
  });

  it('leads the cover with the highlight, then different days and formats', () => {
    const value = edition(
      [
        source('MEMORY:a', 1, {
          media: [shaped('a1', 'portrait', 'a'), shaped('a2', 'portrait', 'a')],
        }),
        source('MEMORY:b', 1, { media: [shaped('b', 'landscape')] }),
        source('MEMORY:c', 4, { media: [shaped('c', 'portrait')] }),
        source('MEMORY:d', 6, { media: [shaped('d', 'landscape')] }),
        source('MEMORY:top', 9, { media: [shaped('top', 'portrait')] }),
      ],
      {},
      { ...variety, highlightKey: 'MEMORY:top' },
    );
    const [cover] = recapFilmScenes(value) ?? [];
    expect(
      cover.type === 'cover' && cover.media.map((item) => item.attachmentId),
    ).toEqual(['top-photo', 'd-photo', 'a1-photo', 'c-photo']);
  });

  it('lets the highlight fade out in a fading closing', () => {
    const scenes =
      recapFilmScenes(
        edition(
          [
            ...run(2),
            source('MEMORY:top', 12, { media: [shaped('top', 'portrait')] }),
          ],
          {},
          { ...variety, highlightKey: 'MEMORY:top' },
        ),
      ) ?? [];
    const closing = scenes.at(-1);
    expect(closing?.layout).toBe('fade');
    expect(
      closing?.type === 'closing' &&
        closing.media.map((item) => item.attachmentId),
    ).toEqual(['top-photo']);
  });

  it('takes the year forms of markers, firsts and covers from the look', () => {
    const scenes = recapFilmScenes(year(variety)) ?? [];
    const layoutOf = (list: FilmScene[], type: string) =>
      list.find((scene) => scene.type === type)?.layout;
    expect(layoutOf(scenes, 'month')).toBe('numeral');
    expect(layoutOf(scenes, 'firsts')).toBe('cards');
    expect(layoutOf(scenes, 'covers')).toBe('calendar');
    // A year look from before the variety catalogue keeps its established forms.
    const legacy = recapFilmScenes(year()) ?? [];
    expect(layoutOf(legacy, 'month')).toBe('line');
    expect(layoutOf(legacy, 'firsts')).toBe('timeline');
    expect(layoutOf(legacy, 'covers')).toBe('grid');
    expect(legacy.at(-1)?.layout).toBe('tiles');
  });
});

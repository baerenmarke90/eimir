import { describe, expect, it } from 'vitest';
import { RecapViewFromJSON } from '../api/generated/models/RecapView';
import {
  FILM_INLINE_ANSWER_CHARS,
  type FilmScene,
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
    expect(recapFilmScenes(edition([], { kind: 'YEAR', month: 0 }))).toBe(null);
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

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecapViewFromJSON } from '../api/generated/models/RecapView';
import type { FilmScene } from '../client/recapFilm';
import type { ReferenceApis } from '../client/referenceFlow';
import { RecapFilmScene } from './RecapFilmScene';

afterEach(cleanup);

const value = RecapViewFromJSON({
  id: 'edition',
  kind: 'MONTH',
  year: 2026,
  month: 11,
  variant: 0,
  version: 1,
  startsOn: '2026-11-01',
  throughOn: '2026-11-30',
  isPartial: false,
  status: 'READY',
  theme: 'MOMENTS',
  generatedAt: null,
  savedAt: null,
  locale: 'de-DE',
  headline: null,
  introduction: null,
  sources: [],
  reflections: [],
  ownDraft: null,
});

const source = RecapViewFromJSON({
  ...value,
  sources: [
    {
      key: 'MEMORY:happy',
      id: 'happy',
      kind: 'MEMORY',
      title: 'What made your day?',
      excerpt: null,
      available: true,
      occurredOn: '2026-11-03',
      version: 1,
      previewAttachmentId: null,
      previewIsSensitive: false,
      placeName: 'Köln',
    },
  ],
}).sources[0];

const timing = {
  ms: 4_500,
  transition: 'fade',
  motion: 'zoom-in',
  layout: 'dialog',
  climax: false,
  chapter: null,
  beat: null,
};

function show(scene: FilmScene) {
  const onSettled = vi.fn();
  render(
    <RecapFilmScene
      scene={scene}
      value={value}
      playing={false}
      reducedMotion
      onSettled={onSettled}
      sourceLink={() => <a href="/source">Original</a>}
      mediaApis={{} as ReferenceApis}
      spaceId="space"
      account={{ id: 'me' }}
    />,
  );
  return onSettled;
}

describe('RecapFilmScene', () => {
  it('shows a guided question with both answers and their first names', () => {
    const onSettled = show({
      ...timing,
      type: 'answers',
      key: 'MEMORY:happy',
      source,
      answers: [
        { text: 'The morning coffee.', authorId: 'a', authorName: 'Ronja K' },
        { text: 'Your laugh.', authorId: 'b', authorName: 'Philipp' },
      ],
    });
    expect(screen.getByText('What made your day?')).toBeTruthy();
    expect(screen.getByText(/The morning coffee\./u)).toBeTruthy();
    expect(screen.getByText('Ronja')).toBeTruthy();
    expect(screen.getByText(/Köln/u)).toBeTruthy();
    // Text-only scenes start their time at once.
    expect(onSettled).toHaveBeenCalled();
  });

  it('lets the month tags gather, reading known keys in the viewer language', () => {
    show({
      ...timing,
      layout: '',
      type: 'tags',
      key: 'tags',
      tags: [
        { label: 'Festival', count: 3 },
        { label: 'Köln', count: 1 },
        { label: 'Lichterfest', count: 1 },
      ],
    });
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Festival',
      'Köln',
      'Lichterfest',
    ]);
    expect(items[0].style.getPropertyValue('--film-weight')).toBe('1');
  });

  it('never shows an automatic fallback title', () => {
    show({
      ...timing,
      layout: 'stamp',
      type: 'title',
      key: 'MEMORY:auto',
      source: { ...source, title: 'Erinnerung vom 24.10.2026' },
    });
    expect(screen.queryByText('Erinnerung vom 24.10.2026')).toBeNull();
  });

  it('marks a month chapter with its localized name only', () => {
    show({ ...timing, layout: '', type: 'month', key: 'month:3', month: 3 });
    expect(screen.getByRole('heading').textContent).toMatch(/^(März|March)$/u);
  });

  it('lists the year firsts with their days and own titles', () => {
    show({
      ...timing,
      layout: '',
      type: 'firsts',
      key: 'firsts',
      sources: [
        {
          ...source,
          key: 'MILESTONE:keys',
          kind: 'MILESTONE',
          title: 'Our own keys',
        },
        {
          ...source,
          key: 'MILESTONE:auto',
          kind: 'MILESTONE',
          title: 'First trip abroad',
        },
      ],
    });
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toMatch(/Our own keys/u);
    expect(items[0].textContent).toMatch(/3/u);
  });
});

describe('RecapFilmScene variety forms', () => {
  it('counts the days up while assistive technology reads the number once', () => {
    const { container } = render(
      <RecapFilmScene
        scene={{
          ...timing,
          layout: 'counter',
          type: 'fact',
          key: 'fact',
          days: 12,
        }}
        value={value}
        playing={false}
        reducedMotion
        onSettled={vi.fn()}
        sourceLink={() => null}
        mediaApis={{} as ReferenceApis}
        spaceId="space"
        account={{ id: 'me' }}
      />,
    );
    const count = container.querySelector('.recap-film-count') as HTMLElement;
    expect(count.getAttribute('aria-hidden')).toBe('true');
    expect(count.style.getPropertyValue('--film-days')).toBe('12');
    expect(container.querySelector('.sr-only')?.textContent).toBe('12');
  });

  it('reveals words one by one without rewording them', () => {
    const words = 'You made the whole day lighter.';
    const { container } = render(
      <RecapFilmScene
        scene={{
          ...timing,
          layout: 'reveal',
          type: 'words',
          key: 'HEART_MOMENT:w',
          source,
          words,
        }}
        value={value}
        playing={false}
        reducedMotion
        onSettled={vi.fn()}
        sourceLink={() => null}
        mediaApis={{} as ReferenceApis}
        spaceId="space"
        account={{ id: 'me' }}
      />,
    );
    const reveal = container.querySelector('.recap-film-reveal') as HTMLElement;
    expect(reveal.textContent).toBe(words);
    expect(reveal.querySelectorAll('span')).toHaveLength(6);
  });

  it('sets long words as calm prose even when the look asks for a reveal', () => {
    const words = 'One sentence that keeps going. '.repeat(5).trim();
    const { container } = render(
      <RecapFilmScene
        scene={{
          ...timing,
          layout: 'reveal',
          type: 'words',
          key: 'HEART_MOMENT:w',
          source,
          words,
        }}
        value={value}
        playing={false}
        reducedMotion
        onSettled={vi.fn()}
        sourceLink={() => null}
        mediaApis={{} as ReferenceApis}
        spaceId="space"
        account={{ id: 'me' }}
      />,
    );
    expect(
      container.querySelector('.recap-film-frame')?.getAttribute('data-layout'),
    ).toBe('centered');
    expect(container.querySelector('.recap-film-reveal')).toBeNull();
    expect(container.querySelector('.recap-film-prose')?.textContent).toBe(
      words,
    );
  });

  it('keeps the large quote mark and the month numeral decorative', () => {
    const margin = render(
      <RecapFilmScene
        scene={{
          ...timing,
          layout: 'margin',
          type: 'words',
          key: 'HEART_MOMENT:w',
          source,
          words: 'Short and kind.',
        }}
        value={value}
        playing={false}
        reducedMotion
        onSettled={vi.fn()}
        sourceLink={() => null}
        mediaApis={{} as ReferenceApis}
        spaceId="space"
        account={{ id: 'me' }}
      />,
    );
    const mark = margin.container.querySelector('.recap-film-mark');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    expect(mark?.textContent).toBe('');
    cleanup();
    show({
      ...timing,
      layout: 'numeral',
      type: 'month',
      key: 'month:3',
      month: 3,
    });
    expect(screen.getByRole('heading').textContent).toMatch(/^(März|March)$/u);
    const numeral = document.querySelector('.recap-film-numeral');
    expect(numeral?.getAttribute('aria-hidden')).toBe('true');
    expect(numeral?.textContent).toBe('03');
    expect(
      document.querySelector('.recap-film-frame')?.getAttribute('data-variant'),
    ).toBe('numeral');
  });

  it('plays a collage of three pictures that keep their format and focus', () => {
    const picture = (id: string, shape: string) => ({
      attachmentId: id,
      parentId: 'happy',
      kind: 'IMAGE' as const,
      shape,
      focusX: 0.62,
      focusY: 0.3,
    });
    const { container } = render(
      <RecapFilmScene
        scene={{
          ...timing,
          layout: 'grid',
          type: 'collage',
          key: 'MEMORY:happy',
          source,
          media: [
            picture('a', 'portrait'),
            picture('b', 'landscape'),
            picture('c', 'square'),
          ],
          answers: [],
        }}
        value={value}
        playing={false}
        reducedMotion
        onSettled={vi.fn()}
        sourceLink={() => null}
        mediaApis={{} as ReferenceApis}
        spaceId="space"
        account={{ id: 'me' }}
      />,
    );
    const pictures = [
      ...container.querySelectorAll<HTMLElement>('.recap-film-picture'),
    ];
    expect(pictures.map((item) => item.dataset.shape)).toEqual([
      'portrait',
      'landscape',
      'square',
    ]);
    expect(pictures[0].style.getPropertyValue('--film-focus-x')).toBe('62%');
    expect(pictures[0].style.getPropertyValue('--film-focus-y')).toBe('30%');
    expect(
      container.querySelector('.recap-film-media')?.getAttribute('data-scene'),
    ).toBe('collage');
  });
});

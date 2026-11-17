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
});

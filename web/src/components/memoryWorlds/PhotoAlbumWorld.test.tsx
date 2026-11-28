// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemoryAttachmentSummary } from '../../api/generated/models/MemoryAttachmentSummary';
import { i18n } from '../../i18n';
import copy from '../../i18n/locales/memoryWorlds';
import rediscovery from '../../i18n/locales/rediscovery';
import { entry } from './__fixtures__/stories';
import type { MemoryWorldEntry } from './model';
import {
  type AlbumPage,
  albumPageLabel,
  buildAlbumPages,
  PhotoAlbumWorld,
} from './PhotoAlbumWorld';

const album = copy.album;

/** Fills a German product template, so the assertions follow the locale copy. */
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key]));

function photo(
  key: string,
  day: string,
  overrides: Partial<MemoryWorldEntry> = {},
): MemoryWorldEntry {
  return entry(key, {
    kind: 'photo',
    title: `Photo ${key}`,
    date: new Date(`${day}T12:00:00Z`),
    dateTime: day,
    dateLabel: day,
    cover: {
      id: `cover-${key}`,
      position: 0,
      hasThumbnail: true,
      isSensitive: false,
      mediaType: 'IMAGE',
    } as unknown as MemoryAttachmentSummary,
    ...overrides,
  });
}

function text(
  key: string,
  kind: 'heart' | 'milestone' | 'words',
  day: string,
  overrides: Partial<MemoryWorldEntry> = {},
): MemoryWorldEntry {
  return entry(key, {
    kind,
    title: `Title ${key}`,
    date: new Date(`${day}T12:00:00Z`),
    dateTime: day,
    dateLabel: day,
    ...overrides,
  });
}

/** Three seasons: a summer of photos, an autumn with the lead, a winter of words. */
const seasons = [
  photo('p3', '2025-08-01'),
  photo('lead', '2025-10-20', { isLead: true }),
  text('m', 'milestone', '2026-01-10'),
  photo('p1', '2025-07-01'),
  text('h', 'heart', '2025-10-05', { emotion: 'LOVED' }),
  text('w', 'words', '2026-01-12'),
  photo('p2', '2025-07-10'),
];

function shape(pages: AlbumPage[]) {
  return pages.map((page) => {
    switch (page.kind) {
      case 'photos':
        return `${page.layout}:${page.entries.map((item) => item.key).join(',')}`;
      case 'opener':
        return `opener:${page.season}-${page.year}`;
      case 'cover':
        return `cover:${page.photo?.key ?? '-'}`;
      case 'end':
        return `end:${page.photo?.key ?? '-'}`;
      default:
        return `${page.kind}:${page.entry.key}`;
    }
  });
}

const neverLoads = () => new Promise<never>(() => {});

function renderAlbum(entries: MemoryWorldEntry[], onOpen = vi.fn()) {
  const view = render(
    <MemoryRouter>
      <PhotoAlbumWorld
        entries={entries}
        kicker="Two years ago today"
        loadMemoryImage={vi.fn(neverLoads)}
        onOpen={onOpen}
      />
    </MemoryRouter>,
  );
  return { ...view, onOpen };
}

function book(page: number, count: number) {
  return screen.getByRole('group', {
    name: fill(album.label, { page, count }),
  });
}

function announcement(page: number, count: number, label: string) {
  return fill(album.page, { page, count, label });
}

function motionAllowed() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('buildAlbumPages', () => {
  it('sets the moments from old to new with season openers, a lead page and an end', () => {
    expect(shape(buildAlbumPages(seasons))).toEqual([
      'cover:lead',
      'opener:summer-2025',
      'bleed:p1',
      'stack:p2,p3',
      'opener:autumn-2025',
      'heart:h',
      'feature:lead',
      'opener:winter-2026',
      'milestone:m',
      'words:w',
      'end:lead',
    ]);
  });

  it('leaves the openers out of a single season and follows the photo rhythm', () => {
    const summer = [
      photo('a', '2025-06-02'),
      photo('b', '2025-06-03'),
      photo('c', '2025-06-04'),
      photo('d', '2025-06-05'),
      photo('e', '2025-06-06'),
      photo('f', '2025-06-07'),
      text('n', 'words', '2025-06-08', { isLead: true }),
    ];
    expect(shape(buildAlbumPages(summer))).toEqual([
      'cover:a',
      'bleed:a',
      'stack:b,c',
      'mosaic:d,e,f',
      'words:n',
      'end:f',
    ]);
  });

  it('builds nothing without memories', () => {
    expect(buildAlbumPages([])).toEqual([]);
  });

  it('labels a winter across the turn of the year', () => {
    const t = i18n.t.bind(i18n);
    const winter = buildAlbumPages(seasons).find(
      (page) => page.kind === 'opener' && page.season === 'winter',
    );
    expect(winter && albumPageLabel(winter, t)).toBe(
      `${rediscovery.season.winter} ${fill(album.winterYear, { from: 2025, to: '26' })}`,
    );
  });
});

describe('PhotoAlbumWorld', () => {
  it('opens on the cover and turns the pages with the keys, announcing each page', async () => {
    renderAlbum(seasons);
    const count = 11;
    const group = book(1, count);
    expect(group.getAttribute('aria-roledescription')).toBe(
      album.roleDescription,
    );
    expect(
      screen.getByText(announcement(1, count, album.pageLabel.cover)),
    ).toBeTruthy();
    expect(
      within(group).getByText(fill(album.moments_other, { count: 7 })),
    ).toBeTruthy();

    group.focus();
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(
      await screen.findByText(
        announcement(2, count, `${rediscovery.season.summer} 2025`),
      ),
    ).toBeTruthy();
    expect(book(2, count)).toBeTruthy();

    fireEvent.keyDown(group, { key: 'PageDown' });
    expect(
      await screen.findByText(announcement(3, count, 'Photo p1')),
    ).toBeTruthy();

    fireEvent.keyDown(group, { key: 'PageUp' });
    expect(
      await screen.findByText(
        announcement(2, count, `${rediscovery.season.summer} 2025`),
      ),
    ).toBeTruthy();

    fireEvent.keyDown(group, { key: 'End' });
    expect(
      await screen.findByText(announcement(count, count, album.pageLabel.end)),
    ).toBeTruthy();

    fireEvent.keyDown(group, { key: 'Home' });
    expect(
      await screen.findByText(announcement(1, count, album.pageLabel.cover)),
    ).toBeTruthy();
  });

  it('turns with the previous and next buttons and back to the start from the end', async () => {
    const pages = [text('note', 'words', '2025-03-01', { isLead: true })];
    renderAlbum(pages);
    const previous = screen.getByRole('button', {
      name: album.previous,
      hidden: true,
    }) as HTMLButtonElement;
    const next = screen.getByRole('button', {
      name: album.next,
      hidden: true,
    }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);

    fireEvent.click(next);
    expect(
      await screen.findByText(announcement(2, 3, 'Title note')),
    ).toBeTruthy();
    expect(previous.disabled).toBe(false);

    fireEvent.click(next);
    expect(
      await screen.findByText(announcement(3, 3, album.pageLabel.end)),
    ).toBeTruthy();
    expect(next.disabled).toBe(true);
    // A book without photos ends with the printed vignette.
    expect(document.querySelector('.memory-album-end-vignette')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: album.restart }));
    expect(
      await screen.findByText(announcement(1, 3, album.pageLabel.cover)),
    ).toBeTruthy();
  });

  it('mounts only the open page and its neighbours, and hides them from assistive technology', () => {
    renderAlbum(seasons);
    const leaves = [...document.querySelectorAll('.memory-album-leaf')];
    expect(leaves.map((leaf) => leaf.getAttribute('data-role'))).toEqual([
      'current',
      'next',
    ]);
    expect(leaves[1].getAttribute('aria-hidden')).toBe('true');
    expect(leaves[1].hasAttribute('inert')).toBe(true);
  });

  it('opens the memory of a page', async () => {
    const note = text('note', 'words', '2025-03-01', { isLead: true });
    const { onOpen } = renderAlbum([note]);
    fireEvent.keyDown(book(1, 3), { key: 'ArrowRight' });
    const link = await screen.findByRole('link', {
      name: fill(album.words, { title: 'Title note', date: '2025-03-01' }),
    });
    fireEvent.click(link);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][1]).toBe(note.path);
    expect(onOpen.mock.calls[0][2]).toBe(note.key);
  });

  it('names the photos, the heart moment and the milestone for screen readers', async () => {
    renderAlbum(seasons);
    const group = book(1, 11);
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    await screen.findByText(
      announcement(2, 11, `${rediscovery.season.summer} 2025`),
    );
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(
      await screen.findByRole('link', {
        name: fill(album.photo, { title: 'Photo p1', date: '2025-07-01' }),
      }),
    ).toBeTruthy();
  });

  it('does not invite or turn in 3D with reduced motion', async () => {
    renderAlbum(seasons);
    const cover = document.querySelector('.memory-album-leaf');
    expect(cover?.getAttribute('data-invite')).toBeNull();
    fireEvent.keyDown(book(1, 11), { key: 'ArrowRight' });
    // The leaving page only fades: no rotation is written.
    expect((cover as HTMLElement).style.transform).not.toContain('rotateY');
    await screen.findByText(
      announcement(2, 11, `${rediscovery.season.summer} 2025`),
    );
  });

  it('invites once on the closed book and turns the leaf in 3D with motion', async () => {
    motionAllowed();
    renderAlbum(seasons);
    const cover = document.querySelector<HTMLElement>('.memory-album-leaf');
    expect(cover?.getAttribute('data-invite')).toBe('true');
    fireEvent.keyDown(book(1, 11), { key: 'ArrowRight' });
    expect(cover?.style.transform).toContain('rotateY');
    expect(cover?.getAttribute('data-invite')).toBeNull();
    await screen.findByText(
      announcement(2, 11, `${rediscovery.season.summer} 2025`),
      undefined,
      { timeout: 2000 },
    );
  });

  it('refuses to turn before the cover', () => {
    renderAlbum(seasons);
    fireEvent.keyDown(book(1, 11), { key: 'ArrowLeft' });
    expect(book(1, 11)).toBeTruthy();
  });
});

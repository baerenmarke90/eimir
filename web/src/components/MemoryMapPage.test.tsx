// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ClientProblemError } from '../client/problemDetails';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import copy from '../i18n/locales/memoryMap';
import { MemoryMapPage } from './MemoryMapPage';

vi.mock('./PlaceMapCanvas', () => ({
  default: ({
    onLocationSelect,
    locations,
    focus,
  }: {
    onLocationSelect: (id: string) => void;
    locations: { id: string }[];
    focus?: { latitude: number; longitude: number };
  }) => (
    <div
      data-testid="external-map"
      data-locations={locations.map((item) => item.id).join(',')}
      data-focus={focus ? `${focus.latitude}:${focus.longitude}` : ''}
    >
      <button type="button" onClick={() => onLocationSelect('49:7')}>
        Map marker
      </button>
    </div>
  ),
}));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
const item = {
  memoryId: 'm1',
  title: 'By the lake',
  happenedOn: new Date('2026-10-30'),
  placeId: 'p1',
  placeName: 'Lake',
  latitude: 49,
  longitude: 7,
};
function setup(
  listMemoryMap: ReturnType<typeof vi.fn>,
  loadMemoryImage?: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<string>,
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <MemoryMapPage
          apis={{ places: { listMemoryMap } } as unknown as SharedPlanningApis}
          spaceId="s1"
          accountId="a1"
          loadMemoryImage={loadMemoryImage}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('Pro memory map', () => {
  it('focuses a selected place, hides other markers and resets through the standard filter', async () => {
    setup(
      vi.fn().mockResolvedValue({
        items: [
          item,
          {
            ...item,
            memoryId: 'm2',
            placeName: 'Zoo',
            latitude: 53,
            longitude: 10,
          },
        ],
        nextCursor: null,
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Lake · 1 Erinnerung' }),
    );
    expect(
      (await screen.findByTestId('external-map')).getAttribute(
        'data-locations',
      ),
    ).toBe('49:7');
    expect(screen.getByTestId('external-map').getAttribute('data-focus')).toBe(
      '49:7',
    );
    fireEvent.click(screen.getByRole('button', { name: copy.filter }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Zoo' }));
    await screen.findByRole('heading', { name: 'Zoo' });
    expect(
      screen.getByTestId('external-map').getAttribute('data-locations'),
    ).toBe('53:10');
    fireEvent.click(screen.getByRole('button', { name: copy.filter }));
    fireEvent.click(await screen.findByRole('radio', { name: copy.allPlaces }));
    await screen.findByRole('button', { name: 'Lake · 1 Erinnerung' });
    expect(
      screen.getByTestId('external-map').getAttribute('data-locations'),
    ).toBe('49:7,53:10');
    expect(screen.getByTestId('external-map').getAttribute('data-focus')).toBe(
      '',
    );
  });
  it('sorts place choices by name after loading another page and retains grouping', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ ...item, placeName: 'Zoo' }],
        nextCursor: 'next',
      })
      .mockResolvedValueOnce({
        items: [
          { ...item, placeName: 'Äpfel', memoryId: 'm2', latitude: 50 },
          { ...item, placeName: 'Zoo', memoryId: 'm3' },
        ],
        nextCursor: null,
      });
    setup(list);
    fireEvent.click(await screen.findByRole('button', { name: copy.loadMore }));
    await screen.findByRole('button', { name: 'Äpfel · 1 Erinnerung' });
    const choices = screen.getAllByRole('button', { name: / · \d Erinner/ });
    expect(choices.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Äpfel · 1 Erinnerung',
      'Zoo · 2 Erinnerungen',
    ]);
  });
  it('commits a fullscreen location only after closing its owned history entry', async () => {
    setup(vi.fn().mockResolvedValue({ items: [item], nextCursor: null }));
    fireEvent.click(
      await screen.findByRole('button', { name: copy.fullscreen }),
    );
    const dialog = await screen.findByRole('dialog', { name: copy.title });
    expect(screen.getAllByTestId('external-map')).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Map marker' }));
    expect(
      (await screen.findByRole('link', { name: /By the lake/ })).getAttribute(
        'href',
      ),
    ).toBe('/story/memories/m1');
    expect(screen.queryByRole('dialog', { name: copy.title })).toBeNull();
  });
  it('opens the map immediately, groups co-located sources and opens canonical memories', async () => {
    setup(
      vi.fn().mockResolvedValue({
        items: [
          item,
          { ...item, placeId: 'p2' },
          { ...item, memoryId: 'm2', title: 'Second visit' },
        ],
        nextCursor: null,
      }),
    );
    const place = await screen.findByRole('button', {
      name: 'Lake · 2 Erinnerungen',
    });
    expect(await screen.findByTestId('external-map')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Karte laden' })).toBeNull();
    fireEvent.click(place);
    expect(
      screen.getByRole('link', { name: /By the lake/ }).getAttribute('href'),
    ).toBe('/story/memories/m1');
    expect(screen.getByRole('link', { name: /Second visit/ })).toBeTruthy();
    expect(
      screen.getAllByText('30.10.2026', { selector: 'time' }),
    ).toHaveLength(2);
  });
  it('keeps photo failures browseable with the shared preview fallback', async () => {
    const load = vi.fn().mockRejectedValue(new Error('Image unavailable'));
    const view = setup(
      vi.fn().mockResolvedValue({
        items: [
          {
            ...item,
            previewAttachmentId: 'photo',
            previewIsSensitive: false,
            previewHasThumbnail: true,
          },
        ],
        nextCursor: null,
      }),
      load,
    );
    await screen.findByRole('button', { name: 'Lake · 1 Erinnerung' });
    await vi.waitFor(() =>
      expect(
        view.container.querySelector(
          '.memory-map-thumbnail .eimir-icon-erinnerungen',
        ),
      ).toBeTruthy(),
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(
      'm1',
      'photo',
      expect.any(AbortSignal),
      'thumbnail',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Lake · 1 Erinnerung' }),
    );
    expect(
      screen.getByRole('link', { name: /By the lake/ }).getAttribute('href'),
    ).toBe('/story/memories/m1');
  });
  it('requires the server capability without retaining a stale map', async () => {
    setup(
      vi
        .fn()
        .mockRejectedValue(
          new ClientProblemError(
            'permission',
            403,
            'PREMIUM_ENTITLEMENT_REQUIRED',
          ),
        ),
    );
    await screen.findByText(copy.proTitle);
    expect(screen.queryByTestId('external-map')).toBeNull();
  });
  it('lets a bounded next page fill a sparse first page without automatic unbounded loading', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ items: [], nextCursor: 'next' })
      .mockResolvedValueOnce({ items: [item], nextCursor: null });
    setup(load);
    expect(screen.queryByTestId('external-map')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: copy.loadMore }));
    await screen.findByRole('button', { name: 'Lake · 1 Erinnerung' });
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1][0].cursor).toBe('next');
  });
  it('keeps an empty map provider-free', async () => {
    setup(vi.fn().mockResolvedValue({ items: [], nextCursor: null }));
    await screen.findByText(copy.emptyTitle);
    expect(screen.queryByTestId('external-map')).toBeNull();
  });
});

// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { ClientProblemError } from '../client/problemDetails';
import copy from '../i18n/locales/memoryMap';
import { MemoryMapPage } from './MemoryMapPage';
vi.mock('./PlaceMapCanvas', () => ({
  default: () => <div data-testid="external-map" />,
}));
const item = {
  memoryId: 'm1',
  title: 'By the lake',
  happenedOn: new Date('2026-10-30'),
  placeId: 'p1',
  placeName: 'Lake',
  latitude: 49,
  longitude: 7,
};
function setup(listMemoryMap: ReturnType<typeof vi.fn>) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <MemoryMapPage
          apis={{ places: { listMemoryMap } } as unknown as SharedPlanningApis}
          spaceId="s1"
          accountId="a1"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('Pro memory map', () => {
  it('groups co-located sources, opens canonical memories, and loads tiles only on request', async () => {
    setup(
      vi
        .fn()
        .mockResolvedValue({
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
    expect(screen.queryByTestId('external-map')).toBeNull();
    fireEvent.click(place);
    expect(
      screen.getByRole('link', { name: /By the lake/ }).getAttribute('href'),
    ).toBe('/story/memories/m1');
    expect(screen.getByRole('link', { name: /Second visit/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Karte laden' }));
    expect(await screen.findByTestId('external-map')).toBeTruthy();
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
    expect(screen.queryByRole('button', { name: 'Karte laden' })).toBeNull();
  });
  it('lets a bounded next page fill a sparse first page without automatic unbounded loading', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ items: [], nextCursor: 'next' })
      .mockResolvedValueOnce({ items: [item], nextCursor: null });
    setup(load);
    fireEvent.click(await screen.findByRole('button', { name: copy.loadMore }));
    await screen.findByRole('button', { name: 'Lake · 1 Erinnerung' });
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1][0].cursor).toBe('next');
  });
});

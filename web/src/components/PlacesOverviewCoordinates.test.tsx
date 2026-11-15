// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { PlacesOverviewPage } from './PlacesOverviewPage';

vi.mock('./PlaceMapPicker', () => ({
  PlaceMapPicker: ({ onSelect }: { onSelect: (point: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({
          latitude: 0,
          longitude: 8.612346,
          name: 'Weekend stop',
          address: 'Coast',
        })
      }
    >
      Select map point
    </button>
  ),
}));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

it('saves map-picked coordinates even while technical details stay collapsed, including zero', async () => {
  const createPlace = vi.fn(async ({ placeCreate }) => ({
    ...placeCreate,
    id: 'new-place',
    version: 1,
  }));
  const apis = {
    places: {
      listPlaces: vi.fn(async () => ({ items: [], nextCursor: null })),
      createPlace,
    },
  } as unknown as SharedPlanningApis;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlacesOverviewPage apis={apis} spaceId="space-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByText(i18n.t('m5s3.place.create')));
  fireEvent.click(screen.getByRole('button', { name: 'Select map point' }));
  const details = document.querySelector('details');
  expect(details?.hasAttribute('open')).toBe(false);
  fireEvent.click(
    screen.getByRole('button', {
      name: i18n.t('m5s3.common.save'),
    }),
  );
  await waitFor(() =>
    expect(createPlace).toHaveBeenCalledExactlyOnceWith({
      spaceId: 'space-1',
      placeCreate: {
        name: 'Weekend stop',
        address: 'Coast',
        description: undefined,
        latitude: 0,
        longitude: 8.612346,
      },
    }),
  );
  expect(
    client.getQueryData(
      authorSummaryQueryKeys.placeDetail('space-1', 'new-place'),
    ),
  ).toMatchObject({ latitude: 0, longitude: 8.612346 });
});

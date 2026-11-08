// @vitest-environment jsdom
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlaceRelationsApi } from '../api/generated/apis/PlaceRelationsApi';
import { PlacesApi } from '../api/generated/apis/PlacesApi';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

import {
  authorSummaryQueryKeys,
  invalidateStoryProjections,
} from '../client/authorSummaryConsumers';
import { ClientProblemError } from '../client/problemDetails';
import photoPlaceCopy from '../i18n/locales/photoPlaces';
import { MomentPlaces } from './MomentPlaces';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
});

function wrapper(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

it('opens a map only as an explicit link and requires deliberate unlink confirmation', async () => {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
  const place = {
    id: 'p',
    name: 'Photo location',
    latitude: 0,
    longitude: 0,
  } as PlaceDetail;
  const list = vi
    .spyOn(PlacesApi.prototype, 'listMomentPlaces')
    .mockResolvedValue({ items: [place], nextCursor: null, hasMore: false });
  const unlink = vi
    .spyOn(PlaceRelationsApi.prototype, 'unlinkPlaceMemory')
    .mockResolvedValue();
  wrapper(
    <MomentPlaces
      canManage
      apiBaseUrl="http://example.test"
      accessToken="token"
      accountId="a"
      spaceId="s"
      targetId="m"
      kind="memories"
      offline={false}
    />,
  );
  expect(
    await screen.findByText(
      place.name === 'Photo location'
        ? photoPlaceCopy.locationFallback
        : place.name,
    ),
  ).toBeTruthy();
  expect(screen.queryByRole('link', { name: photoPlaceCopy.maps })).toBeNull();
  expect(unlink).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', {
      name: photoPlaceCopy.actions.replace(
        '{{name}}',
        photoPlaceCopy.locationFallback,
      ),
    }),
  );
  const map = await screen.findByRole('link', { name: photoPlaceCopy.maps });
  expect(map.getAttribute('href')).toBe('/story/map?place=0%3A0');
  fireEvent.click(screen.getByRole('button', { name: photoPlaceCopy.remove }));
  expect(unlink).not.toHaveBeenCalled();
  list.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  fireEvent.click(screen.getByRole('button', { name: photoPlaceCopy.remove }));
  await waitFor(() =>
    expect(unlink).toHaveBeenCalledWith({
      spaceId: 's',
      targetId: 'm',
      placeId: 'p',
    }),
  );
});

it('shows the resolved address as a direct coordinate map link before opening any menu', async () => {
  const place = {
    id: 'resolved',
    name: 'Riverside cafe',
    address: 'River Lane 12, Berlin',
    latitude: 52.516667,
    longitude: 13.4,
    geocodingSource: 'openstreetmap',
  } as PlaceDetail;
  vi.spyOn(PlacesApi.prototype, 'listMomentPlaces').mockResolvedValue({
    items: [place],
    nextCursor: null,
    hasMore: false,
  });
  wrapper(
    <MomentPlaces
      canManage
      apiBaseUrl="http://example.test"
      accessToken="token"
      accountId="a"
      spaceId="s"
      targetId="m"
      kind="memories"
      offline={false}
    />,
  );
  const address = await screen.findByRole('link', {
    name: photoPlaceCopy.mapAddress.replace('{{address}}', place.address ?? ''),
  });
  expect(address.textContent).toBe(place.address);
  expect(address.getAttribute('href')).toBe(
    '/story/map?place=52.516667%3A13.4',
  );
  expect(address.getAttribute('target')).toBeNull();
  expect(address.getAttribute('referrerpolicy')).toBeNull();
  expect(screen.getByText(place.name).tagName).toBe('STRONG');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(
    screen.getByRole('link', { name: '© OpenStreetMap' }).getAttribute('href'),
  ).toBe('https://www.openstreetmap.org/copyright');
  expect(screen.queryByRole('link', { name: photoPlaceCopy.edit })).toBeNull();
});

it('does not invent a map destination for an address without coordinates', async () => {
  vi.spyOn(PlacesApi.prototype, 'listMomentPlaces').mockResolvedValue({
    items: [
      {
        id: 'name-only',
        name: 'Our place',
        address: 'Our own address',
        latitude: null,
        longitude: null,
      } as PlaceDetail,
    ],
    nextCursor: null,
    hasMore: false,
  });
  wrapper(
    <MomentPlaces
      canManage
      apiBaseUrl="http://example.test"
      accessToken="token"
      accountId="a"
      spaceId="s"
      targetId="m"
      kind="memories"
      offline
    />,
  );
  expect(await screen.findByText('Our own address')).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
});

it('reveals an automatically added Place after saving a photo into a recently opened moment', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
  const otherSpace = [
    ...authorSummaryQueryKeys.places('other'),
    'moment',
    'private',
  ];
  client.setQueryData(otherSpace, {
    pages: [{ items: [] }],
    pageParams: [undefined],
  });
  const list = vi
    .spyOn(PlacesApi.prototype, 'listMomentPlaces')
    .mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MomentPlaces
          canManage
          apiBaseUrl="http://example.test"
          accessToken="token"
          accountId="a"
          spaceId="s"
          targetId="existing-memory"
          kind="memories"
          offline={false}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(
    screen.getByRole('button', { name: photoPlaceCopy.add }),
  ).toBeDefined();
  const place = {
    id: 'new-photo-place',
    name: 'New photo location',
    latitude: 52.516667,
    longitude: 13.4,
  } as PlaceDetail;
  list.mockResolvedValue({ items: [place], nextCursor: null, hasMore: false });
  // Memory and shared HeartMoment saves already call this projection boundary.
  // A fresh cached empty result must not hide the newly bound photo's Place.
  await act(() => invalidateStoryProjections(client, 's'));
  expect(
    await screen.findByText(
      place.name === 'Photo location'
        ? photoPlaceCopy.locationFallback
        : place.name,
    ),
  ).toBeTruthy();
  expect(list).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: photoPlaceCopy.add })).toBeTruthy();
  expect(
    screen.getByRole('button', {
      name: photoPlaceCopy.actions.replace('{{name}}', place.name),
    }),
  ).toBeTruthy();
  expect(client.getQueryState(otherSpace)?.isInvalidated).toBe(false);
});

it('keeps a saved location readable without add or management controls in reading mode', async () => {
  const place = {
    id: 'read-only-place',
    name: 'Our lakeside',
    address: 'Lake Road 4',
    latitude: 52.5,
    longitude: 13.4,
  } as PlaceDetail;
  vi.spyOn(PlacesApi.prototype, 'listMomentPlaces').mockResolvedValue({
    items: [place],
    nextCursor: null,
    hasMore: false,
  });
  wrapper(
    <MomentPlaces
      apiBaseUrl="http://example.test"
      accessToken="token"
      accountId="a"
      spaceId="s"
      targetId="m"
      kind="memories"
      offline={false}
    />,
  );
  expect(await screen.findByText(place.name)).toBeTruthy();
  expect(
    screen.getByRole('link', {
      name: photoPlaceCopy.mapAddress.replace('{{address}}', place.address!),
    }),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: photoPlaceCopy.add })).toBeNull();
  expect(
    screen.queryByRole('button', {
      name: photoPlaceCopy.actions.replace('{{name}}', place.name),
    }),
  ).toBeNull();
});

it('keeps all ordered Places beside the date while disclosing map context on demand', async () => {
  const places = ['Riverbank', 'Old town'].map(
    (name, index) =>
      ({
        id: `inline-${index}`,
        name,
        address: `${name} address`,
        latitude: 49.23,
        longitude: 6.99,
        geocodingSource: 'openstreetmap',
      }) as PlaceDetail,
  );
  vi.spyOn(PlacesApi.prototype, 'listMomentPlaces').mockResolvedValue({
    items: places,
    nextCursor: null,
    hasMore: false,
  });
  const { container } = wrapper(
    <div className="moment-metadata">
      <time dateTime="2026-11-04">4 November 2026</time>
      <MomentPlaces
        apiBaseUrl="http://example.test"
        accessToken="test"
        accountId="account"
        spaceId="space"
        targetId="moment"
        kind="memories"
        offline={false}
        inline
        orderedIds={['inline-1', 'inline-0']}
      />
    </div>,
  );
  await screen.findByRole('button', { name: 'Old town' });
  const names = Array.from(
    container.querySelectorAll('.moment-place-summary'),
  ).map((button) => button.textContent);
  expect(names).toEqual(['Old town', 'Riverbank']);
  expect(
    container.querySelector('.moment-metadata > .moment-places-inline'),
  ).not.toBeNull();
  expect(screen.queryByRole('link', { name: /Old town address/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Old town' }));
  expect(await screen.findByRole('dialog', { name: 'Old town' })).toBeTruthy();
  expect(
    screen.getByRole('link', { name: /Old town address/ }).getAttribute('href'),
  ).toContain('49.23');
  expect(screen.getByRole('link', { name: '© OpenStreetMap' })).toBeTruthy();
});

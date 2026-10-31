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
import { AccountApi } from '../api/generated/apis/AccountApi';
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
import { PhotoLocationSettings } from './PhotoLocationSettings';

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

it('waits for the real preference and confirms only after the server accepts it', async () => {
  let finish!: (value: { enabled: boolean; version: number }) => void;
  vi.spyOn(
    AccountApi.prototype,
    'getPhotoLocationPreference',
  ).mockResolvedValue({ enabled: true, version: 0 });
  const save = vi
    .spyOn(AccountApi.prototype, 'setPhotoLocationPreference')
    .mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  wrapper(
    <PhotoLocationSettings
      apiBaseUrl="http://example.test"
      accessToken="token"
      accountId="a"
    />,
  );
  expect(screen.queryByRole('switch')).toBeNull();
  const control = await screen.findByRole('switch');
  expect(control.getAttribute('aria-checked')).toBe('true');
  fireEvent.click(control);
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      ifMatch: '"0"',
      photoLocationPreferenceUpdate: { enabled: false },
    }),
  );
  expect(control.getAttribute('aria-checked')).toBe('true');
  expect((control as HTMLButtonElement).disabled).toBe(true);
  finish({ enabled: false, version: 1 });
  await waitFor(() =>
    expect(control.getAttribute('aria-checked')).toBe('false'),
  );
  expect(await screen.findByText(photoPlaceCopy.saved)).toBeTruthy();
});

it('does not queue an offline preference change or change its confirmed value', async () => {
  vi.spyOn(
    AccountApi.prototype,
    'getPhotoLocationPreference',
  ).mockResolvedValue({ enabled: true, version: 0 });
  const save = vi.spyOn(AccountApi.prototype, 'setPhotoLocationPreference');
  wrapper(
    <PhotoLocationSettings
      apiBaseUrl="http://example.test"
      accessToken="token"
      accountId="a"
    />,
  );
  const control = await screen.findByRole('switch');
  onlineManager.setOnline(false);
  fireEvent.click(control);
  await waitFor(() =>
    expect((control as HTMLButtonElement).disabled).toBe(false),
  );
  expect(save).not.toHaveBeenCalled();
  expect(control.getAttribute('aria-checked')).toBe('true');
  onlineManager.setOnline(true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(save).not.toHaveBeenCalled();
});

it('refreshes a concurrent preference without claiming the failed write succeeded', async () => {
  vi.spyOn(AccountApi.prototype, 'getPhotoLocationPreference')
    .mockResolvedValueOnce({ enabled: true, version: 0 })
    .mockResolvedValue({ enabled: false, version: 2 });
  vi.spyOn(
    AccountApi.prototype,
    'setPhotoLocationPreference',
  ).mockRejectedValue(new ClientProblemError('conflict', 409));
  wrapper(
    <PhotoLocationSettings
      apiBaseUrl="http://example.test"
      accessToken="token"
      accountId="a"
    />,
  );
  fireEvent.click(await screen.findByRole('switch'));
  await waitFor(() =>
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(
      'false',
    ),
  );
  expect(screen.queryByText(photoPlaceCopy.saved)).toBeNull();
});

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
  expect(map.getAttribute('href')).toBe(
    'https://www.google.com/maps/search/?api=1&query=0%2C0',
  );
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
    'https://www.google.com/maps/search/?api=1&query=52.516667%2C13.4',
  );
  expect(address.getAttribute('target')).toBe('_blank');
  expect(address.getAttribute('referrerpolicy')).toBe('no-referrer');
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
  expect(screen.queryByRole('button', { name: photoPlaceCopy.add })).toBeNull();
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

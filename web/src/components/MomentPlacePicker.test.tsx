// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { PlacesApi } from '../api/generated/apis/PlacesApi';
import type { PlaceRelationsApi } from '../api/generated/apis/PlaceRelationsApi';
import { ClientProblemError } from '../client/problemDetails';
import copy from '../i18n/locales/photoPlaces';
import { MomentPlacePicker } from './MomentPlacePicker';

vi.mock('./PlaceMapPicker', () => ({
  PlaceMapPicker: ({
    onSelect,
    disabled,
  }: {
    onSelect: (place: unknown) => void;
    disabled: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() =>
        onSelect({ name: 'By the water', latitude: 52.5, longitude: 13.4 })
      }
    >
      Choose on map
    </button>
  ),
}));
afterEach(cleanup);
const place = { id: 'p', name: 'By the water' };
function setup(create: () => Promise<unknown> = async () => place) {
  const key = ['moment-places', 'account', 'space', 'memory'];
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(key, { items: [], nextCursor: null });
  const api = {
    listPlaces: vi.fn(async () => ({ items: [], nextCursor: null })),
    createPlace: vi.fn(create),
  };
  const relations = {
    linkPlaceMemory: vi.fn(async () => undefined),
    linkPlaceHeartMoment: vi.fn(async () => undefined),
  };
  const linked = vi.fn();
  const pending = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <MomentPlacePicker
        api={api as unknown as PlacesApi}
        relations={relations as unknown as PlaceRelationsApi}
        spaceId="s"
        targetId="m"
        kind="memories"
        queryKey={key}
        offline={false}
        onLinked={linked}
        onPendingChange={pending}
      />
    </QueryClientProvider>,
  );
  return { api, relations, linked, pending, client, key };
}
it('keeps a created Place after a failed relation and retries only the unfinished link', async () => {
  const h = setup();
  h.relations.linkPlaceMemory.mockRejectedValueOnce(
    new ClientProblemError('server', 500),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Choose on map' }));
  const retry = await screen.findByRole('button', { name: copy.retryLink });
  await waitFor(() =>
    expect((retry as HTMLButtonElement).disabled).toBe(false),
  );
  expect(h.api.createPlace).toHaveBeenCalledTimes(1);
  expect(h.linked).not.toHaveBeenCalled();
  fireEvent.click(retry);
  await waitFor(() => expect(h.linked).toHaveBeenCalledTimes(1));
  expect(h.api.createPlace).toHaveBeenCalledTimes(1);
  expect(h.relations.linkPlaceMemory).toHaveBeenCalledTimes(2);
  expect(h.relations.linkPlaceHeartMoment).not.toHaveBeenCalled();
  expect(h.pending.mock.calls.map((call) => call[0])).toEqual([
    true,
    false,
    true,
    false,
  ]);
});
it('does not link or report success after the initiating moment loses authorization during Place creation', async () => {
  let resolve!: (value: unknown) => void;
  const h = setup(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Choose on map' }));
  await waitFor(() => expect(h.api.createPlace).toHaveBeenCalledTimes(1));
  h.client
    .getQueryCache()
    .find({ queryKey: h.key, exact: true })
    ?.setState({
      status: 'error',
      error: new ClientProblemError('permission', 403),
    });
  await act(async () => resolve(place));
  expect(h.relations.linkPlaceMemory).not.toHaveBeenCalled();
  expect(h.linked).not.toHaveBeenCalled();
});

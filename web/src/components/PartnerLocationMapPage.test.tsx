// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AccountView } from '../api/generated/models/AccountView';
import copy from '../i18n/locales/partnerLocation';
import { PartnerLocationMapPage } from './PartnerLocationMapPage';
import type { MapArea, MapFocus } from './PlaceMapCanvas';

const env = vi.hoisted(() => ({
  partnerArea: true,
  ownPosition: true,
}));

/** What the page last handed the map. */
const canvas = vi.hoisted(() => ({
  focus: undefined as MapFocus | undefined,
  showAreasRequest: 0,
  areas: [] as readonly MapArea[],
}));

vi.mock('./PlaceMapCanvas', () => ({
  default: (props: {
    areas?: readonly MapArea[];
    focus?: MapFocus;
    showAreasRequest?: number;
    onAreaSelect?: (id: string) => void;
  }) => {
    canvas.focus = props.focus;
    canvas.showAreasRequest = props.showAreasRequest ?? 0;
    canvas.areas = props.areas ?? [];
    return (
      <div data-testid="map">
        {props.areas?.map((area) =>
          area.selectLabel && props.onAreaSelect ? (
            <button
              key={area.id}
              type="button"
              onClick={() => props.onAreaSelect?.(area.id)}
            >
              {area.selectLabel}
            </button>
          ) : null,
        )}
      </div>
    );
  },
}));
vi.mock('../client/approximateLocation', () => ({
  locationPermission: async () => (env.ownPosition ? 'granted' : 'prompt'),
  currentApproximatePosition: async () => ({
    latitude: 50.94,
    longitude: 6.96,
  }),
}));
vi.mock('../client/partnerLocation', () => ({
  usePartnerLocationApi: () => ({}),
  usePartnerLocationCapability: () => ({
    data: true,
    isError: false,
    isPending: false,
  }),
  usePartnerLocationSettings: () => ({
    data: {
      state: 'ACTIVE',
      level: 'DISTANCE_AND_MAP',
      precision: 'APPROXIMATE',
    },
  }),
  usePartnerName: () => ({
    paired: true,
    id: 'account-2',
    name: 'Alex Example',
  }),
}));
vi.mock('../client/partnerDistance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../client/partnerDistance')>()),
  usePartnerMapArea: () => ({
    isSuccess: true,
    isError: false,
    isPending: false,
    data: env.partnerArea
      ? {
          available: true,
          latitude: 53.55,
          longitude: 9.99,
          radiusMeters: 5000,
          capturedAt: new Date(),
        }
      : { available: false },
  }),
}));

const account = { id: 'account-1', displayName: 'Lea Example' } as AccountView;
const forPartner = (value: string) => value.replaceAll('{{partner}}', 'Alex');

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: () => null } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PartnerLocationMapPage
          apiBaseUrl="https://api.example"
          accessToken="token"
          account={account}
          spaceId="space-1"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sheet = () =>
  within(
    screen
      .getByRole('heading', { name: copy.mapPeopleLabel })
      .closest('section')!,
  );

beforeEach(() => {
  env.partnerArea = true;
  env.ownPosition = true;
  canvas.focus = undefined;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((media: string) => ({
      matches: media === '(prefers-reduced-motion: reduce)',
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});
afterEach(cleanup);

it('names each avatar on the map as a way to zoom to that person', async () => {
  renderPage();
  const map = within(await screen.findByTestId('map'));
  expect(
    await map.findByRole('button', { name: copy.mapZoomToOwn }),
  ).toBeTruthy();
  expect(
    map.getByRole('button', { name: forPartner(copy.mapZoomToPartner) }),
  ).toBeTruthy();
  expect(canvas.areas.map(({ id, selectLabel }) => [id, selectLabel])).toEqual([
    ['partner', forPartner(copy.mapZoomToPartner)],
    ['own', copy.mapZoomToOwn],
  ]);
  expect(canvas.focus).toBeUndefined();
});

it('focuses the tapped person with their radius and again on a second tap', async () => {
  renderPage();
  const map = within(await screen.findByTestId('map'));
  const partner = map.getByRole('button', {
    name: forPartner(copy.mapZoomToPartner),
  });
  fireEvent.click(partner);
  expect(canvas.focus).toEqual({
    latitude: 53.55,
    longitude: 9.99,
    radiusMeters: 5000,
    request: 1,
  });
  // After the viewer panned away, the same avatar flies there again.
  fireEvent.click(partner);
  expect(canvas.focus).toEqual(expect.objectContaining({ request: 2 }));
  fireEvent.click(await map.findByRole('button', { name: copy.mapZoomToOwn }));
  expect(canvas.focus).toEqual({
    latitude: 50.94,
    longitude: 6.96,
    radiusMeters: 0,
    request: 3,
  });
});

it('lets the sheet rows focus a person and "show us" return to both', async () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  renderPage();
  await screen.findByTestId('map');
  // The visible row text stays the start of its accessible name.
  const own = await sheet().findByRole('button', {
    name: new RegExp(`^${copy.mapYou}.*${copy.mapZoomToOwn}$`),
  });
  fireEvent.click(own);
  expect(canvas.focus).toEqual(
    expect.objectContaining({ latitude: 50.94, radiusMeters: 0 }),
  );
  // The map comes into view without motion for reduced motion.
  expect(scrollIntoView).toHaveBeenCalledWith({
    block: 'nearest',
    behavior: 'auto',
  });
  fireEvent.click(
    sheet().getByRole('button', {
      name: new RegExp(forPartner(copy.mapZoomToPartner)),
    }),
  );
  expect(canvas.focus).toEqual(
    expect.objectContaining({ latitude: 53.55, radiusMeters: 5000 }),
  );
  const before = canvas.showAreasRequest;
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: copy.mapShowUs }));
  });
  expect(canvas.focus).toBeUndefined();
  expect(canvas.showAreasRequest).toBe(before + 1);
});

it('offers no zoom for a person who is not on the map', async () => {
  env.partnerArea = false;
  env.ownPosition = false;
  renderPage();
  await screen.findByTestId('map');
  expect(sheet().queryByRole('button')).toBeNull();
  expect(canvas.areas).toEqual([]);
});

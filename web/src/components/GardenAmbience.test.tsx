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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GardenPlantView } from '../api/generated/models/GardenPlantView';
import type { GardenView } from '../api/generated/models/GardenView';
import { gardenFlight } from '../client/garden';
import type { SpaceOccasion } from '../client/occasionMatches';
import games from '../i18n/locales/games';
import { GardenGamePage, type GardenServices } from './GardenGamePage';

vi.mock('../client/gardenImage', () => ({
  renderSvgPng: vi.fn().mockResolvedValue(new Blob(['png'])),
}));

const ME = 'me';
const PARTNER = 'partner';
const PARTNERS = [
  { id: ME, displayName: 'Lea' },
  { id: PARTNER, displayName: 'Alex' },
];
const copy = games.garden;
const ambience = copy.ambience;
const DAY = new Date('2026-11-16T00:00:00Z');

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, String(value)),
    template,
  );
}

const plant = (
  id: string,
  slot: number,
  overrides: Partial<GardenPlantView> = {},
): GardenPlantView => ({
  id,
  species: 'POPPY',
  words: null,
  senderId: PARTNER,
  sentOn: new Date('2026-11-08T00:00:00Z'),
  stage: 3,
  slot,
  inPond: false,
  ...overrides,
});

function view(overrides: Partial<GardenView> = {}): GardenView {
  return {
    localDate: DAY,
    plants: [plant('p1', 0), plant('p2', 1, { senderId: ME })],
    incoming: null,
    sentToday: null,
    partnerSentToday: false,
    sharedToday: false,
    wateredToday: null,
    partnerWateredToday: null,
    sleeping: false,
    reunionToday: false,
    offer: ['POPPY', 'SUNFLOWER', 'SURPRISE'],
    sharedDays: 60,
    form: 'PARADISE',
    unlocks: ['PATH', 'POND', 'BENCH', 'TREE', 'BIRDHOUSE', 'SWING'],
    news: [],
    discovered: ['POPPY'],
    name: null,
    bouquet: null,
    gaveBouquetToday: false,
    ...overrides,
  };
}

function services(...views: GardenView[]): GardenServices {
  const load = vi.fn();
  for (const entry of views) load.mockResolvedValueOnce(entry);
  load.mockResolvedValue(views[views.length - 1]);
  return {
    load,
    send: vi.fn(),
    plant: vi.fn(),
    water: vi.fn(),
    nameVisitor: vi.fn(),
  };
}

function renderPage(
  api: GardenServices,
  occasions: ReadonlyArray<SpaceOccasion> = [],
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/games/garden']}>
        <GardenGamePage
          apiBaseUrl="http://api.example.test"
          accessToken="token"
          spaceId="space"
          currentAccountId={ME}
          services={api}
          loadPartners={async () => PARTNERS}
          occasionsOverride={occasions}
          flightOverride={gardenFlight()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function reducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

/** The device clock; timers keep running. */
function clock(hour: number) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 16, hour, 0, 0));
}

const status = () => document.querySelector('.garden-status')?.textContent;

beforeEach(() => reducedMotion(true));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('garden ambience', () => {
  it('follows the device clock; at night the birds sleep in the tree', async () => {
    clock(23);
    renderPage(services(view()));
    const frame = await screen.findByTestId('garden-frame');
    expect(frame.getAttribute('data-daytime')).toBe('night');
    expect(
      screen.getByTestId('garden-scene').getAttribute('aria-label'),
    ).toContain(ambience.daytime.night);
    fireEvent.click(screen.getByRole('button', { name: ambience.labels.tree }));
    expect(status()).toBe(ambience.tap.treeNight);
    fireEvent.keyDown(
      screen.getByRole('button', { name: ambience.labels.pond }),
      { key: 'Enter' },
    );
    expect(status()).toBe(ambience.tap.pond);
    fireEvent.click(
      screen.getAllByRole('button', { name: ambience.labels.cloud })[0],
    );
    expect(status()).toBe(ambience.tap.cloud);
  });

  it('lets a flower bob while its story still opens', async () => {
    clock(11);
    renderPage(services(view()));
    const flower = await screen.findByRole('button', {
      name: fill(copy.plantLabel, {
        species: copy.species.POPPY.name,
        name: 'Alex',
      }),
    });
    fireEvent.click(flower);
    expect(flower.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(copy.stages[3])).toBeTruthy();
    expect(status()).toBe(ambience.tap.flower);
    expect(
      document
        .querySelector('[data-plant-art="p1"]')
        ?.classList.contains('is-boing'),
    ).toBe(true);
    // Tapping it again closes the story without another bounce message.
    fireEvent.click(flower);
    expect(flower.getAttribute('aria-pressed')).toBe('false');
  });

  it('waters with the can tilted, also without motion, then removes it', async () => {
    clock(11);
    const api = services(view());
    api.water = vi.fn().mockResolvedValue(view({ wateredToday: 'p1' }));
    renderPage(api);
    fireEvent.click(await screen.findByRole('button', { name: copy.water }));
    fireEvent.click(
      screen.getAllByRole('button', {
        name: fill(copy.waterPlantLabel, {
          species: copy.species.POPPY.name,
        }),
      })[0],
    );
    const can = await screen.findByTestId('garden-watering-can');
    expect(can.getAttribute('data-who')).toBe('own');
    expect(can.querySelector('.garden-can-tilt')).toBeTruthy();
    expect(status()).toBe(fill(copy.wateredStatus, { name: 'Alex' }));
    await waitFor(
      () => expect(screen.queryByTestId('garden-watering-can')).toBeNull(),
      { timeout: 4_000 },
    );
  });

  it('shows today’s together moments and the partner’s note in the birdhouse', async () => {
    clock(11);
    renderPage(
      services(
        view({
          plants: [
            plant('p1', 0),
            plant('p2', 1, { senderId: ME }),
            plant('today', 2, { stage: 0, sentOn: DAY, words: 'MISS_YOU' }),
          ],
          sentToday: plant('mine', 3, { senderId: ME, sentOn: DAY }),
          partnerSentToday: true,
          sharedToday: true,
          wateredToday: 'p1',
          partnerWateredToday: 'p2',
        }),
      ),
    );
    expect(await screen.findByTestId('garden-double-rainbow')).toBeTruthy();
    expect(screen.getByTestId('garden-together')).toBeTruthy();
    const label = screen.getByTestId('garden-scene').getAttribute('aria-label');
    expect(label).toContain(ambience.doubleRainbow);
    expect(label).toContain(ambience.together.swing);
    fireEvent.click(
      screen.getByRole('button', {
        name: fill(ambience.labels.birdhouse, { name: 'Alex' }),
      }),
    );
    expect(screen.getByTestId('garden-birdhouse-words').textContent).toBe(
      copy.words.MISS_YOU,
    );
    expect(status()).toBe(
      fill(ambience.birdhouseStatus, {
        name: 'Alex',
        words: copy.words.MISS_YOU,
      }),
    );
  });

  it('has no birdhouse note or figures without today’s seeds', async () => {
    clock(11);
    renderPage(services(view()));
    await screen.findByTestId('garden-frame');
    expect(screen.queryByTestId('garden-together')).toBeNull();
    expect(screen.queryByTestId('garden-double-rainbow')).toBeNull();
    expect(screen.queryByTestId('garden-birdhouse-note')).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: fill(ambience.labels.birdhouse, { name: 'Alex' }),
      }),
    ).toBeNull();
  });

  it('plays the partner’s watering once when the live sync brings it', async () => {
    clock(11);
    renderPage(
      services(
        view({ wateredToday: 'p2' }),
        view({ wateredToday: 'p2', partnerWateredToday: 'p1' }),
      ),
    );
    const can = await screen.findByTestId(
      'garden-watering-can',
      {},
      { timeout: 5_000 },
    );
    expect(can.getAttribute('data-who')).toBe('partner');
    expect(screen.getByTestId('garden-double-rainbow')).toBeTruthy();
  }, 10_000);

  it('decorates the garden on the partner’s birthday only', async () => {
    clock(11);
    renderPage(services(view()), [
      {
        kind: 'birthday',
        key: 'birthday:partner',
        date: new Date('1992-11-16T00:00:00Z'),
        accountId: PARTNER,
        displayName: 'Alex',
        isViewer: false,
      },
    ]);
    expect((await screen.findByTestId('garden-celebration')).textContent).toBe(
      fill(ambience.celebration.birthdayPartner, { name: 'Alex' }),
    );
    expect(screen.getByTestId('garden-celebration-lights')).toBeTruthy();
  });

  it('notes the first snow on the first day of winter', async () => {
    clock(11);
    renderPage(services(view({ localDate: new Date('2026-12-01T00:00:00Z') })));
    expect((await screen.findByTestId('garden-first-snow')).textContent).toBe(
      ambience.firstSnow,
    );
  });

  it('calls a named visitor from the garden book', async () => {
    clock(11);
    renderPage(
      services(view({ visitorNames: [{ animal: 'SNAIL', name: 'Frieda' }] })),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: copy.growth.book }),
    );
    // Only named visitors can be called.
    expect(
      screen.queryByRole('button', {
        name: fill(ambience.call.label, { name: 'Hoppel' }),
      }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', {
        name: fill(ambience.call.label, { name: 'Frieda' }),
      }),
    );
    expect(screen.queryByTestId('garden-book')).toBeNull();
    await waitFor(() =>
      expect(status()).toBe(fill(ambience.call.greeted, { name: 'Frieda' })),
    );
    await waitFor(() =>
      expect(screen.getByTestId('garden-greet-hearts')).toBeTruthy(),
    );
  });
});

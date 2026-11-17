// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GardenPlantView } from '../api/generated/models/GardenPlantView';
import type { GardenView } from '../api/generated/models/GardenView';
import { gardenFlight } from '../client/garden';
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
const growth = copy.growth;
const DAY = new Date('2026-11-16T00:00:00Z');

function view(overrides: Partial<GardenView> = {}): GardenView {
  return {
    localDate: DAY,
    plants: [],
    incoming: null,
    sentToday: null,
    partnerSentToday: false,
    sharedToday: false,
    wateredToday: null,
    partnerWateredToday: null,
    offer: ['POPPY', 'SUNFLOWER', 'SURPRISE'],
    sharedDays: 30,
    form: 'GARDEN',
    unlocks: [
      'PATH',
      'POND',
      'SUNFLOWER',
      'TULIP',
      'WATER_LILY',
      'BENCH',
      'TREE',
      'MORE_ROOM',
      'STRAWBERRY',
    ],
    news: [],
    discovered: ['POPPY', 'BELLFLOWER', 'STARFLOWER', 'SUNFLOWER'],
    name: null,
    bouquet: null,
    gaveBouquetToday: false,
    ...overrides,
  };
}

const plant = (
  id: string,
  slot: number,
  stage: number,
  overrides: Partial<GardenPlantView> = {},
): GardenPlantView => ({
  id,
  species: 'POPPY',
  words: null,
  senderId: PARTNER,
  sentOn: new Date('2026-11-08T00:00:00Z'),
  stage,
  slot,
  inPond: false,
  ...overrides,
});

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, String(value)),
    template,
  );
}

function services(initial: GardenView): Required<GardenServices> {
  return {
    load: vi.fn().mockResolvedValue(initial),
    send: vi.fn().mockResolvedValue(initial),
    plant: vi.fn().mockResolvedValue(initial),
    water: vi.fn().mockResolvedValue(initial),
    acknowledgeNews: vi.fn().mockResolvedValue({ ...initial, news: [] }),
    rename: vi.fn(),
    giveBouquet: vi.fn(),
    closeBouquet: vi.fn().mockResolvedValue({ ...initial, bouquet: null }),
    saveToMoments: vi.fn().mockResolvedValue({ memoryId: 'memory-1' }),
  };
}

function renderPage(api: GardenServices) {
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
          flightOverride={gardenFlight({
            kind: 'distance',
            band: { kind: 'APPROXIMATE', approximateKm: 350 },
            asOf: new Date(),
            mapAvailable: false,
          })}
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

beforeEach(() => reducedMotion(true));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('garden growth and life', () => {
  it('announces new things once, quietly and without numbers', async () => {
    const api = services(view({ news: ['BENCH', 'TREE', 'STRAWBERRY'] }));
    renderPage(api);

    const card = await screen.findByTestId('garden-news');
    expect(within(card).getByText(growth.newsEyebrow)).toBeTruthy();
    expect(within(card).getByText(growth.forms.GARDEN)).toBeTruthy();
    expect(within(card).getByText(growth.finds.BENCH)).toBeTruthy();
    expect(
      within(card).getByText(
        fill(growth.newSeeds, { species: copy.species.STRAWBERRY.name }),
      ),
    ).toBeTruthy();
    // No counter, bar or number anywhere in the announcement.
    expect(card.textContent).not.toMatch(/\d/);
    expect(card.querySelector('progress, [role="progressbar"]')).toBeNull();

    fireEvent.click(
      within(card).getByRole('button', { name: growth.newsDone }),
    );
    await waitFor(() => expect(api.acknowledgeNews).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('garden-news')).toBeNull());
  });

  it('shows the garden name as the page title and renames it in the book', async () => {
    const api = services(view({ name: 'Unser Eck' }));
    vi.mocked(api.rename).mockResolvedValue(view({ name: 'Rosengarten' }));
    renderPage(api);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Unser Eck' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: growth.book }));
    const book = screen.getByTestId('garden-book');
    // Undiscovered plants and finds are placeholders without any distance hint.
    expect(within(book).getAllByText(growth.undiscovered).length).toBe(4);
    expect(within(book).getAllByText(growth.secret).length).toBe(5);
    expect(within(book).getByText(growth.finds.TREE)).toBeTruthy();
    expect(book.textContent).not.toMatch(/\d/);

    fireEvent.click(within(book).getByRole('button', { name: growth.rename }));
    const input = within(book).getByLabelText(growth.nameLabel);
    expect(input.getAttribute('maxlength')).toBe('40');
    fireEvent.change(input, { target: { value: '  Rosengarten ' } });
    fireEvent.click(within(book).getByRole('button', { name: growth.save }));
    await waitFor(() => expect(api.rename).toHaveBeenCalledWith('Rosengarten'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Rosengarten' }),
    ).toBeTruthy();
  });

  it('binds up to three blooming flowers into a bouquet for the partner', async () => {
    const plants = [
      plant('p1', 0, 3),
      plant('p2', 1, 3, { senderId: ME }),
      plant('p3', 2, 3),
      plant('p4', 3, 3),
      plant('bud', 4, 2),
      plant('lily', 0, 3, { species: 'WATER_LILY', inPond: true }),
      plant('tulip', 5, 3, { species: 'TULIP' }),
    ];
    const api = services(view({ plants }));
    vi.mocked(api.giveBouquet).mockResolvedValue(
      view({
        plants: plants.map((entry) =>
          ['p1', 'p2', 'p3'].includes(entry.id)
            ? { ...entry, stage: 0 }
            : entry,
        ),
        gaveBouquetToday: true,
      }),
    );
    renderPage(api);

    fireEvent.click(await screen.findByRole('button', { name: growth.bind }));
    const card = screen.getByTestId('garden-bind-card');
    const give = within(card).getByRole('button', {
      name: fill(growth.bindSend, { name: 'Alex' }),
    }) as HTMLButtonElement;
    expect(give.disabled).toBe(true);
    // A bud, a pond lily and a resting tulip cannot be picked.
    for (const slot of ['garden-plant-4', 'garden-plant-5']) {
      fireEvent.click(screen.getByTestId(slot));
    }
    fireEvent.click(
      screen
        .getAllByTestId('garden-plant-0')
        .find((target) => target.getAttribute('data-in-pond')) as Element,
    );
    expect(give.disabled).toBe(true);
    for (const slot of [0, 1, 2, 3]) {
      const target = screen
        .getAllByTestId(`garden-plant-${slot}`)
        .find((element) => !element.getAttribute('data-in-pond'));
      fireEvent.click(target as Element);
    }
    expect(
      within(card).getByText(fill(growth.bindCount_other, { count: 3 })),
    ).toBeTruthy();
    fireEvent.click(give);
    await waitFor(() =>
      expect(api.giveBouquet).toHaveBeenCalledWith(['p1', 'p2', 'p3']),
    );
    expect(
      await screen.findByText(fill(growth.bouquetSentStatus, { name: 'Alex' })),
    ).toBeTruthy();
    // One bouquet a day: the action is gone afterwards.
    expect(screen.queryByRole('button', { name: growth.bind })).toBeNull();
  });

  it('puts a received bouquet into Momente only on an explicit tap', async () => {
    const api = services(
      view({
        bouquet: {
          id: 'bouquet-1',
          giverId: PARTNER,
          givenOn: DAY,
          flowers: [
            { species: 'SUNFLOWER', senderId: ME },
            { species: 'POPPY', senderId: PARTNER },
          ],
        },
      }),
    );
    renderPage(api);

    const card = await screen.findByTestId('garden-bouquet-card');
    expect(
      within(card).getByText(fill(growth.bouquetTitle, { name: 'Alex' })),
    ).toBeTruthy();
    expect(api.saveToMoments).not.toHaveBeenCalled();
    fireEvent.click(
      within(card).getByRole('button', { name: growth.bouquetKeep }),
    );
    await waitFor(() => expect(api.saveToMoments).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.saveToMoments).mock.calls[0][0]).toMatchObject({
      title: fill(growth.bouquetMemoryTitle, { name: 'Alex' }),
      fileName: 'strauss.png',
    });
    await waitFor(() =>
      expect(api.closeBouquet).toHaveBeenCalledWith('bouquet-1', true),
    );
    expect(await screen.findByText(growth.bouquetKept)).toBeTruthy();
  });

  it('closes a bouquet with thanks without saving anything', async () => {
    const api = services(
      view({
        bouquet: {
          id: 'bouquet-2',
          giverId: PARTNER,
          givenOn: DAY,
          flowers: [{ species: 'TULIP', senderId: PARTNER }],
        },
      }),
    );
    renderPage(api);
    fireEvent.click(
      await screen.findByRole('button', { name: growth.bouquetThanks }),
    );
    await waitFor(() =>
      expect(api.closeBouquet).toHaveBeenCalledWith('bouquet-2', false),
    );
    expect(api.saveToMoments).not.toHaveBeenCalled();
  });

  it('keeps the surprise wrapped and tells the resting tulip apart', async () => {
    const api = services(
      view({
        plants: [
          plant('tulip', 0, 3, { species: 'TULIP' }),
          plant('wrapped', 1, 2, { species: 'SURPRISE' }),
        ],
      }),
    );
    renderPage(api);
    fireEvent.click(await screen.findByTestId('garden-plant-0'));
    expect(await screen.findByText(growth.restingTulip)).toBeTruthy();
    fireEvent.click(screen.getByTestId('garden-plant-1'));
    expect(
      screen.getByRole('heading', { name: copy.species.SURPRISE.name }),
    ).toBeTruthy();
  });

  it('lets visitors react to a tap and names the reaction', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const api = services(view({ sharedDays: 12, unlocks: ['PATH', 'POND'] }));
    renderPage(api);

    const visitor = await screen.findByTestId(
      /garden-animal-(snail|rabbit|hedgehog|ducks)/,
      undefined,
      { timeout: 4000 },
    );
    const kind = visitor
      .getAttribute('data-testid')
      ?.replace('garden-animal-', '') as keyof typeof growth.reactions;
    expect(visitor.getAttribute('role')).toBe('button');
    expect(visitor.getAttribute('aria-label')).toBe(
      fill(growth.animalLabel, { animal: growth.animals[kind] }),
    );
    fireEvent.click(visitor);
    expect(await screen.findByText(growth.reactions[kind])).toBeTruthy();
  });

  it('sends kind words by plane banner sometimes, and falls back to the card with reduced motion', async () => {
    const incoming = plant('seed-plane-3', 0, 0, { words: 'MISS_YOU' });
    // Find a seed id whose words travel by plane.
    const { wordsArriveByPlane } = await import('../client/gardenGrowth');
    let id = 0;
    while (!wordsArriveByPlane(`seed-${id}`)) id += 1;
    const withPlane = { ...incoming, id: `seed-${id}`, slot: null };

    reducedMotion(true);
    const quiet = renderPage(services(view({ incoming: withPlane })));
    expect(
      await screen.findByRole('button', { name: new RegExp(copy.foldedCard) }),
    ).toBeTruthy();
    expect(screen.queryByText(growth.planeNote)).toBeNull();
    quiet.unmount();

    reducedMotion(false);
    renderPage(services(view({ incoming: withPlane })));
    const note = await screen.findByRole('button', {
      name: new RegExp(growth.planeNote),
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((step) => {
      window.setTimeout(() => step(performance.now() + 60_000), 0);
      return 1;
    });
    await act(async () => {
      fireEvent.click(note);
    });
    expect(
      await screen.findByText(
        fill(copy.quoted, { words: copy.words.MISS_YOU }),
      ),
    ).toBeTruthy();
  });
});

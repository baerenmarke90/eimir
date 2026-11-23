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
import type { GardenView } from '../api/generated/models/GardenView';
import { gardenFlight } from '../client/garden';
import { LIVE_GAME_REFRESH_MS } from '../client/liveGameSync';
import games from '../i18n/locales/games';
import { GardenGamePage, type GardenServices } from './GardenGamePage';

vi.mock('../client/gardenPresentation', async (original) => ({
  ...(await original<typeof import('../client/gardenPresentation')>()),
  // jsdom cannot rasterize SVG; the still itself is covered in the browser.
  gardenSceneImage: vi.fn().mockResolvedValue(new Blob(['png'])),
}));

const ME = 'me';
const PARTNER = 'partner';
const PARTNERS = [
  { id: ME, displayName: 'Lea' },
  { id: PARTNER, displayName: 'Alex' },
];
const copy = games.garden;
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
    offer: ['POPPY', 'BELLFLOWER', 'STARFLOWER'],
    sleeping: false,
    reunionOn: null,
    reunionToday: false,
    ...overrides,
  };
}

const plant = (
  id: string,
  slot: number,
  stage: number,
  senderId = PARTNER,
): GardenView['plants'][number] => ({
  id,
  species: 'STARFLOWER',
  words: 'FOR_YOU',
  senderId,
  sentOn: new Date('2026-11-08T00:00:00Z'),
  stage,
  slot,
});

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, String(value)),
    template,
  );
}

function services(initial: GardenView): GardenServices {
  return {
    load: vi.fn().mockResolvedValue(initial),
    send: vi.fn().mockResolvedValue(
      view({
        sentToday: {
          ...plant('seed-1', 0, 0, ME),
          slot: null,
          species: 'POPPY',
          words: null,
        },
      }),
    ),
    plant: vi.fn().mockResolvedValue(view({ plants: [plant('seed-2', 0, 0)] })),
    water: vi
      .fn()
      .mockResolvedValue(
        view({ plants: [plant('p1', 0, 3)], wateredToday: 'p1' }),
      ),
  };
}

function renderPage(
  api: GardenServices,
  flight = gardenFlight({
    kind: 'distance',
    band: { kind: 'APPROXIMATE', approximateKm: 350 },
    asOf: new Date(),
    mapAvailable: false,
  }),
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
          flightOverride={flight}
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

beforeEach(() => {
  // Reduced motion: state changes apply at once, without the flight delay.
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('GardenGamePage', () => {
  it('sends a seed with collapsed kind words when the couple is far apart', async () => {
    const api = services(view());
    renderPage(api);

    await screen.findByRole('heading', {
      name: fill(copy.todayTitle, { name: 'Alex' }),
    });
    const send = screen.getByRole('button', { name: copy.send });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    // The words question only appears once a seed is chosen, collapsed.
    expect(
      screen.queryByRole('button', { name: copy.wordsQuestion }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: copy.species.POPPY.name }),
    );
    const toggle = screen.getByRole('button', { name: copy.wordsQuestion });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Freiwillig')).toBeNull();
    expect(
      screen.queryByRole('button', { name: copy.words.MISS_YOU }),
    ).toBeNull();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: copy.words.MISS_YOU }));
    // Choosing collapses the phrases again and shows the choice.
    expect(
      screen.queryByRole('button', { name: copy.words.GOOD_NIGHT }),
    ).toBeNull();
    expect(
      screen.getByText(fill(copy.yourWords, { words: copy.words.MISS_YOU })),
    ).toBeTruthy();
    fireEvent.click(send);

    await waitFor(() =>
      expect(api.send).toHaveBeenCalledWith('POPPY', 'MISS_YOU'),
    );
    await screen.findByRole('heading', {
      name: fill(copy.waitingTitle, { name: 'Alex' }),
    });
    expect(
      screen.getByText(
        fill(copy.sentStatus, {
          messenger: copy.messengers.bird,
          name: 'Alex',
        }),
      ),
    ).toBeTruthy();
  });

  it('offers no kind words when the couple is close by', async () => {
    const api = services(view());
    renderPage(
      api,
      gardenFlight({
        kind: 'distance',
        band: { kind: 'RANGE', minKm: 2, maxKm: 5 },
        asOf: new Date(),
        mapAvailable: false,
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: copy.species.BELLFLOWER.name }),
    );
    expect(
      screen.queryByRole('button', { name: copy.wordsQuestion }),
    ).toBeNull();
    expect(
      screen.getByText(
        fill(copy.todayBody, {
          messenger: copy.messengers.ladybug,
          name: 'Alex',
        }),
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.send }));
    await waitFor(() =>
      expect(api.send).toHaveBeenCalledWith('BELLFLOWER', null),
    );
  });

  it('uses the neutral bird and offers words when distance is not shared', () => {
    const flight = gardenFlight(undefined);
    expect(flight.messenger).toBe('bird');
    expect(flight.band).toBeNull();
    expect(flight.wordsOffered).toBe(true);
  });

  it('opens the folded card and plants an arrived seed', async () => {
    const api = services(
      view({
        incoming: {
          ...plant('seed-2', 0, 0),
          slot: null,
          species: 'BELLFLOWER',
          words: 'LOOKING_FORWARD',
        },
      }),
    );
    renderPage(api);
    await screen.findByRole('heading', {
      name: fill(copy.arrivedTitle, { name: 'Alex' }),
    });
    expect(
      screen.queryByText(new RegExp(copy.words.LOOKING_FORWARD)),
    ).toBeNull();
    const folded = screen.getByRole('button', {
      name: new RegExp(copy.foldedCard),
    });
    expect(folded.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(folded);
    expect(
      screen.getByText(
        fill(copy.quoted, { words: copy.words.LOOKING_FORWARD }),
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.plant }));
    await waitFor(() => expect(api.plant).toHaveBeenCalledWith('seed-2'));
    await screen.findByText(copy.plantedStatus);
  });

  it('shows a seed the partner sends while the garden is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const api = services(view());
      renderPage(api);
      await screen.findByRole('heading', {
        name: fill(copy.todayTitle, { name: 'Alex' }),
      });
      (api.load as ReturnType<typeof vi.fn>).mockResolvedValue(
        view({
          incoming: {
            ...plant('seed-3', 0, 0),
            slot: null,
            species: 'POPPY',
            words: null,
          },
        }),
      );
      await vi.advanceTimersByTimeAsync(LIVE_GAME_REFRESH_MS + 100);
      expect(
        await screen.findByRole('heading', {
          name: fill(copy.arrivedTitle, { name: 'Alex' }),
        }),
      ).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a plant story and waters a plant once a day', async () => {
    const api = services(view({ plants: [plant('p1', 0, 3)] }));
    renderPage(api);
    const target = await screen.findByRole('button', {
      name: fill(copy.plantLabel, {
        species: copy.species.STARFLOWER.name,
        name: 'Alex',
      }),
    });
    fireEvent.click(target);
    expect(screen.getByText(copy.stages[3])).toBeTruthy();
    expect(
      screen.getByText(fill(copy.quoted, { words: copy.words.FOR_YOU })),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.water }));
    await screen.findByRole('heading', { name: copy.waterTitle });
    fireEvent.click(
      screen.getByRole('button', {
        name: fill(copy.waterPlantLabel, {
          species: copy.species.STARFLOWER.name,
        }),
      }),
    );
    await waitFor(() => expect(api.water).toHaveBeenCalledWith('p1'));
    await screen.findByText(fill(copy.wateredStatus, { name: 'Alex' }));
    expect(screen.queryByRole('button', { name: copy.water })).toBeNull();
  });

  it('reports a shared day and a stale send calmly', async () => {
    const api = services(
      view({
        sentToday: plant('mine', 0, 0, ME),
        partnerSentToday: true,
        sharedToday: true,
      }),
    );
    renderPage(api);
    await screen.findByRole('heading', { name: copy.sharedTitle });
    expect(screen.getByText(copy.footnote)).toBeTruthy();
  });

  it('tints the season and lights the lantern of who was here today', async () => {
    const api = services(
      view({
        localDate: new Date('2027-01-12T00:00:00Z'),
        plants: [plant('p1', 0, 2)],
        sentToday: plant('mine', 1, 0, ME),
      }),
    );
    renderPage(api);
    const frame = await screen.findByTestId('garden-frame');
    expect(frame.getAttribute('data-season')).toBe('winter');
    expect(screen.getByTestId('garden-snow')).toBeTruthy();
    expect(
      screen.getByTestId('garden-lantern-own').getAttribute('data-lit'),
    ).toBe('true');
    expect(
      screen.getByTestId('garden-lantern-partner').getAttribute('data-lit'),
    ).toBe('false');
    const label = screen.getByTestId('garden-scene').getAttribute('aria-label');
    expect(label).toContain(copy.seasons.winter);
    expect(label).toContain(copy.lanterns.own);
    // "Today in the garden", never a time.
    expect(label).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it('welcomes the reader into a garden that slept, at once with reduced motion', async () => {
    const api = services(view({ sleeping: true, plants: [plant('p1', 0, 3)] }));
    renderPage(api);
    await screen.findByRole('heading', { name: copy.sleep.wokeTitle });
    expect(screen.getByText(copy.sleep.wokeBody)).toBeTruthy();
    expect(screen.queryByTestId('garden-mist')).toBeNull();
    // Nothing is lost and today's step stays available.
    expect(
      screen.getByRole('heading', {
        name: fill(copy.todayTitle, { name: 'Alex' }),
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: copy.sleep.wokeClose }));
    expect(
      screen.queryByRole('heading', { name: copy.sleep.wokeTitle }),
    ).toBeNull();
  });

  it('shows the sleeping garden under mist before it wakes', async () => {
    reducedMotion(false);
    const api = services(
      view({
        sleeping: true,
        plants: [plant('p1', 0, 3)],
        sentToday: plant('mine', 1, 0, ME),
      }),
    );
    renderPage(api);
    await screen.findByRole('heading', { name: copy.sleep.title });
    expect(screen.getByTestId('garden-mist')).toBeTruthy();
    expect(screen.getByTestId('garden-frame').getAttribute('data-sleep')).toBe(
      'asleep',
    );
    expect(
      screen.getByTestId('garden-lantern-own').getAttribute('data-lit'),
    ).toBe('false');
    await screen.findByRole(
      'heading',
      { name: copy.sleep.wokeTitle },
      { timeout: 4000 },
    );
    expect(
      screen.getByTestId('garden-lantern-own').getAttribute('data-lit'),
    ).toBe('true');
  });

  it('waits for an upcoming reunion behind a garden gate', async () => {
    const api = services(view({ reunionOn: new Date('2026-11-20T00:00:00Z') }));
    renderPage(api);
    const card = await screen.findByTestId('garden-reunion-soon');
    expect(card.textContent).toContain(copy.reunion.eyebrow);
    expect(card.textContent).toContain(copy.reunion.soonBody);
    expect(screen.getByTestId('garden-reunion-gate')).toBeTruthy();
    expect(screen.queryByTestId('garden-bunting')).toBeNull();
    expect(screen.getByRole('button', { name: copy.send })).toBeTruthy();
  });

  it('lets everything bloom on the reunion day and keeps it as a Moment', async () => {
    const saveMoment = vi.fn().mockResolvedValue({ memoryId: 'memory-1' });
    const api = {
      ...services(
        view({
          reunionOn: DAY,
          reunionToday: true,
          plants: [plant('p1', 0, 0), plant('p2', 1, 3, ME)],
        }),
      ),
      saveMoment,
    };
    renderPage(api);
    await screen.findByRole('heading', { name: copy.reunion.todayTitle });
    expect(screen.getByTestId('garden-bunting')).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.send })).toBeNull();
    expect(screen.queryByRole('button', { name: copy.water })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy.reunion.save }));
    await waitFor(() =>
      expect(saveMoment).toHaveBeenCalledWith(
        expect.objectContaining({
          title: copy.reunion.memoryTitle,
          body: copy.reunion.memoryBody,
          happenedOn: DAY,
        }),
      ),
    );
    const link = await screen.findByRole('link', {
      name: copy.reunion.openMoment,
    });
    expect(link.getAttribute('href')).toBe('/story/memories/memory-1');
    expect(
      screen.queryByRole('button', { name: copy.reunion.save }),
    ).toBeNull();
  });
});

describe('GardenGamePage send flight in view (#2158 G)', () => {
  type Rect = Pick<DOMRect, 'top' | 'bottom' | 'width' | 'height'>;
  const box = (top: number, height = 100): Rect => ({
    top,
    bottom: top + height,
    width: 340,
    height,
  });

  /** The band sits above the viewport until it is scrolled into view. */
  function layout({ statusTop = 300 }: { statusTop?: number } = {}) {
    const calls: Array<{ target: string; options: unknown }> = [];
    let bandShown = false;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const rect = this.classList.contains('garden-band')
          ? box(bandShown ? 0 : -900)
          : this.classList.contains('garden-status-line')
            ? box(statusTop, 40)
            : box(0, 0);
        return {
          ...rect,
          left: 0,
          right: rect.width,
          x: 0,
          y: rect.top,
        } as DOMRect;
      },
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(function (this: HTMLElement, options: unknown) {
        const target = this.classList.contains('garden-band')
          ? 'band'
          : this.classList.contains('garden-status-line')
            ? 'status'
            : this.className;
        if (target === 'band') bandShown = true;
        calls.push({ target, options });
      }),
    });
    return calls;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    delete (HTMLElement.prototype as { scrollIntoView?: unknown })
      .scrollIntoView;
  });

  async function chooseAndSend() {
    fireEvent.click(
      await screen.findByRole('button', { name: copy.species.POPPY.name }),
    );
    fireEvent.click(screen.getByRole('button', { name: copy.send }));
  }

  it('brings the band into view first, then flies, then keeps focus on the card', async () => {
    reducedMotion(false);
    const calls = layout();
    const order: string[] = [];
    renderPage(services(view()));
    const messenger = await screen.findByTestId('garden-messenger');
    const watcher = new MutationObserver(() => {
      if (
        messenger.getAttribute('opacity') === '1' &&
        !order.includes('flight')
      )
        order.push('flight');
    });
    watcher.observe(messenger, { attributes: true });
    await chooseAndSend();
    await waitFor(() =>
      expect(calls.map((call) => call.target)).toContain('band'),
    );
    order.push('scroll');
    expect(calls[0]).toEqual({
      target: 'band',
      options: { block: 'start', behavior: 'smooth' },
    });
    const waiting = await screen.findByRole(
      'heading',
      { name: fill(copy.waitingTitle, { name: 'Alex' }) },
      { timeout: 4000 },
    );
    watcher.disconnect();
    expect(order).toEqual(['scroll', 'flight']);
    await waitFor(() => expect(document.activeElement).toBe(waiting));
    // The view stays with the flight and the garden: no second scroll.
    expect(calls.map((call) => call.target)).toEqual(['band']);
    expect(
      screen.getByText(
        fill(copy.sentStatus, {
          messenger: copy.messengers.bird,
          name: 'Alex',
        }),
      ),
    ).toBeTruthy();
  });

  it('does not scroll when the band is already in view', async () => {
    reducedMotion(false);
    const calls = layout();
    // Already scrolled to the top: the band is on screen.
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(
      () => ({ ...box(10), left: 0, right: 340, x: 0, y: 10 }) as DOMRect,
    );
    renderPage(services(view()));
    await chooseAndSend();
    await screen.findByRole(
      'heading',
      { name: fill(copy.waitingTitle, { name: 'Alex' }) },
      { timeout: 4000 },
    );
    expect(calls).toEqual([]);
  });

  it('shows the result in place with reduced motion and moves only to the status', async () => {
    const calls = layout({ statusTop: 2000 });
    renderPage(services(view()));
    await chooseAndSend();
    const waiting = await screen.findByRole('heading', {
      name: fill(copy.waitingTitle, { name: 'Alex' }),
    });
    await waitFor(() =>
      expect(calls).toEqual([
        { target: 'status', options: { block: 'nearest', behavior: 'auto' } },
      ]),
    );
    expect(document.activeElement).toBe(waiting);
    expect(screen.getByTestId('garden-messenger').getAttribute('opacity')).toBe(
      '0',
    );
  });

  it('leaves the page where it is with reduced motion when the status is in view', async () => {
    const calls = layout({ statusTop: 300 });
    renderPage(services(view()));
    await chooseAndSend();
    await screen.findByRole('heading', {
      name: fill(copy.waitingTitle, { name: 'Alex' }),
    });
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(calls).toEqual([]);
  });
});

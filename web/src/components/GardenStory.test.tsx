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
import { foundKeepsakes } from '../client/gardenStory';
import type { MilestoneRef } from '../client/storyWaymarks';
import games from '../i18n/locales/games';
import { GardenGamePage, type GardenServices } from './GardenGamePage';

const native = vi.hoisted(() => ({ value: false }));
vi.mock('../pwa', async (original) => ({
  ...(await original<typeof import('../pwa')>()),
  isCapacitorNative: () => native.value,
}));

const ME = 'me';
const PARTNER = 'partner';
const SPACE = 'space';
const copy = games.garden;
const story = copy.story;
const DAY = new Date('2026-11-16T00:00:00Z');

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

const plant = (index: number): GardenPlantView => ({
  id: `plant-${index}`,
  species: 'POPPY',
  words: null,
  senderId: index % 2 ? ME : PARTNER,
  sentOn: new Date(`2026-10-${String(index + 1).padStart(2, '0')}T00:00:00Z`),
  stage: 3,
  slot: index,
  inPond: false,
});

function view(overrides: Partial<GardenView> = {}): GardenView {
  return {
    localDate: DAY,
    plants: [plant(0), plant(1), plant(2)],
    incoming: null,
    sentToday: null,
    partnerSentToday: false,
    sharedToday: false,
    wateredToday: null,
    partnerWateredToday: null,
    sleeping: false,
    reunionToday: false,
    offer: ['POPPY', 'BELLFLOWER', 'STARFLOWER'],
    sharedDays: 10,
    form: 'MEADOW',
    unlocks: ['PATH', 'POND', 'SUNFLOWER', 'TULIP', 'WATER_LILY'],
    news: [],
    discovered: ['POPPY'],
    name: null,
    bouquet: null,
    gaveBouquetToday: false,
    ...overrides,
  };
}

const MILESTONES: MilestoneRef[] = [
  {
    id: 'm-1',
    title: 'Unser Anfang',
    happenedOn: new Date('2023-06-17T00:00:00Z'),
  },
  {
    id: 'm-2',
    title: 'Erste Reise',
    happenedOn: new Date('2024-05-12T00:00:00Z'),
  },
];

function services(
  initial: GardenView,
  milestones: () => Promise<MilestoneRef[]> = async () => MILESTONES,
): GardenServices {
  return {
    load: vi.fn().mockResolvedValue(initial),
    send: vi.fn().mockResolvedValue(initial),
    plant: vi.fn().mockResolvedValue(initial),
    water: vi.fn().mockResolvedValue(initial),
    loadMilestones: vi.fn(milestones),
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
          spaceId={SPACE}
          currentAccountId={ME}
          services={api}
          loadPartners={async () => [
            { id: ME, displayName: 'Lea' },
            { id: PARTNER, displayName: 'Alex' },
          ]}
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

const dateOf = (date: Date) =>
  new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);

async function openBook() {
  fireEvent.click(
    await screen.findByRole('button', { name: copy.growth.book }),
  );
  return screen.getByTestId('garden-book');
}

beforeEach(() => {
  native.value = false;
  window.localStorage.clear();
  reducedMotion(true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the couple’s story in the garden', () => {
  it('grows Milestones as plants with a card and a link', async () => {
    renderPage(services(view()));
    const trip = MILESTONES[1];
    const target = await screen.findByRole('button', {
      name: fill(story.memoryLabel, {
        title: trip.title,
        date: dateOf(trip.happenedOn),
      }),
    });
    expect(screen.getAllByTestId('garden-memory-plant')).toHaveLength(2);
    fireEvent.click(target);
    const card = screen.getByTestId('garden-memory-card');
    expect(
      within(card).getByRole('heading', { name: trip.title }),
    ).toBeTruthy();
    expect(within(card).getByText(dateOf(trip.happenedOn))).toBeTruthy();
    expect(
      within(card).getByRole('link', { name: story.open }).getAttribute('href'),
    ).toBe('/story/milestones/m-2');
    expect(target.getAttribute('aria-pressed')).toBe('true');

    // Tapping a flower replaces the Milestone card with the plant's story.
    fireEvent.click(screen.getByTestId('garden-plant-0'));
    expect(screen.queryByTestId('garden-memory-card')).toBeNull();
  });

  it('lists the Milestone plants and only the finds already found', async () => {
    renderPage(services(view()));
    await screen.findAllByTestId('garden-memory-plant');
    const book = await openBook();
    const section = within(book).getByTestId('garden-memory-book');
    for (const entry of MILESTONES) {
      expect(
        within(section)
          .getByRole('link', {
            name: fill(story.openLabel, { title: entry.title }),
          })
          .getAttribute('href'),
      ).toBe(`/story/milestones/${entry.id}`);
    }
    const finds = within(book).getByTestId('garden-keepsakes');
    const found = foundKeepsakes(SPACE, 10);
    expect(within(finds).getAllByRole('listitem')).toHaveLength(found.length);
    for (const keepsake of found)
      expect(within(finds).getByText(story.keepsakes[keepsake])).toBeTruthy();
    // No empty slots, no counts.
    expect(finds.textContent).not.toMatch(/\d|\?/);
  });

  it('leaves the garden and the book unchanged when Milestones fail', async () => {
    renderPage(
      services(view({ sharedDays: 0 }), () =>
        Promise.reject(new Error('unavailable')),
      ),
    );
    await screen.findByTestId('garden-scene');
    const book = await openBook();
    await waitFor(() =>
      expect(screen.queryAllByTestId('garden-memory-plant')).toHaveLength(0),
    );
    expect(within(book).queryByTestId('garden-memory-book')).toBeNull();
    expect(within(book).queryByTestId('garden-keepsakes')).toBeNull();
  });

  it('keeps sounds off by default and shows vibration only in the native app', async () => {
    renderPage(services(view()));
    let book = await openBook();
    const sound = within(book).getByRole('switch', {
      name: story.feedback.sound,
    });
    expect(sound.getAttribute('aria-checked')).toBe('false');
    expect(
      within(book).queryByRole('switch', { name: story.feedback.vibration }),
    ).toBeNull();
    cleanup();

    native.value = true;
    renderPage(services(view()));
    book = await openBook();
    const vibration = within(book).getByRole('switch', {
      name: story.feedback.vibration,
    });
    expect(vibration.getAttribute('aria-checked')).toBe('false');
    const vibrate = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrate,
      configurable: true,
    });
    fireEvent.click(vibration);
    expect(vibration.getAttribute('aria-checked')).toBe('true');
    expect(vibrate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('garden-plant-0'));
    expect(vibrate).toHaveBeenCalledTimes(2);
  });
});

describe('Euer Gartenjahr', () => {
  it('plays with pause, resume and close and returns focus', async () => {
    reducedMotion(false);
    renderPage(services(view()));
    const book = await openBook();
    const play = within(book).getByRole('button', {
      name: story.playback.play,
    });
    play.focus();
    fireEvent.click(play);
    const dialog = screen.getByRole('dialog', { name: story.playback.title });
    const toggle = within(dialog).getByTestId('garden-playback-toggle');
    expect(document.activeElement).toBe(toggle);
    expect(toggle.textContent).toBe(story.playback.pause);
    expect(
      within(dialog).getByTestId('garden-playback-caption').textContent,
    ).toBe(
      fill(story.playback.caption, {
        season: story.playback.seasons.spring,
        form: copy.growth.forms.BED,
      }),
    );
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe(story.playback.resume);
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe(story.playback.pause);
    fireEvent.click(
      within(dialog).getByRole('button', { name: story.playback.close }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(play);
  });

  it('shows the start and today next to each other with reduced motion', async () => {
    renderPage(services(view()));
    const book = await openBook();
    fireEvent.click(
      within(book).getByRole('button', { name: story.playback.play }),
    );
    const dialog = screen.getByRole('dialog', { name: story.playback.title });
    expect(within(dialog).getByTestId('garden-playback-pair')).toBeTruthy();
    expect(within(dialog).getByText(story.playback.start)).toBeTruthy();
    expect(within(dialog).getByText(story.playback.today)).toBeTruthy();
    expect(within(dialog).queryByTestId('garden-playback-toggle')).toBeNull();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is not offered for a garden without plants', async () => {
    renderPage(services(view({ plants: [] })));
    const book = await openBook();
    expect(
      within(book).queryByRole('button', { name: story.playback.play }),
    ).toBeNull();
  });
});

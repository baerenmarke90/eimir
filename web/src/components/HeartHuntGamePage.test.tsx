// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { HeartHuntRoundView } from '../api/generated/models/HeartHuntRoundView';
import games from '../i18n/locales/games';
import partnerLocation from '../i18n/locales/partnerLocation';
import { type HeartHuntApi, HeartHuntGamePage } from './HeartHuntGamePage';

vi.mock('../client/storyMediaLoader', () => ({
  loadAuthorizedStoryImageResource: vi.fn(async () => ({
    url: 'blob:heart-hunt-photo',
    dispose: () => undefined,
  })),
}));

const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PEOPLE = {
  me: { id: 'lea', displayName: 'Lea' },
  partner: { id: 'alex', displayName: 'Alex' },
};

function round(
  overrides: Partial<HeartHuntRoundView> = {},
): HeartHuntRoundView {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    role: 'SEEKER',
    state: 'HIDDEN',
    partnerId: 'alex',
    attachmentId: '44444444-4444-4444-8444-444444444444',
    taps: [],
    tapCount: 0,
    bestLevel: 0,
    heart: undefined,
    createdAt: new Date('2026-11-16T10:00:00Z'),
    foundAt: null,
    deleteAfter: new Date('2026-12-16T10:00:00Z'),
    kept: false,
    ...overrides,
  };
}

function fakeApi(rounds: HeartHuntRoundView[]): HeartHuntApi {
  return {
    getHeartHunt: vi.fn(async () => ({ rounds })),
    createHeartHuntRound: vi.fn(),
    tapHeartHuntRound: vi.fn(),
    keepHeartHuntRound: vi.fn(),
  } as unknown as HeartHuntApi;
}

function renderPage(
  api: HeartHuntApi,
  distanceBand?: Parameters<typeof HeartHuntGamePage>[0]['distanceBand'],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/games/heart-hunt']}>
        <HeartHuntGamePage
          apiBaseUrl="http://api.example.test"
          accessToken="test-token"
          spaceId={SPACE_ID}
          currentAccountId="lea"
          api={api}
          loadPeople={async () => PEOPLE}
          distanceBand={distanceBand}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HeartHuntGamePage', () => {
  it('starts with the hide step and one photo action when nothing is open', async () => {
    renderPage(fakeApi([]), null);
    await screen.findByRole('heading', {
      name: games.heartHunt.hide.title.replace('{{name}}', 'Alex'),
    });
    expect(
      screen.getByRole('button', { name: games.heartHunt.hide.pickPhoto }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: games.heartHunt.hide.send.replace('{{name}}', 'Alex'),
      }),
    ).toBeNull();
  });

  it('shows the seeker only fog and warmth, never the heart, and sends per-mille taps', async () => {
    const api = fakeApi([round()]);
    (api.tapHeartHuntRound as ReturnType<typeof vi.fn>).mockResolvedValue({
      level: 2,
      meter: 65,
      found: false,
      round: round({ tapCount: 1, bestLevel: 2 }),
    });
    const { container } = renderPage(api, null);
    await screen.findByText(games.heartHunt.seek.tapHint);
    expect(container.querySelector('.heart-hunt-heart')).toBeNull();
    expect(container.querySelector('.heart-hunt-fog')).not.toBeNull();

    const frame = await screen.findByRole('button', {
      name: games.heartHunt.seek.photoLabel,
    });
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 250 }) as DOMRect;
    fireEvent.pointerUp(frame, { clientX: 100, clientY: 125 });

    await waitFor(() =>
      expect(api.tapHeartHuntRound).toHaveBeenCalledWith({
        spaceId: SPACE_ID,
        roundId: '33333333-3333-4333-8333-333333333333',
        heartHuntTap: { x: 500, y: 500 },
      }),
    );
    await screen.findByText(games.heartHunt.warmth.warm);
    expect(container.querySelector('.heart-hunt-heart')).toBeNull();
  });

  it('taps from the keyboard with the arrow keys and Enter', async () => {
    const api = fakeApi([round()]);
    (api.tapHeartHuntRound as ReturnType<typeof vi.fn>).mockResolvedValue({
      level: 0,
      meter: 0,
      found: false,
      round: round(),
    });
    renderPage(api, null);
    const frame = await screen.findByRole('button', {
      name: games.heartHunt.seek.photoLabel,
    });
    frame.focus();
    fireEvent.keyDown(frame, { key: 'ArrowRight' });
    fireEvent.keyDown(frame, { key: 'Enter' });
    await waitFor(() =>
      expect(api.tapHeartHuntRound).toHaveBeenCalledWith(
        expect.objectContaining({ heartHuntTap: { x: 550, y: 500 } }),
      ),
    );
  });

  it('lifts the fog when the server reports the heart as found', async () => {
    const api = fakeApi([round()]);
    (api.tapHeartHuntRound as ReturnType<typeof vi.fn>).mockResolvedValue({
      level: 3,
      meter: 100,
      found: true,
      round: round({ state: 'FOUND' }),
    });
    const { container } = renderPage(api, null);
    const frame = await screen.findByRole('button', {
      name: games.heartHunt.seek.photoLabel,
    });
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 250 }) as DOMRect;
    fireEvent.pointerUp(frame, { clientX: 100, clientY: 125 });
    await waitFor(() =>
      expect(
        container.querySelector('.heart-hunt-fog.is-lifting'),
      ).not.toBeNull(),
    );
    expect(
      screen.getAllByText(games.heartHunt.found.title).length,
    ).toBeGreaterThan(0);
  });

  it('tells the hider that the round waits, with their own heart on the photo', async () => {
    const { container } = renderPage(
      fakeApi([
        round({ role: 'HIDER', heart: { x: 300, y: 400 }, partnerId: 'alex' }),
      ]),
      null,
    );
    await screen.findByRole('heading', {
      name: games.heartHunt.waiting.title.replace('{{name}}', 'Alex'),
    });
    expect(container.querySelector('.heart-hunt-heart')).not.toBeNull();
  });

  it('names where the heart was after it was found and offers keeping and swapping', async () => {
    const { container } = renderPage(
      fakeApi([
        round({
          state: 'FOUND',
          heart: { x: 100, y: 100 },
          foundAt: new Date('2026-11-16T11:00:00Z'),
          deleteAfter: new Date('2026-11-30T11:00:00Z'),
        }),
      ]),
      null,
    );
    await screen.findByRole('heading', { name: games.heartHunt.found.title });
    expect(
      screen.getByText(
        games.heartHunt.found.bodySeeker
          .replace(/\{\{name\}\}/g, 'Alex')
          .replace('{{place}}', games.heartHunt.places.topLeft),
      ),
    ).toBeTruthy();
    expect(
      container.querySelector('.heart-hunt-heart.is-found'),
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: games.heartHunt.found.keep }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: games.heartHunt.found.swap }),
    );
    await screen.findByRole('heading', {
      name: games.heartHunt.hide.title.replace('{{name}}', 'Alex'),
    });
  });

  it('labels the flight with the H4 word only when a band is shared', async () => {
    const shared = renderPage(fakeApi([]), {
      kind: 'RANGE',
      minKm: 25,
      maxKm: 50,
      approximateKm: null,
    });
    await screen.findByText(partnerLocation.distanceShortTripShort);
    shared.unmount();

    const { container } = renderPage(fakeApi([]), null);
    await screen.findByRole('heading', {
      name: games.heartHunt.hide.title.replace('{{name}}', 'Alex'),
    });
    expect(container.querySelector('.heart-hunt-band-label')).toBeNull();
    expect(container.textContent).not.toMatch(/Standort/);
  });
});

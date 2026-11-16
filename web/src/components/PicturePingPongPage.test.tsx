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
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PicturePingPongState } from '../api/generated/models/PicturePingPongState';
import games from '../i18n/locales/games';
import {
  PicturePingPongPage,
  type PicturePingPongServices,
} from './PicturePingPongPage';

const ME = 'me';
const PARTNER = 'partner';
const PARTNERS = [
  { id: ME, displayName: 'Lea' },
  { id: PARTNER, displayName: 'Alex' },
];

function state(
  overrides: Partial<NonNullable<PicturePingPongState['picture']>> = {},
): PicturePingPongState {
  return {
    picture: {
      id: 'picture-1',
      status: 'DRAWING',
      drawerId: ME,
      startedBy: ME,
      turnsDone: 0,
      maxTurns: 6,
      finishedEarly: false,
      savedMemoryId: null,
      strokes: [
        { turn: 0, authorId: null, colour: 'INK', points: [10, 10, 900, 900] },
      ],
      updatedAt: new Date(),
      ...overrides,
    },
  };
}

function localized(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, String(value)),
    template,
  );
}

function services(initial: PicturePingPongState): PicturePingPongServices {
  return {
    load: vi.fn().mockResolvedValue(initial),
    start: vi.fn().mockResolvedValue(state()),
    handOver: vi
      .fn()
      .mockResolvedValue(state({ drawerId: PARTNER, turnsDone: 1 })),
    finish: vi
      .fn()
      .mockResolvedValue(
        state({ status: 'FINISHED', drawerId: null, turnsDone: 1 }),
      ),
    markSaved: vi.fn().mockResolvedValue(
      state({
        status: 'FINISHED',
        drawerId: null,
        turnsDone: 6,
        savedMemoryId: 'memory-1',
      }),
    ),
    saveToMoments: vi.fn().mockResolvedValue({ memoryId: 'memory-1' }),
  };
}

function renderPage(api: PicturePingPongServices) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/games/picture-ping-pong']}>
        <PicturePingPongPage
          apiBaseUrl="http://api.example.test"
          accessToken="token"
          spaceId="space"
          currentAccountId={ME}
          services={api}
          loadPartners={async () => PARTNERS}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function drawStroke(from: [number, number], to: [number, number]) {
  const canvas = screen.getByRole('img', {
    name: games.pingPong.canvasLabel,
  });
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 400,
      height: 400,
      right: 400,
      bottom: 400,
    }) as DOMRect;
  fireEvent.pointerDown(canvas, {
    clientX: from[0],
    clientY: from[1],
    pointerId: 1,
  });
  fireEvent.pointerMove(canvas, {
    clientX: to[0],
    clientY: to[1],
    pointerId: 1,
  });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe('PicturePingPongPage', () => {
  it('offers a new picture when none exists and starts it on tap', async () => {
    const api = services({ picture: undefined });
    renderPage(api);
    fireEvent.click(
      await screen.findByRole('button', { name: games.pingPong.newPicture }),
    );
    await waitFor(() => expect(api.start).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(games.pingPong.turnYou)).toBeTruthy();
  });

  it('lets the drawer paint up to three strokes, undo, and send', async () => {
    const api = services(state());
    renderPage(api);
    await screen.findByText(games.pingPong.turnYou);
    const send = screen.getByRole('button', { name: /Alex schicken/ });
    expect((send as HTMLButtonElement).disabled).toBe(true);

    drawStroke([40, 40], [200, 200]);
    drawStroke([40, 100], [300, 300]);
    expect(
      screen.getByText(
        localized(games.pingPong.strokesUsed, { count: 2, max: 3 }),
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: games.pingPong.undo }));
    expect(
      screen.getByText(
        localized(games.pingPong.strokesUsed, { count: 1, max: 3 }),
      ),
    ).toBeTruthy();

    fireEvent.click(send);
    await waitFor(() => expect(api.handOver).toHaveBeenCalledTimes(1));
    const [turnsDone, strokes] = (api.handOver as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(turnsDone).toBe(0);
    expect(strokes).toHaveLength(1);
    expect(strokes[0].colour).toBe('PERSON');
    expect(
      await screen.findByText(
        localized(games.pingPong.turnPartner, { name: 'Alex' }),
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('pingpong-flyer')).toBeTruthy();
  });

  it('stops accepting strokes after the third one', async () => {
    renderPage(services(state()));
    await screen.findByText(games.pingPong.turnYou);
    for (let index = 0; index < 4; index += 1) {
      drawStroke([30 + index * 10, 40], [300, 300 - index * 20]);
    }
    expect(
      screen.getByText(
        localized(games.pingPong.strokesUsed, { count: 3, max: 3 }),
      ),
    ).toBeTruthy();
  });

  it('is read-only while it is the partner’s turn', async () => {
    renderPage(services(state({ drawerId: PARTNER, turnsDone: 1 })));
    expect(
      await screen.findByText(
        localized(games.pingPong.turnPartner, { name: 'Alex' }),
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: games.pingPong.undo }),
    ).toBeNull();
    drawStroke([10, 10], [100, 100]);
    expect(document.querySelectorAll('.is-draft')).toHaveLength(0);
  });

  it('asks before finishing early and then finishes', async () => {
    const api = services(state({ drawerId: PARTNER, turnsDone: 1 }));
    renderPage(api);
    fireEvent.click(
      await screen.findByRole('button', { name: games.pingPong.finishEarly }),
    );
    expect(api.finish).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: games.pingPong.finishConfirmAction }),
    );
    await waitFor(() => expect(api.finish).toHaveBeenCalledWith(1));
    expect(await screen.findByText(games.pingPong.doneTitle)).toBeTruthy();
  });

  it('saves a finished picture to Momente only on explicit tap', async () => {
    const api = services(
      state({ status: 'FINISHED', drawerId: null, turnsDone: 6 }),
    );
    // jsdom has no canvas: the render step is the only part stubbed here.
    const original = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') return original(tag);
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          fillRect() {},
          scale() {},
          stroke() {},
        }),
        toBlob: (callback: (blob: Blob) => void) =>
          callback(new Blob(['x'], { type: 'image/png' })),
      } as unknown as HTMLCanvasElement;
    });
    vi.stubGlobal(
      'Path2D',
      class {
        constructor(public path: string) {}
      },
    );
    renderPage(api);
    await screen.findByText(games.pingPong.doneBody);
    expect(api.saveToMoments).not.toHaveBeenCalled();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    fireEvent.click(
      screen.getByRole('button', { name: games.pingPong.saveToMoments }),
    );
    await waitFor(() => expect(api.saveToMoments).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(api.markSaved).toHaveBeenCalledWith('memory-1'));
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows no distance caption without a shared distance', async () => {
    renderPage(services(state()));
    await screen.findByText(games.pingPong.turnYou);
    drawStroke([40, 40], [200, 200]);
    fireEvent.click(screen.getByRole('button', { name: /Alex schicken/ }));
    await screen.findByText(
      localized(games.pingPong.turnPartner, { name: 'Alex' }),
    );
    expect(document.querySelector('.pingpong-distance')).toBeNull();
  });
});

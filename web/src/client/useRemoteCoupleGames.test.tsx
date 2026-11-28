// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { OurMomentsRemoteState } from '../api/generated/models/OurMomentsRemoteState';
import type { WhoOfUsRemoteState } from '../api/generated/models/WhoOfUsRemoteState';
import type { WishDetectiveRemoteState } from '../api/generated/models/WishDetectiveRemoteState';
import { ClientProblemError } from './problemDetails';
import {
  type RemoteCoupleGameServices,
  useRemoteOurMomentsGame,
  useRemoteWhoOfUsGame,
  useRemoteWishDetectiveGame,
} from './useRemoteCoupleGames';

const ME = 'account-me';
const PARTNER = 'account-partner';
const UPDATED = new Date('2026-11-18T10:00:00Z');

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function services(
  overrides: Partial<RemoteCoupleGameServices>,
): RemoteCoupleGameServices {
  const unexpected = () => Promise.reject(new Error('unexpected call'));
  return {
    getWhoOfUs: unexpected,
    startWhoOfUs: unexpected,
    answerWhoOfUs: unexpected,
    endWhoOfUs: unexpected,
    getWishDetective: unexpected,
    startWishDetective: unexpected,
    skipWish: unexpected,
    submitClues: unexpected,
    guessWish: unexpected,
    endWishDetective: unexpected,
    getOurMoments: unexpected,
    startOurMoments: unexpected,
    flipCard: unexpected,
    endOurMoments: unexpected,
    ...overrides,
  };
}

function options(api: RemoteCoupleGameServices) {
  return {
    spaceId: 'space-1',
    currentAccountId: ME,
    apiBaseUrl: 'http://localhost',
    accessToken: 'unused',
    services: api,
  };
}

function whoOfUs(
  first: { mine: string | null; theirs: string | null },
  status: 'OPEN' | 'FINISHED' = 'OPEN',
): WhoOfUsRemoteState {
  const revealed = first.mine !== null && first.theirs !== null;
  return {
    game: {
      id: 'who-1',
      status,
      startedBy: ME,
      endedBy: null,
      turnAccountId: null,
      questions: [
        {
          questionId: 'snack',
          myAnswer: first.mine,
          partnerAnswered: first.theirs !== null,
          partnerAnswer: revealed ? first.theirs : null,
          matches: revealed ? first.mine === first.theirs : null,
        },
        {
          questionId: 'packing',
          myAnswer: null,
          partnerAnswered: false,
          partnerAnswer: null,
          matches: null,
        },
      ],
      myAnsweredCount: first.mine ? 1 : 0,
      partnerAnsweredCount: first.theirs ? 1 : 0,
      revealedCount: revealed ? 1 : 0,
      agreementCount: revealed && first.mine === first.theirs ? 1 : 0,
      updatedAt: UPDATED,
    },
  };
}

describe('useRemoteWhoOfUsGame', () => {
  it('answers, shows the reveal and continues to the next question', async () => {
    const answerWhoOfUs = vi.fn(() =>
      Promise.resolve(whoOfUs({ mine: PARTNER, theirs: PARTNER })),
    );
    const api = services({
      getWhoOfUs: () =>
        Promise.resolve(whoOfUs({ mine: null, theirs: PARTNER })),
      answerWhoOfUs,
    });
    const { result } = renderHook(() => useRemoteWhoOfUsGame(options(api)), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.view.phase).toBe('myTurn'));
    await act(async () => {
      expect(await result.current.answer('snack', PARTNER)).toEqual({
        ok: true,
      });
    });
    expect(answerWhoOfUs).toHaveBeenCalledWith('who-1', 'snack', PARTNER);
    expect(result.current.view).toMatchObject({
      phase: 'reveal',
      question: { questionId: 'snack', matches: true },
    });
    act(() => result.current.continue());
    expect(result.current.view).toMatchObject({
      phase: 'myTurn',
      question: { questionId: 'packing' },
    });
  });

  it('reloads after a conflict and reports it without throwing', async () => {
    const getWhoOfUs = vi.fn(() =>
      Promise.resolve(whoOfUs({ mine: null, theirs: null })),
    );
    const api = services({
      getWhoOfUs,
      answerWhoOfUs: () =>
        Promise.reject(
          new ClientProblemError('conflict', 409, 'WHO_OF_US_ALREADY_ANSWERED'),
        ),
    });
    const { result } = renderHook(() => useRemoteWhoOfUsGame(options(api)), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.view.phase).toBe('myTurn'));
    let outcome: Awaited<ReturnType<typeof result.current.answer>> | undefined;
    await act(async () => {
      outcome = await result.current.answer('snack', ME);
    });
    expect(outcome).toMatchObject({ ok: false, conflict: true });
    expect(result.current.problem?.code).toBe('WHO_OF_US_ALREADY_ANSWERED');
    await waitFor(() => expect(getWhoOfUs).toHaveBeenCalledTimes(2));
  });
});

describe('useRemoteWishDetectiveGame', () => {
  const empty: WishDetectiveRemoteState = {
    game: null,
    readiness: { ownWishesAvailable: true, partnerWishesAvailable: false },
  };

  it('tells who is missing a wish when the start is refused', async () => {
    const api = services({
      getWishDetective: () => Promise.resolve(empty),
      startWishDetective: () =>
        Promise.reject(
          new ClientProblemError(
            'conflict',
            409,
            'WISH_DETECTIVE_PARTNER_WISH_MISSING',
          ),
        ),
    });
    const { result } = renderHook(
      () => useRemoteWishDetectiveGame(options(api)),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.view.phase).toBe('notStarted'));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.missingWishes).toEqual({
      youNeedWishes: false,
      partnerNeedsWishes: true,
    });
  });

  it('sends clues for the current round and refuses a blank guess', async () => {
    const giving: WishDetectiveRemoteState = {
      readiness: { ownWishesAvailable: true, partnerWishesAvailable: true },
      game: {
        id: 'wish-1',
        status: 'OPEN',
        startedBy: ME,
        endedBy: null,
        roundsTotal: 2,
        roundsPlayed: 0,
        turnAccountId: ME,
        current: {
          round: 0,
          giverId: ME,
          guesserId: PARTNER,
          phase: 'CLUE',
          wish: { wishId: 'wish-a', title: 'Picnic by the lake' },
          skipsLeft: 3,
          clues: [],
        },
        revealed: [],
        scores: [],
        updatedAt: UPDATED,
      },
    };
    const submitClues = vi.fn(() => Promise.resolve(giving));
    const guessWish = vi.fn(() => Promise.resolve(giving));
    const api = services({
      getWishDetective: () => Promise.resolve(giving),
      submitClues,
      guessWish,
    });
    const { result } = renderHook(
      () => useRemoteWishDetectiveGame(options(api)),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.view.phase).toBe('giveClues'));
    await act(async () => {
      await result.current.submitClues(['Blanket', 'Water', 'Sun']);
    });
    expect(submitClues).toHaveBeenCalledWith('wish-1', 0, [
      'Blanket',
      'Water',
      'Sun',
    ]);
    let blank: Awaited<ReturnType<typeof result.current.guess>> | undefined;
    await act(async () => {
      blank = await result.current.guess('   ');
    });
    expect(blank).toMatchObject({ ok: false, conflict: false });
    expect(guessWish).not.toHaveBeenCalled();
  });
});

describe('useRemoteOurMomentsGame', () => {
  function board(
    flipsDone: number,
    matched: boolean | null,
  ): OurMomentsRemoteState {
    const moment = {
      memoryId: 'memory-1',
      imageAttachmentId: 'attachment-1',
      title: 'Our first trip',
      effectiveDate: new Date('2025-06-13'),
    };
    return {
      game: {
        id: 'moments-1',
        status: 'OPEN',
        startedBy: ME,
        endedBy: null,
        turnAccountId: ME,
        flipsDone,
        totalPairs: 3,
        matchedPairs: matched ? 1 : 0,
        cards: Array.from({ length: 6 }, (_, position) => ({
          position,
          face: position % 2 === 0 ? ('PHOTO' as const) : ('CONTEXT' as const),
          state:
            matched && position < 2
              ? ('MATCHED' as const)
              : flipsDone === 1 && position === 0
                ? ('REVEALED' as const)
                : ('HIDDEN' as const),
          moment:
            (matched && position < 2) || (flipsDone === 1 && position === 0)
              ? moment
              : null,
        })),
        lastTurn:
          matched === null
            ? null
            : {
                playerId: ME,
                matched,
                cards: [0, 1].map((position) => ({
                  position,
                  face: position === 0 ? 'PHOTO' : 'CONTEXT',
                  state: matched ? 'MATCHED' : 'HIDDEN',
                  moment,
                })),
              },
        scores: [],
        updatedAt: UPDATED,
      },
    };
  }

  it('flips with the seen flip count and celebrates the reader’s own pair', async () => {
    const flipCard = vi.fn(() => Promise.resolve(board(2, true)));
    const api = services({
      getOurMoments: () => Promise.resolve(board(1, null)),
      flipCard,
    });
    const { result } = renderHook(() => useRemoteOurMomentsGame(options(api)), {
      wrapper: Wrapper,
    });
    await waitFor(() =>
      expect(result.current.view).toMatchObject({
        phase: 'myTurn',
        flipped: [{ position: 0 }],
      }),
    );
    await act(async () => {
      await result.current.flip(1);
    });
    expect(flipCard).toHaveBeenCalledWith('moments-1', 1, 1);
    expect(result.current.view.phase).toBe('matchReveal');
    act(() => result.current.continue());
    expect(result.current.view.phase).toBe('myTurn');
  });
});

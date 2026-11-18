import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { GamesApi } from '../api/generated/apis/GamesApi';
import type { OurMomentsRemoteState } from '../api/generated/models/OurMomentsRemoteState';
import type { WhoOfUsRemoteState } from '../api/generated/models/WhoOfUsRemoteState';
import type { WishDetectiveRemoteState } from '../api/generated/models/WishDetectiveRemoteState';
import { Configuration } from './apiConfiguration';
import { liveGameQueryOptions } from './liveGameSync';
import { ClientProblemError, normalizeClientError } from './problemDetails';
import {
  deriveOurMomentsPhase,
  deriveWhoOfUsPhase,
  deriveWishDetectivePhase,
  type RemoteCoupleGame,
  type RemoteOurMomentsPhase,
  type RemoteWhoOfUsPhase,
  type RemoteWishDetectivePhase,
  remoteCoupleGameQueryKey,
  type WishDetectiveMissingWishes,
  wishDetectiveMissingWishes,
} from './remoteCoupleGames';

/**
 * Data hooks for the remote couple games. Each hook reads the one server
 * state of its game for the reading partner, keeps it live while the page is
 * open (liveGameSync: short polling, refetch on focus and reconnect) and
 * offers the game's actions. A write replaces the cached state with the
 * server's answer; a conflict (the partner moved meanwhile) reloads it.
 */

export interface RemoteCoupleGameServices {
  getWhoOfUs(): Promise<WhoOfUsRemoteState>;
  startWhoOfUs(): Promise<WhoOfUsRemoteState>;
  answerWhoOfUs(
    gameId: string,
    questionId: string,
    partnerId: string,
  ): Promise<WhoOfUsRemoteState>;
  endWhoOfUs(gameId: string): Promise<WhoOfUsRemoteState>;
  getWishDetective(): Promise<WishDetectiveRemoteState>;
  startWishDetective(): Promise<WishDetectiveRemoteState>;
  skipWish(gameId: string, round: number): Promise<WishDetectiveRemoteState>;
  submitClues(
    gameId: string,
    round: number,
    clues: readonly [string, string, string],
  ): Promise<WishDetectiveRemoteState>;
  guessWish(
    gameId: string,
    round: number,
    guess: string | null,
  ): Promise<WishDetectiveRemoteState>;
  endWishDetective(gameId: string): Promise<WishDetectiveRemoteState>;
  getOurMoments(): Promise<OurMomentsRemoteState>;
  startOurMoments(): Promise<OurMomentsRemoteState>;
  flipCard(
    gameId: string,
    flipsDone: number,
    position: number,
  ): Promise<OurMomentsRemoteState>;
  endOurMoments(gameId: string): Promise<OurMomentsRemoteState>;
}

export function createRemoteCoupleGameServices(
  api: GamesApi,
  spaceId: string,
): RemoteCoupleGameServices {
  return {
    getWhoOfUs: () => api.getWhoOfUsRemoteGame({ spaceId }),
    startWhoOfUs: () => api.startWhoOfUsRemoteGame({ spaceId }),
    answerWhoOfUs: (gameId, questionId, partnerId) =>
      api.answerWhoOfUsRemoteQuestion({
        spaceId,
        whoOfUsAnswerInput: { gameId, questionId, partnerId },
      }),
    endWhoOfUs: (gameId) =>
      api.endWhoOfUsRemoteGame({
        spaceId,
        coupleGameEndInput: { gameId },
      }),
    getWishDetective: () => api.getWishDetectiveRemoteGame({ spaceId }),
    startWishDetective: () => api.startWishDetectiveRemoteGame({ spaceId }),
    skipWish: (gameId, round) =>
      api.skipWishDetectiveRemoteWish({
        spaceId,
        wishDetectiveSkipInput: { gameId, round },
      }),
    submitClues: (gameId, round, clues) =>
      api.submitWishDetectiveRemoteClues({
        spaceId,
        wishDetectiveCluesInput: { gameId, round, clues: [...clues] },
      }),
    guessWish: (gameId, round, guess) =>
      api.guessWishDetectiveRemoteWish({
        spaceId,
        wishDetectiveGuessInput: { gameId, round, guess },
      }),
    endWishDetective: (gameId) =>
      api.endWishDetectiveRemoteGame({
        spaceId,
        coupleGameEndInput: { gameId },
      }),
    getOurMoments: () => api.getOurMomentsRemoteGame({ spaceId }),
    startOurMoments: () => api.startOurMomentsRemoteGame({ spaceId }),
    flipCard: (gameId, flipsDone, position) =>
      api.flipOurMomentsRemoteCard({
        spaceId,
        ourMomentsFlipInput: { gameId, flipsDone, position },
      }),
    endOurMoments: (gameId) =>
      api.endOurMomentsRemoteGame({
        spaceId,
        coupleGameEndInput: { gameId },
      }),
  };
}

export interface RemoteCoupleGameOptions {
  spaceId: string;
  currentAccountId: string;
  apiBaseUrl: string;
  accessToken: string;
  /** Test seam; production uses the generated `GamesApi`. */
  services?: RemoteCoupleGameServices;
}

/** The result of one action; a refused write never throws. */
export type RemoteActionResult =
  | { ok: true }
  | { ok: false; conflict: boolean; problem: ClientProblemError };

interface RemoteGameBase<State> {
  state: State | undefined;
  isLoading: boolean;
  /** The load failed (offline, forbidden, ...); show the problem state. */
  loadError: ClientProblemError | null;
  /** The last refused action, cleared by the next action. */
  problem: ClientProblemError | null;
  /** A write is running; disable the controls. */
  busy: boolean;
  refetch: () => void;
}

function useServices(
  options: RemoteCoupleGameOptions,
): RemoteCoupleGameServices {
  const { apiBaseUrl, accessToken, spaceId, services } = options;
  return useMemo(
    () =>
      services ??
      createRemoteCoupleGameServices(
        new GamesApi(
          new Configuration({
            basePath: apiBaseUrl,
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ),
        spaceId,
      ),
    [accessToken, apiBaseUrl, services, spaceId],
  );
}

function useRemoteGameState<State>(
  game: RemoteCoupleGame,
  options: RemoteCoupleGameOptions,
  load: () => Promise<State>,
) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () =>
      remoteCoupleGameQueryKey(game, options.currentAccountId, options.spaceId),
    [game, options.currentAccountId, options.spaceId],
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ClientProblemError | null>(null);
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await load();
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    ...liveGameQueryOptions({ paused: busy }),
  });

  const run = useCallback(
    async (action: () => Promise<State>): Promise<RemoteActionResult> => {
      setBusy(true);
      setProblem(null);
      try {
        const next = await action();
        // A live read that started before this write must not land after it.
        await queryClient.cancelQueries({ queryKey });
        queryClient.setQueryData(queryKey, next);
        return { ok: true };
      } catch (error) {
        const normalized = await normalizeClientError(error);
        const conflict = normalized.status === 409;
        setProblem(normalized);
        if (conflict) await queryClient.invalidateQueries({ queryKey });
        return { ok: false, conflict, problem: normalized };
      } finally {
        setBusy(false);
      }
    },
    [queryClient, queryKey],
  );

  const base: RemoteGameBase<State> = {
    state: query.data,
    isLoading: query.isLoading,
    loadError: (query.error as ClientProblemError | null) ?? null,
    problem,
    busy,
    refetch: () => void query.refetch(),
  };
  return { base, run };
}

/** No game (yet) or no round to act on: nothing is sent. */
function refused(
  kind: 'conflict' | 'validation' = 'conflict',
): Promise<RemoteActionResult> {
  const status = kind === 'conflict' ? 409 : 422;
  return Promise.resolve({
    ok: false,
    conflict: kind === 'conflict',
    problem: new ClientProblemError(kind, status),
  });
}

/* Who of us ------------------------------------------------------------- */

export interface RemoteWhoOfUsGame extends RemoteGameBase<WhoOfUsRemoteState> {
  view: RemoteWhoOfUsPhase;
  start(): Promise<RemoteActionResult>;
  /** `partnerId` is the partner the current question applies to. */
  answer(questionId: string, partnerId: string): Promise<RemoteActionResult>;
  end(): Promise<RemoteActionResult>;
  /** Leave the `reveal` phase for the next question. */
  continue(): void;
}

export function useRemoteWhoOfUsGame(
  options: RemoteCoupleGameOptions,
): RemoteWhoOfUsGame {
  const services = useServices(options);
  const { base, run } = useRemoteGameState('who-of-us', options, () =>
    services.getWhoOfUs(),
  );
  const [pendingReveal, setPendingReveal] = useState<string | null>(null);
  const gameId = base.state?.game?.id;
  return {
    ...base,
    view: deriveWhoOfUsPhase(base.state, pendingReveal),
    start: () => {
      setPendingReveal(null);
      return run(() => services.startWhoOfUs());
    },
    answer: async (questionId, partnerId) => {
      if (!gameId) return refused();
      const result = await run(() =>
        services.answerWhoOfUs(gameId, questionId, partnerId),
      );
      if (result.ok) setPendingReveal(questionId);
      return result;
    },
    end: () => {
      if (!gameId) return refused();
      setPendingReveal(null);
      return run(() => services.endWhoOfUs(gameId));
    },
    continue: () => setPendingReveal(null),
  };
}

/* Wish detective -------------------------------------------------------- */

export interface RemoteWishDetectiveGame
  extends RemoteGameBase<WishDetectiveRemoteState> {
  view: RemoteWishDetectivePhase;
  /** Set when the last start was refused because a partner has no wish. */
  missingWishes: WishDetectiveMissingWishes | null;
  start(): Promise<RemoteActionResult>;
  skipWish(): Promise<RemoteActionResult>;
  submitClues(
    clues: readonly [string, string, string],
  ): Promise<RemoteActionResult>;
  guess(guess: string): Promise<RemoteActionResult>;
  pass(): Promise<RemoteActionResult>;
  end(): Promise<RemoteActionResult>;
  /** Leave the `reveal` phase after the reader's own guess. */
  continue(): void;
}

export function useRemoteWishDetectiveGame(
  options: RemoteCoupleGameOptions,
): RemoteWishDetectiveGame {
  const services = useServices(options);
  const { base, run } = useRemoteGameState('wish-detective', options, () =>
    services.getWishDetective(),
  );
  const [pendingReveal, setPendingReveal] = useState<number | null>(null);
  const game = base.state?.game;
  const round = game?.current?.round;

  const resolve = async (guess: string | null) => {
    if (!game || round === undefined) return refused();
    const result = await run(() => services.guessWish(game.id, round, guess));
    if (result.ok) setPendingReveal(round);
    return result;
  };

  return {
    ...base,
    view: deriveWishDetectivePhase(
      base.state,
      options.currentAccountId,
      pendingReveal,
    ),
    missingWishes: wishDetectiveMissingWishes(base.problem?.code),
    start: () => {
      setPendingReveal(null);
      return run(() => services.startWishDetective());
    },
    skipWish: () => {
      if (!game || round === undefined) return refused();
      return run(() => services.skipWish(game.id, round));
    },
    submitClues: (clues) => {
      if (!game || round === undefined) return refused();
      return run(() => services.submitClues(game.id, round, clues));
    },
    // A blank guess is not a pass; `pass()` is the explicit choice.
    guess: (guess) => (guess.trim() ? resolve(guess) : refused('validation')),
    pass: () => resolve(null),
    end: () => {
      if (!game) return refused();
      setPendingReveal(null);
      return run(() => services.endWishDetective(game.id));
    },
    continue: () => setPendingReveal(null),
  };
}

/* Our moments ----------------------------------------------------------- */

export interface RemoteOurMomentsGame
  extends RemoteGameBase<OurMomentsRemoteState> {
  view: RemoteOurMomentsPhase;
  start(): Promise<RemoteActionResult>;
  /** Flip the card at a board position (0-based). */
  flip(position: number): Promise<RemoteActionResult>;
  end(): Promise<RemoteActionResult>;
  /** Leave the `matchReveal` phase after the reader found a pair. */
  continue(): void;
}

export function useRemoteOurMomentsGame(
  options: RemoteCoupleGameOptions,
): RemoteOurMomentsGame {
  const services = useServices(options);
  const { base, run } = useRemoteGameState('our-moments', options, () =>
    services.getOurMoments(),
  );
  const [pendingMatch, setPendingMatch] = useState<number | null>(null);
  const game = base.state?.game;
  return {
    ...base,
    view: deriveOurMomentsPhase(
      base.state,
      options.currentAccountId,
      pendingMatch,
    ),
    start: () => {
      setPendingMatch(null);
      return run(() => services.startOurMoments());
    },
    flip: async (position) => {
      if (!game) return refused();
      const secondFlip = game.cards.some((card) => card.state === 'REVEALED');
      const result = await run(() =>
        services.flipCard(game.id, game.flipsDone, position),
      );
      // A match on the second flip shows its moment until `continue()`.
      setPendingMatch(result.ok && secondFlip ? game.flipsDone + 1 : null);
      return result;
    },
    end: () => {
      if (!game) return refused();
      setPendingMatch(null);
      return run(() => services.endOurMoments(game.id));
    },
    continue: () => setPendingMatch(null),
  };
}

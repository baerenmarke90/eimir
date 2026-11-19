import type { OurMomentsCardView } from '../api/generated/models/OurMomentsCardView';
import type { OurMomentsLastTurnView } from '../api/generated/models/OurMomentsLastTurnView';
import type { OurMomentsRemoteGame } from '../api/generated/models/OurMomentsRemoteGame';
import type { OurMomentsRemoteState } from '../api/generated/models/OurMomentsRemoteState';
import type { WhoOfUsRemoteGame } from '../api/generated/models/WhoOfUsRemoteGame';
import type { WhoOfUsRemoteQuestion } from '../api/generated/models/WhoOfUsRemoteQuestion';
import type { WhoOfUsRemoteState } from '../api/generated/models/WhoOfUsRemoteState';
import type { WishDetectiveCurrentRound } from '../api/generated/models/WishDetectiveCurrentRound';
import type { WishDetectiveReadiness } from '../api/generated/models/WishDetectiveReadiness';
import type { WishDetectiveRemoteGame } from '../api/generated/models/WishDetectiveRemoteGame';
import type { WishDetectiveRemoteState } from '../api/generated/models/WishDetectiveRemoteState';
import type { WishDetectiveRevealedRound } from '../api/generated/models/WishDetectiveRevealedRound';
import type { WishDetectiveWishView } from '../api/generated/models/WishDetectiveWishView';

/**
 * Remote rounds for the couple games: each partner plays on their own device.
 *
 * The server owns the game state and builds every response for the reading
 * partner (the other partner's answer, the wish and unflipped cards stay
 * hidden until the rules allow them). This module only turns that state into
 * a small phase machine for the page. The local pass-and-play sessions
 * (whoOfUsSession, wishDetectiveSession, ourMomentsSession) stay unchanged.
 */

export type RemoteCoupleGame = 'who-of-us' | 'wish-detective' | 'our-moments';

export function remoteCoupleGameQueryKey(
  game: RemoteCoupleGame,
  accountId: string,
  spaceId: string,
) {
  return ['games', 'remote', game, accountId, spaceId] as const;
}

/* Who of us ------------------------------------------------------------- */

export type RemoteWhoOfUsPhase =
  | { phase: 'notStarted' }
  | {
      phase: 'myTurn';
      game: WhoOfUsRemoteGame;
      /** The first question this partner has not answered yet. */
      question: WhoOfUsRemoteQuestion;
      /** 0-based position of that question in the game. */
      questionIndex: number;
    }
  | {
      /** The reader just answered a question both have answered. */
      phase: 'reveal';
      game: WhoOfUsRemoteGame;
      question: WhoOfUsRemoteQuestion;
    }
  | { phase: 'waitingForPartner'; game: WhoOfUsRemoteGame }
  | { phase: 'finished'; game: WhoOfUsRemoteGame }
  | { phase: 'ended'; game: WhoOfUsRemoteGame };

export function deriveWhoOfUsPhase(
  state: WhoOfUsRemoteState | undefined,
  pendingRevealQuestionId: string | null = null,
): RemoteWhoOfUsPhase {
  const game = state?.game ?? null;
  if (!game) return { phase: 'notStarted' };
  const revealed = pendingRevealQuestionId
    ? game.questions.find(
        (question) =>
          question.questionId === pendingRevealQuestionId &&
          question.matches !== null,
      )
    : undefined;
  if (revealed) return { phase: 'reveal', game, question: revealed };
  if (game.status === 'ENDED') return { phase: 'ended', game };
  if (game.status === 'FINISHED') return { phase: 'finished', game };
  const questionIndex = game.questions.findIndex(
    (question) => question.myAnswer === null,
  );
  if (questionIndex < 0) return { phase: 'waitingForPartner', game };
  return {
    phase: 'myTurn',
    game,
    question: game.questions[questionIndex],
    questionIndex,
  };
}

/* Wish detective -------------------------------------------------------- */

export interface WishDetectiveMissingWishes {
  youNeedWishes: boolean;
  partnerNeedsWishes: boolean;
}

/** Who still needs a wish, from the start problem code (never a count). */
export function wishDetectiveMissingWishes(
  code: string | undefined,
): WishDetectiveMissingWishes | null {
  switch (code) {
    case 'WISH_DETECTIVE_WISHES_MISSING':
      return { youNeedWishes: true, partnerNeedsWishes: true };
    case 'WISH_DETECTIVE_OWN_WISH_MISSING':
      return { youNeedWishes: true, partnerNeedsWishes: false };
    case 'WISH_DETECTIVE_PARTNER_WISH_MISSING':
      return { youNeedWishes: false, partnerNeedsWishes: true };
    default:
      return null;
  }
}

export type RemoteWishDetectivePhase =
  | {
      phase: 'notStarted';
      readiness: WishDetectiveReadiness | null;
    }
  | {
      /** The reader gives three clues for their own wish. */
      phase: 'giveClues';
      game: WishDetectiveRemoteGame;
      round: WishDetectiveCurrentRound;
      /** Absent when the wish vanished; `skipWish()` then draws for free. */
      wish: WishDetectiveWishView | null;
      skipsLeft: number;
      /** The round revealed just before, for a short look back. */
      lastRevealed: WishDetectiveRevealedRound | null;
    }
  | {
      /** The reader guesses from the partner's clues. */
      phase: 'guess';
      game: WishDetectiveRemoteGame;
      round: WishDetectiveCurrentRound;
      clues: readonly string[];
      lastRevealed: WishDetectiveRevealedRound | null;
    }
  | {
      /** The reader just guessed or passed; shown until `continue()`. */
      phase: 'reveal';
      game: WishDetectiveRemoteGame;
      revealed: WishDetectiveRevealedRound;
    }
  | {
      phase: 'waitingForPartner';
      game: WishDetectiveRemoteGame;
      /** What the partner is doing now: giving clues or guessing. */
      partnerStep: 'giveClues' | 'guess';
      lastRevealed: WishDetectiveRevealedRound | null;
    }
  | { phase: 'finished'; game: WishDetectiveRemoteGame }
  | { phase: 'ended'; game: WishDetectiveRemoteGame };

export function deriveWishDetectivePhase(
  state: WishDetectiveRemoteState | undefined,
  accountId: string,
  pendingRevealRound: number | null = null,
): RemoteWishDetectivePhase {
  const game = state?.game ?? null;
  if (!game) {
    return {
      phase: 'notStarted',
      readiness: state?.readiness ?? null,
    };
  }
  const revealed =
    pendingRevealRound === null
      ? undefined
      : game.revealed.find((round) => round.round === pendingRevealRound);
  if (revealed) return { phase: 'reveal', game, revealed };
  if (game.status === 'ENDED') return { phase: 'ended', game };
  if (game.status === 'FINISHED' || !game.current) {
    return { phase: 'finished', game };
  }
  const round = game.current;
  const lastRevealed = game.revealed[game.revealed.length - 1] ?? null;
  if (round.phase === 'CLUE') {
    if (round.giverId === accountId) {
      return {
        phase: 'giveClues',
        game,
        round,
        wish: round.wish,
        skipsLeft: round.skipsLeft,
        lastRevealed,
      };
    }
    return {
      phase: 'waitingForPartner',
      game,
      partnerStep: 'giveClues',
      lastRevealed,
    };
  }
  if (round.guesserId === accountId) {
    return { phase: 'guess', game, round, clues: round.clues, lastRevealed };
  }
  return {
    phase: 'waitingForPartner',
    game,
    partnerStep: 'guess',
    lastRevealed,
  };
}

/* Our moments ----------------------------------------------------------- */

export type RemoteOurMomentsPhase =
  | { phase: 'notStarted' }
  | {
      /** The reader flips; `flipped` is 0 or 1 card of the current turn. */
      phase: 'myTurn';
      game: OurMomentsRemoteGame;
      flipped: readonly OurMomentsCardView[];
      /** The partner's latest turn, for a short replay before flipping. */
      lastTurn: OurMomentsLastTurnView | null;
    }
  | {
      /** The reader just found a pair; shown until `continue()`. */
      phase: 'matchReveal';
      game: OurMomentsRemoteGame;
      pair: OurMomentsLastTurnView;
    }
  | {
      phase: 'waitingForPartner';
      game: OurMomentsRemoteGame;
      lastTurn: OurMomentsLastTurnView | null;
    }
  | { phase: 'finished'; game: OurMomentsRemoteGame }
  | { phase: 'ended'; game: OurMomentsRemoteGame };

export function deriveOurMomentsPhase(
  state: OurMomentsRemoteState | undefined,
  accountId: string,
  pendingMatchFlips: number | null = null,
): RemoteOurMomentsPhase {
  const game = state?.game ?? null;
  if (!game) return { phase: 'notStarted' };
  if (
    pendingMatchFlips !== null &&
    game.flipsDone === pendingMatchFlips &&
    game.lastTurn?.matched &&
    game.lastTurn.playerId === accountId
  ) {
    return { phase: 'matchReveal', game, pair: game.lastTurn };
  }
  if (game.status === 'ENDED') return { phase: 'ended', game };
  if (game.status === 'FINISHED') return { phase: 'finished', game };
  if (game.turnAccountId === accountId) {
    return {
      phase: 'myTurn',
      game,
      flipped: game.cards.filter((card) => card.state === 'REVEALED'),
      lastTurn: game.lastTurn,
    };
  }
  return { phase: 'waitingForPartner', game, lastTurn: game.lastTurn };
}

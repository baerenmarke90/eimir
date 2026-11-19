import { describe, expect, it } from 'vitest';
import type { OurMomentsCardView } from '../api/generated/models/OurMomentsCardView';
import type { OurMomentsRemoteGame } from '../api/generated/models/OurMomentsRemoteGame';
import type { WhoOfUsRemoteGame } from '../api/generated/models/WhoOfUsRemoteGame';
import type { WishDetectiveRemoteGame } from '../api/generated/models/WishDetectiveRemoteGame';
import {
  deriveOurMomentsPhase,
  deriveWhoOfUsPhase,
  deriveWishDetectivePhase,
  remoteCoupleGameQueryKey,
  wishDetectiveMissingWishes,
} from './remoteCoupleGames';

const ME = 'account-me';
const PARTNER = 'account-partner';
const UPDATED = new Date('2026-11-18T10:00:00Z');

function whoOfUsGame(
  overrides: Partial<WhoOfUsRemoteGame> = {},
): WhoOfUsRemoteGame {
  return {
    id: 'who-1',
    status: 'OPEN',
    startedBy: ME,
    endedBy: null,
    turnAccountId: null,
    questions: [
      {
        questionId: 'snack',
        myAnswer: null,
        partnerAnswered: false,
        partnerAnswer: null,
        matches: null,
      },
      {
        questionId: 'packing',
        myAnswer: null,
        partnerAnswered: false,
        partnerAnswer: null,
        matches: null,
      },
    ],
    myAnsweredCount: 0,
    partnerAnsweredCount: 0,
    revealedCount: 0,
    agreementCount: 0,
    updatedAt: UPDATED,
    ...overrides,
  };
}

function wishGame(
  overrides: Partial<WishDetectiveRemoteGame> = {},
): WishDetectiveRemoteGame {
  return {
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
    scores: [
      { accountId: ME, correctGuesses: 0 },
      { accountId: PARTNER, correctGuesses: 0 },
    ],
    updatedAt: UPDATED,
    ...overrides,
  };
}

function card(
  position: number,
  state: OurMomentsCardView['state'],
): OurMomentsCardView {
  return {
    position,
    face: position % 2 === 0 ? 'PHOTO' : 'CONTEXT',
    state,
    moment:
      state === 'HIDDEN'
        ? null
        : {
            memoryId: `memory-${position}`,
            imageAttachmentId: `attachment-${position}`,
            title: 'Our first trip',
            effectiveDate: new Date('2025-06-13'),
          },
  };
}

function momentsGame(
  overrides: Partial<OurMomentsRemoteGame> = {},
): OurMomentsRemoteGame {
  return {
    id: 'moments-1',
    status: 'OPEN',
    startedBy: ME,
    endedBy: null,
    turnAccountId: ME,
    flipsDone: 0,
    totalPairs: 3,
    matchedPairs: 0,
    cards: Array.from({ length: 6 }, (_, position) => card(position, 'HIDDEN')),
    lastTurn: null,
    scores: [
      { accountId: ME, pairs: 0 },
      { accountId: PARTNER, pairs: 0 },
    ],
    updatedAt: UPDATED,
    ...overrides,
  };
}

describe('remote couple game query keys', () => {
  it('are scoped per game, account and Space', () => {
    expect(remoteCoupleGameQueryKey('who-of-us', ME, 'space-1')).toEqual([
      'games',
      'remote',
      'who-of-us',
      ME,
      'space-1',
    ]);
  });
});

describe('deriveWhoOfUsPhase', () => {
  it('is not started without a game', () => {
    expect(deriveWhoOfUsPhase(undefined)).toEqual({ phase: 'notStarted' });
    expect(deriveWhoOfUsPhase({ game: null })).toEqual({ phase: 'notStarted' });
  });

  it('asks the first unanswered question', () => {
    const game = whoOfUsGame();
    game.questions[0] = { ...game.questions[0], myAnswer: PARTNER };
    const view = deriveWhoOfUsPhase({ game });
    expect(view).toMatchObject({ phase: 'myTurn', questionIndex: 1 });
  });

  it('shows a reveal only for a question both answered, then waits', () => {
    const game = whoOfUsGame({
      questions: [
        {
          questionId: 'snack',
          myAnswer: PARTNER,
          partnerAnswered: true,
          partnerAnswer: PARTNER,
          matches: true,
        },
        {
          questionId: 'packing',
          myAnswer: ME,
          partnerAnswered: false,
          partnerAnswer: null,
          matches: null,
        },
      ],
    });
    expect(deriveWhoOfUsPhase({ game }, 'snack')).toMatchObject({
      phase: 'reveal',
      question: { questionId: 'snack', matches: true },
    });
    // The partner has not answered "packing" yet: no reveal, just waiting.
    expect(deriveWhoOfUsPhase({ game }, 'packing')).toMatchObject({
      phase: 'waitingForPartner',
    });
  });

  it('distinguishes finished and ended games', () => {
    expect(
      deriveWhoOfUsPhase({ game: whoOfUsGame({ status: 'FINISHED' }) }).phase,
    ).toBe('finished');
    expect(
      deriveWhoOfUsPhase({
        game: whoOfUsGame({ status: 'ENDED', endedBy: PARTNER }),
      }).phase,
    ).toBe('ended');
  });
});

describe('deriveWishDetectivePhase', () => {
  const readiness = {
    ownWishesAvailable: true,
    partnerWishesAvailable: false,
  };

  it('carries readiness before a game starts', () => {
    expect(deriveWishDetectivePhase({ game: null, readiness }, ME)).toEqual({
      phase: 'notStarted',
      readiness,
    });
  });

  it('lets the giver write clues and the guesser wait', () => {
    const game = wishGame();
    expect(deriveWishDetectivePhase({ game, readiness }, ME)).toMatchObject({
      phase: 'giveClues',
      wish: { title: 'Picnic by the lake' },
      skipsLeft: 3,
    });
    expect(
      deriveWishDetectivePhase({ game, readiness }, PARTNER),
    ).toMatchObject({ phase: 'waitingForPartner', partnerStep: 'giveClues' });
  });

  it('lets the guesser guess from the clues', () => {
    const game = wishGame({
      turnAccountId: PARTNER,
      current: {
        round: 0,
        giverId: ME,
        guesserId: PARTNER,
        phase: 'GUESS',
        wish: null,
        skipsLeft: 0,
        clues: ['Blanket', 'Water', 'Sun'],
      },
    });
    expect(
      deriveWishDetectivePhase({ game, readiness }, PARTNER),
    ).toMatchObject({ phase: 'guess', clues: ['Blanket', 'Water', 'Sun'] });
    expect(deriveWishDetectivePhase({ game, readiness }, ME)).toMatchObject({
      phase: 'waitingForPartner',
      partnerStep: 'guess',
    });
  });

  it('shows the reader their own reveal until it is dismissed', () => {
    const revealed = {
      round: 0,
      giverId: PARTNER,
      guesserId: ME,
      clues: ['Blanket', 'Water', 'Sun'],
      guess: 'picnic lake',
      result: 'CORRECT' as const,
      wish: { wishId: 'wish-b', title: 'Picnic by the lake' },
    };
    const withRound = wishGame({ revealed: [revealed], roundsPlayed: 1 });
    expect(
      deriveWishDetectivePhase({ game: withRound, readiness }, ME, 0),
    ).toMatchObject({ phase: 'reveal', revealed: { result: 'CORRECT' } });
    expect(
      deriveWishDetectivePhase({ game: withRound, readiness }, ME),
    ).toMatchObject({ phase: 'giveClues', lastRevealed: revealed });
  });

  it('maps the start problem to who still needs a wish', () => {
    expect(wishDetectiveMissingWishes('WISH_DETECTIVE_WISHES_MISSING')).toEqual(
      {
        youNeedWishes: true,
        partnerNeedsWishes: true,
      },
    );
    expect(
      wishDetectiveMissingWishes('WISH_DETECTIVE_PARTNER_WISH_MISSING'),
    ).toEqual({ youNeedWishes: false, partnerNeedsWishes: true });
    expect(
      wishDetectiveMissingWishes('WISH_DETECTIVE_OWN_WISH_MISSING'),
    ).toEqual({ youNeedWishes: true, partnerNeedsWishes: false });
    expect(wishDetectiveMissingWishes('COUPLE_GAME_ALREADY_OPEN')).toBeNull();
  });
});

describe('deriveOurMomentsPhase', () => {
  it('lets the active player flip and the other one wait', () => {
    const game = momentsGame({
      flipsDone: 1,
      cards: [card(0, 'REVEALED'), ...momentsGame().cards.slice(1)],
    });
    expect(deriveOurMomentsPhase({ game }, ME)).toMatchObject({
      phase: 'myTurn',
      flipped: [{ position: 0 }],
    });
    expect(deriveOurMomentsPhase({ game }, PARTNER).phase).toBe(
      'waitingForPartner',
    );
  });

  it('shows the reader their own found pair until it is dismissed', () => {
    const lastTurn = {
      playerId: ME,
      matched: true,
      cards: [card(0, 'MATCHED'), card(3, 'MATCHED')],
    };
    const game = momentsGame({ flipsDone: 2, matchedPairs: 1, lastTurn });
    expect(deriveOurMomentsPhase({ game }, ME, 2)).toMatchObject({
      phase: 'matchReveal',
      pair: lastTurn,
    });
    expect(deriveOurMomentsPhase({ game }, ME).phase).toBe('myTurn');
    // A pair the partner found is replayed, not celebrated as the reader's.
    const theirs = momentsGame({
      flipsDone: 2,
      turnAccountId: PARTNER,
      lastTurn: { ...lastTurn, playerId: PARTNER },
    });
    expect(deriveOurMomentsPhase({ game: theirs }, ME, 2).phase).toBe(
      'waitingForPartner',
    );
  });

  it('ends with the finished or ended board', () => {
    expect(
      deriveOurMomentsPhase(
        { game: momentsGame({ status: 'FINISHED', turnAccountId: null }) },
        ME,
      ).phase,
    ).toBe('finished');
    expect(
      deriveOurMomentsPhase(
        {
          game: momentsGame({
            status: 'ENDED',
            endedBy: ME,
            turnAccountId: null,
          }),
        },
        ME,
      ).phase,
    ).toBe('ended');
  });
});

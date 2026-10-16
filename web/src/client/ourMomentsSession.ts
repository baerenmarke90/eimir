export interface OurMomentsParticipant {
  id: string;
  displayName: string;
}

export interface PreparedOurMoment {
  memoryId: string;
  title: string;
  effectiveDate: Date;
  imageAttachmentId: string;
  imageUrl: string;
}

export type OurMomentsCardFace = 'photo' | 'context';
export type OurMomentsCardState = 'hidden' | 'revealed' | 'matched';

export interface OurMomentsCard {
  id: string;
  pairId: string;
  face: OurMomentsCardFace;
  state: OurMomentsCardState;
  moment: PreparedOurMoment;
}

export type OurMomentsSessionStatus =
  | 'idle'
  | 'playing'
  | 'match-reveal'
  | 'finished';

export interface OurMomentsSessionSnapshot {
  status: OurMomentsSessionStatus;
  participants: readonly [OurMomentsParticipant, OurMomentsParticipant] | null;
  activePlayerIndex: 0 | 1;
  scores: readonly [number, number];
  cards: readonly OurMomentsCard[];
  inputLocked: boolean;
  matchedPairs: number;
  totalPairs: number;
  revealedMatch: PreparedOurMoment | null;
  round: number;
}

export type OurMomentsSessionAction =
  | { type: 'SELECT_CARD'; cardId: string }
  | { type: 'CONTINUE_AFTER_MATCH' };

export interface OurMomentsSession {
  start(
    moments: readonly PreparedOurMoment[],
    participants: readonly [OurMomentsParticipant, OurMomentsParticipant],
  ): void;
  restart(): void;
  dispatch(action: OurMomentsSessionAction): void;
  getSnapshot(): OurMomentsSessionSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export interface LocalOurMomentsSessionOptions {
  random?: () => number;
  mismatchDelayMs?: number;
}

const EMPTY_SNAPSHOT: OurMomentsSessionSnapshot = {
  status: 'idle',
  participants: null,
  activePlayerIndex: 0,
  scores: [0, 0],
  cards: [],
  inputLocked: false,
  matchedPairs: 0,
  totalPairs: 0,
  revealedMatch: null,
  round: 0,
};

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function selectOurMomentsRound<T>(
  candidates: readonly T[],
  random: () => number = Math.random,
): T[] {
  if (candidates.length < 3) return [];
  const pairCount = candidates.length >= 4 ? 4 : 3;
  return shuffled(candidates, random).slice(0, pairCount);
}

function buildCards(
  moments: readonly PreparedOurMoment[],
  random: () => number,
): OurMomentsCard[] {
  return shuffled(
    moments.flatMap((moment) => [
      {
        id: `${moment.memoryId}:photo`,
        pairId: moment.memoryId,
        face: 'photo' as const,
        state: 'hidden' as const,
        moment,
      },
      {
        id: `${moment.memoryId}:context`,
        pairId: moment.memoryId,
        face: 'context' as const,
        state: 'hidden' as const,
        moment,
      },
    ]),
    random,
  );
}

function replaceCardState(
  cards: readonly OurMomentsCard[],
  cardIds: ReadonlySet<string>,
  state: OurMomentsCardState,
): OurMomentsCard[] {
  return cards.map((card) =>
    cardIds.has(card.id) ? { ...card, state } : card,
  );
}

export function createLocalOurMomentsSession(
  options: LocalOurMomentsSessionOptions = {},
): OurMomentsSession {
  const random = options.random ?? Math.random;
  const mismatchDelayMs = options.mismatchDelayMs ?? 850;
  const listeners = new Set<() => void>();

  let sourceMoments: PreparedOurMoment[] = [];
  let sourceParticipants:
    | [OurMomentsParticipant, OurMomentsParticipant]
    | null = null;
  let snapshot = EMPTY_SNAPSHOT;
  let mismatchTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function emit(next: OurMomentsSessionSnapshot): void {
    if (disposed) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function clearMismatchTimer(): void {
    if (mismatchTimer === null) return;
    clearTimeout(mismatchTimer);
    mismatchTimer = null;
  }

  function beginRound(): void {
    if (!sourceParticipants || sourceMoments.length < 3) {
      throw new Error(
        'Our Moments requires two participants and at least three prepared moments.',
      );
    }
    clearMismatchTimer();
    emit({
      status: 'playing',
      participants: [
        { ...sourceParticipants[0] },
        { ...sourceParticipants[1] },
      ],
      activePlayerIndex: 0,
      scores: [0, 0],
      cards: buildCards(sourceMoments, random),
      inputLocked: false,
      matchedPairs: 0,
      totalPairs: sourceMoments.length,
      revealedMatch: null,
      round: snapshot.round + 1,
    });
  }

  function resolveMismatch(cardIds: readonly string[]): void {
    if (disposed || snapshot.status !== 'playing') return;
    const nextIndex: 0 | 1 = snapshot.activePlayerIndex === 0 ? 1 : 0;
    emit({
      ...snapshot,
      cards: replaceCardState(snapshot.cards, new Set(cardIds), 'hidden'),
      activePlayerIndex: nextIndex,
      inputLocked: false,
    });
  }

  function selectCard(cardId: string): void {
    if (disposed || snapshot.status !== 'playing' || snapshot.inputLocked) {
      return;
    }

    const selectedCard = snapshot.cards.find((card) => card.id === cardId);
    if (selectedCard?.state !== 'hidden') return;

    const previouslyRevealed = snapshot.cards.filter(
      (card) => card.state === 'revealed',
    );
    if (previouslyRevealed.length >= 2) return;

    const revealedCards = replaceCardState(
      snapshot.cards,
      new Set([cardId]),
      'revealed',
    );

    if (previouslyRevealed.length === 0) {
      emit({ ...snapshot, cards: revealedCards });
      return;
    }

    const firstCard = previouslyRevealed[0];
    if (firstCard.pairId === selectedCard.pairId) {
      const matchedIds = new Set([firstCard.id, selectedCard.id]);
      const nextScores: [number, number] = [
        snapshot.scores[0],
        snapshot.scores[1],
      ];
      nextScores[snapshot.activePlayerIndex] += 1;

      emit({
        ...snapshot,
        status: 'match-reveal',
        cards: replaceCardState(revealedCards, matchedIds, 'matched'),
        scores: nextScores,
        matchedPairs: snapshot.matchedPairs + 1,
        inputLocked: true,
        revealedMatch: selectedCard.moment,
      });
      return;
    }

    const mismatchIds = [firstCard.id, selectedCard.id];
    emit({ ...snapshot, cards: revealedCards, inputLocked: true });
    mismatchTimer = setTimeout(() => {
      mismatchTimer = null;
      resolveMismatch(mismatchIds);
    }, mismatchDelayMs);
  }

  function continueAfterMatch(): void {
    if (disposed || snapshot.status !== 'match-reveal') return;
    const finished = snapshot.matchedPairs === snapshot.totalPairs;
    emit({
      ...snapshot,
      status: finished ? 'finished' : 'playing',
      inputLocked: false,
      revealedMatch: null,
    });
  }

  return {
    start(moments, participants) {
      if (disposed) return;
      if (participants.length !== 2) {
        throw new Error('Our Moments requires exactly two participants.');
      }
      if (moments.length < 3 || moments.length > 4) {
        throw new Error('Our Moments rounds contain three or four moments.');
      }
      sourceMoments = moments.map((moment) => ({
        ...moment,
        effectiveDate: new Date(moment.effectiveDate),
      }));
      sourceParticipants = [{ ...participants[0] }, { ...participants[1] }];
      beginRound();
    },
    restart() {
      if (disposed || !sourceParticipants || sourceMoments.length < 3) return;
      beginRound();
    },
    dispatch(action) {
      if (action.type === 'SELECT_CARD') {
        selectCard(action.cardId);
        return;
      }
      continueAfterMatch();
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearMismatchTimer();
      listeners.clear();
    },
  };
}

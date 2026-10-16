export interface WhoOfUsParticipant {
  id: string;
  displayName: string;
}

export const WHO_OF_US_QUESTION_IDS = [
  'morningLonger',
  'movieSleeper',
  'spontaneous',
  'travelPlanner',
  'sameFood',
  'wrongLyrics',
  'snack',
  'packing',
] as const;

export type WhoOfUsQuestionId = (typeof WHO_OF_US_QUESTION_IDS)[number];

export type WhoOfUsPhase =
  | 'firstAnswer'
  | 'handoff'
  | 'secondAnswer'
  | 'reveal'
  | 'finished';

export interface WhoOfUsReveal {
  questionId: WhoOfUsQuestionId;
  firstResponderId: string;
  firstAnswerPartnerId: string;
  secondResponderId: string;
  secondAnswerPartnerId: string;
  matches: boolean;
}

export interface WhoOfUsSessionSnapshot {
  phase: WhoOfUsPhase;
  participants: readonly [WhoOfUsParticipant, WhoOfUsParticipant] | null;
  currentQuestionId: WhoOfUsQuestionId | null;
  currentRoundIndex: number;
  totalRounds: number;
  roundsPlayed: number;
  responderId: string | null;
  agreementCount: number;
  reveal: WhoOfUsReveal | null;
}

export type WhoOfUsSessionAction =
  | { type: 'ANSWER'; partnerId: string }
  | { type: 'CONFIRM_HANDOFF' }
  | { type: 'CONTINUE' };

export interface WhoOfUsSession {
  start(
    questions: readonly WhoOfUsQuestionId[],
    participants: readonly [WhoOfUsParticipant, WhoOfUsParticipant],
  ): void;
  restart(): void;
  dispatch(action: WhoOfUsSessionAction): void;
  getSnapshot(): WhoOfUsSessionSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

const EMPTY_SNAPSHOT: WhoOfUsSessionSnapshot = {
  phase: 'finished',
  participants: null,
  currentQuestionId: null,
  currentRoundIndex: 0,
  totalRounds: 0,
  roundsPlayed: 0,
  responderId: null,
  agreementCount: 0,
  reveal: null,
};

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function selectWhoOfUsQuestions(
  random: () => number = Math.random,
): WhoOfUsQuestionId[] {
  return shuffled(WHO_OF_US_QUESTION_IDS, random);
}

function responderPair(
  roundIndex: number,
  participants: readonly [WhoOfUsParticipant, WhoOfUsParticipant],
): readonly [WhoOfUsParticipant, WhoOfUsParticipant] {
  return roundIndex % 2 === 0
    ? [participants[0], participants[1]]
    : [participants[1], participants[0]];
}

export function createLocalWhoOfUsSession(): WhoOfUsSession {
  const listeners = new Set<() => void>();
  let sourceQuestions: WhoOfUsQuestionId[] = [];
  let sourceParticipants: [WhoOfUsParticipant, WhoOfUsParticipant] | null =
    null;
  let hiddenFirstAnswerPartnerId: string | null = null;
  let snapshot = EMPTY_SNAPSHOT;
  let disposed = false;

  function emit(next: WhoOfUsSessionSnapshot): void {
    if (disposed) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function beginGame(): void {
    if (!sourceParticipants || sourceQuestions.length === 0) {
      throw new Error(
        'The perspective game requires two participants and at least one question.',
      );
    }
    hiddenFirstAnswerPartnerId = null;
    const [firstResponder] = responderPair(0, sourceParticipants);
    emit({
      phase: 'firstAnswer',
      participants: [
        { ...sourceParticipants[0] },
        { ...sourceParticipants[1] },
      ],
      currentQuestionId: sourceQuestions[0],
      currentRoundIndex: 0,
      totalRounds: sourceQuestions.length,
      roundsPlayed: 0,
      responderId: firstResponder.id,
      agreementCount: 0,
      reveal: null,
    });
  }

  function answer(partnerId: string): void {
    if (!sourceParticipants || !snapshot.currentQuestionId) return;
    if (
      !sourceParticipants.some((participant) => participant.id === partnerId)
    ) {
      return;
    }

    const [firstResponder, secondResponder] = responderPair(
      snapshot.currentRoundIndex,
      sourceParticipants,
    );

    if (snapshot.phase === 'firstAnswer') {
      hiddenFirstAnswerPartnerId = partnerId;
      emit({
        ...snapshot,
        phase: 'handoff',
        currentQuestionId: null,
        responderId: secondResponder.id,
        reveal: null,
      });
      return;
    }

    if (
      snapshot.phase !== 'secondAnswer' ||
      hiddenFirstAnswerPartnerId === null
    ) {
      return;
    }

    const firstAnswerPartnerId = hiddenFirstAnswerPartnerId;
    hiddenFirstAnswerPartnerId = null;
    const matches = firstAnswerPartnerId === partnerId;
    emit({
      ...snapshot,
      phase: 'reveal',
      currentQuestionId: sourceQuestions[snapshot.currentRoundIndex],
      roundsPlayed: snapshot.roundsPlayed + 1,
      responderId: null,
      agreementCount: snapshot.agreementCount + (matches ? 1 : 0),
      reveal: {
        questionId: sourceQuestions[snapshot.currentRoundIndex],
        firstResponderId: firstResponder.id,
        firstAnswerPartnerId,
        secondResponderId: secondResponder.id,
        secondAnswerPartnerId: partnerId,
        matches,
      },
    });
  }

  function confirmHandoff(): void {
    if (
      !sourceParticipants ||
      snapshot.phase !== 'handoff' ||
      hiddenFirstAnswerPartnerId === null
    ) {
      return;
    }
    const [, secondResponder] = responderPair(
      snapshot.currentRoundIndex,
      sourceParticipants,
    );
    emit({
      ...snapshot,
      phase: 'secondAnswer',
      currentQuestionId: sourceQuestions[snapshot.currentRoundIndex],
      responderId: secondResponder.id,
      reveal: null,
    });
  }

  function continueToNextRound(): void {
    if (!sourceParticipants || snapshot.phase !== 'reveal') return;
    const nextIndex = snapshot.currentRoundIndex + 1;
    if (nextIndex >= sourceQuestions.length) {
      emit({
        ...snapshot,
        phase: 'finished',
        currentQuestionId: null,
        responderId: null,
        reveal: null,
      });
      return;
    }

    hiddenFirstAnswerPartnerId = null;
    const [firstResponder] = responderPair(nextIndex, sourceParticipants);
    emit({
      ...snapshot,
      phase: 'firstAnswer',
      currentQuestionId: sourceQuestions[nextIndex],
      currentRoundIndex: nextIndex,
      responderId: firstResponder.id,
      reveal: null,
    });
  }

  return {
    start(questions, participants) {
      if (disposed) return;
      const participantIds = new Set(
        participants.map((participant) => participant.id),
      );
      if (participantIds.size !== 2) {
        throw new Error(
          'The perspective game requires two stable participant identities.',
        );
      }
      const uniqueQuestions = [...new Set(questions)];
      if (uniqueQuestions.length !== questions.length) {
        throw new Error(
          'Perspective-game question IDs must be unique within a session.',
        );
      }
      sourceQuestions = [...questions];
      sourceParticipants = [{ ...participants[0] }, { ...participants[1] }];
      beginGame();
    },
    restart() {
      if (disposed) return;
      beginGame();
    },
    dispatch(action) {
      if (disposed) return;
      switch (action.type) {
        case 'ANSWER':
          answer(action.partnerId);
          break;
        case 'CONFIRM_HANDOFF':
          confirmHandoff();
          break;
        case 'CONTINUE':
          continueToNextRound();
          break;
      }
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      listeners.clear();
      sourceQuestions = [];
      sourceParticipants = null;
      hiddenFirstAnswerPartnerId = null;
    },
  };
}

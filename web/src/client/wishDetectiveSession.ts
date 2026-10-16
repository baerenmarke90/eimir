import { WISH_DETECTIVE_GERMAN_STOP_WORDS } from '../i18n/locales/wishDetectiveRules';

export interface WishDetectiveParticipant {
  id: string;
  displayName: string;
}

export interface WishDetectiveCandidate {
  wishId: string;
  createdBy: string;
  title: string;
}

export type WishDetectivePhase =
  | 'clue'
  | 'handoff'
  | 'guess'
  | 'reveal'
  | 'finished';

export type WishDetectiveResult = 'correct' | 'incorrect' | 'passed';

export type ClueValidationError =
  | 'required'
  | 'oneWord'
  | 'tooLong'
  | 'duplicate'
  | 'wishWord';

export interface WishDetectiveReveal {
  result: WishDetectiveResult;
  guess: string | null;
}

export interface WishDetectiveSessionSnapshot {
  phase: WishDetectivePhase;
  participants:
    | readonly [WishDetectiveParticipant, WishDetectiveParticipant]
    | null;
  currentRoundIndex: number;
  totalRounds: number;
  roundsPlayed: number;
  giverIndex: 0 | 1;
  guesserIndex: 0 | 1;
  currentWish: WishDetectiveCandidate | null;
  clues: readonly [string, string, string];
  clueErrors: readonly [
    ClueValidationError | null,
    ClueValidationError | null,
    ClueValidationError | null,
  ];
  scores: readonly [number, number];
  correctGuesses: number;
  reveal: WishDetectiveReveal | null;
}

export type WishDetectiveSessionAction =
  | { type: 'SET_CLUE'; index: 0 | 1 | 2; value: string }
  | { type: 'START_HANDOFF' }
  | { type: 'CONFIRM_HANDOFF' }
  | { type: 'SUBMIT_GUESS'; guess: string }
  | { type: 'PASS' }
  | { type: 'CONTINUE' };

export interface WishDetectiveSession {
  start(
    rounds: readonly WishDetectiveCandidate[],
    participants: readonly [WishDetectiveParticipant, WishDetectiveParticipant],
  ): void;
  restart(): void;
  dispatch(action: WishDetectiveSessionAction): void;
  getSnapshot(): WishDetectiveSessionSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

const MAX_CLUE_LENGTH = 24;
const MIN_ROUNDS_PER_PARTNER = 2;
const MAX_ROUNDS_PER_PARTNER = 4;
const WORD_PATTERN = /^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)?$/u;
const TOKEN_PATTERN = /[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)?/gu;
const GUESS_STOP_WORDS = new Set(WISH_DETECTIVE_GERMAN_STOP_WORDS);

const EMPTY_CLUES: readonly [string, string, string] = ['', '', ''];
const EMPTY_ERRORS: readonly [null, null, null] = [null, null, null];

const EMPTY_SNAPSHOT: WishDetectiveSessionSnapshot = {
  phase: 'finished',
  participants: null,
  currentRoundIndex: 0,
  totalRounds: 0,
  roundsPlayed: 0,
  giverIndex: 0,
  guesserIndex: 1,
  currentWish: null,
  clues: EMPTY_CLUES,
  clueErrors: EMPTY_ERRORS,
  scores: [0, 0],
  correctGuesses: 0,
  reveal: null,
};

function normalized(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('de-DE');
}

function tokens(value: string): string[] {
  return normalized(value).match(TOKEN_PATTERN) ?? [];
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function selectWishDetectiveRounds(
  candidates: readonly WishDetectiveCandidate[],
  participants: readonly [WishDetectiveParticipant, WishDetectiveParticipant],
  random: () => number = Math.random,
): WishDetectiveCandidate[] {
  const first = shuffled(
    candidates.filter(
      (candidate) => candidate.createdBy === participants[0].id,
    ),
    random,
  );
  const second = shuffled(
    candidates.filter(
      (candidate) => candidate.createdBy === participants[1].id,
    ),
    random,
  );
  const roundsPerPartner = Math.min(
    first.length,
    second.length,
    MAX_ROUNDS_PER_PARTNER,
  );
  if (roundsPerPartner < MIN_ROUNDS_PER_PARTNER) return [];

  const rounds: WishDetectiveCandidate[] = [];
  for (let index = 0; index < roundsPerPartner; index += 1) {
    rounds.push(first[index], second[index]);
  }
  return rounds;
}

function isWishWord(clue: string, wishTitle: string): boolean {
  const wishTokens = tokens(wishTitle);
  return wishTokens.some((token) => {
    if (clue === token) return true;
    if (clue.length < 4 || token.length < 4) return false;
    return clue.includes(token) || token.includes(clue);
  });
}

export function validateWishDetectiveClues(
  values: readonly [string, string, string],
  wishTitle: string,
): readonly [
  ClueValidationError | null,
  ClueValidationError | null,
  ClueValidationError | null,
] {
  const normalizedValues = values.map(normalized);
  const duplicateCounts = new Map<string, number>();
  for (const value of normalizedValues) {
    if (!value) continue;
    duplicateCounts.set(value, (duplicateCounts.get(value) ?? 0) + 1);
  }

  const errors = normalizedValues.map((value): ClueValidationError | null => {
    if (!value) return 'required';
    if (value.length > MAX_CLUE_LENGTH) return 'tooLong';
    if (!WORD_PATTERN.test(value)) return 'oneWord';
    if ((duplicateCounts.get(value) ?? 0) > 1) return 'duplicate';
    if (isWishWord(value, wishTitle)) return 'wishWord';
    return null;
  });

  return [errors[0], errors[1], errors[2]];
}

export function isWishDetectiveGuessCorrect(
  guess: string,
  wishTitle: string,
): boolean {
  const normalizedGuess = normalized(guess);
  const normalizedTitle = normalized(wishTitle);
  if (!normalizedGuess) return false;
  if (normalizedGuess === normalizedTitle) return true;

  const targetTokens = tokens(wishTitle).filter(
    (token) => !GUESS_STOP_WORDS.has(token),
  );
  if (targetTokens.length < 2) return false;

  const guessTokens = new Set(
    tokens(guess).filter((token) => !GUESS_STOP_WORDS.has(token)),
  );
  const matchingTokens = new Set(
    targetTokens.filter((token) => guessTokens.has(token)),
  );
  return matchingTokens.size >= 2;
}

function playerIndexes(
  wish: WishDetectiveCandidate,
  participants: readonly [WishDetectiveParticipant, WishDetectiveParticipant],
): readonly [0 | 1, 0 | 1] {
  const giverIndex: 0 | 1 = wish.createdBy === participants[0].id ? 0 : 1;
  return [giverIndex, giverIndex === 0 ? 1 : 0];
}

export function createLocalWishDetectiveSession(): WishDetectiveSession {
  const listeners = new Set<() => void>();
  let sourceRounds: WishDetectiveCandidate[] = [];
  let sourceParticipants:
    | [WishDetectiveParticipant, WishDetectiveParticipant]
    | null = null;
  let snapshot = EMPTY_SNAPSHOT;
  let disposed = false;

  function emit(next: WishDetectiveSessionSnapshot): void {
    if (disposed) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function beginGame(): void {
    if (!sourceParticipants || sourceRounds.length < 4) {
      throw new Error(
        'Wish Detective requires two participants and at least four balanced rounds.',
      );
    }
    const [giverIndex, guesserIndex] = playerIndexes(
      sourceRounds[0],
      sourceParticipants,
    );
    emit({
      phase: 'clue',
      participants: [
        { ...sourceParticipants[0] },
        { ...sourceParticipants[1] },
      ],
      currentRoundIndex: 0,
      totalRounds: sourceRounds.length,
      roundsPlayed: 0,
      giverIndex,
      guesserIndex,
      currentWish: { ...sourceRounds[0] },
      clues: ['', '', ''],
      clueErrors: ['required', 'required', 'required'],
      scores: [0, 0],
      correctGuesses: 0,
      reveal: null,
    });
  }

  function setClue(index: 0 | 1 | 2, value: string): void {
    if (snapshot.phase !== 'clue' || !snapshot.currentWish) return;
    const clues: [string, string, string] = [...snapshot.clues];
    clues[index] = value;
    emit({
      ...snapshot,
      clues,
      clueErrors: validateWishDetectiveClues(clues, snapshot.currentWish.title),
    });
  }

  function startHandoff(): void {
    if (snapshot.phase !== 'clue' || !snapshot.currentWish) return;
    const errors = validateWishDetectiveClues(
      snapshot.clues,
      snapshot.currentWish.title,
    );
    if (errors.some(Boolean)) {
      emit({ ...snapshot, clueErrors: errors });
      return;
    }
    emit({
      ...snapshot,
      phase: 'handoff',
      currentWish: null,
      clueErrors: errors,
    });
  }

  function reveal(result: WishDetectiveResult, guess: string | null): void {
    if (!sourceParticipants) return;
    const wish = sourceRounds[snapshot.currentRoundIndex];
    const scores: [number, number] = [snapshot.scores[0], snapshot.scores[1]];
    const correct = result === 'correct';
    if (correct) scores[snapshot.guesserIndex] += 1;
    emit({
      ...snapshot,
      phase: 'reveal',
      currentWish: { ...wish },
      scores,
      correctGuesses: snapshot.correctGuesses + (correct ? 1 : 0),
      roundsPlayed: snapshot.roundsPlayed + 1,
      reveal: { result, guess },
    });
  }

  function continueToNextRound(): void {
    if (snapshot.phase !== 'reveal' || !sourceParticipants) return;
    const nextIndex = snapshot.currentRoundIndex + 1;
    if (nextIndex >= sourceRounds.length) {
      emit({
        ...snapshot,
        phase: 'finished',
        currentWish: null,
        reveal: null,
        clues: ['', '', ''],
        clueErrors: [null, null, null],
      });
      return;
    }
    const nextWish = sourceRounds[nextIndex];
    const [giverIndex, guesserIndex] = playerIndexes(
      nextWish,
      sourceParticipants,
    );
    emit({
      ...snapshot,
      phase: 'clue',
      currentRoundIndex: nextIndex,
      giverIndex,
      guesserIndex,
      currentWish: { ...nextWish },
      clues: ['', '', ''],
      clueErrors: ['required', 'required', 'required'],
      reveal: null,
    });
  }

  return {
    start(rounds, participants) {
      if (disposed) return;
      sourceRounds = rounds.map((round) => ({ ...round }));
      sourceParticipants = [{ ...participants[0] }, { ...participants[1] }];
      const participantIds = new Set(
        participants.map((participant) => participant.id),
      );
      if (
        participantIds.size !== 2 ||
        sourceRounds.some((round) => !participantIds.has(round.createdBy))
      ) {
        throw new Error(
          'Wish Detective requires two stable participant identities.',
        );
      }
      beginGame();
    },
    restart() {
      if (disposed) return;
      beginGame();
    },
    dispatch(action) {
      if (disposed) return;
      switch (action.type) {
        case 'SET_CLUE':
          setClue(action.index, action.value);
          break;
        case 'START_HANDOFF':
          startHandoff();
          break;
        case 'CONFIRM_HANDOFF':
          if (snapshot.phase === 'handoff') {
            emit({ ...snapshot, phase: 'guess', currentWish: null });
          }
          break;
        case 'SUBMIT_GUESS': {
          if (snapshot.phase !== 'guess') break;
          const guess = action.guess.trim();
          if (!guess) break;
          const wish = sourceRounds[snapshot.currentRoundIndex];
          reveal(
            isWishDetectiveGuessCorrect(guess, wish.title)
              ? 'correct'
              : 'incorrect',
            guess,
          );
          break;
        }
        case 'PASS':
          if (snapshot.phase === 'guess') reveal('passed', null);
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
      sourceRounds = [];
      sourceParticipants = null;
    },
  };
}

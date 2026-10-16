import {
  createLocalOurMomentsSession,
  selectOurMomentsRound,
  type PreparedOurMoment,
} from './ourMomentsSession';

const participants = [
  { id: 'account-a', displayName: 'Lea' },
  { id: 'account-b', displayName: 'Alex' },
] as const;

function moments(count = 4): PreparedOurMoment[] {
  return Array.from({ length: count }, (_, index) => ({
    memoryId: `memory-${index + 1}`,
    title: `Moment ${index + 1}`,
    effectiveDate: new Date(`2026-0${index + 1}-01T00:00:00.000Z`),
    imageAttachmentId: `attachment-${index + 1}`,
    imageUrl: `blob:moment-${index + 1}`,
  }));
}

function firstPairCardIds(
  cards: readonly { id: string; pairId: string }[],
): [string, string] {
  const first = cards[0];
  const partner = cards.find(
    (candidate) =>
      candidate.pairId === first.pairId && candidate.id !== first.id,
  );
  if (!partner) throw new Error('Pair fixture missing.');
  return [first.id, partner.id];
}

function firstMismatchCardIds(
  cards: readonly { id: string; pairId: string }[],
): [string, string] {
  const first = cards[0];
  const second = cards.find((candidate) => candidate.pairId !== first.pairId);
  if (!second) throw new Error('Mismatch fixture missing.');
  return [first.id, second.id];
}

describe('Our Moments local sofa session', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('selects four pairs normally, three for a smaller board and none below the privacy-safe minimum', () => {
    const source = moments(6);
    expect(selectOurMomentsRound(source, () => 0.5)).toHaveLength(4);
    expect(selectOurMomentsRound(source.slice(0, 3), () => 0.5)).toHaveLength(
      3,
    );
    expect(selectOurMomentsRound(source.slice(0, 2), () => 0.5)).toEqual([]);
  });

  it('starts an immutable eight-card round and emits a new snapshot for a reveal', () => {
    const session = createLocalOurMomentsSession({ random: () => 0.5 });
    session.start(moments(4), participants);

    const before = session.getSnapshot();
    expect(before.status).toBe('playing');
    expect(before.cards).toHaveLength(8);
    expect(before.scores).toEqual([0, 0]);

    session.dispatch({ type: 'SELECT_CARD', cardId: before.cards[0].id });
    const after = session.getSnapshot();

    expect(after).not.toBe(before);
    expect(after.cards).not.toBe(before.cards);
    expect(
      after.cards.find((card) => card.id === before.cards[0].id)?.state,
    ).toBe('revealed');
    expect(before.cards[0].state).toBe('hidden');
  });

  it('locks a mismatch, ignores a third tap and passes the turn after the reveal delay', () => {
    vi.useFakeTimers();
    const session = createLocalOurMomentsSession({
      random: () => 0.5,
      mismatchDelayMs: 500,
    });
    session.start(moments(4), participants);

    const initial = session.getSnapshot();
    const [firstId, secondId] = firstMismatchCardIds(initial.cards);
    const thirdId = initial.cards.find(
      (card) => card.id !== firstId && card.id !== secondId,
    )?.id;
    if (!thirdId) throw new Error('Third-card fixture missing.');

    session.dispatch({ type: 'SELECT_CARD', cardId: firstId });
    session.dispatch({ type: 'SELECT_CARD', cardId: secondId });
    const locked = session.getSnapshot();
    expect(locked.inputLocked).toBe(true);
    expect(
      locked.cards.filter((card) => card.state === 'revealed'),
    ).toHaveLength(2);

    session.dispatch({ type: 'SELECT_CARD', cardId: thirdId });
    expect(session.getSnapshot()).toBe(locked);

    vi.advanceTimersByTime(500);
    const resolved = session.getSnapshot();
    expect(resolved.inputLocked).toBe(false);
    expect(resolved.activePlayerIndex).toBe(1);
    expect(
      resolved.cards.filter((card) => card.state === 'revealed'),
    ).toHaveLength(0);
  });

  it('keeps the turn on a match and pauses on the relationship reveal before continuing', () => {
    const session = createLocalOurMomentsSession({ random: () => 0.5 });
    session.start(moments(3), participants);

    const initial = session.getSnapshot();
    const [firstId, secondId] = firstPairCardIds(initial.cards);
    const expectedPairId = initial.cards.find(
      (card) => card.id === firstId,
    )?.pairId;
    session.dispatch({ type: 'SELECT_CARD', cardId: firstId });
    session.dispatch({ type: 'SELECT_CARD', cardId: secondId });

    const reveal = session.getSnapshot();
    expect(reveal.status).toBe('match-reveal');
    expect(reveal.inputLocked).toBe(true);
    expect(reveal.activePlayerIndex).toBe(0);
    expect(reveal.scores).toEqual([1, 0]);
    expect(reveal.revealedMatch?.memoryId).toBe(expectedPairId);

    session.dispatch({ type: 'CONTINUE_AFTER_MATCH' });
    expect(session.getSnapshot().status).toBe('playing');
    expect(session.getSnapshot().activePlayerIndex).toBe(0);
  });

  it('finishes only after the final match reveal is acknowledged and can restart from finished', () => {
    const session = createLocalOurMomentsSession({ random: () => 0.5 });
    session.start(moments(3), participants);

    for (let pairIndex = 0; pairIndex < 3; pairIndex += 1) {
      const snapshot = session.getSnapshot();
      const hidden = snapshot.cards.filter((card) => card.state === 'hidden');
      const [firstId, secondId] = firstPairCardIds(hidden);
      session.dispatch({ type: 'SELECT_CARD', cardId: firstId });
      session.dispatch({ type: 'SELECT_CARD', cardId: secondId });
      expect(session.getSnapshot().status).toBe('match-reveal');
      session.dispatch({ type: 'CONTINUE_AFTER_MATCH' });
    }

    const finished = session.getSnapshot();
    expect(finished.status).toBe('finished');
    expect(finished.matchedPairs).toBe(3);

    session.restart();
    const restarted = session.getSnapshot();
    expect(restarted.status).toBe('playing');
    expect(restarted.matchedPairs).toBe(0);
    expect(restarted.scores).toEqual([0, 0]);
    expect(restarted.round).toBe(finished.round + 1);
  });
});

import {
  createLocalWhoOfUsSession,
  selectWhoOfUsQuestions,
  type WhoOfUsParticipant,
  type WhoOfUsQuestionId,
} from './whoOfUsSession';

const PARTICIPANTS: readonly [WhoOfUsParticipant, WhoOfUsParticipant] = [
  { id: 'lea-id', displayName: 'Lea' },
  { id: 'alex-id', displayName: 'Alex' },
];

const QUESTIONS: readonly WhoOfUsQuestionId[] = [
  'morningLonger',
  'movieSleeper',
];

describe('createLocalWhoOfUsSession', () => {
  it('hides the first response completely during handoff and second answer', () => {
    const session = createLocalWhoOfUsSession();
    session.start(QUESTIONS, PARTICIPANTS);

    session.dispatch({ type: 'ANSWER', partnerId: 'alex-id' });
    const handoff = session.getSnapshot();
    expect(handoff.phase).toBe('handoff');
    expect(handoff.currentQuestionId).toBeNull();
    expect(handoff.reveal).toBeNull();
    expect(JSON.stringify(handoff)).not.toContain('firstAnswerPartnerId');

    session.dispatch({ type: 'CONFIRM_HANDOFF' });
    const secondAnswer = session.getSnapshot();
    expect(secondAnswer.phase).toBe('secondAnswer');
    expect(secondAnswer.currentQuestionId).toBe('morningLonger');
    expect(secondAnswer.reveal).toBeNull();
    expect(JSON.stringify(secondAnswer)).not.toContain('firstAnswerPartnerId');
  });

  it('compares stable partner IDs without treating agreement as a winner score', () => {
    const session = createLocalWhoOfUsSession();
    session.start(QUESTIONS, PARTICIPANTS);

    session.dispatch({ type: 'ANSWER', partnerId: 'alex-id' });
    session.dispatch({ type: 'CONFIRM_HANDOFF' });
    session.dispatch({ type: 'ANSWER', partnerId: 'alex-id' });

    const reveal = session.getSnapshot();
    expect(reveal.phase).toBe('reveal');
    expect(reveal.agreementCount).toBe(1);
    expect(reveal.roundsPlayed).toBe(1);
    expect(reveal.reveal).toEqual({
      questionId: 'morningLonger',
      firstResponderId: 'lea-id',
      firstAnswerPartnerId: 'alex-id',
      secondResponderId: 'alex-id',
      secondAnswerPartnerId: 'alex-id',
      matches: true,
    });
  });

  it('treats different perspectives neutrally and alternates who answers first', () => {
    const session = createLocalWhoOfUsSession();
    session.start(QUESTIONS, PARTICIPANTS);

    session.dispatch({ type: 'ANSWER', partnerId: 'lea-id' });
    session.dispatch({ type: 'CONFIRM_HANDOFF' });
    session.dispatch({ type: 'ANSWER', partnerId: 'alex-id' });

    expect(session.getSnapshot().agreementCount).toBe(0);
    expect(session.getSnapshot().reveal?.matches).toBe(false);

    session.dispatch({ type: 'CONTINUE' });
    const next = session.getSnapshot();
    expect(next.phase).toBe('firstAnswer');
    expect(next.currentQuestionId).toBe('movieSleeper');
    expect(next.responderId).toBe('alex-id');
  });

  it('finishes with only the current-session agreement count and can restart cleanly', () => {
    const session = createLocalWhoOfUsSession();
    session.start(['morningLonger'], PARTICIPANTS);

    session.dispatch({ type: 'ANSWER', partnerId: 'lea-id' });
    session.dispatch({ type: 'CONFIRM_HANDOFF' });
    session.dispatch({ type: 'ANSWER', partnerId: 'lea-id' });
    session.dispatch({ type: 'CONTINUE' });

    expect(session.getSnapshot().phase).toBe('finished');
    expect(session.getSnapshot().agreementCount).toBe(1);

    session.restart();
    const restarted = session.getSnapshot();
    expect(restarted.phase).toBe('firstAnswer');
    expect(restarted.agreementCount).toBe(0);
    expect(restarted.roundsPlayed).toBe(0);
    expect(restarted.currentQuestionId).toBe('morningLonger');
  });
});

describe('selectWhoOfUsQuestions', () => {
  it('returns every curated question exactly once', () => {
    const questions = selectWhoOfUsQuestions(() => 0.25);
    expect(new Set(questions).size).toBe(questions.length);
    expect(questions.length).toBeGreaterThanOrEqual(8);
  });
});

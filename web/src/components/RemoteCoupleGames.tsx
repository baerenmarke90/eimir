import { type ReactNode, useMemo, useRef, useState } from 'react';
import type { OurMomentsCardView } from '../api/generated/models/OurMomentsCardView';
import type { OurMomentsMomentView } from '../api/generated/models/OurMomentsMomentView';
import { createReferenceApis } from '../client/referenceFlow';
import { loadAuthorizedStoryImageResource } from '../client/storyMediaLoader';
import { useObjectUrlResource } from '../client/useObjectUrlResources';
import type {
  RemoteActionResult,
  RemoteOurMomentsGame,
  RemoteWhoOfUsGame,
  RemoteWishDetectiveGame,
} from '../client/useRemoteCoupleGames';
import { validateWishDetectiveClues } from '../client/wishDetectiveSession';
import { resolvedLocale, useTranslation } from '../i18n';
import { type PlayMode, PlayModeChoice } from './PlayModeChoice';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import './RemoteCoupleGames.css';
import { useScene } from '../motion/scene';

/*
 * Couple games at a distance (#2048). Each partner plays on their own phone;
 * the server keeps the open game and tells the other partner when it is their
 * move. These views sit beside the existing one-phone games: the shared
 * `CoupleGameModes` gate resumes an open game, shows a finished result once
 * and otherwise lets the couple choose how to play.
 */

export interface GamePeople {
  me: { id: string; displayName: string };
  partner: { id: string; displayName: string };
}

/* The gate -------------------------------------------------------------- */

export function CoupleGameModes({
  partnerName,
  remote,
  renderRemote,
  renderLocal,
}: {
  partnerName: string;
  remote: {
    isLoading: boolean;
    busy: boolean;
    problem: { message?: string } | null;
    state: { game?: { id: string; status: string } | null } | undefined;
    start(): Promise<RemoteActionResult>;
    refetch(): void;
  };
  renderRemote: (onNewGame: () => void) => ReactNode;
  renderLocal: () => ReactNode;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<PlayMode | null>(null);
  const [dismissedGameId, setDismissedGameId] = useState<string | null>(null);
  const game = remote.state?.game ?? null;
  const newGame = () => {
    if (game) setDismissedGameId(game.id);
    setMode(null);
  };

  if (mode === 'together') return <>{renderLocal()}</>;
  if (remote.isLoading) {
    return <UiState kind="loading" title={t('states.loading.title')} />;
  }
  const showRemote =
    game !== null &&
    game.id !== dismissedGameId &&
    (game.status === 'OPEN' ||
      game.status === 'FINISHED' ||
      (game.status === 'ENDED' && mode === 'apart'));
  if (showRemote) return <>{renderRemote(newGame)}</>;

  return (
    <div className="remote-game-start">
      <PlayModeChoice
        partnerName={partnerName}
        starting={remote.busy}
        onStart={(chosen) => {
          if (chosen === 'together') {
            setMode('together');
            return;
          }
          void remote.start().then((result) => {
            if (result.ok) {
              setDismissedGameId(null);
              setMode('apart');
            }
          });
        }}
      />
      {remote.problem ? <ProblemState error={remote.problem as Error} /> : null}
    </div>
  );
}

/* Shared pieces --------------------------------------------------------- */

function EndGame({ busy, onEnd }: { busy: boolean; onEnd: () => void }) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        type="button"
        className="remote-game-quiet"
        onClick={() => setAsking(true)}
      >
        {t('games.remote.end')}
      </button>
    );
  }
  return (
    <div className="remote-game-confirm eimir-motion-disclosure">
      <p>{t('games.remote.endConfirm')}</p>
      <div className="remote-game-actions">
        <button
          type="button"
          className="remote-game-danger"
          disabled={busy}
          onClick={onEnd}
        >
          {t('games.remote.endConfirmAction')}
        </button>
        <button
          type="button"
          className="remote-game-quiet"
          onClick={() => setAsking(false)}
        >
          {t('games.remote.keepPlaying')}
        </button>
      </div>
    </div>
  );
}

function Waiting({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  // The waiting dot is the scene's one loop: it runs only while the card is
  // seen and is absent with reduced motion (Motion Contract 4.8, M8).
  const card = useRef<HTMLElement | null>(null);
  const scene = useScene(card);
  return (
    <section
      ref={card}
      {...scene.props}
      className="remote-game-card remote-game-waiting eimir-motion-disclosure"
      aria-live="polite"
      aria-labelledby="remote-game-waiting-title"
    >
      <span className="remote-game-pulse" aria-hidden="true" />
      <h2 id="remote-game-waiting-title">{title}</h2>
      <p>{body}</p>
      {children}
    </section>
  );
}

function Ended({
  people,
  endedBy,
  onNewGame,
}: {
  people: GamePeople;
  endedBy: string | null;
  onNewGame: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="remote-game-card"
      aria-labelledby="remote-game-ended-title"
    >
      <h2 id="remote-game-ended-title">
        {endedBy === people.partner.id
          ? t('games.remote.endedByPartner', {
              name: people.partner.displayName,
            })
          : t('games.remote.ended')}
      </h2>
      <button type="button" className="remote-game-primary" onClick={onNewGame}>
        {t('games.remote.newGame')}
      </button>
    </section>
  );
}

function nameOf(people: GamePeople, id: string | null): string {
  if (id === people.me.id) return people.me.displayName;
  if (id === people.partner.id) return people.partner.displayName;
  return '';
}

function initialOf(displayName: string): string {
  return displayName.trim().slice(0, 1).toLocaleUpperCase();
}

/* Who of us ------------------------------------------------------------- */

export function RemoteWhoOfUsView({
  game: remote,
  people,
  onNewGame,
}: {
  game: RemoteWhoOfUsGame;
  people: GamePeople;
  onNewGame: () => void;
}) {
  const { t } = useTranslation();
  const view = remote.view;
  if (view.phase === 'notStarted') return null;
  const game = view.game;
  const total = game.questions.length;
  const question = (id: string) => t(`games.whoOfUs.questions.${id}`);

  if (view.phase === 'ended') {
    return (
      <Ended people={people} endedBy={game.endedBy} onNewGame={onNewGame} />
    );
  }

  if (view.phase === 'reveal') {
    const q = view.question;
    return (
      <section
        className="remote-game-card who-of-us-reveal"
        data-outcome={q.matches ? 'same' : 'different'}
        aria-live="polite"
        aria-labelledby="remote-who-reveal-title"
      >
        <p className="eyebrow">{t('games.whoOfUs.revealEyebrow')}</p>
        <h2 id="remote-who-reveal-title">
          {q.matches
            ? t('games.whoOfUs.sameTitle')
            : t('games.whoOfUs.differentTitle')}
        </h2>
        <p className="who-of-us-question-repeat">{question(q.questionId)}</p>
        <dl className="remote-game-answers">
          <div>
            <dt>{t('games.remote.whoOfUs.you')}</dt>
            <dd>{nameOf(people, q.myAnswer)}</dd>
          </div>
          <div>
            <dt>{people.partner.displayName}</dt>
            <dd>{nameOf(people, q.partnerAnswer)}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="remote-game-primary"
          onClick={() => remote.continue()}
        >
          {t('games.whoOfUs.continue')}
        </button>
      </section>
    );
  }

  if (view.phase === 'finished') {
    return (
      <section
        className="remote-game-card who-of-us-finish eimir-motion-success"
        aria-labelledby="remote-who-finish-title"
      >
        <p className="eyebrow">{t('games.whoOfUs.finishEyebrow')}</p>
        <h2 id="remote-who-finish-title">{t('games.whoOfUs.finishTitle')}</h2>
        <p className="who-of-us-finish-count">
          {t('games.whoOfUs.finishAgreement', {
            count: game.agreementCount,
            total,
          })}
        </p>
        <ul className="remote-game-result-list">
          {game.questions.map((q) => (
            <li
              key={q.questionId}
              data-outcome={q.matches ? 'same' : 'different'}
            >
              <span>{question(q.questionId)}</span>
              <span className="remote-game-result-answers">
                {t('games.remote.whoOfUs.answers', {
                  you: nameOf(people, q.myAnswer),
                  name: people.partner.displayName,
                  partner: nameOf(people, q.partnerAnswer),
                })}
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="remote-game-primary"
          onClick={onNewGame}
        >
          {t('games.remote.newGame')}
        </button>
      </section>
    );
  }

  const partnerProgress = t('games.remote.whoOfUs.partnerProgress', {
    name: people.partner.displayName,
    count: game.partnerAnsweredCount,
    total,
  });

  if (view.phase === 'waitingForPartner') {
    return (
      <Waiting
        title={t('games.remote.whoOfUs.doneTitle')}
        body={t('games.remote.whoOfUs.doneBody', {
          name: people.partner.displayName,
        })}
      >
        <p className="remote-game-status">{partnerProgress}</p>
        <EndGame busy={remote.busy} onEnd={() => void remote.end()} />
      </Waiting>
    );
  }

  const q = view.question;
  return (
    <div className="remote-game-session">
      <p className="remote-game-status" aria-live="polite">
        {partnerProgress}
      </p>
      <section
        key={q.questionId}
        className="remote-game-card who-of-us-question eimir-motion-disclosure"
        aria-labelledby="remote-who-question-title"
      >
        <p className="eyebrow">
          {t('games.whoOfUs.round', {
            current: view.questionIndex + 1,
            total,
          })}
        </p>
        <div className="remote-game-progress" aria-hidden="true">
          {game.questions.map((item, index) => (
            <span
              key={item.questionId}
              className={index <= view.questionIndex ? 'is-done' : undefined}
            />
          ))}
        </div>
        <fieldset className="remote-game-choices" disabled={remote.busy}>
          <legend id="remote-who-question-title">
            {question(q.questionId)}
          </legend>
          {[people.me, people.partner].map((person) => (
            <button
              key={person.id}
              type="button"
              className="who-of-us-choice"
              onClick={() => void remote.answer(q.questionId, person.id)}
            >
              <span className="who-of-us-choice-initial" aria-hidden="true">
                {initialOf(person.displayName)}
              </span>
              <span>
                {person.id === people.me.id
                  ? t('games.remote.whoOfUs.me')
                  : person.displayName}
              </span>
            </button>
          ))}
        </fieldset>
        <p className="remote-game-note">
          {q.partnerAnswered
            ? t('games.remote.whoOfUs.partnerAnswered', {
                name: people.partner.displayName,
              })
            : t('games.remote.whoOfUs.hidden', {
                name: people.partner.displayName,
              })}
        </p>
      </section>
      {remote.problem ? <ProblemState error={remote.problem as Error} /> : null}
      <EndGame busy={remote.busy} onEnd={() => void remote.end()} />
    </div>
  );
}

/* Wish detective -------------------------------------------------------- */

function ResultLine({
  result,
}: {
  result: 'CORRECT' | 'INCORRECT' | 'PASSED' | 'VOID' | string;
}) {
  const { t } = useTranslation();
  const key =
    result === 'CORRECT'
      ? 'correct'
      : result === 'INCORRECT'
        ? 'incorrect'
        : result === 'PASSED'
          ? 'passed'
          : 'void';
  return <>{t(`games.remote.wishDetective.result.${key}`)}</>;
}

export function RemoteWishDetectiveView({
  game: remote,
  people,
  onNewGame,
}: {
  game: RemoteWishDetectiveGame;
  people: GamePeople;
  onNewGame: () => void;
}) {
  const { t } = useTranslation();
  const [clues, setClues] = useState<[string, string, string]>(['', '', '']);
  const [guess, setGuess] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const view = remote.view;
  const wishTitle = view.phase === 'giveClues' ? (view.wish?.title ?? '') : '';
  const clueErrors = useMemo(
    () => validateWishDetectiveClues(clues, wishTitle),
    [clues, wishTitle],
  );
  if (view.phase === 'notStarted') return null;
  const game = view.game;
  const roundLabel = (round: number) =>
    t('games.wishDetective.round', {
      current: Math.min(round, game.roundsTotal),
      total: game.roundsTotal,
    });
  const score = (id: string) =>
    game.scores.find((entry) => entry.accountId === id)?.correctGuesses ?? 0;

  if (view.phase === 'ended') {
    return (
      <Ended people={people} endedBy={game.endedBy} onNewGame={onNewGame} />
    );
  }

  if (view.phase === 'finished') {
    return (
      <section
        className="remote-game-card eimir-motion-success"
        aria-labelledby="remote-wish-finish-title"
      >
        <p className="eyebrow">
          {t('games.remote.wishDetective.finishEyebrow')}
        </p>
        <h2 id="remote-wish-finish-title">
          {t('games.remote.wishDetective.finishTitle')}
        </h2>
        <p className="remote-game-score">
          {people.me.displayName} {score(people.me.id)} ·{' '}
          {people.partner.displayName} {score(people.partner.id)}
        </p>
        <ul className="remote-game-result-list">
          {game.revealed.map((round) => (
            <li key={round.round} data-outcome={round.result}>
              <span>{round.wish?.title ?? '—'}</span>
              <span className="remote-game-result-answers">
                {round.clues.join(' · ')} — <ResultLine result={round.result} />
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="remote-game-primary"
          onClick={onNewGame}
        >
          {t('games.remote.newGame')}
        </button>
      </section>
    );
  }

  if (view.phase === 'reveal') {
    const round = view.revealed;
    return (
      <section
        className="remote-game-card eimir-motion-success"
        data-outcome={round.result}
        aria-live="polite"
        aria-labelledby="remote-wish-reveal-title"
      >
        <p className="eyebrow">{roundLabel(round.round)}</p>
        <h2 id="remote-wish-reveal-title">
          <ResultLine result={round.result} />
        </h2>
        {round.wish ? (
          <p className="remote-game-wish">
            {t('games.remote.wishDetective.itWas', { title: round.wish.title })}
          </p>
        ) : null}
        {round.guess ? (
          <p className="remote-game-note">
            {t('games.remote.wishDetective.yourGuess', { guess: round.guess })}
          </p>
        ) : null}
        <button
          type="button"
          className="remote-game-primary"
          onClick={() => {
            setGuess('');
            remote.continue();
          }}
        >
          {t('games.whoOfUs.continue')}
        </button>
      </section>
    );
  }

  const last =
    'lastRevealed' in view && view.lastRevealed ? view.lastRevealed : null;
  const lastLine = last ? (
    <p className="remote-game-note">
      {t('games.remote.wishDetective.lastRound', {
        title: last.wish?.title ?? '—',
      })}{' '}
      <ResultLine result={last.result} />
    </p>
  ) : null;

  if (view.phase === 'waitingForPartner') {
    return (
      <Waiting
        title={
          view.partnerStep === 'giveClues'
            ? t('games.remote.wishDetective.waitingClues', {
                name: people.partner.displayName,
              })
            : t('games.remote.wishDetective.waitingGuess', {
                name: people.partner.displayName,
              })
        }
        body={t('games.remote.waitingBody')}
      >
        {lastLine}
        <EndGame busy={remote.busy} onEnd={() => void remote.end()} />
      </Waiting>
    );
  }

  if (view.phase === 'giveClues') {
    const send = () => {
      if (clueErrors.some((error) => error !== null)) {
        setShowErrors(true);
        return;
      }
      void remote.submitClues(clues).then((result) => {
        if (result.ok) {
          setClues(['', '', '']);
          setShowErrors(false);
        }
      });
    };
    return (
      <div className="remote-game-session">
        {lastLine}
        <section
          key={view.round.round}
          className="remote-game-card eimir-motion-disclosure"
          aria-labelledby="remote-wish-give-title"
        >
          <p className="eyebrow">{roundLabel(view.round.round)}</p>
          <h2 id="remote-wish-give-title">
            {t('games.remote.wishDetective.giveTitle', {
              name: people.partner.displayName,
            })}
          </h2>
          {view.wish ? (
            <p className="remote-game-wish">{view.wish.title}</p>
          ) : (
            <p className="remote-game-note">
              {t('games.remote.wishDetective.wishGone')}
            </p>
          )}
          <p>{t('games.remote.wishDetective.giveBody')}</p>
          <form
            className="remote-game-clues"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            {clues.map((value, index) => {
              const id = `remote-wish-clue-${index}`;
              const error = showErrors ? clueErrors[index] : null;
              return (
                <div key={id} className="remote-game-field">
                  <label htmlFor={id}>
                    {t('games.remote.wishDetective.clueLabel', {
                      number: index + 1,
                    })}
                  </label>
                  <input
                    id={id}
                    type="text"
                    autoComplete="off"
                    enterKeyHint={index < 2 ? 'next' : 'send'}
                    maxLength={40}
                    value={value}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    onChange={(event) => {
                      const next = [...clues] as [string, string, string];
                      next[index] = event.target.value;
                      setClues(next);
                    }}
                  />
                  {error ? (
                    <p id={`${id}-error`} className="remote-game-error">
                      {t(`games.wishDetective.errors.${error}`)}
                    </p>
                  ) : null}
                </div>
              );
            })}
            <button
              type="submit"
              className="remote-game-primary"
              disabled={remote.busy || !view.wish}
            >
              {t('games.remote.wishDetective.sendClues', {
                name: people.partner.displayName,
              })}
            </button>
          </form>
          {view.skipsLeft > 0 || !view.wish ? (
            <button
              type="button"
              className="remote-game-quiet"
              disabled={remote.busy}
              onClick={() => void remote.skipWish()}
            >
              {view.wish
                ? t('games.remote.wishDetective.skip', {
                    count: view.skipsLeft,
                  })
                : t('games.remote.wishDetective.skipGone')}
            </button>
          ) : null}
        </section>
        {remote.problem ? (
          <ProblemState error={remote.problem as Error} />
        ) : null}
        <EndGame busy={remote.busy} onEnd={() => void remote.end()} />
      </div>
    );
  }

  // Guessing from the partner's clues; the wish itself stays hidden.
  return (
    <div className="remote-game-session">
      {lastLine}
      <section
        key={view.round.round}
        className="remote-game-card eimir-motion-disclosure"
        aria-labelledby="remote-wish-guess-title"
      >
        <p className="eyebrow">{roundLabel(view.round.round)}</p>
        <h2 id="remote-wish-guess-title">
          {t('games.remote.wishDetective.guessTitle', {
            name: people.partner.displayName,
          })}
        </h2>
        <ul className="remote-game-clue-list">
          {view.clues.map((clue) => (
            <li key={clue}>{clue}</li>
          ))}
        </ul>
        <form
          className="remote-game-field"
          onSubmit={(event) => {
            event.preventDefault();
            if (guess.trim()) void remote.guess(guess);
          }}
        >
          <label htmlFor="remote-wish-guess">
            {t('games.remote.wishDetective.guessLabel')}
          </label>
          <input
            id="remote-wish-guess"
            type="text"
            autoComplete="off"
            enterKeyHint="send"
            maxLength={120}
            value={guess}
            onChange={(event) => setGuess(event.target.value)}
          />
          <button
            type="submit"
            className="remote-game-primary"
            disabled={remote.busy || !guess.trim()}
          >
            {t('games.remote.wishDetective.guess')}
          </button>
        </form>
        <button
          type="button"
          className="remote-game-quiet"
          disabled={remote.busy}
          onClick={() => void remote.pass()}
        >
          {t('games.remote.wishDetective.pass')}
        </button>
      </section>
      {remote.problem ? <ProblemState error={remote.problem as Error} /> : null}
      <EndGame busy={remote.busy} onEnd={() => void remote.end()} />
    </div>
  );
}

/* Our moments ----------------------------------------------------------- */

function momentDate(value: Date | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat(resolvedLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

function CardFace({
  moment,
  face,
  apis,
  spaceId,
  accountId,
}: {
  moment: OurMomentsMomentView;
  face: string;
  apis: ReturnType<typeof createReferenceApis>;
  spaceId: string;
  accountId: string;
}) {
  const image = useObjectUrlResource(
    `remote-moments:${accountId}:${spaceId}:${moment.memoryId}`,
    face === 'PHOTO' ? moment.imageAttachmentId : null,
    (attachmentId, signal) =>
      loadAuthorizedStoryImageResource(
        apis,
        spaceId,
        'MEMORY',
        moment.memoryId,
        attachmentId,
        { signal },
      ),
  );
  if (face === 'PHOTO') {
    return image.url ? (
      <img src={image.url} alt="" draggable={false} />
    ) : (
      <span className="our-moments-card-back" aria-hidden="true" />
    );
  }
  return (
    <span className="our-moments-card-context" aria-hidden="true">
      <strong>{moment.title ?? ''}</strong>
      <span>{momentDate(moment.effectiveDate)}</span>
    </span>
  );
}

export function RemoteOurMomentsView({
  game: remote,
  people,
  onNewGame,
  apiBaseUrl,
  accessToken,
  spaceId,
}: {
  game: RemoteOurMomentsGame;
  people: GamePeople;
  onNewGame: () => void;
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const apis = useMemo(
    () => createReferenceApis(apiBaseUrl, accessToken),
    [apiBaseUrl, accessToken],
  );
  const view = remote.view;
  if (view.phase === 'notStarted') return null;
  const game = view.game;
  const pairs = (id: string) =>
    game.scores.find((entry) => entry.accountId === id)?.pairs ?? 0;
  const scoreLine = (
    <p className="remote-game-score">
      {people.me.displayName} {pairs(people.me.id)} ·{' '}
      {people.partner.displayName} {pairs(people.partner.id)}
    </p>
  );

  if (view.phase === 'ended') {
    return (
      <Ended people={people} endedBy={game.endedBy} onNewGame={onNewGame} />
    );
  }
  if (view.phase === 'finished') {
    return (
      <section
        className="our-moments-finish remote-game-card eimir-motion-success"
        aria-labelledby="remote-moments-finish-title"
      >
        <p className="eyebrow">{t('games.momentsGame.finishEyebrow')}</p>
        <h2 id="remote-moments-finish-title">
          {t('games.momentsGame.finishTitle')}
        </h2>
        <p>{t('games.momentsGame.finishBody', { count: game.totalPairs })}</p>
        {scoreLine}
        <button
          type="button"
          className="remote-game-primary"
          onClick={onNewGame}
        >
          {t('games.remote.newGame')}
        </button>
      </section>
    );
  }

  const cardLabel = (card: OurMomentsCardView) =>
    card.moment && card.state !== 'HIDDEN'
      ? card.state === 'MATCHED'
        ? t('games.momentsGame.cardMatched', {
            title: card.moment.title ?? '',
            date: momentDate(card.moment.effectiveDate),
          })
        : card.face === 'PHOTO'
          ? t('games.momentsGame.cardPhotoRevealed', {
              title: card.moment.title ?? '',
            })
          : t('games.momentsGame.cardContextRevealed', {
              title: card.moment.title ?? '',
              date: momentDate(card.moment.effectiveDate),
            })
      : t('games.momentsGame.cardHidden', {
          index: card.position + 1,
          total: game.cards.length,
        });

  const myTurn = view.phase === 'myTurn';
  const lastTurn = 'lastTurn' in view ? view.lastTurn : null;
  const replay =
    lastTurn && lastTurn.playerId === people.partner.id
      ? new Map(lastTurn.cards.map((card) => [card.position, card]))
      : null;

  return (
    <div className="our-moments-session remote-game-session">
      <section className="our-moments-turn" aria-live="polite">
        <div>
          <strong>
            {myTurn
              ? t('games.remote.ourMoments.yourTurn')
              : t('games.remote.ourMoments.partnerTurn', {
                  name: people.partner.displayName,
                })}
          </strong>
          {replay && lastTurn ? (
            <span>
              {lastTurn.matched
                ? t('games.remote.ourMoments.partnerMatched', {
                    name: people.partner.displayName,
                  })
                : t('games.remote.ourMoments.partnerMissed', {
                    name: people.partner.displayName,
                  })}
            </span>
          ) : null}
        </div>
        {scoreLine}
      </section>

      {view.phase === 'matchReveal' ? (
        <section
          className="our-moments-match-reveal eimir-motion-success"
          aria-live="polite"
          aria-labelledby="remote-moments-match-title"
        >
          <div>
            <p className="eyebrow">{t('games.momentsGame.matchEyebrow')}</p>
            <h2 id="remote-moments-match-title">
              {view.pair.cards[0]?.moment?.title ?? ''}
            </h2>
            <button type="button" onClick={() => remote.continue()}>
              {t('games.momentsGame.continue')}
            </button>
          </div>
        </section>
      ) : null}

      <section
        className="our-moments-board"
        aria-label={t('games.momentsGame.boardAria')}
        aria-busy={remote.busy}
      >
        {game.cards.map((card) => {
          // The partner's last miss stays visible briefly as a replay.
          const shown =
            card.state === 'HIDDEN' && replay?.get(card.position)
              ? (replay.get(card.position) as OurMomentsCardView)
              : card;
          const hidden = shown.state === 'HIDDEN' || !shown.moment;
          return (
            <button
              key={card.position}
              type="button"
              className={`our-moments-card our-moments-card-${hidden ? 'hidden' : shown.state.toLowerCase()} our-moments-card-${shown.face.toLowerCase()}${shown !== card ? ' is-replay' : ''}`}
              aria-label={cardLabel(shown)}
              disabled={!myTurn || remote.busy || card.state !== 'HIDDEN'}
              onClick={() => void remote.flip(card.position)}
            >
              {hidden || !shown.moment ? (
                <span className="our-moments-card-back" aria-hidden="true">
                  <span className="our-moments-card-back-mark" />
                </span>
              ) : (
                <CardFace
                  moment={shown.moment}
                  face={shown.face}
                  apis={apis}
                  spaceId={spaceId}
                  accountId={people.me.id}
                />
              )}
            </button>
          );
        })}
      </section>
      {view.phase === 'waitingForPartner' ? (
        <p className="remote-game-note" aria-live="polite">
          {t('games.remote.waitingBody')}
        </p>
      ) : null}
      {remote.problem ? <ProblemState error={remote.problem as Error} /> : null}
      <EndGame busy={remote.busy} onEnd={() => void remote.end()} />
    </div>
  );
}

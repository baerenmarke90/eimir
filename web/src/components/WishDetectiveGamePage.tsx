import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { GamesApi } from '../api/generated/apis/GamesApi';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import { orderParticipants } from '../client/gameParticipants';
import { Configuration } from '../client/apiConfiguration';
import { normalizeClientError } from '../client/problemDetails';
import { appRoutePath } from '../client/routes';
import { useRemoteWishDetectiveGame } from '../client/useRemoteCoupleGames';
import {
  type ClueValidationError,
  createLocalWishDetectiveSession,
  selectWishDetectiveRounds,
  type WishDetectiveCandidate,
  type WishDetectiveParticipant,
} from '../client/wishDetectiveSession';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { CoupleGameModes, RemoteWishDetectiveView } from './RemoteCoupleGames';
import { TaskBackLink } from './TaskBackButton';
import { UiState } from './UiState';

export interface WishDetectiveGameSetup {
  participants:
    | readonly [WishDetectiveParticipant, WishDetectiveParticipant]
    | null;
  rounds: readonly WishDetectiveCandidate[];
  /**
   * Who still needs a wish before a round is possible (#2048). Only a yes/no
   * per person; counts of anyone's wishes are never shown.
   */
  missing?: { you: boolean; partner: boolean };
}

const HIDDEN_ROUND_STORAGE_PREFIX = 'eimir:wish-detective:hidden-round';

function wishDetectiveHiddenRoundStorageKey(
  spaceId: string,
  currentAccountId: string,
): string {
  return `${HIDDEN_ROUND_STORAGE_PREFIX}:${spaceId}:${currentAccountId}`;
}

function hasWishDetectiveHiddenRoundMarker(storageKey: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(storageKey) === 'hidden';
  } catch {
    return false;
  }
}

function setWishDetectiveHiddenRoundMarker(
  storageKey: string,
  hidden: boolean,
): void {
  if (typeof window === 'undefined') return;
  try {
    if (hidden) {
      window.sessionStorage.setItem(storageKey, 'hidden');
    } else {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // Storage may be unavailable in hardened browser contexts. The active
    // in-memory session still keeps the secret out of HANDOFF/GUESS snapshots.
  }
}

type Participants = readonly [
  WishDetectiveParticipant,
  WishDetectiveParticipant,
];
type LocalRounds = Pick<WishDetectiveGameSetup, 'rounds' | 'missing'>;
type LoadLocalRounds = (participants: Participants) => Promise<LocalRounds>;

interface ApiAccess {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
}

function configurationFor({ apiBaseUrl, accessToken }: ApiAccess) {
  return new Configuration({
    basePath: apiBaseUrl,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function loadDefaultParticipants(
  access: ApiAccess,
  currentAccountId: string,
): Promise<Participants | null> {
  const space = await new SpacesApi(
    configurationFor(access),
  ).getSpaceApiV1SpacesSpaceIdGet({ spaceId: access.spaceId });
  return orderParticipants(space.partners, currentAccountId);
}

/*
 * #2158 H: the partner's wish titles reach this device only for a game on
 * one phone, where both of you sit together and the giver reads the wish
 * anyway. A game at a distance never loads them: the server draws the wish.
 */
async function loadDefaultLocalRounds(
  access: ApiAccess,
  participants: Participants,
): Promise<LocalRounds> {
  const candidateSet = await new GamesApi(
    configurationFor(access),
  ).getGameWishCandidates({ spaceId: access.spaceId });
  const candidates: WishDetectiveCandidate[] = candidateSet.items.map(
    (candidate) => ({
      wishId: candidate.wishId,
      createdBy: candidate.createdBy,
      title: candidate.title,
    }),
  );
  return {
    rounds: selectWishDetectiveRounds(candidates, participants),
    missing: {
      you: !candidates.some((c) => c.createdBy === participants[0].id),
      partner: !candidates.some((c) => c.createdBy === participants[1].id),
    },
  };
}

/*
 * #2048: one open wish per person is enough. The state says who
 * still needs one, never how many wishes anybody has.
 */
function SparseWishes({
  partnerName,
  missing,
}: {
  partnerName: string;
  missing?: { you: boolean; partner: boolean };
}) {
  const { t } = useTranslation();
  const you = missing?.you ?? true;
  const partner = missing?.partner ?? true;
  const title =
    you && partner
      ? t('games.wishDetective.sparseTitleBoth')
      : you
        ? t('games.wishDetective.sparseTitleYou')
        : t('games.wishDetective.sparseTitlePartner', { name: partnerName });
  return (
    <section
      className="wish-detective-sparse"
      aria-labelledby="wish-detective-sparse-title"
    >
      <p className="eyebrow">{t('games.wishDetective.sparseEyebrow')}</p>
      <h2 id="wish-detective-sparse-title">{title}</h2>
      <p>
        {you
          ? t('games.wishDetective.sparseBody')
          : t('games.wishDetective.sparseBodyPartner', { name: partnerName })}
      </p>
      {you ? (
        <Link className="button-link" to="/plan/wishes/new">
          {t('games.wishDetective.sparseAction')}
        </Link>
      ) : null}
    </section>
  );
}

/*
 * #2048: one phone together or each partner on their own phone. An open game
 * at a distance always resumes; without enough wishes neither mode starts.
 * #2158 H: whether each of you has a wish comes from the server's readiness
 * (a yes/no per person), so choosing a mode loads no wish titles.
 */
function WishDetectiveModes({
  participants,
  loadLocalRounds,
  hiddenRoundStorageKey,
  apiBaseUrl,
  accessToken,
  spaceId,
}: {
  participants: Participants;
  loadLocalRounds: LoadLocalRounds;
  hiddenRoundStorageKey: string;
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
}) {
  const [me, partner] = participants;
  const people = { me, partner };
  const remote = useRemoteWishDetectiveGame({
    spaceId,
    currentAccountId: me.id,
    apiBaseUrl,
    accessToken,
  });
  const readiness = remote.state?.readiness;
  const openRemote = remote.state?.game?.status === 'OPEN';
  if (
    readiness &&
    !(readiness.ownWishesAvailable && readiness.partnerWishesAvailable) &&
    !openRemote &&
    !remote.isLoading
  ) {
    return (
      <SparseWishes
        partnerName={partner.displayName}
        missing={{
          you: !readiness.ownWishesAvailable,
          partner: !readiness.partnerWishesAvailable,
        }}
      />
    );
  }
  return (
    <CoupleGameModes
      partnerName={partner.displayName}
      remote={remote}
      renderLocal={() => (
        <LocalWishDetective
          participants={participants}
          loadLocalRounds={loadLocalRounds}
          hiddenRoundStorageKey={hiddenRoundStorageKey}
          queryKey={[spaceId, me.id]}
        />
      )}
      renderRemote={(onNewGame) => (
        <RemoteWishDetectiveView
          game={remote}
          people={people}
          onNewGame={onNewGame}
        />
      )}
    />
  );
}

/* The one-phone game: only now are both partners' open wishes loaded. */
function LocalWishDetective({
  participants,
  loadLocalRounds,
  hiddenRoundStorageKey,
  queryKey,
}: {
  participants: Participants;
  loadLocalRounds: LoadLocalRounds;
  hiddenRoundStorageKey: string;
  queryKey: readonly string[];
}) {
  const { t } = useTranslation();
  const local = useQuery({
    queryKey: ['games', 'wish-detective', 'local-rounds', ...queryKey],
    queryFn: async () => {
      try {
        return await loadLocalRounds(participants);
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    gcTime: 0,
  });
  if (local.isPending) {
    return (
      <UiState
        kind="loading"
        title={t('games.wishDetective.loadingTitle')}
        body={t('games.wishDetective.loadingBody')}
      />
    );
  }
  if (local.error) {
    return (
      <ProblemState error={local.error} onRetry={() => void local.refetch()} />
    );
  }
  if (local.data.rounds.length === 0) {
    return (
      <SparseWishes
        partnerName={participants[1].displayName}
        missing={local.data.missing}
      />
    );
  }
  return (
    <WishDetectiveSessionView
      setup={{ participants, rounds: local.data.rounds }}
      hiddenRoundStorageKey={hiddenRoundStorageKey}
    />
  );
}

function clueErrorKey(error: ClueValidationError): string {
  return `games.wishDetective.errors.${error}`;
}

function WishDetectiveSessionView({
  setup,
  hiddenRoundStorageKey,
}: {
  setup: WishDetectiveGameSetup & {
    participants: readonly [WishDetectiveParticipant, WishDetectiveParticipant];
  };
  hiddenRoundStorageKey: string;
}) {
  const { t } = useTranslation();
  const clueGroupId = useId();
  const [guess, setGuess] = useState('');
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [session] = useState(() => {
    const next = createLocalWishDetectiveSession();
    next.start(setup.rounds, setup.participants);
    return next;
  });

  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );

  useEffect(() => {
    setWishDetectiveHiddenRoundMarker(
      hiddenRoundStorageKey,
      snapshot.phase === 'handoff' || snapshot.phase === 'guess',
    );
  }, [hiddenRoundStorageKey, snapshot.phase]);

  const participants = snapshot.participants;
  if (!participants) return null;

  const giver = participants[snapshot.giverIndex];
  const guesser = participants[snapshot.guesserIndex];
  const roundLabel = t('games.wishDetective.round', {
    current: Math.min(snapshot.currentRoundIndex + 1, snapshot.totalRounds),
    total: snapshot.totalRounds,
  });

  if (snapshot.phase === 'finished') {
    return (
      <section
        className="wish-detective-finish eimir-motion-success"
        aria-labelledby="wish-detective-finish-title"
      >
        <p className="eyebrow">{t('games.wishDetective.finishEyebrow')}</p>
        <h2 id="wish-detective-finish-title">
          {t('games.wishDetective.finishTitle')}
        </h2>
        <p>
          {t('games.wishDetective.finishBody', {
            correct: snapshot.correctGuesses,
            total: snapshot.totalRounds,
          })}
        </p>
        <p className="wish-detective-finish-score">
          {participants[0].displayName} {snapshot.scores[0]} ·{' '}
          {participants[1].displayName} {snapshot.scores[1]}
        </p>
        <div className="wish-detective-actions">
          <button
            type="button"
            onClick={() => {
              setGuess('');
              setValidationAttempted(false);
              session.restart();
            }}
          >
            {t('games.wishDetective.restart')}
          </button>
          <TaskBackLink to={appRoutePath('games')}>
            {t('games.wishDetective.backToGames')}
          </TaskBackLink>
        </div>
      </section>
    );
  }

  return (
    <div className="wish-detective-session">
      <section className="wish-detective-meta" aria-live="polite">
        <span>{roundLabel}</span>
        <span className="wish-detective-score">
          {participants[0].displayName} <strong>{snapshot.scores[0]}</strong>
          <span aria-hidden="true"> · </span>
          {participants[1].displayName} <strong>{snapshot.scores[1]}</strong>
        </span>
      </section>

      {snapshot.phase === 'clue' && snapshot.currentWish ? (
        <section
          className="wish-detective-card wish-detective-clue eimir-motion-disclosure"
          aria-labelledby="wish-detective-clue-title"
        >
          <p className="eyebrow">
            {t('games.wishDetective.clueEyebrow', {
              name: giver.displayName,
            })}
          </p>
          <h2 id="wish-detective-clue-title">{snapshot.currentWish.title}</h2>
          <p className="wish-detective-private-note">
            {t('games.wishDetective.cluePrivate')}
          </p>

          <fieldset
            className="wish-detective-clues"
            aria-describedby={`${clueGroupId}-help`}
          >
            <legend>{t('games.wishDetective.cluesLegend')}</legend>
            <p id={`${clueGroupId}-help`} className="field-help">
              {t('games.wishDetective.cluesHelp')}
            </p>
            {snapshot.clues.map((value, index) => {
              const clueIndex = index as 0 | 1 | 2;
              const error = snapshot.clueErrors[clueIndex];
              const showError = Boolean(
                error && (validationAttempted || value.trim()),
              );
              const inputId = `${clueGroupId}-clue-${index}`;
              const errorId = `${inputId}-error`;
              return (
                <div className="wish-detective-clue-field" key={inputId}>
                  <label htmlFor={inputId}>
                    {t('games.wishDetective.clueLabel', {
                      index: index + 1,
                    })}
                  </label>
                  <input
                    id={inputId}
                    value={value}
                    maxLength={40}
                    autoComplete="off"
                    aria-invalid={showError || undefined}
                    aria-describedby={showError ? errorId : undefined}
                    onChange={(event) =>
                      session.dispatch({
                        type: 'SET_CLUE',
                        index: clueIndex,
                        value: event.currentTarget.value,
                      })
                    }
                  />
                  {showError && error ? (
                    <p id={errorId} className="field-error" role="alert">
                      {t(clueErrorKey(error))}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </fieldset>

          <button
            type="button"
            className="wish-detective-primary-action"
            onClick={() => {
              setValidationAttempted(true);
              session.dispatch({ type: 'START_HANDOFF' });
            }}
          >
            {t('games.wishDetective.startHandoff')}
          </button>
        </section>
      ) : null}

      {snapshot.phase === 'handoff' ? (
        <section
          className="wish-detective-card wish-detective-handoff eimir-motion-disclosure"
          aria-labelledby="wish-detective-handoff-title"
        >
          <p className="eyebrow">{t('games.wishDetective.handoffEyebrow')}</p>
          <h2 id="wish-detective-handoff-title">
            {t('games.wishDetective.handoffTitle', {
              name: guesser.displayName,
            })}
          </h2>
          <p>{t('games.wishDetective.handoffBody')}</p>
          <button
            type="button"
            className="wish-detective-primary-action"
            onClick={() => {
              setGuess('');
              session.dispatch({ type: 'CONFIRM_HANDOFF' });
            }}
          >
            {t('games.wishDetective.handoffConfirm', {
              name: guesser.displayName,
            })}
          </button>
        </section>
      ) : null}

      {snapshot.phase === 'guess' ? (
        <section
          className="wish-detective-card wish-detective-guess eimir-motion-disclosure"
          aria-labelledby="wish-detective-guess-title"
        >
          <p className="eyebrow">
            {t('games.wishDetective.guessEyebrow', {
              name: guesser.displayName,
            })}
          </p>
          <h2 id="wish-detective-guess-title">
            {t('games.wishDetective.guessTitle')}
          </h2>
          <ul
            className="wish-detective-clue-chips"
            aria-label={t('games.wishDetective.cluesAria')}
          >
            {snapshot.clues.map((clue) => (
              <li key={clue}>{clue}</li>
            ))}
          </ul>
          <label htmlFor="wish-detective-guess-input">
            {t('games.wishDetective.guessLabel', { name: giver.displayName })}
          </label>
          <input
            id="wish-detective-guess-input"
            value={guess}
            autoComplete="off"
            onChange={(event) => setGuess(event.currentTarget.value)}
          />
          <div className="wish-detective-actions">
            <button
              type="button"
              disabled={!guess.trim()}
              onClick={() => session.dispatch({ type: 'SUBMIT_GUESS', guess })}
            >
              {t('games.wishDetective.submitGuess')}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => session.dispatch({ type: 'PASS' })}
            >
              {t('games.wishDetective.pass')}
            </button>
          </div>
        </section>
      ) : null}

      {snapshot.phase === 'reveal' &&
      snapshot.currentWish &&
      snapshot.reveal ? (
        <section
          className={`wish-detective-card wish-detective-reveal wish-detective-reveal-${snapshot.reveal.result} eimir-motion-disclosure`}
          aria-live="polite"
          aria-labelledby="wish-detective-reveal-title"
        >
          <p className="eyebrow">{t('games.wishDetective.revealEyebrow')}</p>
          <h2 id="wish-detective-reveal-title">
            {snapshot.reveal.result === 'correct'
              ? t('games.wishDetective.correctTitle', {
                  name: guesser.displayName,
                })
              : snapshot.reveal.result === 'incorrect'
                ? t('games.wishDetective.incorrectTitle')
                : t('games.wishDetective.passedTitle')}
          </h2>
          <p className="wish-detective-revealed-wish">
            {snapshot.currentWish.title}
          </p>
          <button
            type="button"
            className="wish-detective-primary-action"
            onClick={() => {
              setGuess('');
              setValidationAttempted(false);
              session.dispatch({ type: 'CONTINUE' });
            }}
          >
            {t('common.continue')}
          </button>
        </section>
      ) : null}
    </div>
  );
}

export function WishDetectiveGamePage({
  apiBaseUrl,
  accessToken,
  spaceId,
  currentAccountId,
  loadSetup,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  currentAccountId: string;
  /** Test seam: the couple and the one-phone wish pool in one step. */
  loadSetup?: () => Promise<WishDetectiveGameSetup>;
}) {
  const { t } = useTranslation();
  const access = { apiBaseUrl, accessToken, spaceId };
  const loadLocalRounds: LoadLocalRounds = loadSetup
    ? async () => {
        const { rounds, missing } = await loadSetup();
        return { rounds, missing };
      }
    : (participants) => loadDefaultLocalRounds(access, participants);
  const hiddenRoundStorageKey = wishDetectiveHiddenRoundStorageKey(
    spaceId,
    currentAccountId,
  );
  const [interruptedHiddenRound] = useState(() =>
    hasWishDetectiveHiddenRoundMarker(hiddenRoundStorageKey),
  );
  const setupQuery = useQuery({
    queryKey: [
      'games',
      'wish-detective',
      'participants',
      spaceId,
      currentAccountId,
    ],
    queryFn: async () => {
      try {
        return loadSetup
          ? (await loadSetup()).participants
          : await loadDefaultParticipants(access, currentAccountId);
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    gcTime: 0,
    enabled: !interruptedHiddenRound,
  });

  return (
    <div className="page wish-detective-page">
      <PageHeader
        eyebrow={t('games.entries.wishes.role')}
        title={t('games.entries.wishes.title')}
        description={t('games.wishDetective.intro')}
        className="wish-detective-heading"
      />

      {interruptedHiddenRound ? (
        <section
          className="wish-detective-sparse"
          aria-labelledby="wish-detective-interrupted-title"
        >
          <p className="eyebrow">
            {t('games.wishDetective.interruptedEyebrow')}
          </p>
          <h2 id="wish-detective-interrupted-title">
            {t('games.wishDetective.interruptedTitle')}
          </h2>
          <p>{t('games.wishDetective.interruptedBody')}</p>
          <TaskBackLink
            to={appRoutePath('games')}
            onClick={() =>
              setWishDetectiveHiddenRoundMarker(hiddenRoundStorageKey, false)
            }
          >
            {t('games.wishDetective.backToGames')}
          </TaskBackLink>
        </section>
      ) : setupQuery.isPending ? (
        <UiState
          kind="loading"
          title={t('games.wishDetective.loadingTitle')}
          body={t('games.wishDetective.loadingBody')}
        />
      ) : setupQuery.error ? (
        <ProblemState
          error={setupQuery.error}
          onRetry={() => void setupQuery.refetch()}
        />
      ) : !setupQuery.data ? (
        <UiState
          kind="empty"
          title={t('games.wishDetective.coupleRequiredTitle')}
          body={t('games.wishDetective.coupleRequiredBody')}
        />
      ) : (
        <WishDetectiveModes
          participants={setupQuery.data}
          loadLocalRounds={loadLocalRounds}
          hiddenRoundStorageKey={hiddenRoundStorageKey}
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          spaceId={spaceId}
        />
      )}
    </div>
  );
}

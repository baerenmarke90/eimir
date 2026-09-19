import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { GamesApi } from '../api/generated/apis/GamesApi';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { PartnerView } from '../api/generated/models/PartnerView';
import { Configuration } from '../api/generated/runtime';
import {
  adoptObjectUrl,
  type OwnedObjectUrl,
} from '../client/objectUrlResource';
import { appRoutePath } from '../client/routes';
import { normalizeClientError } from '../client/problemDetails';
import {
  createLocalOurMomentsSession,
  type OurMomentsCard,
  type OurMomentsParticipant,
  type OurMomentsSession,
  type PreparedOurMoment,
  selectOurMomentsRound,
} from '../client/ourMomentsSession';
import {
  createReferenceApis,
  loadAuthorizedImage,
} from '../client/referenceFlow';
import { resolvedLocale, useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';

export interface OurMomentsGameSetup {
  participants: readonly [OurMomentsParticipant, OurMomentsParticipant] | null;
  moments: readonly PreparedOurMoment[];
}

interface OwnedOurMomentsGameSetup {
  setup: OurMomentsGameSetup;
  acquire(): () => void;
}

function ownedPreparedSetup(
  setup: OurMomentsGameSetup,
  resources: readonly OwnedObjectUrl[],
): OwnedOurMomentsGameSetup {
  let consumers = 0;
  let disposed = false;
  let releaseTimer: ReturnType<typeof setTimeout> | null = null;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (releaseTimer !== null) clearTimeout(releaseTimer);
    releaseTimer = null;
    for (const resource of resources) resource.dispose();
  };

  return {
    setup,
    acquire() {
      consumers += 1;
      if (releaseTimer !== null) {
        clearTimeout(releaseTimer);
        releaseTimer = null;
      }

      let released = false;
      return () => {
        if (released) return;
        released = true;
        consumers = Math.max(0, consumers - 1);
        if (consumers > 0 || releaseTimer !== null) return;

        // Match the shared-avatar StrictMode contract: defer one task so
        // effect cleanup/replay cannot revoke URLs that the replay still uses.
        releaseTimer = setTimeout(() => {
          releaseTimer = null;
          if (consumers === 0) dispose();
        }, 0);
      };
    },
  };
}

function ownPreparedSetup(
  setup: OurMomentsGameSetup,
): OwnedOurMomentsGameSetup {
  const resources = setup.moments
    .filter((moment) => moment.imageUrl.startsWith('blob:'))
    .map((moment) => adoptObjectUrl(moment.imageUrl));
  return ownedPreparedSetup(setup, resources);
}

function orderParticipants(
  partners: readonly PartnerView[],
  currentAccountId: string,
): [OurMomentsParticipant, OurMomentsParticipant] | null {
  if (partners.length !== 2) return null;
  const current = partners.find((partner) => partner.id === currentAccountId);
  const other = partners.find((partner) => partner.id !== currentAccountId);
  if (current && other) {
    return [
      { id: current.id, displayName: current.displayName },
      { id: other.id, displayName: other.displayName },
    ];
  }
  return [
    { id: partners[0].id, displayName: partners[0].displayName },
    { id: partners[1].id, displayName: partners[1].displayName },
  ];
}

function formatMomentDate(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

function cardAccessibleName(
  card: OurMomentsCard,
  index: number,
  total: number,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (card.state === 'hidden') {
    return t('games.momentsGame.cardHidden', {
      index: index + 1,
      total,
    });
  }
  const date = formatMomentDate(card.moment.effectiveDate);
  if (card.state === 'matched') {
    return t('games.momentsGame.cardMatched', {
      title: card.moment.title,
      date,
    });
  }
  return card.face === 'photo'
    ? t('games.momentsGame.cardPhotoRevealed', {
        title: card.moment.title,
      })
    : t('games.momentsGame.cardContextRevealed', {
        title: card.moment.title,
        date,
      });
}

function OurMomentsCardButton({
  card,
  index,
  total,
  session,
  inputLocked,
}: {
  card: OurMomentsCard;
  index: number;
  total: number;
  session: OurMomentsSession;
  inputLocked: boolean;
}) {
  const { t } = useTranslation();
  const hidden = card.state === 'hidden';
  const disabled = inputLocked || card.state === 'matched';

  return (
    <button
      type="button"
      className={`our-moments-card our-moments-card-${card.state} our-moments-card-${card.face}`}
      aria-label={cardAccessibleName(card, index, total, t)}
      disabled={disabled}
      onClick={() => session.dispatch({ type: 'SELECT_CARD', cardId: card.id })}
    >
      {hidden ? (
        <span className="our-moments-card-back" aria-hidden="true">
          <span className="our-moments-card-back-mark" />
        </span>
      ) : card.face === 'photo' ? (
        <img src={card.moment.imageUrl} alt="" draggable={false} />
      ) : (
        <span className="our-moments-card-context" aria-hidden="true">
          <strong>{card.moment.title}</strong>
          <span>{formatMomentDate(card.moment.effectiveDate)}</span>
        </span>
      )}
    </button>
  );
}

function ActiveOurMomentsSessionView({
  session,
}: {
  session: OurMomentsSession;
}) {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const participants = snapshot.participants;
  if (!participants) return null;

  const activePlayer = participants[snapshot.activePlayerIndex];

  if (snapshot.status === 'finished') {
    return (
      <section
        className="our-moments-finish eimir-motion-reveal"
        aria-labelledby="our-moments-finish-title"
      >
        <p className="eyebrow">{t('games.momentsGame.finishEyebrow')}</p>
        <h2 id="our-moments-finish-title">
          {t('games.momentsGame.finishTitle')}
        </h2>
        <p>
          {t('games.momentsGame.finishBody', {
            count: snapshot.totalPairs,
          })}
        </p>
        <p className="our-moments-finish-score">
          {participants[0].displayName} {snapshot.scores[0]} ·{' '}
          {participants[1].displayName} {snapshot.scores[1]}
        </p>
        <div className="our-moments-finish-actions">
          <button type="button" onClick={() => session.restart()}>
            {t('games.momentsGame.restart')}
          </button>
          <Link
            className="button-link secondary-link"
            to={appRoutePath('games')}
          >
            {t('games.momentsGame.backToGames')}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="our-moments-session">
      <section className="our-moments-turn" aria-live="polite">
        <div>
          <span>{t('games.momentsGame.turnLabel')}</span>
          <strong>
            {t('games.momentsGame.turnValue', {
              name: activePlayer.displayName,
            })}
          </strong>
        </div>
        <div className="our-moments-score">
          <span>
            {participants[0].displayName} <strong>{snapshot.scores[0]}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {participants[1].displayName} <strong>{snapshot.scores[1]}</strong>
          </span>
        </div>
      </section>

      {snapshot.status === 'match-reveal' && snapshot.revealedMatch ? (
        <section
          className="our-moments-match-reveal eimir-motion-reveal"
          aria-live="polite"
          aria-labelledby="our-moments-match-title"
        >
          <img src={snapshot.revealedMatch.imageUrl} alt="" />
          <div>
            <p className="eyebrow">{t('games.momentsGame.matchEyebrow')}</p>
            <h2 id="our-moments-match-title">{snapshot.revealedMatch.title}</h2>
            <p>{formatMomentDate(snapshot.revealedMatch.effectiveDate)}</p>
            <button
              type="button"
              onClick={() => session.dispatch({ type: 'CONTINUE_AFTER_MATCH' })}
            >
              {t('games.momentsGame.continue')}
            </button>
          </div>
        </section>
      ) : null}

      <section
        className="our-moments-board"
        aria-label={t('games.momentsGame.boardAria')}
        aria-busy={snapshot.inputLocked && snapshot.status === 'playing'}
      >
        {snapshot.cards.map((card, index) => (
          <OurMomentsCardButton
            key={card.id}
            card={card}
            index={index}
            total={snapshot.cards.length}
            session={session}
            inputLocked={snapshot.inputLocked}
          />
        ))}
      </section>
    </div>
  );
}

function OurMomentsSessionView({
  setup,
}: {
  setup: OurMomentsGameSetup & {
    participants: readonly [OurMomentsParticipant, OurMomentsParticipant];
  };
}) {
  const [session, setSession] = useState<OurMomentsSession | null>(null);

  useEffect(() => {
    const next = createLocalOurMomentsSession();
    next.start(setup.moments, setup.participants);
    setSession(next);
    return () => next.dispose();
  }, [setup]);

  if (!session) return null;

  return <ActiveOurMomentsSessionView session={session} />;
}

async function loadDefaultSetup({
  apiBaseUrl,
  accessToken,
  spaceId,
  currentAccountId,
  signal,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  currentAccountId: string;
  signal: AbortSignal;
}): Promise<OwnedOurMomentsGameSetup> {
  const configuration = new Configuration({
    basePath: apiBaseUrl,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const gamesApi = new GamesApi(configuration);
  const spacesApi = new SpacesApi(configuration);
  const referenceApis = createReferenceApis(apiBaseUrl, accessToken);

  const [candidateSet, space] = await Promise.all([
    gamesApi.getGameMomentCandidates({ spaceId }),
    spacesApi.getSpaceApiV1SpacesSpaceIdGet({ spaceId }),
  ]);
  const participants = orderParticipants(space.partners, currentAccountId);
  const selected = selectOurMomentsRound(candidateSet.items);

  if (!participants || selected.length < 3) {
    return ownPreparedSetup({ participants, moments: [] });
  }

  const resources: OwnedObjectUrl[] = [];
  const results = await Promise.allSettled(
    selected.map(async (candidate) => {
      const imageUrl = await loadAuthorizedImage(
        referenceApis,
        apiBaseUrl,
        accessToken,
        spaceId,
        candidate.memoryId,
        candidate.imageAttachmentId,
        fetch,
        signal,
      );
      const resource = adoptObjectUrl(imageUrl);
      resources.push(resource);
      return {
        memoryId: candidate.memoryId,
        title: candidate.title,
        effectiveDate: candidate.effectiveDate,
        imageAttachmentId: candidate.imageAttachmentId,
        imageUrl: resource.url,
      };
    }),
  );

  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failed || signal.aborted) {
    for (const resource of resources) resource.dispose();
    if (failed) throw failed.reason;
    throw new DOMException('Our Moments media load aborted.', 'AbortError');
  }

  const moments = results.map((result) => {
    if (result.status !== 'fulfilled') {
      throw new Error('Our Moments setup settled inconsistently.');
    }
    return result.value;
  });

  return ownedPreparedSetup({ participants, moments }, resources);
}

export function OurMomentsGamePage({
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
  loadSetup?: () => Promise<OurMomentsGameSetup>;
}) {
  const { t } = useTranslation();
  const setupQuery = useQuery({
    queryKey: ['games', 'our-moments', 'setup', spaceId],
    queryFn: async ({ signal }) => {
      try {
        return loadSetup
          ? ownPreparedSetup(await loadSetup())
          : await loadDefaultSetup({
              apiBaseUrl,
              accessToken,
              spaceId,
              currentAccountId,
              signal,
            });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error;
        }
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    gcTime: 0,
  });

  useEffect(() => {
    const ownedSetup = setupQuery.data;
    if (!ownedSetup) return;
    return ownedSetup.acquire();
  }, [setupQuery.data]);

  const setup = setupQuery.data?.setup;

  return (
    <div className="page our-moments-page">
      <PageHeader
        before={
          <Link className="back-link" to={appRoutePath('games')}>
            {t('games.momentsGame.back')}
          </Link>
        }
        eyebrow={t('games.entries.moments.role')}
        title={t('games.entries.moments.title')}
        description={t('games.momentsGame.intro')}
        className="our-moments-heading"
      />

      {setupQuery.isPending ? (
        <UiState
          kind="loading"
          title={t('games.momentsGame.loadingTitle')}
          body={t('games.momentsGame.loadingBody')}
        />
      ) : setupQuery.error ? (
        <ProblemState
          error={setupQuery.error}
          onRetry={() => void setupQuery.refetch()}
        />
      ) : !setup?.participants ? (
        <UiState
          kind="empty"
          title={t('games.momentsGame.coupleRequiredTitle')}
          body={t('games.momentsGame.coupleRequiredBody')}
        />
      ) : setup.moments.length < 3 ? (
        <section
          className="our-moments-sparse"
          aria-labelledby="our-moments-sparse-title"
        >
          <p className="eyebrow">{t('games.momentsGame.sparseEyebrow')}</p>
          <h2 id="our-moments-sparse-title">
            {t('games.momentsGame.sparseTitle')}
          </h2>
          <p>{t('games.momentsGame.sparseBody')}</p>
          <Link className="button-link" to={appRoutePath('story')}>
            {t('games.momentsGame.sparseAction')}
          </Link>
        </section>
      ) : (
        <OurMomentsSessionView
          setup={{
            participants: setup.participants,
            moments: setup.moments,
          }}
        />
      )}
    </div>
  );
}

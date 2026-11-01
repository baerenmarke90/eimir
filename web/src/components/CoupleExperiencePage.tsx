import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { SpaceEntitlementView } from '../api/generated/models/SpaceEntitlementView';
import { Configuration } from '../client/apiConfiguration';
import { useTaskOrigin } from '../client/taskOrigin';
import { ProMark } from './ProMark';
import './CoupleExperiences.css';
import { loadGameParticipants } from '../client/gameParticipants';
import { normalizeClientError } from '../client/problemDetails';
import type { WhoOfUsParticipant } from '../client/whoOfUsSession';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';

const PROMPTS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
] as const;
type Experience = 'happiness' | 'timeTravel';

function Session({ game, onExit }: { game: Experience; onExit: () => void }) {
  const { t } = useTranslation();
  const [round, setRound] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [offset, setOffset] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const finished = round === PROMPTS.length;
  useEffect(() => {
    if (round >= 0) heading.current?.focus();
  }, [round]);
  function next(done: boolean) {
    if (done) setCompleted((value) => value + 1);
    setRound((value) => Math.min(value + 1, PROMPTS.length));
  }
  return (
    <section className="couple-experience-session">
      <p className="couple-experience-progress">
        {t(
          finished
            ? 'coupleExperiences.session.finished'
            : 'coupleExperiences.session.progress',
          {
            current: round + 1,
            total: PROMPTS.length,
          },
        )}
      </p>
      <h2 key={`${offset}:${round}`} ref={heading} tabIndex={-1}>
        {t(
          finished
            ? 'coupleExperiences.session.finishTitle'
            : `coupleExperiences.session.${game}.${PROMPTS[(round + offset) % PROMPTS.length]}`,
        )}
      </h2>
      <p>
        {t(
          finished
            ? 'coupleExperiences.session.finishBody'
            : `coupleExperiences.session.${game}.instruction`,
          { count: completed },
        )}
      </p>
      <div className="couple-experience-actions">
        {finished ? (
          <>
            <button
              type="button"
              onClick={() => {
                setCompleted(0);
                setOffset((value) => value + 1);
                setRound(0);
              }}
            >
              {t('coupleExperiences.session.restart')}
            </button>
            <button type="button" className="secondary" onClick={onExit}>
              {t('coupleExperiences.session.back')}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => next(true)}>
              {t(
                game === 'happiness'
                  ? 'coupleExperiences.session.done'
                  : 'coupleExperiences.session.next',
              )}
            </button>
            <button
              type="button"
              className="tertiary"
              onClick={() => next(false)}
            >
              {t('coupleExperiences.session.skip')}
            </button>
          </>
        )}
      </div>
      <p className="couple-experience-privacy">
        {t('coupleExperiences.session.privacy')}
      </p>
    </section>
  );
}

export function CoupleExperiencePage({
  kind: game,
  onExit,
  accountId,
  loadEntitlement,
  apiBaseUrl,
  accessToken,
  spaceId,
  loadParticipants,
}: {
  kind: Experience;
  onExit?: () => void;
  accountId: string;
  loadEntitlement?: () => Promise<SpaceEntitlementView>;
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  loadParticipants?: () => Promise<
    readonly [WhoOfUsParticipant, WhoOfUsParticipant] | null
  >;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const { requestReturn } = useTaskOrigin();
  const api = useMemo(
    () =>
      new EntitlementsApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [apiBaseUrl, accessToken],
  );
  const entitlement = useQuery({
    queryKey: ['couple-experience-entitlement', apiBaseUrl, accountId, spaceId],
    queryFn: async () => {
      try {
        return await (loadEntitlement
          ? loadEntitlement()
          : api.getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet({
              spaceId,
            }));
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  const allowed = Boolean(
    !entitlement.error &&
      entitlement.data?.capabilities.includes('games.couple'),
  );
  const exit =
    onExit ??
    (() =>
      requestReturn(
        (location.state as { taskOriginKey?: unknown } | null)?.taskOriginKey,
      ));
  const participants = useQuery({
    queryKey: [
      'couple-experience-participants',
      apiBaseUrl,
      accountId,
      spaceId,
    ],
    enabled: allowed,
    gcTime: 0,
    queryFn: async () => {
      try {
        return await (loadParticipants
          ? loadParticipants()
          : loadGameParticipants({ apiBaseUrl, accessToken, spaceId }));
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });
  return (
    <div className="page couple-experience-page">
      <PageHeader
        title={t(`coupleExperiences.entries.${game}.title`)}
        titleAction={<ProMark label={t('coupleExperiences.pro')} />}
      />
      {entitlement.isPending ? (
        <UiState kind="loading" title={t('states.loading.title')} />
      ) : entitlement.error ? (
        <ProblemState
          error={entitlement.error}
          onRetry={() => void entitlement.refetch()}
        />
      ) : !allowed ? (
        <UiState
          kind="empty"
          title={t('coupleExperiences.proTitle')}
          body={t('coupleExperiences.proBody')}
        />
      ) : participants.isPending ? (
        <UiState kind="loading" title={t('states.loading.title')} />
      ) : participants.error ? (
        <ProblemState
          error={participants.error}
          onRetry={() => void participants.refetch()}
        />
      ) : !participants.data ? (
        <UiState
          kind="empty"
          title={t('coupleExperiences.session.coupleRequiredTitle')}
          body={t('coupleExperiences.session.coupleRequiredBody')}
        />
      ) : (
        <Session
          key={`${apiBaseUrl}:${accountId}:${spaceId}:${game}`}
          game={game}
          onExit={exit}
        />
      )}
    </div>
  );
}

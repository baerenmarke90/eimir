import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { MemoriesApi } from '../api/generated/apis/MemoriesApi';
import type { MemoryPage } from '../api/generated/models/MemoryPage';
import type { SpaceEntitlementView } from '../api/generated/models/SpaceEntitlementView';
import { ExperienceKind } from '../api/generated/models/ExperienceKind';
import { Configuration } from '../client/apiConfiguration';
import {
  COUPLE_EXPERIENCE_PROMPT_IDS,
  isCoupleExperiencePromptId,
} from '../client/coupleExperiencePrompts';
import { loadGameParticipants } from '../client/gameParticipants';
import { normalizeClientError } from '../client/problemDetails';
import {
  HAPPINESS_ROUTE,
  TIME_TRAVEL_ROUTE,
  memoryDetailPath,
} from '../client/routes';
import type { WhoOfUsParticipant } from '../client/whoOfUsSession';
import { resolvedLocale, useTranslation } from '../i18n';
import { MemoryCreatePage } from './MemoryCreatePage';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { ProMark } from './ProMark';
import { TaskOriginLink } from './TodayDestinationLink';
import { UiState } from './UiState';
import './CoupleExperiences.css';

type Experience = 'happiness' | 'timeTravel';

function ExperiencePrompts({
  kind,
  route,
}: {
  kind: Experience;
  route: string;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const id = COUPLE_EXPERIENCE_PROMPT_IDS[index];
  return (
    <section
      className="couple-experience-prompts"
      aria-labelledby="experience-prompt-heading"
    >
      <p className="eyebrow">
        {t('coupleExperiences.prompts.progress', {
          current: index + 1,
          total: COUPLE_EXPERIENCE_PROMPT_IDS.length,
        })}
      </p>
      <h2 id="experience-prompt-heading" aria-live="polite" aria-atomic="true">
        {t(`coupleExperiences.prompts.${kind}.${id}`)}
      </h2>
      <div className="form-actions">
        <TaskOriginLink
          className="button-link"
          to={`${route}/new?prompt=${id}`}
        >
          {t('coupleExperiences.prompts.answer')}
        </TaskOriginLink>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            setIndex(
              (value) => (value + 1) % COUPLE_EXPERIENCE_PROMPT_IDS.length,
            )
          }
        >
          {t('coupleExperiences.prompts.next')}
        </button>
      </div>
    </section>
  );
}

export function CoupleExperiencePage({
  kind,
  accountId,
  apiBaseUrl,
  accessToken,
  spaceId,
  onSaved,
  loadEntitlement,
  loadParticipants,
  loadHistory,
}: {
  kind: Experience;
  accountId: string;
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  onSaved?: () => Promise<void>;
  loadEntitlement?: () => Promise<SpaceEntitlementView>;
  loadParticipants?: () => Promise<
    readonly [WhoOfUsParticipant, WhoOfUsParticipant] | null
  >;
  loadHistory?: (cursor?: string) => Promise<MemoryPage>;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const client = useQueryClient();
  const config = useMemo(
    () =>
      new Configuration({
        basePath: apiBaseUrl,
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    [apiBaseUrl, accessToken],
  );
  const entitlements = useMemo(() => new EntitlementsApi(config), [config]);
  const memories = useMemo(() => new MemoriesApi(config), [config]);
  const origin =
    kind === 'happiness'
      ? ExperienceKind.HAPPINESS
      : ExperienceKind.TIME_TRAVEL;
  const route = kind === 'happiness' ? HAPPINESS_ROUTE : TIME_TRAVEL_ROUTE;
  const creating = location.pathname === `${route}/new`;
  const requestedPrompt = new URLSearchParams(location.search).get('prompt');
  const prompt = isCoupleExperiencePromptId(requestedPrompt)
    ? t(`coupleExperiences.prompts.${kind}.${requestedPrompt}`)
    : undefined;
  const scope = [apiBaseUrl, accountId, spaceId];
  const entitlement = useQuery({
    queryKey: ['couple-experience-entitlement', ...scope],
    queryFn: async () => {
      try {
        return await (loadEntitlement
          ? loadEntitlement()
          : entitlements.getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet({
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
  const participants = useQuery({
    queryKey: ['couple-experience-participants', ...scope],
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
    gcTime: 0,
  });
  const history = useInfiniteQuery({
    queryKey: ['couple-experience-history', ...scope, origin],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      try {
        return await (loadHistory
          ? loadHistory(pageParam)
          : memories.listMemories(
              { spaceId, experienceKind: origin, cursor: pageParam, limit: 20 },
              { signal },
            ));
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    getNextPageParam: (last) =>
      last.hasMore ? (last.nextCursor ?? undefined) : undefined,
    retry: false,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  const allowed =
    !entitlement.error &&
    entitlement.data?.capabilities.includes('games.couple');
  const partner = participants.data?.find((person) => person.id !== accountId);
  const state =
    entitlement.isPending || participants.isPending ? (
      <UiState kind="loading" title={t('states.loading.title')} />
    ) : entitlement.error || participants.error ? (
      <ProblemState
        error={entitlement.error ?? participants.error}
        onRetry={() => {
          void entitlement.refetch();
          void participants.refetch();
        }}
      />
    ) : !allowed ? (
      <UiState
        kind="empty"
        title={t('coupleExperiences.proTitle')}
        body={t('coupleExperiences.proBody')}
      />
    ) : !partner ? (
      <UiState
        kind="empty"
        title={t('coupleExperiences.session.coupleRequiredTitle')}
        body={t('coupleExperiences.session.coupleRequiredBody')}
      />
    ) : null;
  if (creating && state === null) {
    return (
      <MemoryCreatePage
        key={`${apiBaseUrl}:${accountId}:${spaceId}:${origin}`}
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
        accountId={accountId}
        spaceId={spaceId}
        experienceKind={origin}
        experiencePrompt={prompt}
        partnerName={partner?.displayName}
        onSaved={async () => {
          await client.invalidateQueries({
            queryKey: ['couple-experience-history', ...scope],
          });
          await onSaved?.();
        }}
      />
    );
  }
  return (
    <div className="page couple-experience-page">
      <PageHeader
        title={t(`coupleExperiences.entries.${kind}.title`)}
        titleAction={<ProMark label={t('coupleExperiences.pro')} />}
      />
      {state ?? (
        <ExperiencePrompts
          key={`${apiBaseUrl}:${accountId}:${spaceId}:${kind}`}
          kind={kind}
          route={route}
        />
      )}
      {state === null ? (
        <TaskOriginLink
          className="button-link experience-create-action"
          to={`${route}/new`}
        >
          {t(`coupleExperiences.create.${kind}`)}
        </TaskOriginLink>
      ) : null}
      {!creating ? (
        <section
          className="couple-experience-history"
          aria-labelledby="experience-history-heading"
        >
          <h2 id="experience-history-heading">
            {t('coupleExperiences.history')}
          </h2>
          {history.isPending ? (
            <UiState kind="loading" title={t('states.loading.title')} />
          ) : history.error ? (
            <ProblemState
              error={history.error}
              onRetry={() => void history.refetch()}
            />
          ) : (
            <>
              {history.data.pages.flatMap((page) => page.items).length === 0 ? (
                <p>{t(`coupleExperiences.empty.${kind}`)}</p>
              ) : (
                <ul>
                  {history.data.pages
                    .flatMap((page) => page.items)
                    .map((entry) => (
                      <li key={entry.id}>
                        <TaskOriginLink
                          to={memoryDetailPath(entry.id)}
                          className="couple-experience-history-entry"
                        >
                          <span className="couple-experience-author">
                            {entry.author.displayName}
                          </span>
                          {COUPLE_EXPERIENCE_PROMPT_IDS.some(
                            (id) =>
                              entry.title ===
                              t(`coupleExperiences.prompts.${kind}.${id}`),
                          ) ? (
                            <h3>{entry.title}</h3>
                          ) : null}
                          <p>{entry.body.slice(0, 280)}</p>
                          <time dateTime={entry.createdAt.toISOString()}>
                            {new Intl.DateTimeFormat(resolvedLocale(), {
                              dateStyle: 'medium',
                            }).format(entry.happenedOn ?? entry.createdAt)}
                          </time>
                        </TaskOriginLink>
                      </li>
                    ))}
                </ul>
              )}
              {history.hasNextPage ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={history.isFetchingNextPage}
                  onClick={() => void history.fetchNextPage()}
                >
                  {t('coupleExperiences.more')}
                </button>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { GamesApi } from '../api/generated/apis/GamesApi';
import { MemoriesApi } from '../api/generated/apis/MemoriesApi';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { CoupleExperienceQuestionState } from '../api/generated/models/CoupleExperienceQuestionState';
import type { CoupleExperienceQuestions } from '../api/generated/models/CoupleExperienceQuestions';
import { ExperienceKind } from '../api/generated/models/ExperienceKind';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import type { MemoryPage } from '../api/generated/models/MemoryPage';
import type { SpaceEntitlementView } from '../api/generated/models/SpaceEntitlementView';
import { Configuration } from '../client/apiConfiguration';
import { isCoupleExperiencePromptId } from '../client/coupleExperiencePrompts';
import { loadGameParticipants } from '../client/gameParticipants';
import { usePartnerNickname } from '../client/partnerNickname';
import { normalizeClientError } from '../client/problemDetails';
import {
  HAPPINESS_ROUTE,
  memoryDetailPath,
  TIME_TRAVEL_ROUTE,
} from '../client/routes';
import {
  entitlementLoader,
  useSpaceEntitlement,
} from '../client/spaceEntitlement';
import type { WhoOfUsParticipant } from '../client/whoOfUsSession';
import { resolvedLocale, useTranslation } from '../i18n';
import experienceCopy from '../i18n/locales/coupleExperiences';
import { AddActionContent } from './AddAction';
import { AutoLoadMore } from './AutoLoadMore';
import { ExperienceAnswers } from './ExperienceAnswers';
import { MemoryCreatePage } from './MemoryCreatePage';
import { PageHeader } from './PageHeader';
import { personInitials } from './PersonIdentity';
import { ProblemState } from './ProblemState';
import { ProMark } from './ProMark';
import { TaskOriginLink } from './TodayDestinationLink';
import { UiState } from './UiState';
import './CoupleExperiences.css';

type Experience = 'happiness' | 'timeTravel';

type HistoryGroup = 'today' | 'yesterday' | 'recent' | 'month';

/** Calendar day of an entry: a stored date is a UTC date, an instant is local. */
function entryDay(entry: MemoryDetail): number {
  if (entry.happenedOn) {
    const day = entry.happenedOn;
    return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  }
  const at = entry.createdAt;
  return Date.UTC(at.getFullYear(), at.getMonth(), at.getDate());
}

function historyGroup(day: number, now: Date): HistoryGroup {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const age = Math.round((today - day) / 86_400_000);
  if (age <= 0) return 'today';
  if (age === 1) return 'yesterday';
  if (age < 7) return 'recent';
  return 'month';
}

/** Consecutive, recognizable time groups for a newest-first history. */
function groupHistory(entries: readonly MemoryDetail[], now: Date) {
  const locale = resolvedLocale();
  const groups: {
    key: string;
    kind: HistoryGroup;
    label?: string;
    entries: MemoryDetail[];
  }[] = [];
  for (const entry of entries) {
    const day = entryDay(entry);
    const kind = historyGroup(day, now);
    const date = new Date(day);
    const key =
      kind === 'month'
        ? `${date.getUTCFullYear()}-${date.getUTCMonth()}`
        : kind;
    const label =
      kind === 'month'
        ? new Intl.DateTimeFormat(locale, {
            month: 'long',
            ...(date.getUTCFullYear() === now.getFullYear()
              ? {}
              : { year: 'numeric' }),
            timeZone: 'UTC',
          }).format(date)
        : undefined;
    const last = groups.at(-1);
    if (last?.key === key) last.entries.push(entry);
    else groups.push({ key, kind, label, entries: [entry] });
  }
  return groups;
}

/** The question the partner answered first leads, so a reply lands in it. */
function awaitsReader(state: CoupleExperienceQuestionState | undefined) {
  return Boolean(
    state?.memoryId && state.answeredByPartner && !state.answeredByMe,
  );
}

export function CoupleExperiencePage({
  kind,
  accountId,
  apiBaseUrl,
  accessToken,
  spaceId,
  profilesApi,
  onSaved,
  loadEntitlement,
  loadParticipants,
  loadHistory,
  loadQuestions,
}: {
  kind: Experience;
  accountId: string;
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  profilesApi?: ProfilesApi | null;
  onSaved?: () => Promise<void>;
  loadEntitlement?: () => Promise<SpaceEntitlementView>;
  loadParticipants?: () => Promise<
    readonly [WhoOfUsParticipant, WhoOfUsParticipant] | null
  >;
  loadHistory?: (cursor?: string) => Promise<MemoryPage>;
  loadQuestions?: () => Promise<CoupleExperienceQuestions>;
}) {
  const { t } = useTranslation();
  const { nicknameFor } = usePartnerNickname();
  const location = useLocation();
  const [searchParams] = useSearchParams();
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
  const games = useMemo(() => new GamesApi(config), [config]);
  const origin =
    kind === 'happiness'
      ? ExperienceKind.HAPPINESS
      : ExperienceKind.TIME_TRAVEL;
  const route = kind === 'happiness' ? HAPPINESS_ROUTE : TIME_TRAVEL_ROUTE;
  const creating = location.pathname === `${route}/new`;
  const replyId = creating ? searchParams.get('replyTo') : null;
  const reply = useQuery({
    queryKey: [
      'couple-experience-reply',
      apiBaseUrl,
      accountId,
      spaceId,
      replyId,
    ],
    queryFn: async ({ signal }) => {
      if (!replyId) throw new Error('Experience reference is missing.');
      try {
        return await memories.getMemory(
          { spaceId, memoryId: replyId },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: Boolean(replyId),
    retry: false,
    gcTime: 0,
  });
  const scope = [apiBaseUrl, accountId, spaceId];
  const loadSpaceEntitlement = useMemo(
    () =>
      loadEntitlement
        ? () => loadEntitlement()
        : entitlementLoader(entitlements, spaceId),
    [entitlements, loadEntitlement, spaceId],
  );
  // Reuses the session's single entitlement read from app start.
  const entitlement = useSpaceEntitlement({
    accountId,
    spaceId,
    load: loadSpaceEntitlement,
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
  const questions = useQuery({
    queryKey: ['couple-experience-questions', ...scope, origin],
    queryFn: async ({ signal }) => {
      try {
        return await (loadQuestions
          ? loadQuestions()
          : games.getCoupleExperienceQuestions(
              { spaceId, kind: origin },
              { signal },
            ));
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: Boolean(allowed && partner && !creating),
    retry: false,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: (query) =>
      query.state.data
        ? Math.max(1000, query.state.data.refreshAfterSeconds * 1000)
        : false,
    refetchIntervalInBackground: false,
  });
  const pool = experienceCopy.questions[kind];
  const isKnownQuestion = (id: string) => Object.hasOwn(pool, id);
  const dailyIds = questions.data?.questionIds ?? [];
  const validQuestions =
    dailyIds.length === 3 &&
    new Set(dailyIds).size === 3 &&
    dailyIds.every(isKnownQuestion);
  const questionStates = new Map(
    (questions.data?.questionStates ?? []).map((state) => [
      state.questionId,
      state,
    ]),
  );
  const focusId = dailyIds.find((id) => awaitsReader(questionStates.get(id)));
  const focusState = focusId ? questionStates.get(focusId) : undefined;
  const partnerName = partner
    ? nicknameFor(partner.id) || partner.displayName
    : '';
  const selectedId = searchParams.get('question');
  const legacyPromptId = searchParams.get('prompt');
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
    ) : replyId && reply.isPending ? (
      <UiState kind="loading" title={t('states.loading.title')} />
    ) : replyId && (reply.error || reply.data?.experienceKind !== origin) ? (
      <ProblemState
        error={reply.error ?? new Error('Experience source is unavailable.')}
        onRetry={() => void reply.refetch()}
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
        key={`${apiBaseUrl}:${accountId}:${spaceId}:${origin}:${replyId ?? ''}`}
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
        accountId={accountId}
        spaceId={spaceId}
        experienceKind={origin}
        partnerName={partner?.displayName}
        experienceReply={reply.data}
        experienceQuestionId={
          !replyId && selectedId && isKnownQuestion(selectedId)
            ? selectedId
            : undefined
        }
        experienceQuestion={
          reply.data?.title ??
          (selectedId && isKnownQuestion(selectedId)
            ? t(`coupleExperiences.questions.${kind}.${selectedId}`)
            : isCoupleExperiencePromptId(legacyPromptId)
              ? t(`coupleExperiences.prompts.${kind}.${legacyPromptId}`)
              : undefined)
        }
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
        <>
          <section
            className="couple-experience-questions"
            aria-labelledby="experience-questions-heading"
          >
            <h2 id="experience-questions-heading">
              {t('coupleExperiences.questionsTitle')}
            </h2>
            {questions.isPending ? (
              <UiState kind="loading" title={t('states.loading.title')} />
            ) : questions.error || !validQuestions ? (
              <p>{t('coupleExperiences.questionsUnavailable')}</p>
            ) : (
              <>
                {focusId && focusState?.memoryId ? (
                  <div className="experience-question-focus">
                    <p className="experience-question-focus-by">
                      <span
                        className="experience-answer-avatar"
                        aria-hidden="true"
                      >
                        {personInitials(partnerName)}
                      </span>
                      {t('coupleExperiences.questionState.partnerAnswered', {
                        name: partnerName,
                      })}
                    </p>
                    <p className="experience-question-focus-text">
                      {t(`coupleExperiences.questions.${kind}.${focusId}`)}
                    </p>
                    <TaskOriginLink
                      className="button-link add-action"
                      to={`${route}/new?replyTo=${encodeURIComponent(focusState.memoryId)}`}
                    >
                      <AddActionContent
                        label={t('coupleExperiences.addOwnAnswer')}
                      />
                    </TaskOriginLink>
                  </div>
                ) : null}
                <ul>
                  {dailyIds
                    .filter((id) => id !== focusId)
                    .map((id) => {
                      const state = questionStates.get(id);
                      const answered = Boolean(
                        state?.answeredByMe && state.memoryId,
                      );
                      return (
                        <li key={id}>
                          <TaskOriginLink
                            to={
                              answered && state?.memoryId
                                ? memoryDetailPath(state.memoryId)
                                : `${route}/new?question=${encodeURIComponent(id)}`
                            }
                            ariaLabelledBy={`experience-question-${id}`}
                            ariaDescribedBy={
                              state
                                ? `experience-question-${id}-state`
                                : undefined
                            }
                          >
                            <span>
                              <span id={`experience-question-${id}`}>
                                {t(`coupleExperiences.questions.${kind}.${id}`)}
                              </span>
                              {state ? (
                                <span
                                  id={`experience-question-${id}-state`}
                                  className="experience-question-state"
                                >
                                  {state.answeredByMe && state.answeredByPartner
                                    ? t(
                                        'coupleExperiences.questionState.bothAnswered',
                                      )
                                    : state.answeredByMe
                                      ? t(
                                          'coupleExperiences.questionState.youAnswered',
                                        )
                                      : t(
                                          'coupleExperiences.questionState.open',
                                        )}
                                </span>
                              ) : null}
                            </span>
                            <span aria-hidden="true">›</span>
                          </TaskOriginLink>
                        </li>
                      );
                    })}
                </ul>
              </>
            )}
          </section>
          <TaskOriginLink
            className="button-link add-action experience-create-action"
            to={`${route}/new`}
          >
            <AddActionContent label={t(`coupleExperiences.create.${kind}`)} />
          </TaskOriginLink>
        </>
      )}
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
                groupHistory(
                  history.data.pages.flatMap((page) => page.items),
                  new Date(),
                ).map((group) => (
                  <section
                    key={group.key}
                    className="couple-experience-history-group"
                    aria-labelledby={`experience-history-${group.key}`}
                  >
                    <h3 id={`experience-history-${group.key}`}>
                      {group.label ??
                        t(`coupleExperiences.historyGroups.${group.kind}`)}
                    </h3>
                    <ul>
                      {group.entries.map((entry) => {
                        const answers = entry.experienceAnswers ?? [];
                        const awaitsMe =
                          allowed &&
                          Boolean(partner) &&
                          answers.length > 0 &&
                          answers.every(
                            (answer) => answer.author.id !== accountId,
                          );
                        return (
                          <li
                            key={entry.id}
                            className="couple-experience-history-entry"
                          >
                            <TaskOriginLink
                              to={memoryDetailPath(entry.id)}
                              className="couple-experience-history-link"
                            >
                              {entry.title ? (
                                <span className="couple-experience-entry-question">
                                  {entry.title}
                                </span>
                              ) : null}
                              {entry.experienceKind && answers.length ? (
                                <ExperienceAnswers
                                  answers={answers}
                                  kind={entry.experienceKind}
                                  preview
                                  viewerId={accountId}
                                  profilesApi={profilesApi}
                                  spaceId={spaceId}
                                />
                              ) : (
                                <span className="couple-experience-entry-words">
                                  <span className="couple-experience-author">
                                    {entry.author.displayName}
                                  </span>
                                  <span>{entry.body.slice(0, 280)}</span>
                                </span>
                              )}
                              {group.kind === 'month' ? (
                                <time dateTime={entry.createdAt.toISOString()}>
                                  {new Intl.DateTimeFormat(resolvedLocale(), {
                                    dateStyle: 'medium',
                                  }).format(
                                    entry.happenedOn ?? entry.createdAt,
                                  )}
                                </time>
                              ) : null}
                            </TaskOriginLink>
                            {awaitsMe ? (
                              <TaskOriginLink
                                className="button-link add-action experience-history-answer"
                                to={`${route}/new?replyTo=${encodeURIComponent(entry.id)}`}
                              >
                                <AddActionContent
                                  label={t('coupleExperiences.addOwnAnswer')}
                                />
                              </TaskOriginLink>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
              {history.hasNextPage ? (
                <AutoLoadMore
                  query={history}
                  className="secondary"
                  blocked={history.isFetchingNextPage}
                >
                  {t('coupleExperiences.more')}
                </AutoLoadMore>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApiRuntime } from '../client/apiRuntimeContext';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { createReferenceApis } from '../client/referenceFlow';
import {
  heartMomentDetailPath,
  memoryDetailPath,
  milestoneDetailPath,
} from '../client/routes';
import {
  type SharedPlanningApis,
  storyRelationTarget,
} from '../client/sharedPlanning';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import { AutoLoadMore } from './AutoLoadMore';
import { ProblemState } from './ProblemState';
import { RelationMomentPreview } from './RelationMomentPreview';
import { ContentChevron } from './SharedContentSheet';
import './PlanningRelationManager.css';
import './PlanStoryLinks.css';

/** Related entries keep their canonical content, authorization and return path. */
export function PlanStoryLinks({
  apis,
  spaceId,
  planId,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  planId: string;
}) {
  const { t } = useTranslation();
  const runtime = useApiRuntime();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const mediaApis = useMemo(
    () =>
      runtime
        ? createReferenceApis(runtime.apiBaseUrl, runtime.accessToken)
        : null,
    [runtime],
  );
  const linked = useInfiniteQuery({
    queryKey: authorSummaryQueryKeys.planStory(spaceId, planId),
    initialPageParam: null as string | null,
    retry: false,
    queryFn: async ({ pageParam, signal }) => {
      try {
        return await apis.plans.listPlanStory(
          { spaceId, planId, cursor: pageParam, limit: 50 },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    getNextPageParam: (page, _pages, last, cursors) => {
      const next = page.nextCursor;
      return next && next !== last && !cursors.includes(next)
        ? next
        : undefined;
    },
  });
  const denied = ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(linked.error),
  );
  const items = denied
    ? []
    : (linked.data?.pages.flatMap((page) => page.items) ?? []).filter(
        (item) =>
          item.kind !== 'HEART_MOMENT' ||
          item.heartMoment.visibility === 'SHARED',
      );
  if (
    !linked.isPending &&
    !linked.error &&
    !items.length &&
    !linked.hasNextPage
  )
    return null;
  return (
    <section
      className="planen-section plan-story-links"
      aria-labelledby="plan-story-links-heading"
    >
      <h2 id="plan-story-links-heading">{t('m5s3.planStory.linksHeading')}</h2>
      {linked.isPending ? (
        <p role="status">
          {t(
            linked.fetchStatus === 'paused'
              ? 'states.offline.title'
              : 'states.loading.title',
          )}
        </p>
      ) : null}
      {linked.error ? (
        <ProblemState
          error={linked.error}
          onRetry={() => void linked.refetch()}
        />
      ) : null}
      <ul className="planning-relation-list">
        {items.map((item) => {
          const target = storyRelationTarget(item);
          const path =
            target.kind === 'MEMORY'
              ? memoryDetailPath(target.id)
              : target.kind === 'HEART_MOMENT'
                ? heartMomentDetailPath(target.id)
                : milestoneDetailPath(target.id);
          return (
            <li key={`${target.kind}:${target.id}`}>
              <Link
                className="planning-relation-target relation-moment-link"
                to={path}
                onClick={(event) => {
                  if (
                    event.button ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.altKey ||
                    event.shiftKey
                  )
                    return;
                  event.preventDefault();
                  void navigate(path, {
                    state: {
                      taskOriginKey: captureOrigin({
                        planningSegment: 'plans',
                        selectedKey: planId,
                      }),
                    },
                  });
                }}
              >
                <RelationMomentPreview
                  target={target}
                  spaceId={spaceId}
                  mediaApis={mediaApis}
                />
                <ContentChevron />
              </Link>
            </li>
          );
        })}
      </ul>
      <AutoLoadMore query={linked} blocked={Boolean(linked.error)}>
        {t('m5s3.common.loadMore')}
      </AutoLoadMore>
    </section>
  );
}

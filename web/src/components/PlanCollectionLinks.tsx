import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { assertOnlineWrite } from '../client/connectivity';
import {
  normalizeClientError,
  ClientProblemError,
} from '../client/problemDetails';
import { sortByProductLabel } from '../client/productLabelOrder';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { collectionDetailPath, MORE_COLLECTIONS_ROUTE } from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTaskActivation } from '../client/useTaskActivation';
import { resolvedLocale, useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { DestinationIcon } from './DestinationIcon';
import { ListEntryIconButton } from './ListEntryActions';
import { ProblemState } from './ProblemState';
import { ContentChevron } from './SharedContentSheet';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './PlanCollectionLinks.css';
import './SharedContentPages.css';

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

/** References keep their original list identity and independent completion lifecycle. */
export function PlanCollectionLinks({
  apis,
  spaceId,
  plan,
  disabled,
  editing = false,
  onNavigate,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  plan: PlanDetail;
  disabled: boolean;
  editing?: boolean;
  onNavigate?: (destination: () => void) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const inFlight = useRef(false);
  const canManage = editing && plan.capabilities.canEdit;
  const capture = useTaskActivation(canManage);
  const mutationKey = ['plan-write', spaceId, plan.id] as const;
  const key = authorSummaryQueryKeys.planCollections(spaceId, plan.id);
  const linked = useQuery({
    queryKey: key,
    retry: false,
    queryFn: ({ signal }) =>
      apiCall(() =>
        apis.plans.listPlanCollections(
          { spaceId, planId: plan.id },
          { signal },
        ),
      ),
  });
  const choices = useInfiniteQuery({
    queryKey: ['m5-s3', 'collections', spaceId, 'plan-choice', plan.id],
    enabled: open && canManage,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      apiCall(() =>
        apis.collections.listCollections(
          { spaceId, scope: 'ALL', cursor: pageParam, limit: 100 },
          { signal },
        ),
      ),
    getNextPageParam: (page, _pages, last, cursors) => {
      const next = page.nextCursor;
      return next && next !== last && !cursors.includes(next)
        ? next
        : undefined;
    },
  });
  useEffect(() => {
    if (open && choices.hasNextPage && !choices.isFetching && !choices.error)
      void choices.fetchNextPage();
  }, [
    open,
    choices.hasNextPage,
    choices.isFetching,
    choices.error,
    choices.fetchNextPage,
  ]);
  const lists = sortByProductLabel(
    linked.data ?? [],
    (list) => list.title,
    resolvedLocale(),
  );
  const items = sortByProductLabel(
    (choices.data?.pages.flatMap((page) => page.items) ?? []).filter(
      (item) => !lists.some((list) => list.id === item.id),
    ),
    (list) => list.title,
    resolvedLocale(),
  );
  const assembling =
    choices.isPending || choices.isFetching || choices.hasNextPage;
  const mutation = useMutation({
    mutationKey,
    networkMode: 'always',
    retry: false,
    mutationFn: async (intent: {
      ids: string[];
      unlink: boolean;
      owns: () => boolean;
    }) => {
      assertOnlineWrite();
      for (const collectionId of intent.ids) {
        if (!intent.owns()) throw new ClientProblemError('permission');
        await apiCall(() =>
          intent.unlink
            ? apis.plans.unlinkPlanCollection({
                spaceId,
                planId: plan.id,
                collectionId,
              })
            : apis.plans.linkPlanCollection({
                spaceId,
                planId: plan.id,
                collectionId,
              }),
        );
      }
    },
    onSettled: (_data, _error, intent) => {
      inFlight.current = false;
      if (intent.owns()) void client.invalidateQueries({ queryKey: key });
    },
  });
  const linkedSuccessfully =
    mutation.isSuccess &&
    !mutation.variables.unlink &&
    mutation.variables.owns() &&
    !disabled;
  useEffect(() => {
    if (!linkedSuccessfully) return;
    // Restore focus only after the shared Plan write guard enables the trigger.
    setSelected([]);
    setOpen(false);
  }, [linkedSuccessfully]);
  function mutate(ids: string[], unlink: boolean) {
    if (
      !ids.length ||
      disabled ||
      inFlight.current ||
      !canManage ||
      client.isMutating({ mutationKey, exact: true }) > 0 ||
      linked.error
    )
      return;
    const ownsTask = capture();
    const ownsPlan = captureAuthorizedQuery(
      client,
      authorSummaryQueryKeys.planDetail(spaceId, plan.id),
    );
    const ownsLists = captureAuthorizedQuery(client, key);
    inFlight.current = true;
    mutation.mutate({
      ids,
      unlink,
      owns: () => ownsTask() && ownsPlan() && ownsLists(),
    });
  }
  const pending = disabled || mutation.isPending;
  function openDestination(path: string) {
    const follow = () =>
      void navigate(path, {
        state: {
          taskOriginKey: captureOrigin({
            selectedKey: plan.id,
            planningSegment: 'plans',
          }),
        },
      });
    if (onNavigate) onNavigate(follow);
    else follow();
  }
  if (!canManage && !linked.isPending && !linked.error && !lists.length)
    return null;
  return (
    <section
      className="planen-section plan-collection-links"
      aria-labelledby="plan-lists-heading"
    >
      <h2 id="plan-lists-heading">{t('m5s3.collection.planHeading')}</h2>
      {linked.isPending ? (
        <p role="status">{t('states.loading.title')}</p>
      ) : null}
      {linked.error ? (
        <ProblemState
          error={linked.error}
          onRetry={() => void linked.refetch()}
        />
      ) : null}
      {!linked.isPending && !linked.error && !lists.length ? (
        <p className="muted">{t('m5s3.collection.planEmpty')}</p>
      ) : null}
      <ul className="content-overview-list">
        {lists.map((list) => (
          <li key={list.id} className="plan-collection-row">
            <Link
              className="content-overview-row"
              to={collectionDetailPath(list.id)}
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
                openDestination(collectionDetailPath(list.id));
              }}
            >
              <span className="content-overview-icon">
                <DestinationIcon icon="collections" />
              </span>
              <span className="content-overview-copy">
                <strong>{list.title}</strong>
                <span className="muted">
                  {t('m5s3.collection.progress', {
                    count: list.items.length,
                    completed: list.items.filter((item) => item.completed)
                      .length,
                  })}
                </span>
              </span>
              <ContentChevron />
            </Link>
            {canManage ? (
              <ListEntryIconButton
                icon="unlink"
                className="tertiary"
                label={t('m5s3.collection.unlink', { title: list.title })}
                disabled={pending || Boolean(linked.error)}
                onClick={() => mutate([list.id], true)}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <AddActionButton
          ref={trigger}
          label={t('m5s3.collection.create')}
          disabled={pending || linked.isPending || Boolean(linked.error)}
          onClick={() => {
            mutation.reset();
            setSelected([]);
            setOpen(true);
          }}
        />
      ) : null}
      {mutation.error ? <ProblemState error={mutation.error} /> : null}
      <ShortTaskSheet
        ref={sheet}
        open={open && canManage}
        title={t('m5s3.collection.choose')}
        restoreFocusRef={trigger}
        isDirty={selected.length > 0}
        isCloseBlocked={mutation.isPending}
        onClose={() => {
          setOpen(false);
          setSelected([]);
        }}
      >
        <div className="plan-collection-picker">
          {assembling ? <p role="status">{t('states.loading.title')}</p> : null}
          {choices.error ? (
            <ProblemState
              error={choices.error}
              onRetry={() => void choices.refetch()}
            />
          ) : null}
          {!assembling && !choices.error ? (
            <>
              {!items.length ? <p>{t('m5s3.collection.noChoices')}</p> : null}
              <ul className="plan-collection-choices">
                {items.map((list) => (
                  <li key={list.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.includes(list.id)}
                        disabled={mutation.isPending}
                        onChange={(event) =>
                          setSelected((previous) =>
                            event.target.checked
                              ? [...previous, list.id]
                              : previous.filter((id) => id !== list.id),
                          )
                        }
                      />
                      <span>
                        <strong>{list.title}</strong>
                        <span className="muted">
                          {t('m5s3.collection.progress', {
                            count: list.items.length,
                            completed: list.items.filter(
                              (item) => item.completed,
                            ).length,
                          })}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {mutation.error ? <ProblemState error={mutation.error} /> : null}
          <button
            type="button"
            disabled={
              pending ||
              Boolean(assembling) ||
              Boolean(choices.error) ||
              !selected.some((id) => items.some((item) => item.id === id))
            }
            onClick={() =>
              mutate(
                selected.filter((id) => items.some((item) => item.id === id)),
                false,
              )
            }
          >
            {mutation.isPending
              ? t('m5s3.common.saving')
              : t('m5s3.collection.link')}
          </button>
          <AddActionButton
            label={t('m5s3.collection.createNew')}
            disabled={mutation.isPending}
            onClick={() => {
              sheet.current?.closeForNavigation(() =>
                openDestination(`${MORE_COLLECTIONS_ROUTE}/new`),
              );
            }}
          />
        </div>
      </ShortTaskSheet>
    </section>
  );
}

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MemoryPlanningRelationsApi } from '../api/generated/apis/MemoryPlanningRelationsApi';
import { Configuration } from '../client/apiConfiguration';
import { assertOnlineWrite } from '../client/connectivity';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { sortByProductLabel } from '../client/productLabelOrder';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { planDetailPath, wishDetailPath } from '../client/routes';
import { createSharedPlanningApis } from '../client/sharedPlanning';
import { resolvedLocale, useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { AutoLoadMore } from './AutoLoadMore';
import { EimirIcon } from './EimirIcon';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet } from './ShortTaskSheet';
import { TodayDestinationLink } from './TodayDestinationLink';
import './MemoryPlanningLinks.css';

type Kind = 'plans' | 'wishes';
type Target = { id: string; title: string; kind: Kind };
type Props = {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  memoryId: string;
  canManage: boolean;
  editing?: boolean;
  offline: boolean;
  initialPlanId?: string;
  onInitialPlanConsumed?: () => void;
};

export function MemoryPlanningLinks(props: Props) {
  return (
    <ScopedMemoryPlanningLinks
      key={JSON.stringify([
        props.apiBaseUrl,
        props.accountId,
        props.spaceId,
        props.memoryId,
      ])}
      {...props}
    />
  );
}

function ScopedMemoryPlanningLinks({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  memoryId,
  canManage,
  editing = false,
  offline,
  initialPlanId,
  onInitialPlanConsumed,
}: Props) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const apis = useMemo(
    () => createSharedPlanningApis(apiBaseUrl, accessToken),
    [apiBaseUrl, accessToken],
  );
  const relations = useMemo(
    () =>
      new MemoryPlanningRelationsApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [apiBaseUrl, accessToken],
  );
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('plans');
  const writeLock = useRef(false);
  const sourceApplied = useRef(false);
  const queryKey = [
    'memory-planning',
    apiBaseUrl,
    accountId,
    spaceId,
    memoryId,
  ];
  const linked = useQuery({
    queryKey,
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        const [plans, wishes] = await Promise.all([
          relations.listMemoryPlans({ spaceId, memoryId }, { signal }),
          relations.listMemoryWishes({ spaceId, memoryId }, { signal }),
        ]);
        return await Promise.all([
          ...plans.items.map(
            async (planId): Promise<Target> => ({
              ...(await apis.plans.getPlan({ spaceId, planId }, { signal })),
              kind: 'plans',
            }),
          ),
          ...wishes.items.map(
            async (wishId): Promise<Target> => ({
              ...(await apis.wishes.getWish({ spaceId, wishId }, { signal })),
              kind: 'wishes',
            }),
          ),
        ]);
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
  });
  const mutation = useMutation({
    mutationKey: [...queryKey, 'write'],
    networkMode: 'always',
    retry: false,
    onMutate: () => ({ current: captureAuthorizedQuery(client, queryKey) }),
    mutationFn: async ({
      kind: selected,
      id,
      remove = false,
    }: {
      kind: Kind;
      id: string;
      remove?: boolean;
    }) => {
      assertOnlineWrite();
      const request = { spaceId, memoryId, targetId: id };
      try {
        if (selected === 'plans') {
          if (remove) await relations.unlinkMemoryPlan(request);
          else await relations.linkMemoryPlan(request);
        } else {
          if (remove) await relations.unlinkMemoryWish(request);
          else await relations.linkMemoryWish(request);
        }
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async (_value, request, context) => {
      if (!context?.current()) return;
      setOpen(false);
      if (
        request.kind === 'plans' &&
        request.id === initialPlanId &&
        !request.remove
      )
        onInitialPlanConsumed?.();
      await client.invalidateQueries({ queryKey });
    },
    onSettled: () => {
      writeLock.current = false;
    },
  });
  const save = useCallback(
    (kind: Kind, id: string, remove = false) => {
      if (writeLock.current || !canManage || offline || !linked.data) return;
      writeLock.current = true;
      mutation.mutate({ kind, id, remove });
    },
    [canManage, offline, linked.data, mutation.mutate],
  );
  useEffect(() => {
    if (
      !initialPlanId ||
      !linked.data ||
      sourceApplied.current ||
      !canManage ||
      offline
    )
      return;
    sourceApplied.current = true;
    if (
      !linked.data.some(
        (item) => item.kind === 'plans' && item.id === initialPlanId,
      )
    )
      save('plans', initialPlanId);
    else onInitialPlanConsumed?.();
  }, [
    initialPlanId,
    linked.data,
    canManage,
    offline,
    save,
    onInitialPlanConsumed,
  ]);
  const denied = ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(linked.error),
  );
  const targets = denied ? [] : (linked.data ?? []);
  if (!canManage && !targets.length) return null;
  if (!editing && !targets.length && !linked.error && !mutation.error)
    return null;
  return (
    <section
      className="memory-planning-links"
      aria-label={t('memoryProduct.planning.heading')}
    >
      {targets.length ? (
        <>
          <h2>{t('memoryProduct.planning.heading')}</h2>
          <ul>
            {targets.map((target) => (
              <li key={`${target.kind}:${target.id}`}>
                <TodayDestinationLink
                  className="memory-planning-destination"
                  to={
                    target.kind === 'plans'
                      ? planDetailPath(target.id)
                      : wishDetailPath(target.id)
                  }
                >
                  <EimirIcon
                    name={target.kind === 'plans' ? 'kalender' : 'wuensche'}
                  />
                  <span>
                    <span className="memory-planning-kind">
                      {t(
                        target.kind === 'plans'
                          ? 'memoryProduct.planning.linkedPlan'
                          : 'memoryProduct.planning.linkedWish',
                      )}
                    </span>
                    <strong>{target.title}</strong>
                  </span>
                  <EimirIcon name="chevron-right" />
                </TodayDestinationLink>
                {canManage && editing ? (
                  <button
                    type="button"
                    className="tertiary"
                    disabled={offline || mutation.isPending}
                    aria-label={t('memoryProduct.planning.remove', {
                      title: target.title,
                    })}
                    onClick={() => save(target.kind, target.id, true)}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {canManage && editing ? (
        <AddActionButton
          label={t('memoryProduct.planning.add')}
          disabled={offline || linked.isLoading || denied || mutation.isPending}
          onClick={() => setOpen(true)}
        />
      ) : null}
      {linked.error && canManage ? (
        <ProblemState
          error={linked.error}
          onRetry={() => void linked.refetch()}
        />
      ) : null}
      {mutation.error ? (
        <ProblemState
          error={mutation.error}
          onRetry={() => {
            const request = mutation.variables;
            if (request) save(request.kind, request.id, request.remove);
          }}
        />
      ) : null}
      <ShortTaskSheet
        open={open && editing}
        onClose={() => {
          if (!mutation.isPending) setOpen(false);
        }}
        title={t('memoryProduct.planning.add')}
      >
        <fieldset
          className="planning-status-scope"
          aria-label={t('memoryProduct.planning.heading')}
        >
          {(['plans', 'wishes'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              disabled={mutation.isPending}
              onClick={() => setKind(value)}
            >
              {t(`memoryProduct.planning.${value}`)}
            </button>
          ))}
        </fieldset>
        {open ? (
          <PlanningTargetPicker
            key={kind}
            kind={kind}
            apis={apis}
            apiBaseUrl={apiBaseUrl}
            accountId={accountId}
            spaceId={spaceId}
            linked={targets}
            disabled={mutation.isPending || offline}
            onSelect={(id) => save(kind, id)}
          />
        ) : null}
      </ShortTaskSheet>
    </section>
  );
}

function PlanningTargetPicker({
  kind,
  apis,
  apiBaseUrl,
  accountId,
  spaceId,
  linked,
  disabled,
  onSelect,
}: {
  kind: Kind;
  apis: ReturnType<typeof createSharedPlanningApis>;
  apiBaseUrl: string;
  accountId: string;
  spaceId: string;
  linked: Target[];
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const query = useInfiniteQuery({
    queryKey: [
      'planning-link-candidates',
      apiBaseUrl,
      accountId,
      spaceId,
      kind,
    ],
    initialPageParam: null as string | null,
    retry: false,
    queryFn: async ({ pageParam, signal }) => {
      try {
        const params = { spaceId, cursor: pageParam, limit: 30 };
        return kind === 'plans'
          ? await apis.plans.listPlans(params, { signal })
          : await apis.wishes.listWishes(params, { signal });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    getNextPageParam: (page, _pages, previous, params) =>
      page.nextCursor &&
      page.nextCursor !== previous &&
      !params.includes(page.nextCursor)
        ? page.nextCursor
        : undefined,
  });
  const denied = ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(query.error),
  );
  useEffect(() => {
    if (query.hasNextPage && !query.isFetching && !query.error)
      void query.fetchNextPage();
  }, [query.hasNextPage, query.isFetching, query.error, query.fetchNextPage]);
  const assembling = Boolean(query.hasNextPage && !query.error);
  const items = denied
    ? []
    : sortByProductLabel(
        query.data?.pages.flatMap((page) =>
          page.items.map((item) => ({ id: item.id, title: item.title })),
        ) ?? [],
        (item) => item.title,
        resolvedLocale(),
      );
  return (
    <>
      {query.isLoading || assembling ? (
        <p role="status">{t('m5s3.common.loadingMore')}</p>
      ) : null}
      {query.error ? (
        <ProblemState
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {!query.isLoading && !query.error && !items.length ? (
        <p>{t('memoryProduct.planning.empty')}</p>
      ) : null}
      <ul className="memory-planning-choices">
        {(assembling ? [] : items).map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="secondary"
              disabled={
                disabled ||
                linked.some(
                  (target) => target.kind === kind && target.id === item.id,
                )
              }
              onClick={() => onSelect(item.id)}
            >
              {item.title}
            </button>
          </li>
        ))}
      </ul>
      <AutoLoadMore query={query}>{t('m5s3.common.loadMore')}</AutoLoadMore>
    </>
  );
}

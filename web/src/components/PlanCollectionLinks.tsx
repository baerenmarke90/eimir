import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { PlanningDiscardConfirmation } from './PlanningEditorLifecycle';
import { AddActionButton } from './AddAction';
import { CollectionProductPage } from './CollectionProductPage';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { ComposerChip } from './PageComposer';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { assertOnlineWrite } from '../client/connectivity';
import {
  normalizeClientError,
  ClientProblemError,
} from '../client/problemDetails';
import { sortByProductLabel } from '../client/productLabelOrder';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTaskActivation } from '../client/useTaskActivation';
import { resolvedLocale, useTranslation } from '../i18n';
import { CollectionChoicePicker } from './CollectionChoicePicker';
import { DestinationIcon } from './DestinationIcon';
import { ListEntryIconButton } from './ListEntryActions';
import { ProblemState } from './ProblemState';
import { ContentChevron } from './SharedContentSheet';
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
  renderTrigger,
}: {
  renderTrigger?: (open: () => void) => ReactNode;
  apis: SharedPlanningApis;
  spaceId: string;
  plan: PlanDetail;
  disabled: boolean;
  editing?: boolean;
  onNavigate?: (destination: () => void) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const inFlight = useRef(false);
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [listPending, setListPending] = useState(false);
  const [listDirty, setListDirty] = useState(false);
  const [confirmListDiscard, setConfirmListDiscard] = useState(false);
  const [discardListConfirmed, setDiscardListConfirmed] = useState(false);
  const listContent = useRef<HTMLDivElement>(null);
  const listTrigger = useRef<HTMLButtonElement>(null);
  const listSheet = useRef<ShortTaskSheetHandle>(null);
  const openChoices = useRef<() => void>(() => {});
  useEffect(() => {
    if (!discardListConfirmed || listDirty || listPending) return;
    setDiscardListConfirmed(false);
    listSheet.current?.requestClose();
  }, [discardListConfirmed, listDirty, listPending]);
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
  const lists = sortByProductLabel(
    linked.data ?? [],
    (list) => list.title,
    resolvedLocale(),
  );
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
  async function mutate(ids: string[], unlink: boolean) {
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
    await mutation.mutateAsync({
      ids,
      unlink,
      owns: () => ownsTask() && ownsPlan() && ownsLists(),
    });
  }
  const pending = disabled || mutation.isPending;
  if (!canManage && !linked.isPending && !linked.error && !lists.length)
    return null;
  return (
    <section
      className="planen-section plan-collection-links"
      aria-labelledby="plan-lists-heading"
    >
      <h2 id="plan-lists-heading" className={editing ? 'sr-only' : undefined}>
        {t('m5s3.collection.planHeading')}
      </h2>
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
      <ul
        className={
          editing
            ? 'composer-selected-chips plan-collection-chips'
            : 'content-overview-list'
        }
      >
        {lists.map((list) => (
          <li key={list.id} className="plan-collection-row">
            {editing ? (
              <ComposerChip icon="listen" onClick={() => openChoices.current()}>
                {list.title}
              </ComposerChip>
            ) : (
              <button
                type="button"
                className="content-overview-row tertiary"
                disabled={disabled}
                onClick={(event) => {
                  listTrigger.current = event.currentTarget;
                  setListDirty(false);
                  setSelectedList(list.id);
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
              </button>
            )}
            {canManage ? (
              <ListEntryIconButton
                icon="unlink"
                className="tertiary"
                label={t('m5s3.collection.unlink', { title: list.title })}
                disabled={pending || Boolean(linked.error)}
                onClick={() => void mutate([list.id], true).catch(() => {})}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <CollectionChoicePicker
          apis={apis}
          spaceId={spaceId}
          excludedIds={lists.map((list) => list.id)}
          disabled={pending || linked.isPending || Boolean(linked.error)}
          renderTrigger={(open) => {
            const beginChoice = () => {
              listTrigger.current =
                document.activeElement instanceof HTMLButtonElement
                  ? document.activeElement
                  : null;
              open();
            };
            openChoices.current = beginChoice;
            return renderTrigger ? (
              renderTrigger(beginChoice)
            ) : (
              <AddActionButton
                label={t('m5s3.collection.create')}
                icon="listen"
                disabled={pending || linked.isPending || Boolean(linked.error)}
                onClick={beginChoice}
              />
            );
          }}
          onChoose={(items) =>
            mutate(
              items.map((item) => item.id),
              false,
            )
          }
        />
      ) : null}
      <ShortTaskSheet
        ref={listSheet}
        open={selectedList !== null}
        title={
          lists.find((list) => list.id === selectedList)?.title ??
          t('m5s3.collection.planHeading')
        }
        restoreFocusRef={listTrigger}
        isCloseBlocked={listPending}
        isDirty={listDirty}
        onDiscardRequested={() => setConfirmListDiscard(true)}
        onClose={() => {
          setSelectedList(null);
          setListDirty(false);
          setConfirmListDiscard(false);
          setDiscardListConfirmed(false);
          void client.invalidateQueries({ queryKey: key });
        }}
        footer={
          <button
            type="button"
            disabled={listPending}
            onClick={() => listSheet.current?.requestClose()}
          >
            {t('experiences.finish')}
          </button>
        }
      >
        {confirmListDiscard ? (
          <PlanningDiscardConfirmation
            onKeepEditing={() => {
              setConfirmListDiscard(false);
              listContent.current
                ?.querySelector<HTMLInputElement>('input[name="title"]')
                ?.focus();
            }}
            onDiscard={() => {
              setListDirty(false);
              setDiscardListConfirmed(true);
            }}
          />
        ) : null}
        <div ref={listContent}>
          {selectedList ? (
            <CollectionProductPage
              apis={apis}
              spaceId={spaceId}
              collectionId={selectedList}
              embedded
              onPendingChange={setListPending}
              onDirtyChange={(dirty) => {
                setListDirty(dirty);
                if (!dirty) setConfirmListDiscard(false);
              }}
            />
          ) : null}
        </div>
      </ShortTaskSheet>
      {mutation.error ? <ProblemState error={mutation.error} /> : null}
    </section>
  );
}

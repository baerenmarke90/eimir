import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CollectionsApi } from '../api/generated/apis/CollectionsApi';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import {
  reconcileCollectionItemUpdate,
  rollbackCollectionItemUpdate,
} from '../client/collectionItemUpdate';
import { assertOnlineWrite, isClientOnline } from '../client/connectivity';
import { normalizeClientError } from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { collectionDetailPath } from '../client/routes';
import { sharedAchievementKind } from '../client/sharedAchievements';
import { planningIfMatch } from '../client/sharedPlanning';
import { postSnackbar } from '../client/snackbar';
import { useTranslation } from '../i18n';
import { ChecklistToggle } from './ChecklistToggle';
import { AddIcon } from './DestinationIcon';
import { ProblemState } from './ProblemState';
import { SharedAchievementCelebration } from './SharedAchievementCelebration';
import { ShortTaskSheet } from './ShortTaskSheet';

const CELEBRATION_DISMISS_MS = 3_600;

type ToggleVariables = {
  itemId: string;
  completed: boolean;
  fallbackItem: CollectionItemDetail;
  operationId: number;
  state: ToggleState;
  isCurrentQuery: () => boolean;
  key: ReturnType<typeof authorSummaryQueryKeys.collectionDetail>;
  spaceId: string;
  collectionId: string;
  scope: string;
  title: string;
};

type ToggleState = {
  scope: string;
  isCurrentQuery: () => boolean;
  active: boolean;
  latest: Map<string, number>;
  intended: Map<string, boolean>;
  confirmed: Map<string, CollectionItemDetail>;
  queue: Map<string, Promise<ToggleResult | undefined>>;
};

type ToggleResult = {
  item: CollectionItemDetail;
  achievement: ReturnType<typeof sharedAchievementKind>;
};

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

function replaceItem(
  collection: CollectionDetail,
  itemId: string,
  replacement: CollectionItemDetail,
): CollectionDetail {
  return {
    ...collection,
    items: collection.items.map((item) =>
      item.id === itemId ? replacement : item,
    ),
  };
}

export function TodayPinnedCollection({
  api,
  accountId,
  spaceId,
  collection,
  sharedAchievementsEnabled = false,
}: {
  api: CollectionsApi;
  accountId: string;
  spaceId: string;
  collection: CollectionDetail;
  sharedAchievementsEnabled?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const collectionKey = authorSummaryQueryKeys.collectionDetail(
    spaceId,
    collection.id,
  );
  const celebrationScope = `${accountId}:${spaceId}:${collection.id}`;
  const [celebratedScope, setCelebratedScope] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState('');
  const [addValidationError, setAddValidationError] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const previousScopeRef = useRef(celebrationScope);
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const discardHeadingRef = useRef<HTMLHeadingElement>(null);
  const toggleSequenceRef = useRef(0);
  const query = queryClient
    .getQueryCache()
    .find({ queryKey: collectionKey, exact: true });
  // A replacement query or task receives independent online intent ownership.
  const toggleState = useMemo<ToggleState>(
    () => ({
      scope: celebrationScope,
      isCurrentQuery: query
        ? captureAuthorizedQuery(queryClient, query.queryKey)
        : () => false,
      active: true,
      latest: new Map(),
      intended: new Map(),
      confirmed: new Map(),
      queue: new Map(),
    }),
    [celebrationScope, query, queryClient],
  );
  const activeToggleStateRef = useRef(toggleState);
  activeToggleStateRef.current = toggleState;
  const ownsQuery = (variables: ToggleVariables) =>
    variables.isCurrentQuery() &&
    activeToggleStateRef.current === variables.state;
  const ownsToggle = (variables: ToggleVariables) =>
    ownsQuery(variables) && variables.state.active;
  const showSharedAchievement =
    sharedAchievementsEnabled && celebratedScope === celebrationScope;

  const sortedItems = [...collection.items].sort(
    (left, right) => left.position - right.position,
  );
  const todayItems = [
    ...sortedItems.filter((item) => !item.completed),
    ...sortedItems.filter((item) => item.completed),
  ];
  const items = expanded ? todayItems : todayItems.slice(0, 4);
  const remaining = Math.max(0, todayItems.length - items.length);
  const canExpand = todayItems.length > 4;

  useEffect(() => {
    for (const item of collection.items) {
      const confirmed = toggleState.confirmed.get(item.id);
      if (!confirmed || item.version > confirmed.version) {
        toggleState.confirmed.set(item.id, item);
      }
    }
  }, [collection.items, toggleState]);

  useEffect(() => {
    toggleState.active = true;
    return () => {
      toggleState.active = false;
    };
  }, [toggleState]);

  useEffect(() => {
    if (previousScopeRef.current === celebrationScope) return;
    previousScopeRef.current = celebrationScope;
    setExpanded(false);
    setCelebratedScope(null);
    setAddOpen(false);
    setAddDraft('');
    setAddValidationError(false);
    setShowDiscardConfirm(false);
  }, [celebrationScope]);

  useEffect(() => {
    if (!showSharedAchievement) return;
    const timer = setTimeout(
      () =>
        setCelebratedScope((scope) =>
          scope === celebrationScope ? null : scope,
        ),
      CELEBRATION_DISMISS_MS,
    );
    return () => clearTimeout(timer);
  }, [celebrationScope, showSharedAchievement]);

  useEffect(() => {
    if (showDiscardConfirm) discardHeadingRef.current?.focus();
  }, [showDiscardConfirm]);

  const toggleItem = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async (
      variables: ToggleVariables,
    ): Promise<ToggleResult | undefined> => {
      const state = variables.state;
      const previous = state.queue.get(variables.itemId);
      const request = (previous ?? Promise.resolve())
        .catch(() => undefined)
        .then(async () => {
          if (!ownsToggle(variables)) return;
          const currentItem = queryClient
            .getQueryData<CollectionDetail>(variables.key)
            ?.items.find((entry) => entry.id === variables.itemId);
          if (!currentItem) return;
          assertOnlineWrite();
          const confirmed =
            state.confirmed.get(variables.itemId) ?? variables.fallbackItem;
          // Cache refreshes may be newer than the effect that records confirmations.
          const submitted =
            currentItem.version > confirmed.version ? currentItem : confirmed;
          const response = await apiCall(() =>
            api.updateCollectionItemRaw({
              spaceId: variables.spaceId,
              collectionId: variables.collectionId,
              itemId: variables.itemId,
              ifMatch: planningIfMatch(submitted),
              collectionItemUpdate: { completed: variables.completed },
            }),
          );
          const updatedItem = await response.value();
          const latest = state.confirmed.get(variables.itemId);
          if (
            ownsQuery(variables) &&
            (!latest || updatedItem.version > latest.version)
          ) {
            state.confirmed.set(variables.itemId, updatedItem);
          }
          return {
            item: updatedItem,
            achievement: sharedAchievementKind(response.raw),
          };
        });
      state.queue.set(variables.itemId, request);
      try {
        return await request;
      } finally {
        if (state.queue.get(variables.itemId) === request) {
          state.queue.delete(variables.itemId);
        }
      }
    },
    onMutate: async (variables) => {
      if (!ownsToggle(variables)) return;
      await queryClient.cancelQueries({
        queryKey: variables.key,
        exact: true,
      });
      if (
        !ownsToggle(variables) ||
        variables.state.latest.get(variables.itemId) !== variables.operationId
      )
        return;

      const current = queryClient.getQueryData<CollectionDetail>(variables.key);
      const target = current?.items.find(
        (item) => item.id === variables.itemId,
      );
      if (
        !current ||
        !target ||
        target.version !== variables.fallbackItem.version
      )
        return;
      if (!variables.state.confirmed.has(target.id)) {
        variables.state.confirmed.set(target.id, target);
      }
      queryClient.setQueryData<CollectionDetail>(
        variables.key,
        replaceItem(current, target.id, {
          ...target,
          completed: variables.completed,
        }),
      );
      setCelebratedScope(null);
    },
    onSuccess: (result, variables) => {
      if (!ownsQuery(variables)) return;
      const isLatest =
        variables.state.latest.get(variables.itemId) === variables.operationId;
      // A queued intent whose task ended never reached the server.
      if (!result) {
        if (!isLatest) return;
        variables.state.latest.delete(variables.itemId);
        variables.state.intended.delete(variables.itemId);
        const confirmed = variables.state.confirmed.get(variables.itemId);
        if (confirmed)
          queryClient.setQueryData<CollectionDetail>(variables.key, (current) =>
            rollbackCollectionItemUpdate(
              reconcileCollectionItemUpdate(current, confirmed, {
                completed: confirmed.completed,
              }),
              confirmed,
              variables.completed,
            ),
          );
        return;
      }
      const reconciled = queryClient.setQueryData<CollectionDetail>(
        variables.key,
        (current) =>
          reconcileCollectionItemUpdate(
            current,
            result.item,
            isLatest ? { completed: variables.completed } : {},
          ),
      );

      if (!isLatest) return;

      variables.state.latest.delete(variables.itemId);
      variables.state.intended.delete(variables.itemId);
      if (!ownsToggle(variables)) return;
      const accepted = reconciled?.items.find(
        (entry) => entry.id === result.item.id,
      );
      const allComplete =
        Boolean(reconciled?.items.length) &&
        reconciled?.items.every((item) => item.completed) === true;

      if (
        sharedAchievementsEnabled &&
        accepted?.version === result.item.version &&
        accepted.completed === result.item.completed &&
        result.achievement === 'collection-completed' &&
        allComplete
      ) {
        setCelebratedScope(variables.scope);
        postSnackbar('m5s5.today.pinnedCollection.sharedAchievementConfirmed', {
          title: variables.title,
        });
      } else if (!allComplete) {
        setCelebratedScope(null);
      }
    },
    onError: (_error, variables) => {
      if (!ownsQuery(variables)) return;
      const isLatest =
        variables.state.latest.get(variables.itemId) === variables.operationId;
      if (!isLatest) return;

      variables.state.latest.delete(variables.itemId);
      variables.state.intended.delete(variables.itemId);
      const confirmed = variables.state.confirmed.get(variables.itemId);
      if (confirmed) {
        queryClient.setQueryData<CollectionDetail>(variables.key, (current) =>
          rollbackCollectionItemUpdate(current, confirmed, variables.completed),
        );
      }
      if (ownsToggle(variables)) {
        setCelebratedScope(null);
        postSnackbar('m5s5.today.pinnedCollection.toggleFailed');
      }
      void queryClient.invalidateQueries({
        queryKey: variables.key,
        exact: true,
        refetchType: isClientOnline() ? 'active' : 'none',
      });
    },
  });

  const createItem = useMutation({
    mutationFn: (title: string) =>
      apiCall(() =>
        api.createCollectionItem({
          spaceId,
          collectionId: collection.id,
          collectionItemCreate: { title },
        }),
      ),
    onSuccess: (createdItem) => {
      toggleState.confirmed.set(createdItem.id, createdItem);
      queryClient.setQueryData<CollectionDetail>(collectionKey, (current) => {
        const base = current ?? collection;
        if (base.items.some((item) => item.id === createdItem.id)) return base;
        return {
          ...base,
          items: [...base.items, createdItem],
        };
      });
      void queryClient.invalidateQueries({
        queryKey: collectionKey,
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: authorSummaryQueryKeys.collections(spaceId),
      });
      setExpanded(true);
      setAddOpen(false);
      setAddDraft('');
      setAddValidationError(false);
      setShowDiscardConfirm(false);
    },
    onError: () => {
      addInputRef.current?.focus({ preventScroll: true });
    },
  });

  function requestToggle(item: CollectionItemDetail) {
    if (!isClientOnline()) {
      postSnackbar('m5s5.today.pinnedCollection.toggleFailed');
      return;
    }
    const isCurrentQuery = toggleState.isCurrentQuery;
    if (!isCurrentQuery()) return;
    const intended = toggleState.intended.get(item.id) ?? item.completed;
    const completed = !intended;
    toggleState.intended.set(item.id, completed);
    toggleSequenceRef.current += 1;
    const operationId = toggleSequenceRef.current;
    toggleState.latest.set(item.id, operationId);
    toggleItem.mutate({
      itemId: item.id,
      completed,
      fallbackItem: item,
      operationId,
      state: toggleState,
      isCurrentQuery,
      key: collectionKey,
      spaceId,
      collectionId: collection.id,
      scope: toggleState.scope,
      title: collection.title,
    });
  }

  function closeAddFlow() {
    setAddOpen(false);
    setAddDraft('');
    setAddValidationError(false);
    setShowDiscardConfirm(false);
    createItem.reset();
  }

  function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = addDraft.trim();
    if (!title) {
      setAddValidationError(true);
      addInputRef.current?.focus({ preventScroll: true });
      return;
    }
    setAddValidationError(false);
    createItem.mutate(title);
  }

  return (
    <div className="today-pinned-list">
      <SharedAchievementCelebration
        visible={showSharedAchievement}
        centered
        headingLevel={3}
        title={t('m5s5.today.pinnedCollection.sharedAchievementTitle')}
        body={t('m5s5.today.pinnedCollection.sharedAchievementBody', {
          title: collection.title,
        })}
        action={
          <Link
            className="shared-achievement-cta"
            to={collectionDetailPath(collection.id)}
          >
            {t('m5s5.today.pinnedCollection.sharedAchievementAction')}
            <span className="shared-achievement-cta-arrow" aria-hidden="true">
              ›
            </span>
          </Link>
        }
      />

      {items.length > 0 ? (
        <ul className="today-pinned-list-items">
          {items.map((item) => (
            <li
              key={item.id}
              className={item.completed ? 'is-completed' : undefined}
            >
              <ChecklistToggle
                completed={item.completed}
                label={
                  item.completed
                    ? t('m5s3.collection.markOpen', { title: item.title })
                    : t('m5s3.collection.markDone', { title: item.title })
                }
                disabled={!item.capabilities.canEdit}
                onToggle={() => requestToggle(item)}
              />
              <span className="today-pinned-list-title">{item.title}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="today-pinned-list-empty">
          {t('m5s5.today.pinnedCollection.empty')}
        </p>
      )}

      {canExpand || collection.capabilities.canEdit ? (
        <div className="today-pinned-list-actions">
          {canExpand ? (
            <button
              type="button"
              className="today-pinned-list-disclosure"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded
                ? t('m5s5.today.pinnedCollection.showLess')
                : t('m5s5.today.pinnedCollection.showMore', {
                    count: remaining,
                  })}
            </button>
          ) : null}
          {collection.capabilities.canEdit ? (
            <button
              ref={addTriggerRef}
              type="button"
              className="today-pinned-list-add-button"
              aria-label={t('m5s5.today.pinnedCollection.addAction')}
              title={t('m5s5.today.pinnedCollection.addAction')}
              onClick={() => {
                createItem.reset();
                setAddValidationError(false);
                setShowDiscardConfirm(false);
                setAddOpen(true);
              }}
            >
              <AddIcon />
            </button>
          ) : null}
        </div>
      ) : null}

      <ShortTaskSheet
        open={addOpen}
        title={t('m5s5.today.pinnedCollection.addAction')}
        onClose={closeAddFlow}
        initialFocusRef={addInputRef}
        restoreFocusRef={addTriggerRef}
        isDirty={addDraft.length > 0}
        isCloseBlocked={createItem.isPending}
        onDiscardRequested={() => setShowDiscardConfirm(true)}
      >
        <form
          className="today-pinned-list-add-sheet-form"
          onSubmit={submitItem}
        >
          <div className="today-pinned-list-add-sheet-field">
            <label htmlFor="today-pinned-list-new-item">
              {t('m5s3.collection.itemTitle')}
            </label>
            <input
              ref={addInputRef}
              id="today-pinned-list-new-item"
              name="title"
              value={addDraft}
              maxLength={200}
              required
              aria-invalid={addValidationError || createItem.isError}
              aria-describedby={
                addValidationError ? 'today-pinned-list-add-error' : undefined
              }
              placeholder={t('m5s5.today.pinnedCollection.addPlaceholder')}
              onChange={(event) => {
                setAddDraft(event.target.value);
                if (addValidationError) setAddValidationError(false);
                if (createItem.isError) createItem.reset();
              }}
            />
            {addValidationError ? (
              <p
                id="today-pinned-list-add-error"
                className="today-pinned-list-add-error"
                role="alert"
              >
                {t('m5s5.today.pinnedCollection.addRequired')}
              </p>
            ) : null}
          </div>

          {createItem.error ? <ProblemState error={createItem.error} /> : null}

          {showDiscardConfirm ? (
            <section
              className="today-pinned-list-discard"
              role="alertdialog"
              aria-labelledby="today-pinned-list-discard-title"
            >
              <h3
                ref={discardHeadingRef}
                id="today-pinned-list-discard-title"
                tabIndex={-1}
              >
                {t('m5s3.common.discardTitle')}
              </h3>
              <p>{t('m5s3.common.discardBody')}</p>
              <div className="short-task-sheet-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setShowDiscardConfirm(false);
                    addInputRef.current?.focus({ preventScroll: true });
                  }}
                >
                  {t('m5s3.common.keepEditing')}
                </button>
                <button type="button" className="danger" onClick={closeAddFlow}>
                  {t('m5s3.common.discardConfirm')}
                </button>
              </div>
            </section>
          ) : (
            <div className="short-task-sheet-actions">
              <button
                type="button"
                className="secondary"
                disabled={createItem.isPending}
                onClick={closeAddFlow}
              >
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={createItem.isPending}>
                {createItem.isPending
                  ? t('m5s3.common.saving')
                  : t('m5s3.collection.addItem')}
              </button>
            </div>
          )}
        </form>
      </ShortTaskSheet>
    </div>
  );
}

/**
 * Keeps the changes of one shopping list that are waiting to be sent (#1808).
 *
 * The rules live in `client/collectionOutbox`; this hook connects them to the
 * list on screen: it loads the stored queue, saves every change reliably,
 * sends the queue when a connection is there (and again after a pause, with
 * growing waits), and reports what could not be sent.
 */
import { type QueryClient, onlineManager } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import { invalidateCollectionConsumers } from '../client/authorSummaryConsumers';
import {
  type OutboxOp,
  type OutboxOutcome,
  type OutboxRecord,
  type OutboxTransport,
  OutboxFullError,
  applyOutbox,
  emptyOutbox,
  enqueueAdd,
  enqueueSetCompleted,
  enqueueSetQuantity,
  isLocalItemId,
  newLocalItemId,
  parseOutbox,
  replayOutbox,
  settleOp,
  upsertConfirmedItem,
} from '../client/collectionOutbox';
import { isClientOnline } from '../client/connectivity';
import {
  deleteCollectionOutbox,
  readCollectionOutbox,
  writeCollectionOutbox,
} from '../client/productReadCache';
import type { SharedPlanningApis } from '../client/sharedPlanning';

/** Pauses before the next attempt while something stays unsent. */
export const OUTBOX_RETRY_DELAYS_MS = [
  3_000, 6_000, 12_000, 24_000, 48_000, 60_000,
];

export type OutboxNotice =
  | {
      id: string;
      kind: 'addDropped';
      reason: 'expired' | 'rejected';
      title: string;
    }
  | { id: string; kind: 'itemGone' }
  | { id: string; kind: 'collectionGone' }
  | { id: string; kind: 'full' };

type NoticeInput = OutboxNotice extends infer Notice
  ? Notice extends { id: string }
    ? Omit<Notice, 'id'>
    : never
  : never;

export interface UseCollectionOutboxOptions {
  apis: Pick<SharedPlanningApis, 'collections'>;
  queryClient: QueryClient;
  queryKey: readonly unknown[];
  accountId?: string;
  spaceId: string;
  collectionId?: string;
  /** Only shopping lists queue their changes. */
  enabled: boolean;
}

function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

/** Run `task` while holding a named lock across tabs, or without one where locks are missing. */
async function withLock<T>(
  name: string,
  options: { ifAvailable: boolean },
  task: () => Promise<T>,
): Promise<T | undefined> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return task();
  return locks.request(
    name,
    { ifAvailable: options.ifAvailable },
    async (lock) => (lock ? task() : undefined),
  );
}

export function useCollectionOutbox({
  apis,
  queryClient,
  queryKey,
  accountId,
  spaceId,
  collectionId,
  enabled,
}: UseCollectionOutboxOptions) {
  const active = enabled && Boolean(accountId) && Boolean(collectionId);
  const [record, setRecord] = useState<OutboxRecord>(emptyOutbox);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [notices, setNotices] = useState<OutboxNotice[]>([]);
  const recordRef = useRef(record);
  // Waiting adds the server confirmed, until the queue has dropped their ops.
  // A ref, not state: it is set right before the cache gains the confirmed
  // item, so the render that shows that item already hides the waiting copy.
  const confirmedAddsRef = useRef<ReadonlyMap<string, string>>(new Map());
  const storageFailedRef = useRef(false);
  const loadedRef = useRef<Promise<void> | null>(null);
  const runningRef = useRef(false);
  const attemptRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const aliveRef = useRef(true);
  const replayRef = useRef<() => void>(() => undefined);
  const keyRef = useRef(queryKey);
  keyRef.current = queryKey;

  const lockName = `eimir-outbox:${accountId}:${spaceId}:${collectionId}`;

  const publish = useCallback((next: OutboxRecord) => {
    recordRef.current = next;
    if (next.ops.length === 0 && confirmedAddsRef.current.size > 0) {
      confirmedAddsRef.current = new Map();
    }
    if (aliveRef.current) setRecord(next);
  }, []);

  /** Read what is stored, so a change made in another tab is not overwritten. */
  const readStored = useCallback(async (): Promise<OutboxRecord> => {
    if (!accountId || !collectionId) return emptyOutbox();
    // While the device refuses to keep anything, what is waiting exists only
    // here and must not be replaced by the (empty) stored copy.
    if (storageFailedRef.current) return recordRef.current;
    try {
      return parseOutbox(
        await readCollectionOutbox(accountId, spaceId, collectionId),
      );
    } catch {
      return recordRef.current;
    }
  }, [accountId, spaceId, collectionId]);

  /** Change the queue and keep it: read, change, save, under the list's lock. */
  const mutate = useCallback(
    async (
      change: (current: OutboxRecord) => OutboxRecord,
    ): Promise<OutboxRecord> => {
      await loadedRef.current;
      const result = await withLock(
        `${lockName}:store`,
        { ifAvailable: false },
        async () => {
          const next = change(await readStored());
          let stored = true;
          if (accountId && collectionId) {
            if (next.ops.length === 0) {
              await deleteCollectionOutbox(
                accountId,
                spaceId,
                collectionId,
              ).catch(() => undefined);
            } else {
              stored = await writeCollectionOutbox(
                accountId,
                spaceId,
                collectionId,
                next,
              );
            }
          }
          publish(next);
          storageFailedRef.current = !stored;
          if (aliveRef.current) setStorageFailed(!stored);
          return next;
        },
      );
      return result ?? recordRef.current;
    },
    [accountId, collectionId, lockName, publish, readStored, spaceId],
  );

  const addNotice = useCallback((notice: NoticeInput) => {
    if (!aliveRef.current) return;
    setNotices((current) => [
      ...current,
      { ...notice, id: newUuid() } as OutboxNotice,
    ]);
  }, []);

  const dismissNotice = useCallback((id: string) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  const noticesFor = useCallback(
    (outcomes: OutboxOutcome[]) => {
      let itemGone = false;
      for (const outcome of outcomes) {
        if (outcome.kind !== 'dropped') continue;
        if (outcome.reason === 'collectionGone')
          addNotice({ kind: 'collectionGone' });
        else if (outcome.reason === 'itemGone') itemGone = true;
        else if (
          (outcome.reason === 'expired' || outcome.reason === 'rejected') &&
          outcome.op.kind === 'add'
        )
          addNotice({
            kind: 'addDropped',
            reason: outcome.reason,
            title: outcome.op.title,
          });
      }
      if (itemGone) addNotice({ kind: 'itemGone' });
    },
    [addNotice],
  );

  const transport = useMemo<OutboxTransport>(
    () => ({
      createItem: ({
        collectionId: id,
        idempotencyKey,
        title,
        quantity,
        completed,
      }) =>
        apis.collections.createCollectionItem({
          spaceId,
          collectionId: id,
          idempotencyKey,
          collectionItemCreate: { title, quantity, completed },
        }),
      updateItem: ({
        collectionId: id,
        itemId,
        version,
        completed,
        quantity,
      }) =>
        apis.collections.updateCollectionItem({
          spaceId,
          collectionId: id,
          itemId,
          ifMatch: String(version),
          collectionItemUpdate: { completed, quantity },
        }),
      readCollection: (id) =>
        apis.collections.getCollection({ spaceId, collectionId: id }),
    }),
    [apis.collections, spaceId],
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(() => {
    clearTimer();
    if (!aliveRef.current) return;
    const delay =
      OUTBOX_RETRY_DELAYS_MS[
        Math.min(attemptRef.current, OUTBOX_RETRY_DELAYS_MS.length - 1)
      ];
    attemptRef.current += 1;
    timerRef.current = window.setTimeout(() => replayRef.current(), delay);
  }, [clearTimer]);

  const replay = useCallback(async () => {
    if (!active || !collectionId || runningRef.current) return;
    runningRef.current = true;
    try {
      await loadedRef.current;
      // Only one tab sends at a time; an add that is sent twice is harmless
      // anyway because it carries its request identity.
      await withLock(`${lockName}:send`, { ifAvailable: true }, async () => {
        const stored = await readStored();
        publish(stored);
        if (stored.ops.length === 0 || !isClientOnline()) return;
        if (aliveRef.current) setSyncing(true);
        const result = await replayOutbox({
          collectionId,
          transport,
          store: {
            peek: () => recordRef.current.ops,
            settle: async (opId, named) => {
              await mutate((current) => settleOp(current, opId, named));
            },
            dropAll: async () => {
              await mutate(() => emptyOutbox());
            },
          },
          known: (itemId) =>
            queryClient
              .getQueryData<CollectionDetail>(keyRef.current)
              ?.items.find((item) => item.id === itemId),
          onAddConfirmed: (localId, created) => {
            confirmedAddsRef.current = new Map(confirmedAddsRef.current).set(
              localId,
              created.id,
            );
          },
          onItem: (item: CollectionItemDetail) => {
            queryClient.setQueryData<CollectionDetail | undefined>(
              keyRef.current,
              (current) =>
                current ? upsertConfirmedItem(current, item) : current,
            );
          },
          onCollection: (collection) => {
            queryClient.setQueryData(keyRef.current, collection);
          },
          now: () => Date.now(),
        });
        noticesFor(result.outcomes);
        if (result.outcomes.some((outcome) => outcome.kind === 'sent')) {
          attemptRef.current = 0;
          await Promise.all([
            invalidateCollectionConsumers(queryClient, spaceId),
            queryClient.invalidateQueries({
              queryKey: keyRef.current,
              refetchType: isClientOnline() ? 'active' : 'none',
            }),
          ]);
        }
        if (result.status === 'blocked') scheduleRetry();
        else attemptRef.current = 0;
      });
    } finally {
      runningRef.current = false;
      if (aliveRef.current) setSyncing(false);
    }
  }, [
    active,
    collectionId,
    lockName,
    mutate,
    noticesFor,
    publish,
    queryClient,
    readStored,
    scheduleRetry,
    spaceId,
    transport,
  ]);
  replayRef.current = () => void replay();

  // Load the stored queue, then try to send it.
  useEffect(() => {
    aliveRef.current = true;
    if (!active) {
      publish(emptyOutbox());
      setLoaded(true);
      loadedRef.current = Promise.resolve();
      return () => {
        aliveRef.current = false;
      };
    }
    setLoaded(false);
    const load = readStored().then((stored) => {
      publish(stored);
      if (aliveRef.current) setLoaded(true);
      if (stored.ops.length > 0) replayRef.current();
    });
    loadedRef.current = load;
    return () => {
      aliveRef.current = false;
      clearTimer();
    };
  }, [active, clearTimer, publish, readStored]);

  // Send again when the connection comes back or the page becomes visible.
  useEffect(() => {
    if (!active) return;
    const unsubscribe = onlineManager.subscribe((online) => {
      if (online) {
        attemptRef.current = 0;
        replayRef.current();
      }
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') replayRef.current();
    };
    const onOnline = () => {
      attemptRef.current = 0;
      replayRef.current();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active]);

  const guard = useCallback(
    async (change: (current: OutboxRecord) => OutboxRecord) => {
      try {
        await mutate(change);
        attemptRef.current = 0;
        replayRef.current();
        return true;
      } catch (error) {
        if (error instanceof OutboxFullError) addNotice({ kind: 'full' });
        else throw error;
        return false;
      }
    },
    [addNotice, mutate],
  );

  const addItem = useCallback(
    (input: { title: string; quantity?: string | null; completed?: boolean }) =>
      guard((current) => {
        const opId = newUuid();
        return enqueueAdd(current, {
          opId,
          idempotencyKey: newUuid(),
          localId: newLocalItemId(newUuid()),
          title: input.title,
          quantity: input.quantity ?? null,
          completed: input.completed ?? false,
          now: new Date(),
        });
      }),
    [guard],
  );

  const setCompleted = useCallback(
    (itemId: string, completed: boolean) =>
      guard((current) =>
        enqueueSetCompleted(current, {
          opId: newUuid(),
          itemId,
          completed,
          now: new Date(),
        }),
      ),
    [guard],
  );

  const setQuantity = useCallback(
    (itemId: string, quantity: string | null) =>
      guard((current) =>
        enqueueSetQuantity(current, {
          opId: newUuid(),
          itemId,
          quantity,
          now: new Date(),
        }),
      ),
    [guard],
  );

  const apply = useCallback(
    (collection: CollectionDetail, creator: CollectionItemDetail['creator']) =>
      applyOutbox(
        collection,
        record,
        { accountId: accountId ?? '', creator },
        confirmedAddsRef.current,
      ),
    [accountId, record],
  );

  const pendingCount = record.ops.length;

  return {
    /** Whether this list queues its changes at all. */
    active,
    loaded,
    ops: record.ops as readonly OutboxOp[],
    pendingCount,
    syncing,
    /** True when the device refused to keep the waiting changes for later. */
    storageFailed,
    notices,
    dismissNotice,
    addItem,
    setCompleted,
    setQuantity,
    apply,
    isWaiting: (itemId: string) =>
      isLocalItemId(itemId) ||
      record.ops.some((op) => 'itemId' in op && op.itemId === itemId),
    replayNow: () => replayRef.current(),
  };
}

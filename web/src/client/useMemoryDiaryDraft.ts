import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTaskActivation } from './useTaskActivation';
import { memoryOnlyPhotoDescriptor } from './selectedMediaRetention';
import {
  MemoryDiaryDraftStore,
  MemoryDraftOwnershipError,
  type MemoryDiaryDraft,
} from './memoryDiaryDraft';

export function useMemoryDiaryDraft({
  apiBaseUrl,
  accountId,
  spaceId,
  purpose,
  snapshot,
  dirty,
  suspended,
}: {
  apiBaseUrl: string;
  accountId: string;
  spaceId: string;
  purpose?: string;
  snapshot: MemoryDiaryDraft;
  dirty: boolean;
  suspended: boolean;
}) {
  const store = useMemo(
    () => new MemoryDiaryDraftStore(apiBaseUrl, accountId, spaceId, purpose),
    [apiBaseUrl, accountId, spaceId, purpose],
  );
  const [recovery, setRecovery] = useState<MemoryDiaryDraft | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'idle' | 'saving' | 'saved' | 'unavailable' | 'conflict'
  >('loading');
  const captureOwnership = useTaskActivation(
    true,
    JSON.stringify([apiBaseUrl, accountId, spaceId, purpose]),
  );
  const closed = useRef(false);
  const revision = useRef(0);
  const [loaded, setLoaded] = useState(false);
  const supported = useRef(false);
  const hasSavedWork = useRef(false);
  const recoveryPending = useRef(false);
  const initialization = useMemo(() => {
    let resolve!: () => void;
    const ready = new Promise<void>((done) => {
      resolve = done;
    });
    return {
      store,
      ready,
      resolve,
      loading: null as Promise<MemoryDiaryDraft | null> | null,
      error: null as unknown,
    };
  }, [store]);

  useEffect(() => {
    const isCurrent = captureOwnership();
    initialization.loading ??= store.load();
    void initialization.loading
      .then((value) => {
        initialization.resolve();
        if (!isCurrent()) return;
        supported.current = true;
        recoveryPending.current = Boolean(value);
        setRecovery(value);
        setStatus('idle');
        setLoaded(true);
      })
      .catch((error) => {
        initialization.error = error;
        initialization.resolve();
        if (!isCurrent()) return;
        setStatus('unavailable');
        setLoaded(true);
      });
  }, [captureOwnership, initialization, store]);

  const checkpoint = useCallback(
    async (value: MemoryDiaryDraft, resuming = false) => {
      const isCurrent = captureOwnership();
      const current = ++revision.current;
      hasSavedWork.current = true;
      if (isCurrent()) setStatus('saving');
      try {
        await initialization.ready;
        if (initialization.error) throw initialization.error;
        if (recoveryPending.current && !resuming) return false;
        await store.save(value);
        if (isCurrent() && revision.current === current && !closed.current)
          setStatus('saved');
        return true;
      } catch (error) {
        if (isCurrent() && revision.current === current)
          setStatus(
            error instanceof MemoryDraftOwnershipError
              ? 'conflict'
              : 'unavailable',
          );
        // A tab that lost ownership must never publish a stale recovered task.
        const requiresJournal =
          Boolean(value.attempt || value.partial) &&
          value.files.some(({ file }) => memoryOnlyPhotoDescriptor(file));
        return (
          !(error instanceof MemoryDraftOwnershipError) && !requiresJournal
        );
      }
    },
    [captureOwnership, initialization, store],
  );

  useEffect(() => {
    if (
      !loaded ||
      !supported.current ||
      recovery ||
      suspended ||
      closed.current
    )
      return;
    if (dirty) void checkpoint(snapshot);
    else if (hasSavedWork.current) {
      hasSavedWork.current = false;
      const isCurrent = captureOwnership();
      const current = ++revision.current;
      void initialization.ready
        .then(() => store.clear())
        .then(() => {
          if (isCurrent() && current === revision.current) setStatus('idle');
        })
        .catch(() => {
          if (isCurrent() && current === revision.current)
            setStatus('unavailable');
        });
    }
  }, [
    captureOwnership,
    checkpoint,
    dirty,
    initialization,
    loaded,
    recovery,
    snapshot,
    store,
    suspended,
  ]);

  const clear = useCallback(async () => {
    closed.current = true;
    revision.current += 1;
    try {
      await initialization.ready;
      await store.clear();
    } catch {
      /* No claim of successful local persistence. */
    }
  }, [initialization, store]);

  const discardRecovery = useCallback(async () => {
    try {
      await store.clear();
      recoveryPending.current = false;
      setRecovery(null);
      setStatus('idle');
    } catch {
      setStatus('conflict');
    }
  }, [store]);

  return {
    recovery,
    status,
    checkpoint,
    clear,
    discardRecovery,
    acceptRecovery: () => {
      recoveryPending.current = false;
      setRecovery(null);
    },
  };
}

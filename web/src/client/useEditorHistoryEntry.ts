import { useCallback, useEffect, useRef } from 'react';

export const EDITOR_HISTORY_STATE_KEY = '__eimirEditorEntry';
let editorHistorySequence = 0;
let pendingEntryRemoval: Promise<void> | null = null;
const activeOwners: string[] = [];
const eventOwners = new WeakMap<Event, string | undefined>();

function releaseOwner(marker: string): void {
  const index = activeOwners.indexOf(marker);
  if (index !== -1) activeOwners.splice(index, 1);
}

function waitForPendingEntryRemoval(): Promise<void> {
  return pendingEntryRemoval ?? Promise.resolve();
}

function removeCurrentEntry(marker: string): Promise<void> {
  if (window.history.state?.[EDITOR_HISTORY_STATE_KEY] !== marker) {
    return Promise.resolve();
  }
  if (pendingEntryRemoval) return pendingEntryRemoval;

  const removal = new Promise<void>((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
    window.history.back();
  });
  const trackedRemoval = removal.finally(() => {
    if (pendingEntryRemoval === trackedRemoval) pendingEntryRemoval = null;
  });
  pendingEntryRemoval = trackedRemoval;
  return trackedRemoval;
}

function historyStateWithMarker(marker: string): Record<string, unknown> {
  const currentState = window.history.state;
  const state =
    currentState && typeof currentState === 'object' ? currentState : {};
  return { ...state, [EDITOR_HISTORY_STATE_KEY]: marker };
}

export function useEditorHistoryEntry({
  isActive = true,
  isDirty,
  isCloseBlocked = false,
  onDiscardRequested,
  onCloseBlocked,
  onClose,
}: {
  isActive?: boolean;
  isDirty: boolean;
  isCloseBlocked?: boolean;
  onDiscardRequested: () => void;
  onCloseBlocked?: () => void;
  onClose: () => void;
}): (afterClose?: unknown) => void {
  const markerRef = useRef('');
  if (!markerRef.current) {
    editorHistorySequence += 1;
    markerRef.current = `editor-${editorHistorySequence}`;
  }

  const ownsEntryRef = useRef(false);
  const closingRef = useRef(false);
  const isDirtyRef = useRef(isDirty);
  const isCloseBlockedRef = useRef(isCloseBlocked);
  const onDiscardRequestedRef = useRef(onDiscardRequested);
  const onCloseRef = useRef(onClose);
  const onCloseBlockedRef = useRef(onCloseBlocked);

  isDirtyRef.current = isDirty;
  isCloseBlockedRef.current = isCloseBlocked;
  onDiscardRequestedRef.current = onDiscardRequested;
  onCloseRef.current = onClose;
  onCloseBlockedRef.current = onCloseBlocked;

  useEffect(() => {
    if (isActive) closingRef.current = false;
  }, [isActive]);

  const isCurrentEntry = useCallback(
    () =>
      window.history.state?.[EDITOR_HISTORY_STATE_KEY] === markerRef.current,
    [],
  );

  const pushEntry = useCallback(() => {
    window.history.pushState(
      historyStateWithMarker(markerRef.current),
      '',
      window.location.href,
    );
    ownsEntryRef.current = true;
    releaseOwner(markerRef.current);
    activeOwners.push(markerRef.current);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !isActive) return;

    let mounted = true;
    const handlePopState = (event: PopStateEvent) => {
      // A child may re-push an entry while dispatching this same event. Snapshot
      // its original owner so listener order cannot dismiss the parent as well.
      if (pendingEntryRemoval) return;
      if (!eventOwners.has(event)) eventOwners.set(event, activeOwners.at(-1));
      if (eventOwners.get(event) !== markerRef.current || !ownsEntryRef.current)
        return;
      if (isCurrentEntry()) return;
      ownsEntryRef.current = false;
      releaseOwner(markerRef.current);

      if (isCloseBlockedRef.current) {
        pushEntry();
        onCloseBlockedRef.current?.();
        return;
      }

      if (isDirtyRef.current) {
        pushEntry();
        onDiscardRequestedRef.current();
        return;
      }

      onCloseRef.current();
    };

    window.addEventListener('popstate', handlePopState);
    void waitForPendingEntryRemoval().then(() => {
      if (mounted && !ownsEntryRef.current) pushEntry();
    });

    return () => {
      mounted = false;
      window.removeEventListener('popstate', handlePopState);
      releaseOwner(markerRef.current);
      if (ownsEntryRef.current && isCurrentEntry()) {
        ownsEntryRef.current = false;
        void removeCurrentEntry(markerRef.current);
      }
    };
  }, [isActive, isCurrentEntry, pushEntry]);

  return useCallback(
    (afterClose?: unknown) => {
      if (closingRef.current) return;
      closingRef.current = true;
      const complete =
        typeof afterClose === 'function'
          ? () => afterClose()
          : onCloseRef.current;
      releaseOwner(markerRef.current);
      if (
        typeof window !== 'undefined' &&
        ownsEntryRef.current &&
        isCurrentEntry()
      ) {
        ownsEntryRef.current = false;
        void removeCurrentEntry(markerRef.current).then(complete);
        return;
      }
      complete();
    },
    [isCurrentEntry],
  );
}

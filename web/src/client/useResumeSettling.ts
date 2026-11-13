import { useEffect, useRef, useState } from 'react';
import {
  focusManager,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

/** Let focus-triggered refetches start before judging that none are running. */
export const RESUME_SETTLE_GRACE_MS = 80;
/** A slow network must never keep an already readable page frozen. */
export const RESUME_SETTLE_MAX_MS = 1500;

function activeFetchCount(client: QueryClient): number {
  return client.isFetching({ predicate: (query) => query.isActive() });
}

/**
 * True from the moment the app regains focus until the refetches that focus
 * triggered have settled (or a short ceiling passes, or the person interacts).
 *
 * A page that holds its already-visible data while this is true can then show
 * the refreshed result in one step instead of module by module as each
 * response arrives.
 */
export function useResumeSettling(): boolean {
  const client = useQueryClient();
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    let active = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    let maxTimer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribeCache: (() => void) | undefined;

    const finish = () => {
      if (!active) return;
      active = false;
      clearTimeout(graceTimer);
      clearTimeout(maxTimer);
      unsubscribeCache?.();
      unsubscribeCache = undefined;
      window.removeEventListener('pointerdown', finish, true);
      window.removeEventListener('keydown', finish, true);
      setSettling(false);
    };
    const finishWhenIdle = () => {
      if (activeFetchCount(client) === 0) finish();
    };
    const begin = () => {
      if (active) return;
      active = true;
      setSettling(true);
      // Interaction must act on what is currently true, not on a held view.
      window.addEventListener('pointerdown', finish, true);
      window.addEventListener('keydown', finish, true);
      maxTimer = setTimeout(finish, RESUME_SETTLE_MAX_MS);
      graceTimer = setTimeout(() => {
        if (!active) return;
        finishWhenIdle();
        if (active) {
          unsubscribeCache = client.getQueryCache().subscribe(() => {
            queueMicrotask(finishWhenIdle);
          });
        }
      }, RESUME_SETTLE_GRACE_MS);
    };

    const unsubscribeFocus = focusManager.subscribe((focused) => {
      if (focused) begin();
    });
    return () => {
      unsubscribeFocus();
      finish();
    };
  }, [client]);

  return settling;
}

/**
 * While `hold` is true, keep returning the last value seen before it started.
 * Nothing is held until the value has something to show, so an initial load or
 * an error is never delayed.
 */
export function useHeldQuery<T extends { data?: unknown }>(
  value: T,
  hold: boolean,
): T {
  const held = useRef(value);
  if (!hold || value.data === undefined || held.current.data === undefined) {
    held.current = value;
  }
  return held.current;
}

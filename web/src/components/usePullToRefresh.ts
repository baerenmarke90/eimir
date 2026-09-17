import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_THRESHOLD = 72;
const START_SLOP = 8;
const MAX_PULL_DISTANCE = 64;
const TOP_TOLERANCE = 1;
const COARSE_POINTER_QUERY = '(pointer: coarse)';

export interface PullToRefreshOptions {
  enabled: boolean;
  blocked: boolean;
  onRefresh: () => Promise<unknown> | unknown;
  threshold?: number;
}

export interface PullToRefreshState {
  pullDistance: number;
  ready: boolean;
  refreshing: boolean;
  supported: boolean;
}

function touchRefreshSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  return (
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.(COARSE_POINTER_QUERY).matches === true
  );
}

function isAtDocumentTop(): boolean {
  const scrollingElement = document.scrollingElement;
  return (
    window.scrollY <= TOP_TOLERANCE &&
    (!scrollingElement || scrollingElement.scrollTop <= TOP_TOLERANCE)
  );
}

/**
 * Small, window-scroll pull-to-refresh primitive for the Momente timeline.
 *
 * It deliberately owns only the gesture. The caller still owns data loading,
 * cache/offline semantics and pagination, so #974 reuses the existing Story
 * query rather than creating a second refresh architecture. The root class
 * lets CSS suppress browser-level overscroll while this interaction is active.
 */
export function usePullToRefresh({
  enabled,
  blocked,
  onRefresh,
  threshold = DEFAULT_THRESHOLD,
}: PullToRefreshOptions): PullToRefreshState {
  const [pullDistance, setPullDistance] = useState(0);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [supported, setSupported] = useState(false);
  const blockedRef = useRef(blocked);
  const readyRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  blockedRef.current = blocked;
  onRefreshRef.current = onRefresh;

  const resetPull = useCallback(() => {
    readyRef.current = false;
    setReady(false);
    setPullDistance(0);
  }, []);

  const runRefresh = useCallback(async () => {
    if (refreshInFlightRef.current || blockedRef.current) return;
    refreshInFlightRef.current = true;
    resetPull();
    setRefreshing(true);
    try {
      await onRefreshRef.current();
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
    }
  }, [resetPull]);

  useEffect(() => {
    const canPull = touchRefreshSupported();
    setSupported(canPull);
    if (!enabled || !canPull) {
      resetPull();
      return;
    }

    const root = document.documentElement;
    root.classList.add('story-pull-refresh-enabled');

    let tracking = false;
    let startY: number | null = null;

    const cancelGesture = () => {
      tracking = false;
      startY = null;
      resetPull();
    };

    const onTouchStart = (event: TouchEvent) => {
      if (
        event.touches.length !== 1 ||
        blockedRef.current ||
        refreshInFlightRef.current ||
        !isAtDocumentTop()
      ) {
        cancelGesture();
        return;
      }
      tracking = true;
      startY = event.touches[0]?.clientY ?? null;
      resetPull();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || startY === null || event.touches.length !== 1) return;
      if (
        blockedRef.current ||
        refreshInFlightRef.current ||
        !isAtDocumentTop()
      ) {
        cancelGesture();
        return;
      }

      const currentY = event.touches[0]?.clientY;
      if (currentY === undefined) return;
      const delta = currentY - startY;
      if (delta <= 0) {
        resetPull();
        return;
      }
      if (delta < START_SLOP) return;

      // Once the gesture is clearly a downward pull at the document top,
      // keep the browser's own pull-to-refresh from competing with the app.
      event.preventDefault();
      setPullDistance(Math.min(MAX_PULL_DISTANCE, delta * 0.5));
      const thresholdReached = delta >= threshold;
      readyRef.current = thresholdReached;
      setReady(thresholdReached);
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      const shouldRefresh =
        readyRef.current &&
        !blockedRef.current &&
        !refreshInFlightRef.current &&
        isAtDocumentTop();
      tracking = false;
      startY = null;
      resetPull();
      if (shouldRefresh) void runRefresh();
    };

    const onTouchCancel = () => cancelGesture();

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      root.classList.remove('story-pull-refresh-enabled');
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchCancel);
      resetPull();
    };
  }, [enabled, resetPull, runRefresh, threshold]);

  return { pullDistance, ready, refreshing, supported };
}

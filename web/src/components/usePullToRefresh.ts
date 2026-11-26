import { useCallback, useEffect, useRef, useState } from 'react';
import {
  commitDistance,
  decideRelease,
  resolveOwnership,
  rubberBand,
} from '../motion/gesture/follow';
import {
  SPRING_FRAME_MS,
  sampleSpring,
  springDuration,
} from '../motion/gesture/spring';
import { VelocityTracker } from '../motion/gesture/velocity';
import { haptic } from '../motion/haptics';
import { prefersReducedMotion } from '../motion/reducedMotion';
import { run } from '../motion/run';

// Pull to refresh is Gesture follow plus Loading (Motion Contract 4.6, 4.8):
// slop, axis ownership, reversal and the commit distance are the shared
// tokens. The disc follows half the finger travel, so it is fully shown
// exactly where the pull commits (72 px of finger = 36 px, the disc's height).
const DEFAULT_THRESHOLD = commitDistance('pull', 0);
const INDICATOR_RATIO = 0.5;
// Disc travel that follows 1:1; beyond it the disc gives way with resistance.
const FOLLOW_MAX = 64;
// The disc fades in over its first pixels of travel instead of popping.
const FADE_IN_PX = 18;
// A fetch that never ends must not hold a requested refresh forever.
const BLOCKED_WAIT_MAX_MS = 5000;
const TOP_TOLERANCE = 1;
const COARSE_POINTER_QUERY = '(pointer: coarse)';

export interface PullToRefreshOptions {
  enabled: boolean;
  blocked: boolean;
  onRefresh: () => Promise<unknown> | unknown;
  threshold?: number;
}

export interface PullToRefreshState {
  /** The finger is pulling, or the disc is still settling after a pull. */
  pulling: boolean;
  ready: boolean;
  refreshing: boolean;
  supported: boolean;
  /** Ref for the moving disc; the hook positions it by transform only. */
  indicatorRef: (element: HTMLElement | null) => void;
}

interface Settle {
  animation: Animation;
  frames: number[];
}

/** Disc style for an offset: its bottom edge sits `offset` px below the top. */
function discFrame(offset: number): { transform: string; opacity: string } {
  return {
    transform: `translate3d(0, calc(${offset}px - 100%), 0)`,
    opacity: String(Math.min(1, Math.max(0, offset / FADE_IN_PX))),
  };
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
 * Shared document-scroll pull-to-refresh interaction primitive.
 *
 * It deliberately owns only gesture mechanics. The caller owns authoritative
 * data loading, cache/offline semantics and pagination. The root class lets CSS
 * suppress browser-level pull-to-refresh while an in-app surface is enabled.
 *
 * The disc is positioned by `transform` only, written once per animation
 * frame, so a pull never re-renders React or reflows the page. On release it
 * continues from where it is with the finger's velocity on the shared sampled
 * spring.
 */
export function usePullToRefresh({
  enabled,
  blocked,
  onRefresh,
  threshold = DEFAULT_THRESHOLD,
}: PullToRefreshOptions): PullToRefreshState {
  const [pulling, setPulling] = useState(false);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [supported, setSupported] = useState(false);
  const blockedRef = useRef(blocked);
  const readyRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  const discRef = useRef<HTMLElement | null>(null);
  const offsetRef = useRef(0);
  const frameRef = useRef(0);
  const frameScheduledRef = useRef(false);
  const settleRef = useRef<Settle | null>(null);
  const idleWaitersRef = useRef(new Set<() => void>());

  blockedRef.current = blocked;
  onRefreshRef.current = onRefresh;

  // Writes the disc's transform directly: no React render per touch move.
  const placeOffset = useCallback((offset: number) => {
    offsetRef.current = offset;
    const disc = discRef.current;
    if (!disc) return;
    const frame = discFrame(offset);
    disc.style.transform = frame.transform;
    disc.style.opacity = frame.opacity;
  }, []);

  const indicatorRef = useCallback(
    (element: HTMLElement | null) => {
      discRef.current = element;
      if (element) placeOffset(offsetRef.current);
    },
    [placeOffset],
  );

  // Moves the disc once per animation frame, however many moves came in.
  const followOffset = useCallback(
    (offset: number) => {
      offsetRef.current = offset;
      if (frameScheduledRef.current) return;
      if (typeof requestAnimationFrame !== 'function') {
        placeOffset(offset);
        return;
      }
      frameScheduledRef.current = true;
      frameRef.current = requestAnimationFrame(() => {
        frameScheduledRef.current = false;
        frameRef.current = 0;
        placeOffset(offsetRef.current);
      });
    },
    [placeOffset],
  );

  const stopFollowFrame = useCallback(() => {
    if (!frameScheduledRef.current) return;
    if (typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(frameRef.current);
    frameScheduledRef.current = false;
    frameRef.current = 0;
  }, []);

  // Interruption: a settle that is stopped leaves the disc where it was.
  const stopSettle = useCallback(() => {
    const current = settleRef.current;
    if (!current) return;
    settleRef.current = null;
    const time = Number(current.animation.currentTime ?? 0);
    const index = Math.min(
      current.frames.length - 1,
      Math.max(0, Math.round(time / SPRING_FRAME_MS)),
    );
    current.animation.cancel();
    placeOffset(current.frames[index] ?? offsetRef.current);
  }, [placeOffset]);

  // Release handoff (Motion Contract 4.6): the disc continues from where it
  // is with the release velocity on a sampled spring; reduced motion lands at
  // once.
  const settleTo = useCallback(
    (target: number, velocity: number, onDone?: () => void) => {
      stopSettle();
      stopFollowFrame();
      const from = offsetRef.current;
      const disc = discRef.current;
      if (!disc || prefersReducedMotion() || Math.abs(from - target) < 0.5) {
        placeOffset(target);
        onDone?.();
        return;
      }
      const frames = sampleSpring(from, target, velocity, undefined, true);
      placeOffset(target);
      const animation = run(disc, frames.map(discFrame), {
        duration: springDuration(frames),
        easing: 'linear',
        channel: 'gesture',
        willChange: 'transform, opacity',
      });
      if (!animation) {
        onDone?.();
        return;
      }
      settleRef.current = { animation, frames };
      animation.finished.then(
        () => {
          if (settleRef.current?.animation !== animation) return;
          settleRef.current = null;
          onDone?.();
        },
        () => {},
      );
    },
    [placeOffset, stopFollowFrame, stopSettle],
  );

  const settleBack = useCallback(
    (velocity: number) => {
      if (refreshInFlightRef.current) return;
      settleTo(0, velocity, () => setPulling(false));
    },
    [settleTo],
  );

  const resetReady = useCallback(() => {
    readyRef.current = false;
    setReady(false);
  }, []);

  // A fetch already running on the surface does not kill the pull: the refresh
  // is asked for at release and starts as soon as the surface is idle.
  const waitForIdle = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (!blockedRef.current) {
          resolve();
          return;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const done = () => {
          clearTimeout(timer);
          idleWaitersRef.current.delete(done);
          resolve();
        };
        timer = setTimeout(done, BLOCKED_WAIT_MAX_MS);
        idleWaitersRef.current.add(done);
      }),
    [],
  );

  useEffect(() => {
    if (blocked) return;
    for (const waiter of [...idleWaitersRef.current]) waiter();
  }, [blocked]);

  useEffect(
    () => () => {
      stopFollowFrame();
      settleRef.current?.animation.cancel();
      settleRef.current = null;
      for (const waiter of [...idleWaitersRef.current]) waiter();
    },
    [stopFollowFrame],
  );

  const runRefresh = useCallback(
    async (restOffset: number, velocity: number) => {
      if (refreshInFlightRef.current) return;
      refreshInFlightRef.current = true;
      resetReady();
      setRefreshing(true);
      // The refresh starts at release and is never delayed by the settle (M10).
      settleTo(restOffset, velocity);
      try {
        // Only a running fetch makes the refresh wait; otherwise it starts now.
        if (blockedRef.current) await waitForIdle();
        await onRefreshRef.current();
      } finally {
        refreshInFlightRef.current = false;
        setRefreshing(false);
        settleTo(0, 0, () => setPulling(false));
      }
    },
    [resetReady, settleTo, waitForIdle],
  );

  useEffect(() => {
    const canPull = touchRefreshSupported();
    setSupported(canPull);
    if (!enabled || !canPull) {
      resetReady();
      return;
    }

    const root = document.documentElement;
    root.classList.add('app-pull-refresh-enabled');

    // Where the disc rests while a refresh runs: fully shown, no further.
    const restOffset = threshold * INDICATOR_RATIO;
    const tracker = new VelocityTracker();
    let tracking = false;
    let claimed = false;
    let startX: number | null = null;
    let startY: number | null = null;
    let startElement: Element | null = null;
    let travel = 0;
    let peak = 0;
    let suppressClick = false;

    const clearGesture = () => {
      tracking = false;
      claimed = false;
      startX = null;
      startY = null;
      startElement = null;
      travel = 0;
      peak = 0;
      tracker.reset();
    };

    const cancelGesture = (velocity = 0) => {
      const wasClaimed = claimed;
      clearGesture();
      resetReady();
      if (wasClaimed) settleBack(velocity);
    };

    const onTouchStart = (event: TouchEvent) => {
      suppressClick = false;
      const target = event.target;
      const interactiveTarget =
        target instanceof Element
          ? target.closest(
              'form, input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog, [role="dialog"], [role="slider"], [role="switch"], [draggable="true"], video, audio, .place-map-viewport, .media-gallery, [data-pull-to-refresh-block="true"], [data-primary-tab-dragging]',
            )
          : null;
      // A fetch that is already running does not stop the pull: the refresh
      // waits for it at release instead of a gesture that silently does
      // nothing.
      if (
        event.touches.length !== 1 ||
        interactiveTarget ||
        window.getSelection()?.isCollapsed === false ||
        document.body.style.overflow === 'hidden' ||
        document.querySelector(
          'dialog[open], [aria-modal="true"], [role="menu"]',
        ) ||
        refreshInFlightRef.current ||
        !isAtDocumentTop()
      ) {
        cancelGesture();
        return;
      }
      clearGesture();
      resetReady();
      tracking = true;
      startElement = target instanceof Element ? target : null;
      startX = event.touches[0]?.clientX ?? null;
      startY = event.touches[0]?.clientY ?? null;
      if (startY !== null) tracker.add(event.timeStamp, startY);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (
        !tracking ||
        startX === null ||
        startY === null ||
        event.touches.length !== 1
      )
        return;
      // A selection made during the pull ends it (`onSelectionChange`):
      // reading the selection here would force style and layout per sample.
      if (refreshInFlightRef.current || !isAtDocumentTop()) {
        cancelGesture();
        return;
      }

      const currentX = event.touches[0]?.clientX;
      const currentY = event.touches[0]?.clientY;
      if (currentX === undefined || currentY === undefined) return;
      tracker.add(event.timeStamp, currentY);
      const deltaX = currentX - startX;
      const deltaY = currentY - startY;
      if (!claimed) {
        // One ownership rule for every Gesture follow owner: a horizontal
        // start belongs to the pager or a carousel, not to the refresh.
        const ownership = resolveOwnership('y', deltaX, deltaY);
        if (ownership === 'reject') {
          cancelGesture();
          return;
        }
        if (ownership === 'pending' || deltaY <= 0) return;
        // Only a downward pull needs layout reads to check nested scrollers.
        // Taps and horizontal swipes leave these ancestors untouched.
        for (
          let node = startElement;
          node && node !== document.body;
          node = node.parentElement
        ) {
          const style = window.getComputedStyle(node);
          if (
            style.touchAction === 'none' ||
            style.touchAction === 'pan-x' ||
            (/(auto|scroll)/.test(style.overflowY) &&
              node.scrollHeight > node.clientHeight + 1)
          ) {
            cancelGesture();
            return;
          }
        }
        claimed = true;
        // Grabbing a disc that is still settling continues from where it is.
        stopSettle();
        setPulling(true);
      }
      travel = Math.max(0, deltaY);
      peak = Math.max(peak, travel);
      if (travel <= 0) {
        resetReady();
        followOffset(0);
        return;
      }

      // Once the gesture is clearly a downward pull at the document top,
      // keep the browser's own pull-to-refresh from competing with the app.
      event.preventDefault();
      suppressClick = true;
      followOffset(rubberBand(travel * INDICATOR_RATIO, 0, FOLLOW_MAX));
      const thresholdReached = travel >= threshold;
      if (thresholdReached !== readyRef.current) haptic('threshold');
      readyRef.current = thresholdReached;
      setReady(thresholdReached);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!tracking) return;
      const released = event.changedTouches?.[0];
      // The release position, or the last tracked one when the platform
      // reports no changed touch.
      const releasedTravel = !claimed
        ? null
        : released && startY !== null
          ? Math.max(0, released.clientY - startY)
          : travel;
      // A refresh starts by distance, unless the finger went back before
      // lifting (Motion Contract 4.6). A fling does not start it: a quick
      // downward flick at the top is how people scroll back up, and an
      // accidental refresh would replace what they are reading.
      const shouldRefresh =
        releasedTravel !== null &&
        decideRelease({
          travel: releasedTravel,
          peak: Math.max(peak, releasedTravel),
          velocity: 0,
          threshold,
        }) === 'commit' &&
        !refreshInFlightRef.current &&
        isAtDocumentTop();
      // The disc continues from the finger's speed, at its half of the travel.
      const velocity =
        (released
          ? tracker.velocity({ t: event.timeStamp, p: released.clientY })
          : tracker.velocity()) * INDICATOR_RATIO;
      const wasClaimed = claimed;
      clearGesture();
      resetReady();
      if (shouldRefresh) {
        haptic('commit');
        void runRefresh(restOffset, velocity);
      } else if (wasClaimed) {
        settleBack(velocity);
      }
    };

    const onTouchCancel = () => {
      suppressClick = false;
      cancelGesture();
    };
    const onClick = (event: MouseEvent) => {
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const onPointerDown = () => {
      suppressClick = false;
    };

    const onSelectionChange = () => {
      if (tracking && window.getSelection()?.isCollapsed === false)
        cancelGesture();
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchCancel, { passive: true });
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('selectionchange', onSelectionChange);

    return () => {
      root.classList.remove('app-pull-refresh-enabled');
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchCancel);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('selectionchange', onSelectionChange);
      resetReady();
      if (claimed && !refreshInFlightRef.current) {
        stopSettle();
        stopFollowFrame();
        placeOffset(0);
        setPulling(false);
      }
    };
  }, [
    enabled,
    followOffset,
    placeOffset,
    resetReady,
    runRefresh,
    settleBack,
    stopFollowFrame,
    stopSettle,
    threshold,
  ]);

  return { pulling, ready, refreshing, supported, indicatorRef };
}

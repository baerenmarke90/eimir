import { useEffect, useRef, useState } from 'react';

/**
 * Direction-aware scroll and hysteresis constants (#970).
 *
 * Hiding requires deliberate intent (~40-60 px cumulative downward scroll).
 * Revealing is eager and easy (~10-20 px upward scroll).
 * Avoids jitter, flicker, and reacting to 1 px deltas.
 */
export const HIDE_ON_SCROLL_CONSTANTS = {
  /** Cumulative downward scroll (px) required before hiding navigation. */
  HIDE_THRESHOLD_PX: 50,
  /** Upward scroll (px) required to reveal navigation. */
  REVEAL_THRESHOLD_PX: 15,
  /** Distance from top of the page (px) where navigation is always forced visible. */
  TOP_THRESHOLD_PX: 20,
  /** Minimum delta to register as scroll movement rather than subpixel noise. */
  JITTER_TOLERANCE_PX: 2,
  /** Threshold for meaningful direction reversal (px). */
  DIRECTION_REVERSAL_TOLERANCE_PX: 6,
  /** Minimum page scrollable overflow (px) required to allow hiding. */
  MIN_SCROLLABLE_OVERFLOW_PX: 40,
} as const;

/**
 * Returns true if the given route pathname is a content-consumption feed
 * where hide-on-scroll should be active.
 *
 * Requirements:
 * - Momente / Timeline & Entdecken (/story, /story/years, /story/years/:year): true
 * - Form / Create / Edit flows (/new, /edit): false (persistent/follow flow behaviour)
 * - Heute (/today), Planen (/plan), Mehr (/more), Games (/games): false (persistent by default)
 */
export function isHideOnScrollRoute(pathname: string): boolean {
  if (pathname.includes('/new') || pathname.includes('/edit')) {
    return false;
  }
  if (pathname === '/story' || pathname.startsWith('/story/years')) {
    return true;
  }
  return false;
}

export interface ScrollNavigationState {
  isVisible: boolean;
  lastScrollY: number;
  accumulatedDown: number;
  accumulatedUp: number;
}

export function createInitialScrollNavState(
  scrollY = 0,
): ScrollNavigationState {
  return {
    isVisible: true,
    lastScrollY: Math.max(0, scrollY),
    accumulatedDown: 0,
    accumulatedUp: 0,
  };
}

export interface ScrollStepParams {
  currentScrollY: number;
  maxScrollY?: number;
  isFocused?: boolean;
  hasOpenModal?: boolean;
}

/**
 * Pure state machine transition for scroll navigation step.
 */
export function computeScrollNavStep(
  prevState: ScrollNavigationState,
  params: ScrollStepParams,
  constants = HIDE_ON_SCROLL_CONSTANTS,
): ScrollNavigationState {
  const {
    currentScrollY,
    maxScrollY = Number.POSITIVE_INFINITY,
    isFocused = false,
    hasOpenModal = false,
  } = params;

  // If focused or modal open, navigation must stay visible
  if (isFocused || hasOpenModal) {
    return {
      isVisible: true,
      lastScrollY: currentScrollY,
      accumulatedDown: 0,
      accumulatedUp: 0,
    };
  }

  // Top of page or iOS/bounce overscroll: always restore navigation
  if (currentScrollY <= constants.TOP_THRESHOLD_PX) {
    return {
      isVisible: true,
      lastScrollY: currentScrollY,
      accumulatedDown: 0,
      accumulatedUp: 0,
    };
  }

  // Short/non-scrollable page: do not hide
  if (maxScrollY <= constants.MIN_SCROLLABLE_OVERFLOW_PX) {
    return {
      isVisible: true,
      lastScrollY: currentScrollY,
      accumulatedDown: 0,
      accumulatedUp: 0,
    };
  }

  const delta = currentScrollY - prevState.lastScrollY;

  // Ignore micro jitter
  if (Math.abs(delta) < constants.JITTER_TOLERANCE_PX) {
    return {
      ...prevState,
      lastScrollY: currentScrollY,
    };
  }

  let accumulatedDown = prevState.accumulatedDown;
  let accumulatedUp = prevState.accumulatedUp;
  let isVisible = prevState.isVisible;

  if (delta > 0) {
    // Scrolling downward
    if (delta >= constants.DIRECTION_REVERSAL_TOLERANCE_PX) {
      accumulatedUp = 0;
    } else {
      accumulatedUp = Math.max(0, accumulatedUp - delta);
    }
    accumulatedDown += delta;

    if (accumulatedDown >= constants.HIDE_THRESHOLD_PX) {
      isVisible = false;
    }
  } else {
    // Scrolling upward (delta < 0)
    const upwardMagnitude = Math.abs(delta);
    if (upwardMagnitude >= constants.DIRECTION_REVERSAL_TOLERANCE_PX) {
      accumulatedDown = 0;
    } else {
      accumulatedDown = Math.max(0, accumulatedDown - upwardMagnitude);
    }
    accumulatedUp += upwardMagnitude;

    if (accumulatedUp >= constants.REVEAL_THRESHOLD_PX) {
      isVisible = true;
    }
  }

  return {
    isVisible,
    lastScrollY: currentScrollY,
    accumulatedDown,
    accumulatedUp,
  };
}

/**
 * Hook to manage context-aware hide-on-scroll for the floating bottom shell.
 */
export function useHideOnScrollNav(pathname: string) {
  const isEnabled = isHideOnScrollRoute(pathname);
  const [isVisible, setIsVisible] = useState(true);
  const stateRef = useRef<ScrollNavigationState>(createInitialScrollNavState());
  const shellRef = useRef<HTMLDivElement | null>(null);

  // Route changes always restore correct visible navigation state
  useEffect(() => {
    void pathname;
    stateRef.current = createInitialScrollNavState(
      typeof window !== 'undefined' ? window.scrollY : 0,
    );
    setIsVisible(true);
  }, [pathname]);

  useEffect(() => {
    if (!isEnabled || typeof window === 'undefined') {
      setIsVisible(true);
      return;
    }

    const handleScroll = (event: Event) => {
      // Nested controls must not accidentally hide global navigation
      if (
        event.target !== document &&
        event.target !== window &&
        event.target !== document.documentElement
      ) {
        return;
      }

      const isFocused = Boolean(
        shellRef.current &&
          document.activeElement &&
          shellRef.current.contains(document.activeElement),
      );

      const hasOpenModal = Boolean(
        document.querySelector(
          'dialog[open], [role="dialog"][aria-modal="true"]',
        ),
      );

      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      const maxScrollY = Math.max(0, scrollHeight - clientHeight);

      const nextState = computeScrollNavStep(stateRef.current, {
        currentScrollY: window.scrollY,
        maxScrollY,
        isFocused,
        hasOpenModal,
      });

      stateRef.current = nextState;
      setIsVisible(nextState.isVisible);
    };

    const handleResize = () => {
      // Viewport / orientation resize resets to visible
      stateRef.current = createInitialScrollNavState(window.scrollY);
      setIsVisible(true);
    };

    const handleFocusIn = () => {
      // When focus lands inside the bottom shell, restore visibility immediately
      if (
        shellRef.current &&
        document.activeElement &&
        shellRef.current.contains(document.activeElement)
      ) {
        stateRef.current = {
          ...stateRef.current,
          isVisible: true,
          accumulatedDown: 0,
          accumulatedUp: 0,
        };
        setIsVisible(true);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [isEnabled]);

  return {
    isVisible: isEnabled ? isVisible : true,
    shellRef,
  };
}

import { type RefObject, useEffect, useRef } from 'react';

type KeyboardLikeEvent = {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
};

let bodyScrollLocks = 0;
let originalBodyOverflow = '';

function acquireBodyScrollLock(): () => void {
  if (typeof document === 'undefined') return () => undefined;

  if (bodyScrollLocks === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  bodyScrollLocks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    bodyScrollLocks = Math.max(0, bodyScrollLocks - 1);
    if (bodyScrollLocks === 0) {
      document.body.style.overflow = originalBodyOverflow;
    }
  };
}

export interface ModalLifecycleOptions {
  active: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  restoreFocus?: boolean;
  focusDelayMs?: number;
  deferRestoreFocus?: boolean;
  shouldRestoreFocus?: () => boolean;
}

/**
 * Shared top-layer mechanics only. Product-specific close/discard semantics,
 * backdrop behavior and native <dialog> ownership stay with the caller.
 */
export function useModalLifecycle({
  active,
  initialFocusRef,
  restoreFocusRef,
  restoreFocus = true,
  focusDelayMs = 0,
  deferRestoreFocus = false,
  shouldRestoreFocus,
}: ModalLifecycleOptions): void {
  const shouldRestoreFocusRef = useRef(shouldRestoreFocus);
  shouldRestoreFocusRef.current = shouldRestoreFocus;

  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    const previousFocus =
      restoreFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const releaseScroll = acquireBodyScrollLock();
    let focusTimer: number | null = null;

    const focusInitial = () => {
      initialFocusRef?.current?.focus({ preventScroll: true });
    };

    if (initialFocusRef) {
      if (focusDelayMs > 0) {
        focusTimer = window.setTimeout(focusInitial, focusDelayMs);
      } else {
        focusInitial();
      }
    }

    return () => {
      if (focusTimer !== null) window.clearTimeout(focusTimer);
      releaseScroll();

      const mayRestore =
        restoreFocus &&
        (shouldRestoreFocusRef.current?.() ?? true) &&
        previousFocus instanceof HTMLElement;

      if (mayRestore) {
        const restore = () => {
          if (previousFocus.isConnected) {
            previousFocus.focus({ preventScroll: true });
          }
        };
        if (deferRestoreFocus) queueMicrotask(restore);
        else restore();
      }
    };
  }, [
    active,
    deferRestoreFocus,
    focusDelayMs,
    initialFocusRef,
    restoreFocus,
    restoreFocusRef,
  ]);
}

export function containModalTabFocus(
  event: KeyboardLikeEvent,
  container: HTMLElement | null,
  {
    visibleOnly = false,
    wrapFromOutside = false,
  }: {
    visibleOnly?: boolean;
    wrapFromOutside?: boolean;
  } = {},
): boolean {
  if (event.key !== 'Tab' || !container || typeof document === 'undefined') {
    return false;
  }

  let focusable = Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (visibleOnly) {
    focusable = focusable.filter((element) => element.offsetParent !== null);
  }
  if (focusable.length === 0) return false;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const activeElement = document.activeElement;
  const outside = !container.contains(activeElement);

  if (
    event.shiftKey &&
    (activeElement === first || (wrapFromOutside && outside))
  ) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (
    !event.shiftKey &&
    (activeElement === last || (wrapFromOutside && outside))
  ) {
    event.preventDefault();
    first.focus();
    return true;
  }

  return false;
}

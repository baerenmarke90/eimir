import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

export interface UseDismissiblePopoverOptions {
  onClose?: () => void;
  closeOnRouteChange?: boolean;
  /**
   * Whether Escape restores focus to the trigger immediately. A consumer that
   * owns a retained exit presentation (e.g. via `useOverlayPresence`) sets
   * this to `false` and restores focus itself once presence actually ends,
   * so focus does not jump to the trigger while a modal layer is still
   * visibly exiting.
   */
  restoreFocusOnEscape?: boolean;
  /**
   * Portal-backed modal consumers can hand outside-pointer dismissal to their
   * modal primitive while retaining this hook as the authoritative open state.
   */
  dismissOnOutsidePointerDown?: boolean;
  /**
   * Same ownership handoff for Escape: native/modal consumers handle it while
   * ordinary non-modal popovers keep the default window listener.
   */
  dismissOnEscape?: boolean;
}

export function useDismissiblePopover(
  options: UseDismissiblePopoverOptions = {},
) {
  const {
    onClose,
    closeOnRouteChange = true,
    restoreFocusOnEscape = true,
    dismissOnOutsidePointerDown = true,
    dismissOnEscape = true,
  } = options;
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const location = useLocation();

  const close = useCallback(
    (restoreFocus = false) => {
      setIsOpen((prev) => {
        if (prev) {
          onClose?.();
          return false;
        }
        return prev;
      });
      if (restoreFocus) {
        triggerRef.current?.focus();
      }
    },
    [onClose],
  );

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (!next) {
        onClose?.();
      }
      return next;
    });
  }, [onClose]);

  // Route change auto-dismiss
  useEffect(() => {
    if (
      closeOnRouteChange &&
      (location.pathname || location.search || location.hash)
    ) {
      setIsOpen(false);
    }
  }, [location.pathname, location.search, location.hash, closeOnRouteChange]);

  // Outside pointerdown and Escape key listeners
  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: PointerEvent | MouseEvent) {
      const target = event.target as Node | null;
      if (!dismissOnOutsidePointerDown || !target) return;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      close();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (dismissOnEscape && event.key === 'Escape') {
        close(restoreFocusOnEscape);
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    isOpen,
    close,
    dismissOnEscape,
    dismissOnOutsidePointerDown,
    restoreFocusOnEscape,
  ]);

  return {
    isOpen,
    setIsOpen,
    open,
    close,
    toggle,
    triggerRef,
    panelRef,
  };
}

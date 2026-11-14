import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type RefObject,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { useEditorHistoryEntry } from '../client/useEditorHistoryEntry';
import { useTranslation } from '../i18n';
import { useModalLifecycle } from './useModalLifecycle';
import { useOverlayPresence } from './useOverlayPresence';
import './ShortTaskSheet.css';

export interface ShortTaskSheetHandle {
  closeForNavigation: (
    navigate: () => void,
    options?: { animateExit?: boolean },
  ) => void;
  requestClose: () => boolean;
}

const COMPACT_DRAG_DISMISS_MIN_PX = 120;
const COMPACT_DRAG_DISMISS_MAX_PX = 180;
const COMPACT_DRAG_DISMISS_RATIO = 0.22;
const COMPACT_DRAG_REVERSAL_CANCEL_PX = 24;
const COMPACT_DRAG_SLOP_PX = 4;
const COMPACT_DRAG_AXIS_DOMINANCE = 1.15;
const EXPANDED_QUERY = '(min-width: 840px)';

// A deliberate downward pull may start anywhere on the sheet surface,
// including buttons, links and list rows (the release then does not activate
// them). Only controls whose own vertical gesture or text caret would be taken
// away stay excluded.
const GESTURE_OWNER_DRAG_EXCLUSION_SELECTOR = [
  'input',
  'textarea',
  'select',
  'option',
  'iframe',
  'video',
  'audio',
  '.place-map-viewport',
  '.photo-crop-stage',
  '[draggable="true"]',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="slider"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="listbox"]',
].join(',');

type DragInput = 'pointer' | 'touch';
type DragMoveResult = 'pending' | 'claimed-now' | 'claimed' | 'cancelled';

interface DragFinishResult {
  wasDrag: boolean;
}

interface DragGestureHandlers {
  begin: (
    input: DragInput,
    identifier: number,
    clientX: number,
    clientY: number,
    target: EventTarget | null,
  ) => boolean;
  move: (
    input: DragInput,
    identifier: number,
    clientX: number,
    clientY: number,
  ) => DragMoveResult;
  finish: (
    input: DragInput,
    identifier: number,
    clientY: number,
    allowDismiss: boolean,
  ) => DragFinishResult;
}

/** A bounded choice task: the native modal owns inertness and keyboard focus. */
export function ShortTaskSheet({
  open,
  title,
  onClose,
  children,
  footer,
  initialFocusRef,
  isDirty = false,
  isCloseBlocked = false,
  onDiscardRequested,
  onCloseBlocked,
  restoreFocusRef,
  onPresenceChange,
  role = 'dialog',
  className = '',
  closeLabel,
  id,
  ref,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  isDirty?: boolean;
  isCloseBlocked?: boolean;
  onDiscardRequested?: () => void;
  onCloseBlocked?: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  onPresenceChange?: (present: boolean) => void;
  role?: 'dialog' | 'alertdialog';
  className?: string;
  closeLabel?: string;
  id?: string;
  ref?: Ref<ShortTaskSheetHandle>;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const navigatingRef = useRef(false);
  const pendingNavigationRef = useRef<{
    navigate: () => void;
    animateExit: boolean;
  } | null>(null);
  const implicitRestoreFocusRef = useRef<HTMLElement | null>(null);
  const wasPresentRef = useRef(false);
  const dragIdentifierRef = useRef<number | null>(null);
  const dragInputRef = useRef<DragInput | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const dragMaxDistanceRef = useRef(0);
  const dragPeakOffsetRef = useRef(0);
  const dragSheetHeightRef = useRef(COMPACT_DRAG_DISMISS_MAX_PX);
  const dragScrollOwnerRef = useRef<HTMLElement | null>(null);
  const dragClaimedRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const gestureHandlersRef = useRef<DragGestureHandlers | null>(null);
  const closeConfirmed = useEditorHistoryEntry({
    isActive: open,
    isDirty,
    isCloseBlocked,
    onDiscardRequested: onDiscardRequested ?? onClose,
    onCloseBlocked,
    onClose,
  });
  const requestDiscard = onDiscardRequested ?? onClose;

  function requestClose(): boolean {
    if (isCloseBlocked) {
      onCloseBlocked?.();
      return false;
    }
    if (isDirty) {
      requestDiscard();
      return false;
    }
    closeConfirmed();
    return true;
  }

  const resolvedCloseLabel = closeLabel?.trim() || t('taskSheets.close');
  const {
    present: retainedPresence,
    presenceState,
    completeExit,
  } = useOverlayPresence(open);
  const present =
    retainedPresence &&
    (open || pendingNavigationRef.current?.animateExit !== false);

  useLayoutEffect(() => {
    if (present && !wasPresentRef.current && typeof document !== 'undefined') {
      const activeElement = restoreFocusRef?.current ?? document.activeElement;
      implicitRestoreFocusRef.current =
        activeElement instanceof HTMLElement ? activeElement : null;
    }
    wasPresentRef.current = present;
  }, [present, restoreFocusRef]);

  useEffect(() => {
    onPresenceChange?.(present);
  }, [onPresenceChange, present]);

  function isCompactPresentation(): boolean {
    return (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function' ||
      !window.matchMedia(EXPANDED_QUERY).matches
    );
  }

  function updateDragOffset(offset: number): void {
    dialogRef.current?.style.setProperty(
      '--short-task-sheet-drag-offset',
      `${Math.max(0, offset)}px`,
    );
  }

  function compactDragDismissThreshold(): number {
    const height = dragSheetHeightRef.current;
    return Math.min(
      COMPACT_DRAG_DISMISS_MAX_PX,
      Math.max(
        COMPACT_DRAG_DISMISS_MIN_PX,
        height * COMPACT_DRAG_DISMISS_RATIO,
      ),
    );
  }

  function resetPendingDrag(): void {
    dragIdentifierRef.current = null;
    dragInputRef.current = null;
    dragStartXRef.current = 0;
    dragStartYRef.current = 0;
    dragMaxDistanceRef.current = 0;
    dragPeakOffsetRef.current = 0;
    dragScrollOwnerRef.current = null;
    dragClaimedRef.current = false;
  }

  function elementFromTarget(target: EventTarget | null): Element | null {
    return target instanceof Element ? target : null;
  }

  function findScrollableAncestor(
    target: Element,
    dialog: HTMLDialogElement,
  ): HTMLElement | null {
    let current: Element | null = target;
    while (current && current !== dialog) {
      if (current instanceof HTMLElement) {
        if (current.classList.contains('short-task-sheet-body')) return current;
        const style = window.getComputedStyle(current);
        const scrollableOverflow = /(auto|scroll|overlay)/.test(
          style.overflowY,
        );
        if (
          scrollableOverflow &&
          (current.scrollHeight > current.clientHeight || current.scrollTop > 0)
        ) {
          return current;
        }
      }
      current = current.parentElement;
    }
    return null;
  }

  function canArmSurfaceDrag(
    target: EventTarget | null,
    dialog: HTMLDialogElement,
  ): { scrollOwner: HTMLElement | null } | null {
    const element = elementFromTarget(target);
    if (!element || element === dialog || !dialog.contains(element))
      return null;

    if (element.closest(GESTURE_OWNER_DRAG_EXCLUSION_SELECTOR)) return null;

    const scrollOwner = findScrollableAncestor(element, dialog);
    if (scrollOwner && scrollOwner.scrollTop > 0) return null;

    return { scrollOwner };
  }

  function beginDragGesture(
    input: DragInput,
    identifier: number,
    clientX: number,
    clientY: number,
    target: EventTarget | null,
  ): boolean {
    if (
      !isCompactPresentation() ||
      dragIdentifierRef.current !== null ||
      presenceState !== 'open'
    ) {
      return false;
    }

    const dialog = dialogRef.current;
    if (!dialog) return false;
    const armed = canArmSurfaceDrag(target, dialog);
    if (!armed) return false;

    dragIdentifierRef.current = identifier;
    dragInputRef.current = input;
    dragStartXRef.current = clientX;
    dragStartYRef.current = clientY;
    dragMaxDistanceRef.current = 0;
    dragPeakOffsetRef.current = 0;
    dragSheetHeightRef.current = Math.max(
      dialog.getBoundingClientRect().height,
      COMPACT_DRAG_DISMISS_MAX_PX,
    );
    dragScrollOwnerRef.current = armed.scrollOwner;
    dragClaimedRef.current = false;
    suppressNextClickRef.current = false;
    return true;
  }

  function abandonPendingDrag(): void {
    if (dragClaimedRef.current) {
      dialogRef.current?.removeAttribute('data-dragging');
      updateDragOffset(0);
    }
    resetPendingDrag();
  }

  function moveDragGesture(
    input: DragInput,
    identifier: number,
    clientX: number,
    clientY: number,
  ): DragMoveResult {
    if (
      dragIdentifierRef.current !== identifier ||
      dragInputRef.current !== input
    ) {
      return 'cancelled';
    }

    const deltaX = clientX - dragStartXRef.current;
    const deltaY = clientY - dragStartYRef.current;
    const absoluteX = Math.abs(deltaX);
    const absoluteY = Math.abs(deltaY);
    if (!dragClaimedRef.current) {
      if (
        absoluteX <= COMPACT_DRAG_SLOP_PX &&
        absoluteY <= COMPACT_DRAG_SLOP_PX
      ) {
        return 'pending';
      }

      if (
        deltaY <= 0 ||
        absoluteY < absoluteX * COMPACT_DRAG_AXIS_DOMINANCE ||
        (dragScrollOwnerRef.current && dragScrollOwnerRef.current.scrollTop > 0)
      ) {
        abandonPendingDrag();
        return 'cancelled';
      }

      dragClaimedRef.current = true;
      const dialog = dialogRef.current;
      dialog?.setAttribute('data-interacted', 'true');
      dialog?.setAttribute('data-dragging', 'true');
      updateDragOffset(deltaY);
      dragPeakOffsetRef.current = Math.max(
        dragPeakOffsetRef.current,
        Math.max(0, deltaY),
      );
      return 'claimed-now';
    }

    const offset = Math.max(0, deltaY);
    dragPeakOffsetRef.current = Math.max(dragPeakOffsetRef.current, offset);
    updateDragOffset(offset);
    return 'claimed';
  }

  function finishDragGesture(
    input: DragInput,
    identifier: number,
    clientY: number,
    allowDismiss: boolean,
  ): DragFinishResult {
    if (
      dragIdentifierRef.current !== identifier ||
      dragInputRef.current !== input
    ) {
      return { wasDrag: false };
    }

    const wasDrag = dragClaimedRef.current;
    if (!wasDrag) {
      resetPendingDrag();
      return { wasDrag: false };
    }

    const deltaY = clientY - dragStartYRef.current;
    const offset = Math.max(0, deltaY);
    dragPeakOffsetRef.current = Math.max(dragPeakOffsetRef.current, offset);
    const reversedUpward =
      dragPeakOffsetRef.current - offset >= COMPACT_DRAG_REVERSAL_CANCEL_PX;
    dialogRef.current?.removeAttribute('data-dragging');
    // A claimed pull must not fall through into the control it started on.
    suppressNextClickRef.current = true;

    const shouldDismiss =
      allowDismiss &&
      !reversedUpward &&
      offset >= compactDragDismissThreshold();

    resetPendingDrag();

    if (shouldDismiss && requestClose()) {
      return { wasDrag: true };
    }

    updateDragOffset(0);
    return { wasDrag: true };
  }

  gestureHandlersRef.current = {
    begin: beginDragGesture,
    move: moveDragGesture,
    finish: finishDragGesture,
  };

  useImperativeHandle(ref, () => ({
    requestClose,
    closeForNavigation(navigate, { animateExit = true } = {}) {
      closeConfirmed(() => {
        // Auth/Space teardown may have ended this task during history removal.
        const dialog = dialogRef.current;
        if (!dialog?.isConnected) return;
        navigatingRef.current = true;
        pendingNavigationRef.current = { navigate, animateExit };
        onClose();
      });
    },
  }));

  useEffect(() => {
    if (!present) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      dragIdentifierRef.current = null;
      dragInputRef.current = null;
      dragStartXRef.current = 0;
      dragStartYRef.current = 0;
      dragMaxDistanceRef.current = 0;
      dragPeakOffsetRef.current = 0;
      dragScrollOwnerRef.current = null;
      dragClaimedRef.current = false;
      dialog.removeAttribute('data-interacted');
      dialog.removeAttribute('data-dragging');
      dialog.style.removeProperty('--short-task-sheet-drag-offset');
      dialog.style.removeProperty('--short-task-sheet-drag-progress');
      dialog.style.removeProperty('--short-task-sheet-backdrop-opacity');
      dialog.close();
    };
  }, [present]);

  useEffect(() => {
    if (!present) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    function findTouch(list: TouchList, identifier: number): Touch | undefined {
      return Array.from(list).find((touch) => touch.identifier === identifier);
    }

    function onTouchStart(event: TouchEvent): void {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      gestureHandlersRef.current?.begin(
        'touch',
        touch.identifier,
        touch.clientX,
        touch.clientY,
        event.target,
      );
    }

    function onTouchMove(event: TouchEvent): void {
      if (
        dragInputRef.current !== 'touch' ||
        dragIdentifierRef.current === null
      ) {
        return;
      }
      const touch = findTouch(event.touches, dragIdentifierRef.current);
      if (!touch) return;
      const result = gestureHandlersRef.current?.move(
        'touch',
        touch.identifier,
        touch.clientX,
        touch.clientY,
      );
      if (
        (result === 'claimed-now' || result === 'claimed') &&
        event.cancelable
      ) {
        event.preventDefault();
      }
    }

    function finishTouch(event: TouchEvent, allowDismiss: boolean): void {
      if (
        dragInputRef.current !== 'touch' ||
        dragIdentifierRef.current === null
      ) {
        return;
      }
      const identifier = dragIdentifierRef.current;
      const touch =
        findTouch(event.changedTouches, identifier) ??
        findTouch(event.touches, identifier);
      const result = gestureHandlersRef.current?.finish(
        'touch',
        identifier,
        touch?.clientY ?? dragStartYRef.current,
        allowDismiss,
      );
      if (result?.wasDrag && event.cancelable) event.preventDefault();
    }

    function onTouchEnd(event: TouchEvent): void {
      finishTouch(event, true);
    }

    function onTouchCancel(event: TouchEvent): void {
      finishTouch(event, false);
    }

    dialog.addEventListener('touchstart', onTouchStart, { passive: true });
    dialog.addEventListener('touchmove', onTouchMove, { passive: false });
    dialog.addEventListener('touchend', onTouchEnd, { passive: false });
    dialog.addEventListener('touchcancel', onTouchCancel, { passive: false });
    return () => {
      dialog.removeEventListener('touchstart', onTouchStart);
      dialog.removeEventListener('touchmove', onTouchMove);
      dialog.removeEventListener('touchend', onTouchEnd);
      dialog.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [present]);

  useEffect(() => {
    if (!open || !present) return;
    navigatingRef.current = false;
    pendingNavigationRef.current = null;
    dragIdentifierRef.current = null;
    dragInputRef.current = null;
    dragStartXRef.current = 0;
    dragStartYRef.current = 0;
    dragMaxDistanceRef.current = 0;
    dragPeakOffsetRef.current = 0;
    dragScrollOwnerRef.current = null;
    dragClaimedRef.current = false;
    suppressNextClickRef.current = false;
    const dialog = dialogRef.current;
    dialog?.removeAttribute('data-interacted');
    dialog?.removeAttribute('data-dragging');
    dialog?.style.setProperty('--short-task-sheet-drag-offset', '0px');
    dialog?.style.setProperty('--short-task-sheet-drag-progress', '0');
    dialog?.style.setProperty('--short-task-sheet-backdrop-opacity', '1');
  }, [open, present]);

  useEffect(() => {
    if (present) return;
    const handoff = pendingNavigationRef.current;
    if (!handoff) return;
    pendingNavigationRef.current = null;
    if (!handoff.animateExit) completeExit();
    // React runs passive cleanup for the prior presentation before setup
    // effects for this closed state, so native modality and scroll ownership
    // are already released before the destination can assign focus.
    handoff.navigate();
  }, [completeExit, present]);

  useModalLifecycle({
    active: present,
    initialFocusRef: initialFocusRef ?? closeRef,
    restoreFocusRef: implicitRestoreFocusRef,
    deferRestoreFocus: true,
    shouldRestoreFocus: () => !navigatingRef.current,
  });

  if (!present || typeof document === 'undefined') return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      id={id}
      className={`short-task-sheet ${className}`}
      data-presence={presenceState}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        // Keep Escape with this native dialog; ancestor editor shortcuts must
        // not dismiss a second task. The browser still dispatches cancel.
        if (event.key === 'Escape') event.stopPropagation();
      }}
      onCancel={(event) => {
        // A nested sheet's cancel reaches this handler through the React
        // portal tree; only the topmost dialog closes on Escape.
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        // Native cancel still propagates through React's parent portal tree.
        event.stopPropagation();
        requestClose();
      }}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget || presenceState !== 'exiting')
          return;
        completeExit();
      }}
      onPointerDownCapture={() => {
        // Every new press starts without a stale suppression; a touch pull
        // produces no click of its own to consume the flag.
        suppressNextClickRef.current = false;
      }}
      onClickCapture={(event) => {
        if (event.detail === 0 || !suppressNextClickRef.current) return;
        suppressNextClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onDragStart={(event) => {
        // A mouse pull armed on a link or image must not become a native
        // drag-and-drop, which would cancel the sheet gesture.
        if (
          dragInputRef.current === 'pointer' &&
          dragIdentifierRef.current !== null
        ) {
          event.preventDefault();
        }
      }}
      onPointerDown={(event: ReactPointerEvent<HTMLDialogElement>) => {
        if (
          event.pointerType === 'touch' ||
          event.button !== 0 ||
          event.isPrimary === false
        ) {
          return;
        }
        gestureHandlersRef.current?.begin(
          'pointer',
          event.pointerId,
          event.clientX,
          event.clientY,
          event.target,
        );
      }}
      onPointerMove={(event: ReactPointerEvent<HTMLDialogElement>) => {
        if (event.pointerType === 'touch') return;
        const result = gestureHandlersRef.current?.move(
          'pointer',
          event.pointerId,
          event.clientX,
          event.clientY,
        );
        if (result !== 'claimed-now' && result !== 'claimed') return;
        event.preventDefault();
        if (
          result === 'claimed-now' &&
          typeof event.currentTarget.setPointerCapture === 'function'
        ) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }}
      onPointerUp={(event: ReactPointerEvent<HTMLDialogElement>) => {
        if (event.pointerType === 'touch') return;
        const result = gestureHandlersRef.current?.finish(
          'pointer',
          event.pointerId,
          event.clientY,
          true,
        );
        if (result?.wasDrag) event.preventDefault();
        if (
          typeof event.currentTarget.hasPointerCapture === 'function' &&
          event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={(event: ReactPointerEvent<HTMLDialogElement>) => {
        if (event.pointerType === 'touch') return;
        const result = gestureHandlersRef.current?.finish(
          'pointer',
          event.pointerId,
          event.clientY,
          false,
        );
        if (result?.wasDrag) event.preventDefault();
        if (
          typeof event.currentTarget.hasPointerCapture === 'function' &&
          event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          requestClose();
      }}
    >
      <header className="short-task-sheet-header">
        <button
          ref={closeRef}
          type="button"
          className="short-task-sheet-close short-task-sheet-drag-zone"
          aria-label={resolvedCloseLabel}
          title={resolvedCloseLabel}
          onClick={() => requestClose()}
        >
          <span className="short-task-sheet-drag-handle" aria-hidden="true" />
          <svg
            className="short-task-sheet-close-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6 6 18 18M18 6 6 18" />
          </svg>
        </button>
      </header>
      <section
        className="short-task-sheet-body"
        aria-labelledby={titleId}
        tabIndex={footer ? 0 : undefined}
      >
        <h2 id={titleId} className="short-task-sheet-title">
          {title}
        </h2>
        {children}
      </section>
      {footer ? <div className="short-task-sheet-footer">{footer}</div> : null}
    </dialog>,
    document.body,
  );
}

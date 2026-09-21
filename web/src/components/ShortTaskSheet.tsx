import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
  type RefObject,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { useEditorHistoryEntry } from '../client/useEditorHistoryEntry';
import { useTranslation } from '../i18n';
import { useModalLifecycle } from './useModalLifecycle';
import './ShortTaskSheet.css';

export interface ShortTaskSheetHandle {
  closeForNavigation: (navigate: () => void) => void;
}

const COMPACT_DRAG_DISMISS_THRESHOLD_PX = 72;

/** A bounded choice task: the native modal owns inertness and keyboard focus. */
export function ShortTaskSheet({
  open,
  title,
  onClose,
  children,
  initialFocusRef,
  restoreFocusRef,
  role = 'dialog',
  className = '',
  closeLabel,
  id,
  ref,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  restoreFocusRef?: RefObject<HTMLElement | null>;
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
  const dragPointerRef = useRef<number | null>(null);
  const dragStartYRef = useRef(0);
  const dragMaxDistanceRef = useRef(0);
  const suppressNextClickRef = useRef(false);
  const closeSheet = useEditorHistoryEntry({
    isActive: open,
    isDirty: false,
    onDiscardRequested: onClose,
    onClose,
  });
  const resolvedCloseLabel = closeLabel?.trim() || t('taskSheets.close');

  function updateDragOffset(offset: number): void {
    dialogRef.current?.style.setProperty(
      '--short-task-sheet-drag-offset',
      `${Math.max(0, offset)}px`,
    );
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>): void {
    const expanded =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(min-width: 840px)').matches;
    if (expanded || event.button !== 0 || dragPointerRef.current !== null)
      return;
    dragPointerRef.current = event.pointerId;
    dragStartYRef.current = event.clientY;
    dragMaxDistanceRef.current = 0;
    suppressNextClickRef.current = false;
    dialogRef.current?.setAttribute('data-dragging', 'true');
    updateDragOffset(0);
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (dragPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    const delta = event.clientY - dragStartYRef.current;
    dragMaxDistanceRef.current = Math.max(
      dragMaxDistanceRef.current,
      Math.abs(delta),
    );
    updateDragOffset(delta);
  }

  function finishDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    allowDismiss: boolean,
  ): void {
    if (dragPointerRef.current !== event.pointerId) return;
    const delta = event.clientY - dragStartYRef.current;
    const offset = Math.max(0, delta);
    dragMaxDistanceRef.current = Math.max(
      dragMaxDistanceRef.current,
      Math.abs(delta),
    );
    const wasDrag = dragMaxDistanceRef.current > 4;
    dragPointerRef.current = null;

    if (
      typeof event.currentTarget.hasPointerCapture === 'function' &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dialogRef.current?.removeAttribute('data-dragging');
    if (wasDrag) {
      suppressNextClickRef.current = true;
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 0);
    }
    if (allowDismiss && offset >= COMPACT_DRAG_DISMISS_THRESHOLD_PX) {
      closeSheet();
      return;
    }
    updateDragOffset(0);
  }

  useImperativeHandle(ref, () => ({
    closeForNavigation(navigate) {
      navigatingRef.current = true;
      closeSheet(() => {
        // Auth/Space teardown may have ended this task during history removal.
        const dialog = dialogRef.current;
        if (!dialog?.isConnected) return;
        // End native modality before the destination can assign its focus.
        dialog.close();
        onClose();
        navigate();
      });
    },
  }));

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    navigatingRef.current = false;
    dragPointerRef.current = null;
    dragMaxDistanceRef.current = 0;
    suppressNextClickRef.current = false;
    dialog.removeAttribute('data-dragging');
    dialog.style.setProperty('--short-task-sheet-drag-offset', '0px');
    dialog.showModal();
    return () => {
      dragPointerRef.current = null;
      dialog.removeAttribute('data-dragging');
      dialog.style.removeProperty('--short-task-sheet-drag-offset');
      dialog.close();
    };
  }, [open]);

  useModalLifecycle({
    active: open,
    initialFocusRef: initialFocusRef ?? closeRef,
    restoreFocusRef,
    deferRestoreFocus: true,
    shouldRestoreFocus: () => !navigatingRef.current,
  });

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      id={id}
      className={`short-task-sheet ${className}`}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        // Keep Escape with this native dialog; ancestor editor shortcuts must
        // not dismiss a second task. The browser still dispatches cancel.
        if (event.key === 'Escape') event.stopPropagation();
      }}
      onCancel={(event) => {
        event.preventDefault();
        closeSheet();
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
          closeSheet();
      }}
    >
      <header className="short-task-sheet-header">
        <button
          ref={closeRef}
          type="button"
          className="short-task-sheet-close short-task-sheet-drag-zone"
          aria-label={resolvedCloseLabel}
          title={resolvedCloseLabel}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={(event) => finishDrag(event, true)}
          onPointerCancel={(event) => finishDrag(event, false)}
          onClick={() => {
            if (suppressNextClickRef.current) {
              suppressNextClickRef.current = false;
              return;
            }
            closeSheet();
          }}
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
      <div className="short-task-sheet-body">
        <h2 id={titleId} className="short-task-sheet-title">
          {title}
        </h2>
        {children}
      </div>
    </dialog>,
    document.body,
  );
}

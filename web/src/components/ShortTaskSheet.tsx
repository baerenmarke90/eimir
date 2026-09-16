import {
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
import './ShortTaskSheet.css';

export interface ShortTaskSheetHandle {
  closeForNavigation: (navigate: () => void) => void;
}

let scrollLocks = 0;
let originalBodyOverflow = '';

function lockBody(): () => void {
  if (scrollLocks === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
  return () => {
    scrollLocks -= 1;
    if (scrollLocks === 0) document.body.style.overflow = originalBodyOverflow;
  };
}

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
  const closeSheet = useEditorHistoryEntry({
    isActive: open,
    isDirty: false,
    onDiscardRequested: onClose,
    onClose,
  });

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
    const previousFocus = restoreFocusRef?.current ?? document.activeElement;
    const releaseScroll = lockBody();
    dialog.showModal();
    (initialFocusRef?.current ?? closeRef.current)?.focus({
      preventScroll: true,
    });
    return () => {
      dialog.close();
      releaseScroll();
      if (!navigatingRef.current && previousFocus instanceof HTMLElement) {
        // The trigger may have been hidden until the same React commit closed us.
        queueMicrotask(() => {
          if (previousFocus.isConnected)
            previousFocus.focus({ preventScroll: true });
        });
      }
    };
  }, [open, initialFocusRef, restoreFocusRef]);

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
          className="short-task-sheet-close"
          aria-label={closeLabel}
          onClick={() => closeSheet()}
        >
          {t('taskSheets.close')}
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

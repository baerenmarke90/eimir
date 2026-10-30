import { type ReactNode, type RefObject, useEffect, useState } from 'react';
import { PlanningDiscardConfirmation } from './PlanningEditorLifecycle';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';

/** Short content tasks share the existing modal, history and discard contract. */
export function SharedContentSheet({
  open,
  title,
  isDirty = false,
  isPending = false,
  onClose,
  initialFocusRef,
  restoreFocusRef,
  sheetRef,
  hasDismissLayer = false,
  onDismissLayer,
  children,
}: {
  open: boolean;
  title: string;
  isDirty?: boolean;
  isPending?: boolean;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  sheetRef?: RefObject<ShortTaskSheetHandle | null>;
  hasDismissLayer?: boolean;
  onDismissLayer?: () => void;
  children: (requestClose: () => void) => ReactNode;
}) {
  const [discardOpen, setDiscardOpen] = useState(false);
  useEffect(() => {
    if (!open) setDiscardOpen(false);
  }, [open]);
  function requestClose() {
    if (isPending) return;
    if (hasDismissLayer) {
      onDismissLayer?.();
      return;
    }
    if (discardOpen) {
      setDiscardOpen(false);
      initialFocusRef?.current?.focus();
      return;
    }
    if (isDirty) setDiscardOpen(true);
    else onClose();
  }
  return (
    <ShortTaskSheet
      ref={sheetRef}
      open={open}
      title={title}
      isDirty={isDirty || hasDismissLayer || discardOpen}
      isCloseBlocked={isPending}
      onDiscardRequested={requestClose}
      onClose={onClose}
      initialFocusRef={initialFocusRef}
      restoreFocusRef={restoreFocusRef}
      className="shared-content-sheet"
    >
      {discardOpen ? (
        <PlanningDiscardConfirmation
          onKeepEditing={() => {
            setDiscardOpen(false);
            initialFocusRef?.current?.focus();
          }}
          onDiscard={onClose}
        />
      ) : null}
      {children(requestClose)}
    </ShortTaskSheet>
  );
}

export function ContentChevron() {
  return (
    <svg
      className="content-chevron"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

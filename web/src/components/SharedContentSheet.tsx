import { type ReactNode, type RefObject, useEffect, useState } from 'react';
import { EimirIcon } from './EimirIcon';
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
  return <EimirIcon name="chevron-right" className="content-chevron" />;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDocumentLeaveGuard } from './useDocumentLeaveGuard';
import { useEditorHistoryEntry } from './useEditorHistoryEntry';
import { useTaskActivation } from './useTaskActivation';

export function useTaskEditorLifecycle({
  isActive = true,
  isDirty,
  isCloseBlocked = false,
  onCloseBlocked,
  onClose,
}: {
  isActive?: boolean;
  isDirty: boolean;
  isCloseBlocked?: boolean;
  onCloseBlocked?: () => void;
  onClose: () => void;
}) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const requestedDestination = useRef<(() => void) | undefined>(undefined);
  const requestDiscard = useCallback(() => setShowDiscardConfirm(true), []);
  const keepEditing = useCallback(() => {
    requestedDestination.current = undefined;
    setShowDiscardConfirm(false);
  }, []);
  const captureOwnership = useTaskActivation(isActive);

  const closeHistory = useEditorHistoryEntry({
    isActive,
    isDirty,
    isCloseBlocked,
    onDiscardRequested: requestDiscard,
    onCloseBlocked,
    onClose,
  });

  const closeConfirmed = useCallback(
    (afterClose?: unknown) => {
      const destination =
        typeof afterClose === 'function'
          ? afterClose
          : requestedDestination.current;
      requestedDestination.current = undefined;
      setShowDiscardConfirm(false);
      closeHistory(destination);
    },
    [closeHistory],
  );

  const requestClose = useCallback(
    (afterClose?: unknown) => {
      if (!isActive || isCloseBlocked) return;
      requestedDestination.current =
        typeof afterClose === 'function' ? () => afterClose() : undefined;
      if (isDirty) {
        requestDiscard();
        return;
      }
      closeConfirmed();
    },
    [closeConfirmed, isActive, isCloseBlocked, isDirty, requestDiscard],
  );

  useEffect(() => {
    if (!isActive) keepEditing();
  }, [isActive, keepEditing]);

  useDocumentLeaveGuard(isActive && (isDirty || isCloseBlocked));

  return {
    captureOwnership,
    showDiscardConfirm,
    keepEditing,
    closeConfirmed,
    requestClose,
  };
}

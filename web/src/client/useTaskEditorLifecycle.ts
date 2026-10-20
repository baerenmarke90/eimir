import { useCallback, useEffect, useState } from 'react';
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
  const requestDiscard = useCallback(() => setShowDiscardConfirm(true), []);
  const keepEditing = useCallback(() => setShowDiscardConfirm(false), []);
  const captureOwnership = useTaskActivation(isActive);

  const closeConfirmed = useEditorHistoryEntry({
    isActive,
    isDirty,
    isCloseBlocked,
    onDiscardRequested: requestDiscard,
    onCloseBlocked,
    onClose,
  });

  const requestClose = useCallback(() => {
    if (!isActive || isCloseBlocked) return;
    if (isDirty) {
      requestDiscard();
      return;
    }
    closeConfirmed();
  }, [closeConfirmed, isActive, isCloseBlocked, isDirty, requestDiscard]);

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

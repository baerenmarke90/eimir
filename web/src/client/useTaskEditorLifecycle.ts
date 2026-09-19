import { useCallback, useEffect, useState } from 'react';
import { useEditorHistoryEntry } from './useEditorHistoryEntry';

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

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !isActive ||
      (!isDirty && !isCloseBlocked)
    )
      return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isActive, isCloseBlocked, isDirty]);

  return {
    showDiscardConfirm,
    keepEditing,
    closeConfirmed,
    requestClose,
  };
}

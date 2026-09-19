import { type RefObject, useEffect, useId, useRef } from 'react';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import { useTranslation } from '../i18n';

export function usePlanningEditorLifecycle({
  isActive = true,
  isDirty,
  isPending,
  initialFocusRef,
  restoreFocusRef,
  onEscape,
  onClose,
}: {
  isActive?: boolean;
  isDirty: boolean;
  isPending: boolean;
  initialFocusRef: RefObject<HTMLElement | null>;
  restoreFocusRef: RefObject<HTMLElement | null>;
  onEscape?: () => boolean;
  onClose: () => void;
}) {
  const { showDiscardConfirm, keepEditing, closeConfirmed, requestClose } =
    useTaskEditorLifecycle({
      isActive,
      isDirty,
      isCloseBlocked: isPending,
      onClose,
    });

  useEffect(() => {
    if (!isActive) return;
    initialFocusRef.current?.focus();
    return () => restoreFocusRef.current?.focus();
  }, [initialFocusRef, isActive, restoreFocusRef]);

  useEffect(() => {
    if (!isActive) return;
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape' || isPending) return;
      event.preventDefault();
      if (onEscape?.()) return;
      if (showDiscardConfirm) keepEditing();
      else requestClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    isActive,
    isPending,
    keepEditing,
    onEscape,
    requestClose,
    showDiscardConfirm,
  ]);

  return {
    showDiscardConfirm,
    keepEditing,
    discard: closeConfirmed,
    requestClose,
  };
}

export function PlanningDiscardConfirmation({
  onKeepEditing,
  onDiscard,
}: {
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => titleRef.current?.focus(), []);

  return (
    <section
      className="inline-message inline-message-danger focused-editor-confirmation"
      role="alertdialog"
      aria-labelledby={titleId}
    >
      <h3 ref={titleRef} id={titleId} tabIndex={-1}>
        {t('m5s3.common.discardTitle')}
      </h3>
      <p>{t('m5s3.common.discardBody')}</p>
      <div className="form-actions choice-row">
        <button type="button" className="secondary" onClick={onKeepEditing}>
          {t('m5s3.common.keepEditing')}
        </button>
        <button type="button" className="danger" onClick={onDiscard}>
          {t('m5s3.common.discardConfirm')}
        </button>
      </div>
    </section>
  );
}

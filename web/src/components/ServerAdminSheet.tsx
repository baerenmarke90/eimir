import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useRef,
} from 'react';
import { useTranslation } from '../i18n';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';
import './ServerAdminSheet.css';

/**
 * A modal sheet for one ServerAdmin action: bottom sheet on Compact,
 * centred dialog on Expanded. Escape and the close button leave it unless
 * a request is still running.
 */
export function ServerAdminSheet({
  titleId,
  title,
  busy,
  onClose,
  initialFocusRef,
  children,
}: {
  titleId: string;
  title: string;
  busy: boolean;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useModalLifecycle({
    active: true,
    initialFocusRef: initialFocusRef ?? closeRef,
  });

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onClose();
      return;
    }
    containModalTabFocus(event, dialogRef.current);
  }

  return (
    <div className="server-admin-sheet-layer">
      {/* A sibling, so its fade never dims the sheet's own text. */}
      <div className="server-admin-sheet-backdrop" aria-hidden="true" />
      <section
        ref={dialogRef}
        className="server-admin-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <div className="server-admin-sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button
            ref={closeRef}
            type="button"
            className="text-button"
            disabled={busy}
            onClick={onClose}
          >
            {t('serverAdmin.sheet.close')}
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

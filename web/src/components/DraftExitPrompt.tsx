import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';

export function DraftExitPrompt({
  open,
  onKeep,
  onDiscard,
}: {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const discarding = useRef(false);
  const [closingForDiscard, setClosingForDiscard] = useState(false);
  useEffect(() => {
    if (!open) {
      discarding.current = false;
      setClosingForDiscard(false);
    }
  }, [open]);
  return (
    <ShortTaskSheet
      ref={sheet}
      open={open && !closingForDiscard}
      title={t('taskBoundary.discardTitle')}
      onClose={() => {
        // A deliberate discard must retain the editor's requested destination
        // until this sheet releases history, modality and focus ownership.
        if (discarding.current) setClosingForDiscard(true);
        else onKeep();
      }}
    >
      <p>{t('taskBoundary.discardBody')}</p>
      <div className="form-actions">
        <button type="button" className="primary" onClick={onKeep}>
          {t('taskBoundary.keepEditing')}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            discarding.current = true;
            sheet.current?.closeForNavigation(onDiscard);
          }}
        >
          {t('taskBoundary.discard')}
        </button>
      </div>
    </ShortTaskSheet>
  );
}

import { useTranslation } from '../i18n';
import { ShortTaskSheet } from './ShortTaskSheet';

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
  return (
    <ShortTaskSheet
      open={open}
      title={t('taskBoundary.discardTitle')}
      onClose={onKeep}
    >
      <p>{t('taskBoundary.discardBody')}</p>
      <div className="form-actions">
        <button type="button" className="primary" onClick={onKeep}>
          {t('taskBoundary.keepEditing')}
        </button>
        <button type="button" className="secondary" onClick={onDiscard}>
          {t('taskBoundary.discard')}
        </button>
      </div>
    </ShortTaskSheet>
  );
}

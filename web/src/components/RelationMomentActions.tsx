import { useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import { ListEntryIconButton } from './ListEntryActions';
import { ProblemState } from './ProblemState';
import { SharedContentSheet } from './SharedContentSheet';

export function RelationMomentActions({
  name,
  pending,
  error,
  onRemove,
  ownerKind = 'place',
}: {
  name: string;
  pending: boolean;
  error: unknown;
  onRemove: () => Promise<unknown>;
  ownerKind?: 'place' | 'chapter';
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <ListEntryIconButton
        ref={trigger}
        icon="more"
        className="tertiary"
        label={t('m5s3.relations.actions', { title: name })}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      />
      <SharedContentSheet
        open={open}
        title={name}
        isPending={pending}
        restoreFocusRef={trigger}
        onClose={() => setOpen(false)}
      >
        {(requestClose) => (
          <>
            <p>
              {t(
                ownerKind === 'chapter'
                  ? 'm5s3.relations.unlinkChapterConsequence'
                  : 'm5s3.relations.unlinkPlaceConsequence',
              )}
            </p>
            <div className="shared-content-sheet-actions">
              <button
                type="button"
                className="secondary"
                disabled={pending}
                onClick={async () => {
                  try {
                    await onRemove();
                    setOpen(false);
                  } catch {
                    /* The mutation supplies inline recovery. */
                  }
                }}
              >
                {t(
                  pending
                    ? 'm5s3.common.saving'
                    : ownerKind === 'chapter'
                      ? 'm5s3.relations.unlink'
                      : 'm5s3.relations.unlinkPlace',
                )}
              </button>
              <button
                type="button"
                className="tertiary"
                disabled={pending}
                onClick={requestClose}
              >
                {t('common.cancel')}
              </button>
            </div>
            {error ? <ProblemState error={error} /> : null}
          </>
        )}
      </SharedContentSheet>
    </>
  );
}

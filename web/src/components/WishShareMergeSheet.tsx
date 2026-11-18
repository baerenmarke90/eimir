import { useId, useState } from 'react';
import type { SharedWishConflicts } from '../client/wishLinkPhoto';
import { wishLinkHost } from '../client/wishLinkPhoto';
import { useTranslation } from '../i18n';
import { ShortTaskSheet } from './ShortTaskSheet';
import './WishLinkPhoto.css';

const KEEP: SharedWishConflicts = { link: false, photo: false };

type Field = keyof SharedWishConflicts;

/**
 * Shared content meets a Wish that already has a link or a photo: for each
 * occupied field the couple keeps the existing value (the default) or replaces
 * it before anything is merged into the editor.
 */
export function WishShareMergeSheet({
  open,
  conflicts,
  existingLink,
  sharedLink,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  conflicts: SharedWishConflicts;
  existingLink: string | null;
  sharedLink: string | null;
  onConfirm: (replace: SharedWishConflicts) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [replace, setReplace] = useState<SharedWishConflicts>(KEEP);
  const fields: Field[] = (['link', 'photo'] as const).filter(
    (field) => conflicts[field],
  );
  return (
    <ShortTaskSheet
      open={open}
      title={t('m5s3.wish.merge.title')}
      onClose={onCancel}
    >
      <p>{t('m5s3.wish.merge.intro')}</p>
      <form
        className="form-grid wish-merge-form"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(replace);
        }}
      >
        {fields.map((field) => (
          <fieldset key={field} className="wish-merge-field">
            <legend>{t(`m5s3.wish.merge.${field}Legend`)}</legend>
            {field === 'link' && existingLink && sharedLink ? (
              <p className="field-help">
                {t('m5s3.wish.merge.linkCompare', {
                  existing: wishLinkHost(existingLink),
                  shared: wishLinkHost(sharedLink),
                })}
              </p>
            ) : null}
            {[false, true].map((value) => (
              <label key={String(value)} className="wish-merge-choice">
                <input
                  type="radio"
                  name={`${id}-${field}`}
                  checked={replace[field] === value}
                  onChange={() =>
                    setReplace((current) => ({ ...current, [field]: value }))
                  }
                />
                <span>
                  {t(
                    value ? 'm5s3.wish.merge.replace' : 'm5s3.wish.merge.keep',
                  )}
                </span>
              </label>
            ))}
          </fieldset>
        ))}
        <div className="form-actions">
          <button type="submit">{t('m5s3.wish.merge.continue')}</button>
          <button type="button" className="tertiary" onClick={onCancel}>
            {t('m5s3.wish.merge.cancel')}
          </button>
        </div>
      </form>
    </ShortTaskSheet>
  );
}

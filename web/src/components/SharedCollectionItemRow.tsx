import { type ButtonHTMLAttributes, useEffect, useRef, useState } from 'react';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import { useTranslation } from '../i18n';
import { ChecklistToggle } from './ChecklistToggle';
import { ListEntryIconButton } from './ListEntryActions';
import { ProblemState } from './ProblemState';
import { SharedContentSheet } from './SharedContentSheet';

export function SharedCollectionItemRow({
  item,
  canSort,
  isSorting,
  activeItemId,
  handleProps,
  onUpdateTitle,
  onToggleComplete,
  onRetry,
  onDelete,
  isUpdating,
  isTogglePending,
  isDeleting,
  error,
}: {
  item: CollectionItemDetail;
  canSort: boolean;
  isSorting: boolean;
  activeItemId: string | null;
  handleProps: (id: string) => ButtonHTMLAttributes<HTMLButtonElement>;
  onUpdateTitle: (
    item: CollectionItemDetail,
    title: string,
  ) => Promise<boolean>;
  onToggleComplete: (item: CollectionItemDetail) => void;
  onRetry: () => void;
  onDelete: (item: CollectionItemDetail) => Promise<boolean>;
  isUpdating: boolean;
  isTogglePending: boolean;
  isDeleting: boolean;
  error: unknown;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'actions' | 'edit' | 'delete' | null>(null);
  const [draft, setDraft] = useState(item.title);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = isUpdating || isDeleting;

  useEffect(() => {
    if (mode === 'edit') inputRef.current?.focus();
    else setDraft(item.title);
  }, [item.title, mode]);

  function close() {
    setMode(null);
    setDraft(item.title);
  }

  return (
    <li
      data-sortable-item-id={item.id}
      className={[
        item.completed ? 'planning-item-completed' : '',
        activeItemId === item.id ? 'list-entry-dragging' : '',
      ].join(' ')}
    >
      <ChecklistToggle
        completed={item.completed}
        label={t(
          item.completed
            ? 'm5s3.collection.markOpen'
            : 'm5s3.collection.markDone',
          { title: item.title },
        )}
        onToggle={() => onToggleComplete(item)}
        disabled={!item.capabilities.canEdit || isUpdating}
      />
      <div className="shared-list-item-copy">
        <p>{item.title}</p>
        {isTogglePending ? (
          <small role="status">{t('m5s3.common.saving')}</small>
        ) : null}
      </div>
      {isSorting && canSort ? (
        <ListEntryIconButton
          icon="reorder"
          className="tertiary"
          label={t('m5s3.collection.reorderItem', { title: item.title })}
          {...handleProps(item.id)}
        />
      ) : null}
      {!isSorting &&
      (item.capabilities.canEdit || item.capabilities.canDelete) ? (
        <ListEntryIconButton
          ref={triggerRef}
          icon="more"
          className="tertiary"
          label={t('m5s3.collection.itemActions', { title: item.title })}
          aria-haspopup="dialog"
          aria-expanded={Boolean(mode)}
          disabled={pending}
          onClick={() => setMode('actions')}
        />
      ) : null}
      <SharedContentSheet
        open={Boolean(mode)}
        title={mode === 'edit' ? t('m5s3.collection.editItem') : item.title}
        isDirty={mode === 'edit' && draft !== item.title}
        isPending={pending}
        restoreFocusRef={triggerRef}
        initialFocusRef={inputRef}
        onClose={close}
      >
        {(requestClose) => (
          <>
            {mode === 'edit' ? (
              <form
                className="form-grid"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!draft.trim() || pending) return;
                  if (
                    draft.trim() === item.title ||
                    (await onUpdateTitle(item, draft.trim()))
                  )
                    close();
                }}
              >
                <label htmlFor={`collection-item-${item.id}`}>
                  {t('m5s3.collection.itemTitle')}
                </label>
                <input
                  ref={inputRef}
                  id={`collection-item-${item.id}`}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  required
                  maxLength={200}
                  disabled={pending}
                />
                <div className="shared-content-sheet-actions">
                  <button type="submit" disabled={pending || !draft.trim()}>
                    {t(
                      pending
                        ? 'm5s3.common.saving'
                        : 'm5s3.common.saveChanges',
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
              </form>
            ) : mode === 'delete' ? (
              <>
                <p>
                  {t('m5s3.collection.deleteItemConsequence', {
                    title: item.title,
                  })}
                </p>
                <div className="shared-content-sheet-actions">
                  <button
                    type="button"
                    className="danger"
                    disabled={pending}
                    onClick={async () => {
                      if (await onDelete(item)) close();
                    }}
                  >
                    {t(
                      pending
                        ? 'm5s3.common.deleting'
                        : 'm5s3.common.confirmDelete',
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
              </>
            ) : (
              <div className="shared-content-actions">
                {item.capabilities.canEdit ? (
                  <button
                    type="button"
                    className="tertiary"
                    onClick={() => {
                      setDraft(item.title);
                      setMode('edit');
                    }}
                  >
                    {t('m5s3.common.edit')}
                  </button>
                ) : null}
                {item.capabilities.canDelete ? (
                  <button
                    type="button"
                    className="tertiary danger-link"
                    onClick={() => setMode('delete')}
                  >
                    {t('m5s3.common.delete')}
                  </button>
                ) : null}
              </div>
            )}
            {error && mode !== 'actions' ? (
              <ProblemState error={error} onRetry={onRetry} />
            ) : null}
          </>
        )}
      </SharedContentSheet>
    </li>
  );
}

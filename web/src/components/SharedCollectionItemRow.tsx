import './FreeComposer.css';
import { type ButtonHTMLAttributes, useEffect, useRef, useState } from 'react';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import { useTranslation } from '../i18n';
import { isLocalItemId } from '../client/collectionOutbox';
import type { PartnerTone } from '../client/sharedListSummary';
import { ChecklistToggle } from './ChecklistToggle';
import { ListEntryIconButton } from './ListEntryActions';
import { PartnerMarker } from './PartnerMarker';
import { ProblemState } from './ProblemState';
import { SharedContentSheet } from './SharedContentSheet';

export function SharedCollectionItemRow({
  item,
  canSort,
  isSorting,
  activeItemId,
  handleProps,
  onUpdateTitle,
  onUpdateQuantity,
  onToggleComplete,
  onRetry,
  onDelete,
  isUpdating,
  isTogglePending,
  isDeleting,
  error,
  waiting = false,
  marker,
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
  /** Present on a list that takes a quantity (a shopping list). */
  onUpdateQuantity?: (
    item: CollectionItemDetail,
    quantity: string | null,
  ) => Promise<boolean>;
  onToggleComplete: (item: CollectionItemDetail) => void;
  onRetry: () => void;
  onDelete: (item: CollectionItemDetail) => Promise<boolean>;
  isUpdating: boolean;
  isTogglePending: boolean;
  isDeleting: boolean;
  error: unknown;
  /** A change to this item has not been sent yet (#1808). */
  waiting?: boolean;
  /** Who added the entry, or who finished it once it is done (#1808). */
  marker?: { name: string; tone: PartnerTone; caption: string };
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'edit' | 'delete' | null>(null);
  const [draft, setDraft] = useState(item.title);
  const [quantityDraft, setQuantityDraft] = useState(item.quantity ?? '');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = isUpdating || isDeleting;

  useEffect(() => {
    if (mode === 'edit') inputRef.current?.focus();
    else {
      setDraft(item.title);
      setQuantityDraft(item.quantity ?? '');
    }
  }, [item.title, item.quantity, mode]);

  function close() {
    setMode(null);
    setDraft(item.title);
    setQuantityDraft(item.quantity ?? '');
  }

  const canOpen =
    !isSorting &&
    !isLocalItemId(item.id) &&
    (item.capabilities.canEdit || item.capabilities.canDelete);
  const titleText = (
    <>
      {item.title}
      {item.quantity ? (
        <span className="shared-list-item-quantity">
          {' '}
          {/^\d+$/u.test(item.quantity) ? `${item.quantity}×` : item.quantity}
        </span>
      ) : null}
    </>
  );
  const quantityChanged =
    Boolean(onUpdateQuantity) &&
    (quantityDraft.trim() || null) !== (item.quantity ?? null);
  const isDirty = mode === 'edit' && (draft !== item.title || quantityChanged);

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
        <p>
          {canOpen ? (
            <button
              ref={triggerRef}
              type="button"
              className="shared-list-item-open"
              aria-label={t('m5s3.collection.openItem', { title: item.title })}
              aria-haspopup="dialog"
              aria-expanded={Boolean(mode)}
              disabled={pending}
              onClick={() => setMode('edit')}
            >
              {titleText}
            </button>
          ) : (
            titleText
          )}
        </p>
        {isTogglePending ? (
          <small role="status">{t('m5s3.common.saving')}</small>
        ) : null}
        {waiting ? (
          <small className="shared-list-item-waiting">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
              className="shared-list-item-waiting-icon"
            >
              <circle cx="12" cy="12" r="8" />
              <path d="M12 8v4l3 2" />
            </svg>
            <span className="sr-only">
              {t('m5s3.collection.outbox.itemWaiting')}
            </span>
          </small>
        ) : null}
      </div>
      {marker ? (
        <>
          <PartnerMarker name={marker.name} tone={marker.tone} />
          <span className="sr-only">{marker.caption}</span>
        </>
      ) : null}
      {isSorting && canSort ? (
        <ListEntryIconButton
          icon="reorder"
          className="tertiary"
          label={t('m5s3.collection.reorderItem', { title: item.title })}
          {...handleProps(item.id)}
        />
      ) : null}
      <SharedContentSheet
        open={Boolean(mode)}
        title={mode === 'delete' ? item.title : t('m5s3.collection.editItem')}
        isDirty={isDirty}
        isPending={pending}
        restoreFocusRef={triggerRef}
        initialFocusRef={inputRef}
        onClose={close}
      >
        {(requestClose) => (
          <>
            {mode === 'edit' && item.capabilities.canEdit ? (
              <form
                className="form-grid free-composer"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!draft.trim() || pending) return;
                  let saved = true;
                  if (draft.trim() !== item.title)
                    saved = await onUpdateTitle(item, draft.trim());
                  if (saved && onUpdateQuantity && quantityChanged)
                    saved = await onUpdateQuantity(
                      item,
                      quantityDraft.trim() || null,
                    );
                  if (saved) close();
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
                {onUpdateQuantity ? (
                  <>
                    <label htmlFor={`collection-item-quantity-${item.id}`}>
                      {t('m5s3.collection.quantityLabel')}
                    </label>
                    <input
                      id={`collection-item-quantity-${item.id}`}
                      value={quantityDraft}
                      onChange={(event) => setQuantityDraft(event.target.value)}
                      maxLength={40}
                      autoComplete="off"
                      disabled={pending}
                    />
                  </>
                ) : null}
                <div className="shared-content-sheet-actions">
                  <button
                    type="submit"
                    disabled={pending || !draft.trim() || !isDirty}
                  >
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
                {item.capabilities.canDelete ? (
                  <button
                    type="button"
                    className="tertiary danger-link"
                    disabled={pending}
                    onClick={() => setMode('delete')}
                  >
                    {t('m5s3.common.delete')}
                  </button>
                ) : null}
              </form>
            ) : mode === 'edit' ? (
              <div className="shared-content-actions">
                <button
                  type="button"
                  className="tertiary danger-link"
                  onClick={() => setMode('delete')}
                >
                  {t('m5s3.common.delete')}
                </button>
              </div>
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
            ) : null}
            {error && mode ? (
              <ProblemState error={error} onRetry={onRetry} />
            ) : null}
          </>
        )}
      </SharedContentSheet>
    </li>
  );
}

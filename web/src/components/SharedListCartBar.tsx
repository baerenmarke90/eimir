import { CART_TARGET_ATTRIBUTE } from './cartFlight';
import { type ReactNode, useRef, useState } from 'react';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import { useTranslation } from '../i18n';
import type { PartnerTone } from '../client/sharedListSummary';
import { ChecklistToggle } from './ChecklistToggle';
import { PartnerMarker } from './PartnerMarker';
import { SharedContentSheet } from './SharedContentSheet';
import './SharedListCartBar.css';

export interface CartEntry {
  item: CollectionItemDetail;
  marker?: { name: string; tone: PartnerTone; caption: string };
}

/**
 * The cart of a shopping list (#1808): a bar at the bottom edge on Compact
 * that says how much is in the cart and opens a sheet with its entries, from
 * where an entry can be put back. On Expanded the same entries are the inline
 * cart section, so the bar is hidden there.
 */
export function SharedListCartBar({
  entries,
  disabled,
  onPutBack,
  finish,
}: {
  entries: CartEntry[];
  disabled: boolean;
  onPutBack: (item: CollectionItemDetail) => void;
  /** The "finish the trip" control, shown under the entries of the cart. */
  finish?: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (entries.length === 0) return null;
  const people = [
    ...new Map(
      entries
        .map((entry) => entry.marker)
        .filter((marker): marker is NonNullable<typeof marker> =>
          Boolean(marker),
        )
        .map((marker) => [`${marker.tone}:${marker.name}`, marker]),
    ).values(),
  ].sort(
    (left, right) => Number(left.tone === 'b') - Number(right.tone === 'b'),
  );
  return (
    <>
      <div
        className="shared-list-cartbar-wrap"
        {...{ [CART_TARGET_ATTRIBUTE]: '' }}
      >
        <button
          ref={triggerRef}
          type="button"
          className="shared-list-cartbar"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <svg
            className="shared-list-cartbar-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L19 8H6.2" />
            <circle cx="9" cy="19" r="1.3" />
            <circle cx="17" cy="19" r="1.3" />
          </svg>
          <span className="shared-list-cartbar-label">
            {t('m5s3.collection.cart.bar', { count: entries.length })}
          </span>
          <span className="shared-list-cartbar-people" aria-hidden="true">
            {people.map((marker) => (
              <PartnerMarker
                key={`${marker.tone}:${marker.name}`}
                name={marker.name}
                tone={marker.tone}
              />
            ))}
          </span>
          <svg
            className="shared-list-cartbar-chevron"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="m6 15 6-6 6 6" />
          </svg>
        </button>
      </div>
      <SharedContentSheet
        open={open}
        title={t('m5s3.collection.trayShopping')}
        restoreFocusRef={triggerRef}
        onClose={() => setOpen(false)}
      >
        {() => (
          <>
            <ul className="shared-list-cart-entries">
              {entries.map(({ item, marker }) => (
                <li key={item.id} className="planning-item-completed">
                  <ChecklistToggle
                    completed
                    label={t('m5s3.collection.markOpen', { title: item.title })}
                    onToggle={() => onPutBack(item)}
                    disabled={disabled || !item.capabilities.canEdit}
                  />
                  <span className="shared-list-cart-entry-title">
                    {item.title}
                    {item.quantity ? (
                      <span className="shared-list-item-quantity">
                        {' '}
                        {/^\d+$/u.test(item.quantity)
                          ? `${item.quantity}×`
                          : item.quantity}
                      </span>
                    ) : null}
                  </span>
                  {marker ? (
                    <>
                      <PartnerMarker name={marker.name} tone={marker.tone} />
                      <span className="sr-only">{marker.caption}</span>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
            {finish}
          </>
        )}
      </SharedContentSheet>
    </>
  );
}

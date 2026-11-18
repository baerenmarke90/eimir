import { useQuery } from '@tanstack/react-query';
import { type RefObject, useMemo } from 'react';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { CollectionProductPage } from './CollectionProductPage';
import { ShortTaskSheet } from './ShortTaskSheet';
import './WirListSheet.css';

/**
 * A shared list as a tall sheet that rises over Wir (#1808). The handle at the
 * top is the visible Close control, a swipe down closes it too, and closing
 * returns to Wir where the tiles already show the updated counts, because the
 * sheet and the tiles share one list read. Entries are saved as they are made,
 * so the sheet has no Save or Discard.
 */
export function WirListSheet({
  apis,
  accountId,
  spaceId,
  collectionId,
  focusAdd,
  restoreFocusRef,
  onClose,
}: {
  apis: Pick<SharedPlanningApis, 'collections'>;
  accountId: string;
  spaceId: string;
  collectionId: string;
  focusAdd: boolean;
  restoreFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  // The title comes from the list the tile already read.
  const title =
    useQuery<{ title: string }>({
      queryKey: authorSummaryQueryKeys.collectionDetail(spaceId, collectionId),
      enabled: false,
    }).data?.title ?? '';
  // The entry field is in the page below; it is looked up when the sheet asks
  // for its first focus, which is after the page has rendered.
  const addFieldRef = useMemo(
    () =>
      ({
        get current() {
          return document.getElementById('collection-new-item');
        },
      }) as RefObject<HTMLElement | null>,
    [],
  );
  return (
    <ShortTaskSheet
      open
      title={title}
      initialFocusRef={focusAdd ? addFieldRef : undefined}
      className="wir-list-sheet"
      restoreFocusRef={restoreFocusRef}
      onClose={onClose}
    >
      <CollectionProductPage
        apis={apis}
        accountId={accountId}
        spaceId={spaceId}
        collectionId={collectionId}
        inSheet
        focusAddOnOpen={focusAdd}
      />
    </ShortTaskSheet>
  );
}

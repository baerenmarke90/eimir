import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';

/**
 * The two people on a shared list, as a colour role. The person who created
 * the list is partner A (rose), everyone else is partner B (blue). The role
 * belongs to the person, not to the viewer, so both phones show the same
 * colours (#1808, Product Owner decision 2026-11-14).
 */
export type PartnerTone = 'a' | 'b';

export function partnerTone(
  collection: Pick<CollectionDetail, 'createdBy'>,
  personId: string | null | undefined,
): PartnerTone {
  return personId && personId === collection.createdBy ? 'a' : 'b';
}

export interface PartnerShare {
  personId: string;
  displayName: string;
  tone: PartnerTone;
  count: number;
}

export interface SharedListSummary {
  total: number;
  open: number;
  done: number;
  /** Who completed the finished entries, rose first. Empty when none is done. */
  shares: PartnerShare[];
}

/**
 * Count the entries and split the finished ones by the person who completed
 * them. An entry completed before completion actors were recorded has no
 * completer; it counts as done but belongs to nobody's share.
 */
export function summarizeSharedList(
  collection: Pick<CollectionDetail, 'createdBy'>,
  items: readonly CollectionItemDetail[],
): SharedListSummary {
  const byPerson = new Map<string, PartnerShare>();
  let done = 0;
  for (const item of items) {
    if (!item.completed) continue;
    done += 1;
    const completer = item.completer;
    if (!completer) continue;
    const share = byPerson.get(completer.id) ?? {
      personId: completer.id,
      displayName: completer.displayName,
      tone: partnerTone(collection, completer.id),
      count: 0,
    };
    share.count += 1;
    byPerson.set(completer.id, share);
  }
  const shares = [...byPerson.values()].sort(
    (left, right) =>
      Number(left.tone === 'b') - Number(right.tone === 'b') ||
      left.displayName.localeCompare(right.displayName),
  );
  return {
    total: items.length,
    open: items.length - done,
    done,
    shares,
  };
}

/**
 * A person's name as the list already knows it, so an entry that has not been
 * sent yet can still carry a marker with the right initials.
 */
export function knownPersonName(
  collection: CollectionDetail,
  personId: string | undefined,
): string {
  if (!personId) return '';
  if (collection.creator?.id === personId)
    return collection.creator.displayName;
  for (const item of collection.items) {
    if (item.creator?.id === personId && item.creator.displayName)
      return item.creator.displayName;
    if (item.completer?.id === personId && item.completer.displayName)
      return item.completer.displayName;
  }
  return '';
}

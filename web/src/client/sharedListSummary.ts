import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import { type PersonRole, type PersonRoleOf, roleOrder } from './personColours';

export interface PartnerShare {
  personId: string;
  displayName: string;
  role: PersonRole;
  count: number;
}

export interface SharedListSummary {
  total: number;
  open: number;
  done: number;
  /** Who completed the finished entries, you first. Empty when none is done. */
  shares: PartnerShare[];
}

/**
 * Count the entries and split the finished ones by the person who completed
 * them. The colour belongs to the role (you or your partner), see
 * `personColours.ts`. An entry completed before completion actors were recorded has no
 * completer; it counts as done but belongs to nobody's share.
 */
export function summarizeSharedList(
  items: readonly CollectionItemDetail[],
  roleOf: PersonRoleOf,
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
      role: roleOf(completer.id),
      count: 0,
    };
    share.count += 1;
    byPerson.set(completer.id, share);
  }
  const shares = [...byPerson.values()].sort(
    (left, right) =>
      roleOrder(left.role) - roleOrder(right.role) ||
      left.displayName.localeCompare(right.displayName),
  );
  return {
    total: items.length,
    open: items.length - done,
    done,
    shares,
  };
}

export interface ListPerson {
  personId: string;
  displayName: string;
  role: PersonRole;
}

/**
 * The people the list already knows: its creator and anyone who added or
 * completed an entry, you first. A partner who has not touched the list yet
 * is not known to it and does not appear until they do (#1808).
 */
export function listPeople(
  collection: Pick<CollectionDetail, 'creator'>,
  items: readonly CollectionItemDetail[],
  roleOf: PersonRoleOf,
): ListPerson[] {
  const byId = new Map<string, ListPerson>();
  const remember = (
    person: { id: string; displayName: string } | null | undefined,
  ) => {
    if (!person?.id || !person.displayName.trim() || byId.has(person.id))
      return;
    byId.set(person.id, {
      personId: person.id,
      displayName: person.displayName,
      role: roleOf(person.id),
    });
  };
  remember(collection.creator);
  for (const item of items) {
    remember(item.creator);
    remember(item.completer);
  }
  return [...byId.values()].sort(
    (left, right) =>
      roleOrder(left.role) - roleOrder(right.role) ||
      left.displayName.localeCompare(right.displayName),
  );
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

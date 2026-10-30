import type { WishSelectionView } from '../api/generated/models/WishSelectionView';

/** Personal projection: never register this key with the durable read cache. */
export function wishSelectionQueryKey(
  apiBaseUrl: string,
  accountId: string,
  spaceId: string,
) {
  return ['wish-selection', apiBaseUrl, accountId, spaceId] as const;
}

export function selectionChanged(first: string[], second: string[]): boolean {
  return (
    first.length !== second.length || first.some((id) => !second.includes(id))
  );
}

export function ownSelectionIds(view: WishSelectionView): string[] {
  const candidates = new Set(
    view.candidates
      .filter((candidate) => candidate.status === 'OPEN' && !candidate.planId)
      .map((candidate) => candidate.wishId),
  );
  return view.own.favoriteWishIds.filter((id) => candidates.has(id));
}

/** Detect source edits, deletion and conversion without exposing partner choices. */
export function wishSelectionSourceToken(view: WishSelectionView): string {
  return JSON.stringify(
    view.candidates.map(({ wishId, version, status, planId }) => [
      wishId,
      version,
      status,
      planId,
    ]),
  );
}

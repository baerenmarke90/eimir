export type DeleteFocusTarget =
  | { kind: 'item'; id: string }
  | { kind: 'create' };

export const PLANNING_DELETE_FOCUS_STATE_KEY = 'planningDeleteFocus';

export type InfiniteItemsData<T> = {
  pages: ReadonlyArray<{ items: ReadonlyArray<T> }>;
};

export function deleteFocusTarget(
  items: ReadonlyArray<{ id: string }>,
  deletedId: string,
): DeleteFocusTarget {
  const deletedIndex = items.findIndex((item) => item.id === deletedId);
  if (deletedIndex < 0) return { kind: 'create' };

  const nextItem = items[deletedIndex + 1];
  if (nextItem) return { kind: 'item', id: nextItem.id };

  const previousItem = items[deletedIndex - 1];
  if (previousItem) return { kind: 'item', id: previousItem.id };

  return { kind: 'create' };
}

export function deleteFocusTargetFromInfiniteData(
  data: InfiniteItemsData<{ id: string }> | undefined,
  deletedId: string,
): DeleteFocusTarget {
  return deleteFocusTarget(
    data?.pages.flatMap((page) => [...page.items]) ?? [],
    deletedId,
  );
}

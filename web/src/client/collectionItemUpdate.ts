import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { captureAuthorizedQuery } from './queryIdentity';

type ChecklistItem = {
  id: string;
  title: string;
  completed: boolean;
  version: number;
  updatedAt: Date;
};

type ItemUpdate = { title?: string; completed?: boolean };

/** Item responses never own root positions or equal/newer authorized item reads. */
export function reconcileCollectionItemUpdate<
  T extends { items: ChecklistItem[] },
>(
  current: T | undefined,
  updated: ChecklistItem,
  update: ItemUpdate,
): T | undefined {
  return current
    ? {
        ...current,
        items: current.items.map((entry) =>
          entry.id === updated.id && entry.version < updated.version
            ? {
                ...entry,
                ...(update.title !== undefined ? { title: updated.title } : {}),
                ...(update.completed !== undefined
                  ? { completed: updated.completed }
                  : {}),
                version: updated.version,
                updatedAt: updated.updatedAt,
              }
            : entry,
        ),
      }
    : current;
}

export function rollbackCollectionItemUpdate<
  T extends { items: ChecklistItem[] },
>(
  current: T | undefined,
  previous: ChecklistItem,
  completed: boolean | undefined,
): T | undefined {
  return current
    ? {
        ...current,
        items: current.items.map((entry) =>
          entry.id === previous.id &&
          entry.version === previous.version &&
          entry.completed === completed
            ? { ...entry, completed: previous.completed }
            : entry,
        ),
      }
    : current;
}

/** Own submitted item fields, never the collection's independently versioned order. */
export async function captureCollectionItemUpdate<
  T extends { items: ChecklistItem[] },
>(client: QueryClient, key: QueryKey, item: ChecklistItem, update: ItemUpdate) {
  const isCurrentQuery = captureAuthorizedQuery(client, key);
  await client.cancelQueries({ queryKey: key, exact: true });
  const currentItem = isCurrentQuery()
    ? client.getQueryData<T>(key)?.items.find((entry) => entry.id === item.id)
    : undefined;
  const previousItem =
    update.completed !== undefined && currentItem?.version === item.version
      ? currentItem
      : undefined;
  if (previousItem) {
    client.setQueryData<T>(key, (current) =>
      current
        ? {
            ...current,
            items: current.items.map((entry) =>
              entry === previousItem
                ? { ...entry, completed: update.completed }
                : entry,
            ),
          }
        : current,
    );
  }
  return {
    key,
    isCurrentQuery,
    previousItem,
    rollback() {
      if (!isCurrentQuery() || !previousItem) return;
      client.setQueryData<T>(key, (current) =>
        rollbackCollectionItemUpdate(current, previousItem, update.completed),
      );
    },
    confirm(updated: ChecklistItem) {
      if (!isCurrentQuery()) return;
      client.setQueryData<T>(key, (current) =>
        reconcileCollectionItemUpdate(current, updated, update),
      );
    },
  };
}

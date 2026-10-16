import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { captureAuthorizedQuery } from './queryIdentity';

type OrderedItem = { id: string; position: number; version: number };
type OrderedCollection = { version: number; items: OrderedItem[] };

/** Own positions at one root version in the exact Query that admitted the move. */
export async function captureCollectionOrder<T extends OrderedCollection>(
  client: QueryClient,
  key: QueryKey,
  version: number,
  itemIds: string[],
) {
  const isCurrentQuery = captureAuthorizedQuery(client, key);
  await client.cancelQueries({ queryKey: key, exact: true });
  const previous = isCurrentQuery() ? client.getQueryData<T>(key) : undefined;
  const previousPositions =
    previous?.version === version
      ? new Map(previous.items.map((item) => [item.id, item.position]))
      : undefined;
  const positions = new Map(itemIds.map((id, position) => [id, position]));
  if (previousPositions) {
    client.setQueryData<T>(key, (current) =>
      current?.version === version
        ? {
            ...current,
            items: current.items.map((item) => ({
              ...item,
              position: positions.get(item.id) ?? item.position,
            })),
          }
        : current,
    );
  }
  return {
    key,
    isCurrentQuery,
    rollback() {
      if (!isCurrentQuery() || !previousPositions) return;
      client.setQueryData<T>(key, (current) =>
        current?.version === version
          ? {
              ...current,
              items: current.items.map((item) => ({
                ...item,
                position: previousPositions.get(item.id) ?? item.position,
              })),
            }
          : current,
      );
    },
    confirm(updated: T) {
      if (!isCurrentQuery()) return;
      client.setQueryData<T>(key, (current) => {
        if (!current || current.version >= updated.version) return current;
        const currentItems = new Map(
          current.items.map((item) => [item.id, item]),
        );
        return {
          ...updated,
          items: updated.items.map((item) => {
            const existing = currentItems.get(item.id);
            return existing && existing.version >= item.version
              ? { ...existing, position: item.position }
              : item;
          }),
        };
      });
    },
  };
}

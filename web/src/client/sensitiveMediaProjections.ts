import type { QueryClient } from '@tanstack/react-query';
import { clearProductReadCacheInBackground } from './productReadCache';

/** Confirmed classification invalidates old reads before any return navigation. */
export function protectSensitiveMediaProjections(
  client: QueryClient,
  spaceId: string,
  attachments: readonly { id: string; isSensitive?: boolean }[],
): void {
  const flags = new Map(
    attachments
      .filter((item) => typeof item.isSensitive === 'boolean')
      .map((item) => [item.id, item.isSensitive]),
  );
  if (!flags.size) return;
  const scope = {
    predicate: (query: { queryKey: readonly unknown[] }) =>
      query.queryKey.includes(spaceId),
  };
  void client.cancelQueries(scope, { revert: false });
  const update = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(update);
    if (!value || typeof value !== 'object' || value instanceof Date)
      return value;
    const record = value as Record<string, unknown>;
    const next = Object.fromEntries(
      Object.entries(record).map(([key, entry]) => [key, update(entry)]),
    );
    if (
      typeof record.id === 'string' &&
      flags.get(record.id) === true &&
      'mediaType' in record
    )
      next.isSensitive = true;
    if (
      typeof record.previewAttachmentId === 'string' &&
      flags.get(record.previewAttachmentId) === true
    )
      next.previewIsSensitive = true;
    return next;
  };
  // A late unmark response must never clear a newer mark in another read
  // projection. Unmarking becomes visible through authoritative revalidation.
  client.setQueriesData(scope, update);
  // Revoke pending disk writes as well as old persisted projections. A failed
  // disk clear cannot revive the invalidated generation after reload.
  clearProductReadCacheInBackground();
}

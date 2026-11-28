import type { QueryClient } from '@tanstack/react-query';
import {
  captureMediaCacheLease,
  evictAuthorizedMedia,
} from './authorizedMediaCache';
import { revokePersistedProductReadsInBackground } from './productReadCache';

interface SensitiveMediaFlag {
  id: string;
  isSensitive?: boolean;
}

/** Confirmed classification invalidates old reads before any return navigation. */
export function protectSensitiveMediaProjections(
  client: QueryClient,
  spaceId: string,
  attachments: readonly SensitiveMediaFlag[],
  {
    previous = [],
    parent,
  }: {
    /** The media before this save; a photo that was already sensitive is protected. */
    previous?: readonly SensitiveMediaFlag[];
    /** The saved entry whose stored photos are dropped on a new mark. */
    parent?: {
      /** Any API client of the session, to address its media store. */
      apiClient: object;
      type: 'HEART_MOMENT' | 'MEMORY';
      id: string;
    };
  } = {},
): void {
  const alreadySensitive = new Set(
    previous.filter((item) => item.isSensitive === true).map((item) => item.id),
  );
  // Only a new mark needs protection. Every saved photo reports a flag, and
  // a save without a new mark must not revoke stored reads or photos.
  const flags = new Map(
    attachments
      .filter(
        (item) => item.isSensitive === true && !alreadySensitive.has(item.id),
      )
      .map((item) => [item.id, true]),
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
  revokePersistedProductReadsInBackground();
  // Drop the stored and decoded photos of this entry only: they reload with
  // the new mark. Every other photo of the app stays on screen.
  if (parent) {
    try {
      evictAuthorizedMedia(captureMediaCacheLease(parent.apiClient, spaceId), [
        'attachment',
        parent.type,
        parent.id,
      ]);
    } catch {
      // A session that is no longer current has no media left to protect.
    }
  }
}

import type { QueryClient } from '@tanstack/react-query';
import {
  clearProductReadCache,
  deleteProductReadCacheKind,
} from './productReadCache';

/** Chapter dates affect every diary scope and the index of available years. */
export async function invalidateChapterProjections(
  client: QueryClient,
  spaceId: string,
  accountId?: string,
): Promise<void> {
  const diary = {
    predicate: (query: { queryKey: readonly unknown[] }) =>
      ['story', 'story-year', 'story-years'].includes(
        String(query.queryKey[0]),
      ) && query.queryKey[1] === spaceId,
  };
  await client.cancelQueries(diary);
  if (accountId) {
    // A storage failure cannot turn a confirmed create into a retryable create.
    // The existing generation wipe is the fail-closed fallback for stale reads.
    await deleteProductReadCacheKind(accountId, spaceId, 'story').catch(() =>
      clearProductReadCache().catch(() => undefined),
    );
  }
  await Promise.all([
    client.invalidateQueries(diary),
    client.invalidateQueries({ queryKey: ['m5-s3', 'chapters', spaceId] }),
  ]);
}

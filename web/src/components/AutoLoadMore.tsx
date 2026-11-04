import { type ReactNode, useCallback, useId, useRef } from 'react';
import { useTimelineAutoPagination } from './useTimelineProgressiveLoading';
import './AutoLoadMore.css';

type PageData = { pages: readonly unknown[]; pageParams?: readonly unknown[] };
type PageQuery = {
  data?: PageData;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetching: boolean;
  isError: boolean;
  fetchNextPage(options?: {
    cancelRefetch: boolean;
  }): Promise<{ isError: boolean }>;
};

function pageCursor(page: unknown): string | null {
  if (!page || typeof page !== 'object') return null;
  const value = 'value' in page ? page.value : page;
  if (!value || typeof value !== 'object' || !('nextCursor' in value))
    return null;
  return typeof value.nextCursor === 'string' ? value.nextCursor : null;
}

/** The Timeline's cursor/observer lifecycle, shared by every paginated browse view. */
export function AutoLoadMore({
  query,
  children,
  className,
  blocked = false,
}: {
  query: PageQuery;
  children: ReactNode;
  className?: string;
  blocked?: boolean;
}) {
  const cursor = query.hasNextPage
    ? pageCursor(query.data?.pages.at(-1))
    : null;
  const repeated = Boolean(cursor && query.data?.pageParams?.includes(cursor));
  const onLoad = useCallback(async () => {
    const result = await query.fetchNextPage({ cancelRefetch: false });
    return !result.isError;
  }, [query.fetchNextPage]);
  return (
    <AutoLoadTrigger
      cursor={repeated ? null : cursor}
      scopeKey={pageCursor(query.data?.pages[0]) ?? ''}
      loading={query.isFetchingNextPage}
      blocked={blocked || query.isFetching || navigator.onLine === false}
      failed={query.isError}
      onLoad={onLoad}
      className={className}
    >
      {children}
    </AutoLoadTrigger>
  );
}

export function AutoLoadTrigger({
  cursor,
  scopeKey,
  loading,
  blocked = false,
  failed = false,
  onLoad,
  children,
  className,
}: {
  cursor: string | null;
  scopeKey: string;
  loading: boolean;
  blocked?: boolean;
  failed?: boolean;
  onLoad: () => Promise<boolean>;
  children: ReactNode;
  className?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const pagination = useTimelineAutoPagination({
    sentinelRef,
    enabled: true,
    blocked: blocked || failed,
    hasNextPage: Boolean(cursor),
    isFetchingNextPage: loading,
    cursor,
    scopeKey: `${id}:${scopeKey}`,
    loadNextPage: onLoad,
  });
  if (!cursor) return null;
  return (
    <div ref={sentinelRef} className="auto-load-sentinel" aria-busy={loading}>
      {loading ? <span role="status">{children}</span> : null}
      {pagination.manualFallback || failed ? (
        <button
          type="button"
          className={className}
          disabled={blocked || loading}
          onClick={() => void pagination.retry()}
        >
          {children}
        </button>
      ) : null}
    </div>
  );
}

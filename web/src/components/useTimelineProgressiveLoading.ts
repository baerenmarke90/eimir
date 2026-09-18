import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import './StoryTimelineProgressive.css';

const MAX_REVEAL_SCOPES = 12;
const revealedByScope = new Map<string, Set<string>>();

function revealSetFor(scopeKey: string): Set<string> {
  const existing = revealedByScope.get(scopeKey);
  if (existing) {
    revealedByScope.delete(scopeKey);
    revealedByScope.set(scopeKey, existing);
    return existing;
  }

  const created = new Set<string>();
  revealedByScope.set(scopeKey, created);
  while (revealedByScope.size > MAX_REVEAL_SCOPES) {
    const oldest = revealedByScope.keys().next().value;
    if (oldest === undefined) break;
    revealedByScope.delete(oldest);
  }
  return created;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Neutral first-entry reveal core behind #975 (Timeline) and #977 (Discover
 * tapestry): a `data-${attrPrefix}-reveal-key` node fades in once, the first
 * time it actually enters the viewport, and stays revealed for the rest of
 * the session (per `scopeKey`) across remounts, re-renders and refreshes.
 * `attrPrefix` namespaces both the query selector and the dataset flags so
 * unrelated consumers never share DOM attribute names.
 *
 * `revision` re-runs the DOM scan/observe pass whenever it changes. A plain
 * count (as Timeline passes) is enough there because pages only ever grow.
 * A consumer whose backing collection can be replaced in place with a
 * different, same-length set (Discover's selection refresh) must instead
 * pass a value that encodes ordered content identity, e.g. the joined item
 * keys — otherwise newly mounted keyed nodes are never (re-)observed.
 */
function useFirstEntryReveal({
  rootRef,
  enabled,
  scopeKey,
  revision,
  attrPrefix,
}: {
  rootRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  scopeKey: string;
  revision: number | string;
  attrPrefix: string;
}) {
  useLayoutEffect(() => {
    if (!enabled || !revision) return;
    const root = rootRef.current;
    if (!root) return;

    const revealKeyAttr = `${attrPrefix}RevealKey`;
    const revealedAttr = `${attrPrefix}Revealed`;
    const selector = `[data-${attrPrefix}-reveal-key]`;

    const revealed = revealSetFor(scopeKey);
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(selector));
    const reveal = (node: HTMLElement) => {
      const key = node.dataset[revealKeyAttr];
      if (key) revealed.add(key);
      node.dataset[revealedAttr] = 'true';
    };

    for (const node of nodes) {
      const key = node.dataset[revealKeyAttr];
      if (key && revealed.has(key)) reveal(node);
    }

    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      nodes.forEach(reveal);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const node = entry.target as HTMLElement;
          reveal(node);
          observer.unobserve(node);
        }
      },
      {
        root: null,
        rootMargin: '0px 0px -8% 0px',
        threshold: 0.04,
      },
    );

    for (const node of nodes) {
      if (node.dataset[revealedAttr] === 'true') continue;
      observer.observe(node);
    }

    return () => observer.disconnect();
  }, [enabled, revision, rootRef, scopeKey, attrPrefix]);
}

export function useTimelineReveal(options: {
  rootRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  scopeKey: string;
  revision: number;
}) {
  useFirstEntryReveal({ ...options, attrPrefix: 'timeline' });
}

/**
 * Discover tapestry's own first-entry reveal (#977). Reuses the same core
 * and session-scoped registry as #975's `useTimelineReveal`, but under
 * `data-discover-reveal-key`/`data-discover-revealed` so Discover never
 * shares DOM attribute names (or CSS) with Timeline.
 *
 * `revision` must be the tapestry's ordered content identity (e.g. the
 * joined item keys), not just a count: the authoritative Discover selection
 * can be replaced in place by a different, same-length set on refresh, and
 * a count-only revision would never re-run the observe pass for the new
 * keyed nodes React mounts in that case.
 */
export function useDiscoverReveal(options: {
  rootRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  scopeKey: string;
  revision: string;
}) {
  useFirstEntryReveal({ ...options, attrPrefix: 'discover' });
}

export function useTimelineAutoPagination({
  sentinelRef,
  enabled,
  blocked,
  hasNextPage,
  isFetchingNextPage,
  cursor,
  scopeKey,
  loadNextPage,
}: {
  sentinelRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  blocked: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  cursor: string | null;
  scopeKey: string;
  loadNextPage: () => Promise<boolean>;
}) {
  const requestedCursorRef = useRef<string | null>(null);
  const previousScopeKeyRef = useRef(scopeKey);
  const [manualFallback, setManualFallback] = useState(false);

  useEffect(() => {
    if (previousScopeKeyRef.current === scopeKey) return;
    previousScopeKeyRef.current = scopeKey;
    requestedCursorRef.current = null;
    setManualFallback(false);
  }, [scopeKey]);

  useEffect(() => {
    if (hasNextPage) return;
    requestedCursorRef.current = null;
    setManualFallback(false);
  }, [hasNextPage]);

  const requestNextPage = useCallback(async () => {
    if (
      blocked ||
      !hasNextPage ||
      isFetchingNextPage ||
      !cursor ||
      requestedCursorRef.current === cursor
    ) {
      return;
    }

    requestedCursorRef.current = cursor;
    try {
      const succeeded = await loadNextPage();
      if (!succeeded) setManualFallback(true);
    } catch {
      setManualFallback(true);
    }
  }, [blocked, cursor, hasNextPage, isFetchingNextPage, loadNextPage]);

  const retry = useCallback(async () => {
    if (blocked || !hasNextPage || isFetchingNextPage) return;
    requestedCursorRef.current = null;
    setManualFallback(false);
    try {
      const succeeded = await loadNextPage();
      if (!succeeded) setManualFallback(true);
    } catch {
      setManualFallback(true);
    }
  }, [blocked, hasNextPage, isFetchingNextPage, loadNextPage]);

  useEffect(() => {
    if (!enabled || blocked || !hasNextPage || isFetchingNextPage || !cursor) {
      return;
    }
    if (manualFallback) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    if (typeof IntersectionObserver === 'undefined') {
      setManualFallback(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        void requestNextPage();
      },
      {
        root: null,
        rootMargin: '0px 0px 125% 0px',
        threshold: 0,
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    blocked,
    cursor,
    enabled,
    hasNextPage,
    isFetchingNextPage,
    manualFallback,
    requestNextPage,
    sentinelRef,
  ]);

  return { manualFallback, retry };
}

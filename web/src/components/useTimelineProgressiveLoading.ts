import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import './StoryTimelineProgressive.css';

const REVEAL_SELECTOR = '[data-timeline-reveal-key]';
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

export function useTimelineReveal({
  rootRef,
  enabled,
  scopeKey,
  revision,
}: {
  rootRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  scopeKey: string;
  revision: number;
}) {
  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;

    const revealed = revealSetFor(scopeKey);
    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR),
    );
    const reveal = (node: HTMLElement) => {
      const key = node.dataset.timelineRevealKey;
      if (key) revealed.add(key);
      node.dataset.timelineRevealed = 'true';
    };

    for (const node of nodes) {
      const key = node.dataset.timelineRevealKey;
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
      if (node.dataset.timelineRevealed === 'true') continue;
      observer.observe(node);
    }

    return () => observer.disconnect();
  }, [enabled, revision, rootRef, scopeKey]);
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
  const [manualFallback, setManualFallback] = useState(false);

  useEffect(() => {
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

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

const CHANGE = 'eimir:attention-receipt';
const MAX_RECEIPTS = 256;
const memory = new Map<string, Record<string, number>>();

function read(key: string): Record<string, number> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries({ ...value, ...memory.get(key) }).filter(
        ([id, until]) =>
          id.length <= 1024 && typeof until === 'number' && until > Date.now(),
      ),
    );
  } catch {
    return memory.get(key) ?? {};
  }
}

interface AttentionCandidate {
  id: string;
  expiresAt: number;
}

/** Bounded local UI receipts contain opaque identities only, never authored text. */
export function useAttentionReceipts(
  scope: readonly string[],
  candidates: readonly AttentionCandidate[],
) {
  const key = `eimir-attention-v1:${JSON.stringify(scope)}`;
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener(CHANGE, notify);
    window.addEventListener('storage', notify);
    window.addEventListener('focus', notify);
    return () => {
      window.removeEventListener(CHANGE, notify);
      window.removeEventListener('storage', notify);
      window.removeEventListener('focus', notify);
    };
  }, []);
  const pending = () => {
    const receipts = read(key);
    return candidates.filter(
      ({ id, expiresAt }) => Date.now() < expiresAt && !receipts[id],
    );
  };
  const snapshot = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(pending().map(({ id }) => id)),
    () =>
      JSON.stringify(
        candidates
          .filter(({ expiresAt }) => Date.now() < expiresAt)
          .map(({ id }) => id),
      ),
  );
  const pendingIds = useMemo(
    () => new Set<string>(JSON.parse(snapshot)),
    [snapshot],
  );
  const expiresAt = Math.min(
    ...candidates
      .filter(({ id }) => pendingIds.has(id))
      .map((candidate) => candidate.expiresAt),
  );
  useEffect(() => {
    if (!Number.isFinite(expiresAt)) return;
    const timer = window.setTimeout(
      () => window.dispatchEvent(new Event(CHANGE)),
      Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647)),
    );
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
  const consume = useCallback(
    (id: string) => {
      const expiresAt = candidates.find(
        (candidate) => candidate.id === id,
      )?.expiresAt;
      if (expiresAt === undefined || expiresAt <= Date.now()) return;
      const receipts = Object.entries({ ...read(key), [id]: expiresAt })
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_RECEIPTS);
      memory.set(key, Object.fromEntries(receipts));
      if (memory.size > 16) memory.delete(memory.keys().next().value as string);
      try {
        localStorage.setItem(key, JSON.stringify(Object.fromEntries(receipts)));
      } catch {
        /* Receipt storage is optional; server expiry remains authoritative. */
      }
      window.dispatchEvent(new Event(CHANGE));
    },
    [key, candidates],
  );
  return { pendingIds, consume };
}

export function useAttentionReceipt(
  scope: readonly string[],
  id: string,
  expiresAt: number,
) {
  const receipts = useAttentionReceipts(scope, [{ id, expiresAt }]);
  return {
    visible: receipts.pendingIds.has(id),
    consume: () => receipts.consume(id),
  };
}

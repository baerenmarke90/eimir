import { useCallback, useEffect, useSyncExternalStore } from 'react';

const CHANGE = 'eimir:attention-receipt';
const MAX_RECEIPTS = 32;
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

/** Bounded local UI receipts contain opaque identities only, never authored text. */
export function useAttentionReceipt(
  scope: readonly string[],
  id: string,
  expiresAt: number,
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
  const visible = useSyncExternalStore(
    subscribe,
    () => Date.now() < expiresAt && !read(key)[id],
    () => Date.now() < expiresAt,
  );
  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(
      () => window.dispatchEvent(new Event(CHANGE)),
      Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647)),
    );
    return () => window.clearTimeout(timer);
  }, [visible, expiresAt]);
  const consume = useCallback(() => {
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
  }, [key, id, expiresAt]);
  return { visible, consume };
}

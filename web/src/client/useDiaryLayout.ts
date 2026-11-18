import { useCallback, useSyncExternalStore } from 'react';

/**
 * Per-device choice between the scrapbook Album and the compact list.
 *
 * One shared value: pages that stay mounted in the background (Wir, Momente)
 * update the moment the setting changes in Mehr. Storage is a convenience
 * only: when it is blocked the choice still holds for this session, and when
 * it is empty or unreadable the default applies.
 */
export type DiaryLayout = 'album' | 'compact';

const STORAGE_KEY = 'eimir.diaryLayout';
const CHANGE_EVENT = 'eimir:diary-layout-change';

/** Product Owner decision 2026-11-16: Album is the default for everyone. */
export const DEFAULT_DIARY_LAYOUT: DiaryLayout = 'album';

// Holds the choice when storage is blocked.
let sessionLayout: DiaryLayout | null = null;

function isLayout(value: unknown): value is DiaryLayout {
  return value === 'album' || value === 'compact';
}

function readLayout(): DiaryLayout {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLayout(stored)) return stored;
  } catch {
    // Storage blocked: fall through to the session value.
  }
  return sessionLayout ?? DEFAULT_DIARY_LAYOUT;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function writeLayout(next: DiaryLayout): void {
  sessionLayout = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage unavailable: the choice lasts until the app is closed.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useDiaryLayout(): readonly [
  DiaryLayout,
  (layout: DiaryLayout) => void,
] {
  const layout = useSyncExternalStore(
    subscribe,
    readLayout,
    () => DEFAULT_DIARY_LAYOUT,
  );
  const setLayout = useCallback((next: DiaryLayout) => writeLayout(next), []);
  return [layout, setLayout] as const;
}

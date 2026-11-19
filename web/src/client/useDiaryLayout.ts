import { useCallback, useSyncExternalStore } from 'react';
import { announcePersonalSettingChange } from './personalSettingsBus';

/**
 * Personal choice between the scrapbook Album and the compact list. It is
 * written here first and then follows the Account to the person's other
 * devices through the personal settings sync.
 *
 * One shared value: pages that stay mounted in the background (Wir, Momente)
 * update the moment the setting changes in Mehr. Storage is a convenience
 * only: when it is blocked the choice still holds for this session, and when
 * it is empty or unreadable the default applies.
 */
export type DiaryLayout = 'album' | 'compact';

export const DIARY_LAYOUT_STORAGE_KEY = 'eimir.diaryLayout';
const STORAGE_KEY = DIARY_LAYOUT_STORAGE_KEY;
const CHANGE_EVENT = 'eimir:diary-layout-change';

/** Product Owner decision 2026-11-16: Album is the default for everyone. */
export const DEFAULT_DIARY_LAYOUT: DiaryLayout = 'album';

// Holds the choice when storage is blocked.
let sessionLayout: DiaryLayout | null = null;

export function isDiaryLayout(value: unknown): value is DiaryLayout {
  return value === 'album' || value === 'compact';
}

function readLayout(): DiaryLayout {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isDiaryLayout(stored)) return stored;
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

/** Applies the Account's saved layout from another device without echoing it back. */
export function applySyncedDiaryLayout(next: DiaryLayout): void {
  writeLayout(next);
}

function chooseLayout(next: DiaryLayout): void {
  writeLayout(next);
  announcePersonalSettingChange(STORAGE_KEY);
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
  const setLayout = useCallback((next: DiaryLayout) => chooseLayout(next), []);
  return [layout, setLayout] as const;
}

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

/**
 * Quiet hints (#1907 I1): small, personal, device-local guidance.
 *
 * Limits that keep hints from nagging:
 * - each screen asks for one slot, so at most one hint is visible per screen;
 * - a hint that was never shown may only start on a day when no other hint
 *   started, so at most one new hint appears per day;
 * - a hint retires for good after its feature was used, after an explicit
 *   dismissal or after it was seen in three app sessions.
 *
 * The store holds opaque hint ids and counters only, never authored content,
 * and is scoped to the viewer and Space on this device.
 */

const CHANGE = 'eimir:quiet-hints';
export const QUIET_HINT_MAX_VIEWS = 3;

/** "New in eimir." notes stay available this long after their release. */
export const NEW_NOTE_WINDOW_DAYS = 14;

/** Release day per "New in eimir." note; the copy lives in the locale. */
export const NEW_NOTES = {
  waymarks: '2026-11-16',
} as const;

export type NewNoteId = keyof typeof NEW_NOTES;

type HintRecord = { views: number; retired?: true };
type HintStore = { hints: Record<string, HintRecord>; lastStartDay?: string };

const memory = new Map<string, HintStore>();
/** Hints counted as seen in this app session, per storage key. */
const seenThisSession = new Set<string>();

export function quietHintKey(accountId: string, spaceId: string) {
  return `eimir-quiet-hints-v1:${accountId}:${spaceId}`;
}

export function localDay(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function readStore(key: string): HintStore {
  const cached = memory.get(key);
  if (cached) return cached;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const hints = (value as { hints?: unknown }).hints;
      const lastStartDay = (value as { lastStartDay?: unknown }).lastStartDay;
      const store: HintStore = {
        hints:
          hints && typeof hints === 'object' && !Array.isArray(hints)
            ? Object.fromEntries(
                Object.entries(hints as Record<string, unknown>).flatMap(
                  ([id, record]) => {
                    if (!record || typeof record !== 'object') return [];
                    const views = Number((record as HintRecord).views) || 0;
                    return [
                      [
                        id,
                        (record as HintRecord).retired
                          ? { views, retired: true as const }
                          : { views },
                      ],
                    ];
                  },
                ),
              )
            : {},
        lastStartDay:
          typeof lastStartDay === 'string' ? lastStartDay : undefined,
      };
      memory.set(key, store);
      return store;
    }
  } catch {
    // Unavailable or malformed storage falls back to this session only.
  }
  const empty: HintStore = { hints: {} };
  memory.set(key, empty);
  return empty;
}

function writeStore(key: string, store: HintStore) {
  memory.set(key, store);
  try {
    localStorage.setItem(key, JSON.stringify(store));
  } catch {
    // The in-memory copy keeps the limits for this session.
  }
  window.dispatchEvent(new Event(CHANGE));
}

function updateHint(
  key: string,
  id: string,
  change: (record: HintRecord) => HintRecord,
  startDay?: string,
) {
  const store = readStore(key);
  writeStore(key, {
    hints: { ...store.hints, [id]: change(store.hints[id] ?? { views: 0 }) },
    lastStartDay: startDay ?? store.lastStartDay,
  });
}

export type QuietHintCandidate = {
  id: string;
  /** The situation the hint explains is present right now. */
  eligible: boolean;
  /** The feature was already used, so the hint is never needed again. */
  used?: boolean;
};

/** Pick the one hint this screen may show, if any. */
export function chooseQuietHint(
  store: HintStore,
  candidates: readonly QuietHintCandidate[],
  key: string,
  today: string,
): string | null {
  for (const candidate of candidates) {
    if (!candidate.eligible || candidate.used) continue;
    const record = store.hints[candidate.id] ?? { views: 0 };
    if (record.retired) continue;
    const sessionKey = `${key}:${candidate.id}`;
    if (seenThisSession.has(sessionKey)) return candidate.id;
    if (record.views >= QUIET_HINT_MAX_VIEWS) continue;
    if (record.views === 0 && store.lastStartDay === today) continue;
    return candidate.id;
  }
  return null;
}

function subscribe(notify: () => void) {
  window.addEventListener(CHANGE, notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(CHANGE, notify);
    window.removeEventListener('storage', notify);
  };
}

/**
 * One quiet hint slot for a screen. Candidates are in priority order; the
 * result is the id to show (or null) and a dismissal for that id.
 */
export function useQuietHint(
  accountId: string | undefined,
  spaceId: string | undefined,
  candidates: readonly QuietHintCandidate[],
) {
  const key = accountId && spaceId ? quietHintKey(accountId, spaceId) : null;
  const signature = JSON.stringify(candidates);
  const today = localDay();
  const activeId = useSyncExternalStore(
    subscribe,
    () =>
      key
        ? chooseQuietHint(
            readStore(key),
            JSON.parse(signature) as QuietHintCandidate[],
            key,
            today,
          )
        : null,
    () => null,
  );

  const usedIds = useMemo(
    () =>
      (JSON.parse(signature) as QuietHintCandidate[])
        .filter((candidate) => candidate.used)
        .map((candidate) => candidate.id),
    [signature],
  );

  // A used feature retires its hint for good, also on other screens.
  useEffect(() => {
    if (!key) return;
    for (const id of usedIds) {
      if (!readStore(key).hints[id]?.retired) {
        updateHint(key, id, (record) => ({ ...record, retired: true }));
      }
    }
  }, [key, usedIds]);

  // Count one view per app session the first time the hint is on screen.
  useEffect(() => {
    if (!key || !activeId) return;
    const sessionKey = `${key}:${activeId}`;
    if (seenThisSession.has(sessionKey)) return;
    seenThisSession.add(sessionKey);
    const first = (readStore(key).hints[activeId]?.views ?? 0) === 0;
    updateHint(
      key,
      activeId,
      (record) => ({ ...record, views: record.views + 1 }),
      first ? localDay() : undefined,
    );
  }, [key, activeId]);

  const dismiss = useCallback(() => {
    if (!key || !activeId) return;
    updateHint(key, activeId, (record) => ({ ...record, retired: true }));
  }, [key, activeId]);

  return { activeId, dismiss };
}

/**
 * Makes a retired hint available again, for a hint that retires when it is
 * shown but whose offer could not be completed (for example a failed save).
 */
export function restoreQuietHint(
  accountId: string,
  spaceId: string,
  id: string,
) {
  const key = quietHintKey(accountId, spaceId);
  if (!readStore(key).hints[id]?.retired) return;
  updateHint(key, id, (record) => ({ views: record.views }));
}

/** Lets a screen skip reads that only feed a hint that already retired. */
export function quietHintRetired(
  accountId: string | undefined,
  spaceId: string | undefined,
  id: string,
) {
  if (!accountId || !spaceId) return true;
  const record = readStore(quietHintKey(accountId, spaceId)).hints[id];
  return Boolean(
    record?.retired || (record && record.views >= QUIET_HINT_MAX_VIEWS),
  );
}

/** Whether a "New in eimir." note is still inside its window. */
export function newNoteOpen(id: NewNoteId, now = new Date()) {
  const released = new Date(`${NEW_NOTES[id]}T00:00:00`);
  const end = new Date(released);
  end.setDate(end.getDate() + NEW_NOTE_WINDOW_DAYS);
  return now >= released && now < end;
}

/** Test seam: forget cached stores and session views. */
export function resetQuietHintsForTests() {
  memory.clear();
  seenThisSession.clear();
}

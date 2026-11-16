import { useEffect, useState } from 'react';
import { localDay } from './quietHints';

/**
 * The one-time "you are connected" moment on Wir (#1907 I1, #513).
 *
 * It plays once per person when the couple becomes two: for the person who
 * created the Space when this device saw it without a partner before, and for
 * the invited partner after accepting the invitation on this device. Couples
 * that were already connected never see it. Afterwards the quiet line stays
 * for the rest of that day. Only opaque ids and a day are stored locally.
 */

type MomentRecord = { solo?: true; partnerId?: string; playedOn?: string };

const decided = new Map<string, boolean>();

function recordKey(accountId: string, spaceId: string) {
  return `eimir-connected-moment-v1:${accountId}:${spaceId}`;
}

function joinedKey(spaceId: string) {
  return `eimir-connected-moment-v1:joined:${spaceId}`;
}

function read(key: string): MomentRecord {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as MomentRecord;
      return {
        solo: record.solo === true ? true : undefined,
        partnerId:
          typeof record.partnerId === 'string' ? record.partnerId : undefined,
        playedOn:
          typeof record.playedOn === 'string' ? record.playedOn : undefined,
      };
    }
  } catch {
    // Without storage the moment simply does not play.
  }
  return {};
}

function write(key: string, record: MomentRecord) {
  try {
    localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Best effort only.
  }
}

/** Called after this device accepted an invitation into the Space. */
export function markInvitationAccepted(spaceId: string) {
  try {
    localStorage.setItem(joinedKey(spaceId), '1');
  } catch {
    // Best effort only.
  }
}

function hasJoinedMark(spaceId: string) {
  try {
    return localStorage.getItem(joinedKey(spaceId)) === '1';
  } catch {
    return false;
  }
}

export type ConnectedMomentState = {
  /** Show the connected line (today, after the moment played). */
  visible: boolean;
  /** The moment plays now, in this mount. */
  playing: boolean;
};

export function connectedMomentState(
  accountId: string,
  spaceId: string,
  partnerId: string | null | undefined,
  today = localDay(),
): ConnectedMomentState {
  const key = recordKey(accountId, spaceId);
  const record = read(key);
  if (!partnerId) {
    if (!record.solo) write(key, { solo: true });
    return { visible: false, playing: false };
  }
  if (record.partnerId === partnerId && record.playedOn) {
    return {
      visible: record.playedOn === today,
      playing: decided.get(key) === true && record.playedOn === today,
    };
  }
  if (record.solo || hasJoinedMark(spaceId)) {
    write(key, { partnerId, playedOn: today });
    try {
      localStorage.removeItem(joinedKey(spaceId));
    } catch {
      // Best effort only.
    }
    decided.set(key, true);
    return { visible: true, playing: true };
  }
  // Already connected before this device knew the Space: never play.
  if (record.partnerId !== partnerId) write(key, { partnerId });
  return { visible: false, playing: false };
}

export function useConnectedMoment(
  accountId: string | undefined,
  spaceId: string | undefined,
  partnerId: string | null | undefined,
  ready: boolean,
): ConnectedMomentState {
  const [state, setState] = useState<ConnectedMomentState>({
    visible: false,
    playing: false,
  });
  useEffect(() => {
    if (!ready || !accountId || !spaceId) return;
    setState(connectedMomentState(accountId, spaceId, partnerId));
  }, [ready, accountId, spaceId, partnerId]);
  return state;
}

/** Test seam. */
export function resetConnectedMomentForTests() {
  decided.clear();
}

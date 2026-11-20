import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DailyCheckInUpdate } from '../api/generated/models/DailyCheckInUpdate';
import {
  DailyVibe,
  type DailyVibe as DailyVibeValue,
} from '../api/generated/models/DailyVibe';
import { dailyCheckInTodayQueryOptions } from '../client/dailyCheckIn';
import { ClientProblemError } from '../client/problemDetails';
import { postSnackbar } from '../client/snackbar';
import { refreshSpaceConfiguration } from '../client/spaceConfiguration';
import { useTranslation } from '../i18n';
import { BatteryIcon } from './DailyEnergyBattery';
import { DailyVibeIcon } from './DailyVibeIcon';
import { EimirIcon } from './EimirIcon';
import type { PartnerAvatarAction } from './PartnerAvatarPair';
import {
  arrivalMode,
  type PartnerArrival,
  startPartnerArrival,
} from './partnerArrival';
import { type PromptFlight, startPromptFlight } from './promptFlight';
import { ShortTaskSheet } from './ShortTaskSheet';
import {
  type FlightItem,
  type FlightKind,
  type SendFlight,
  startSendFlight,
} from './sendFlight';
import { useDailyCheckInWrite } from './useDailyCheckInWrite';
import { useViewportClamp } from './useViewportClamp';
import './WirDailyCheckIn.css';
import '../motion/motion.css';

/**
 * Daily check-in on the couple avatars on Wir (#1790 slice A).
 *
 * One quiet signal per person: the own avatar carries the own vibe and
 * battery and opens the inline "Dein Tag" panel; the partner avatar carries
 * the partner's revealed values and opens the existing partner quick-action
 * sheet, which shows the partner block above the unchanged actions.
 *
 * Reads and writes reuse the existing `daily-check-in/today` contract and its
 * single shared write hook. Each value saves on its own; a value chosen while
 * another write is in flight waits honestly as pending instead of being
 * dropped or shown as saved.
 */

export const DAILY_VIBE_FEELINGS: readonly DailyVibeValue[] = [
  DailyVibe.VERY_GOOD,
  DailyVibe.GOOD,
  DailyVibe.OKAY,
  DailyVibe.STRESSED,
  DailyVibe.SAD,
];

export const DAILY_NOTE_MAX_LENGTH = 200;
const DEFAULT_ENERGY_DRAFT = 50;
/** A write that never settles must not keep the sheet waiting forever. */
const FLIGHT_WAIT_LIMIT = 8000;
const NO_KINDS: ReadonlySet<FlightKind> = new Set();

interface OwnDay {
  vibe: DailyVibeValue | null;
  energy: number | null;
  note: string | null;
}

interface ActiveFlight {
  handle: SendFlight;
  expected: OwnDay;
  kinds: FlightKind[];
}

function withoutKind(
  kinds: ReadonlySet<FlightKind>,
  kind: FlightKind,
): ReadonlySet<FlightKind> {
  const next = new Set(kinds);
  next.delete(kind);
  return next;
}

function withKind(
  kinds: ReadonlySet<FlightKind>,
  kind: FlightKind,
): ReadonlySet<FlightKind> {
  return new Set(kinds).add(kind);
}
type Dimension = 'vibe' | 'energy';
type EnergyLevel = NonNullable<DailyCheckInUpdate['energyLevel']>;

function subscribeOnlineState(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

function subscribeVisibility(onStoreChange: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  document.addEventListener('visibilitychange', onStoreChange);
  return () => document.removeEventListener('visibilitychange', onStoreChange);
}

function visibilitySnapshot(): boolean {
  return typeof document === 'undefined'
    ? true
    : document.visibilityState !== 'hidden';
}

function onlineSnapshot(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

function mergeUpdate(
  queued: DailyCheckInUpdate | undefined,
  next: DailyCheckInUpdate,
): DailyCheckInUpdate {
  const merged = { ...(queued ?? {}), ...next };
  // Removing the vibe removes its note on the server; never queue both.
  if ('vibe' in next && next.vibe === null) delete merged.vibeNote;
  return merged;
}

/** True when the confirmed server state already contains every supplied value. */
function alreadyApplied(
  update: DailyCheckInUpdate | undefined,
  own: {
    vibe: DailyVibeValue | null;
    note: string | null;
    energy: number | null;
  },
): boolean {
  if (!update) return false;
  if ('vibe' in update && (update.vibe ?? null) !== own.vibe) return false;
  if ('vibeNote' in update && (update.vibeNote?.trim() || null) !== own.note)
    return false;
  if ('energyLevel' in update && (update.energyLevel ?? null) !== own.energy)
    return false;
  return true;
}

/** A short, non-reversible fingerprint; the note text never leaves memory. */
function noteFingerprint(note: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < note.length; index += 1) {
    hash ^= note.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function readSeenNote(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSeenNote(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Unread state is a local convenience only; storage may be unavailable.
  }
}

/**
 * The partner-note dot is local to this device: opening the note records only
 * a fingerprint here and never sends a read receipt to the partner.
 */
function usePartnerNoteSeen(
  accountId: string,
  spaceId: string,
  day: string | null,
  note: string | null,
) {
  const storageKey = `eimir.wir.partnerNoteSeen:${accountId}:${spaceId}`;
  const current = day && note ? `${day}:${noteFingerprint(note)}` : null;
  const [seen, setSeen] = useState<string | null>(() =>
    readSeenNote(storageKey),
  );
  useEffect(() => {
    setSeen(readSeenNote(storageKey));
  }, [storageKey]);
  const markSeen = useCallback(() => {
    if (!current) return;
    writeSeenNote(storageKey, current);
    setSeen(current);
  }, [current, storageKey]);
  return { unread: Boolean(current && seen !== current), markSeen };
}

/**
 * What this device has already seen of the partner's shared day. It decides
 * which values arrive with a movement on Wir; like the note dot it is local to
 * this device and never sent anywhere.
 */
interface ArrivalSeen {
  day: string;
  vibe: DailyVibeValue | null;
  energy: number | null;
  note: string | null;
}

function readArrivalSeen(key: string): ArrivalSeen | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ArrivalSeen) : null;
  } catch {
    return null;
  }
}

function writeArrivalSeen(key: string, value: ArrivalSeen): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local convenience only; storage may be unavailable.
  }
}

/**
 * How long the line stays before it sinks into the plus. It arrives with the
 * names during the Wir opening (fully shown after about 1.5 s), so this keeps
 * it readable for about two seconds.
 */
const PROMPT_HOLD_MS = 3600;
/** Accounts and spaces whose line already sank into the plus this session. */
const promptSettled = new Set<string>();

export type PartnerDayState = 'visible' | 'hidden' | 'none' | 'off';

export interface WirDailyCheckIn {
  ownAction: PartnerAvatarAction;
  ownAriaLabel: string;
  ownBadge: ReactNode;
  /** Whether the viewer has set a mood or energy value today. */
  ownHasValue: boolean;
  partnerBadge: ReactNode;
  partnerAriaLabel: string | null;
  partnerState: PartnerDayState;
  panel: ReactNode;
  partnerBlock: ReactNode;
  announcement: ReactNode;
}

export function useWirDailyCheckIn({
  api,
  accountId,
  spaceId,
  partnerName,
  vibeEnabled,
  energyEnabled,
}: {
  api?: DailyCheckInsApi;
  accountId?: string;
  spaceId: string;
  partnerName: string;
  vibeEnabled: boolean;
  energyEnabled: boolean;
}): WirDailyCheckIn | null {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const account = accountId ?? '';
  const active = Boolean(api && accountId && (vibeEnabled || energyEnabled));
  const online = useSyncExternalStore(
    subscribeOnlineState,
    onlineSnapshot,
    () => true,
  );
  const queryOptions = dailyCheckInTodayQueryOptions(api, account, spaceId);
  const dailyQuery = useQuery({
    ...queryOptions,
    enabled: queryOptions.enabled && active,
  });
  const vibeWrite = useDailyCheckInWrite({
    api,
    accountId: account,
    spaceId,
    dimension: 'vibe',
  });
  const energyWrite = useDailyCheckInWrite({
    api,
    accountId: account,
    spaceId,
    dimension: 'energy',
  });

  const [panelOpen, setPanelOpen] = useState(false);
  // Offered inside the open sheet: the shared snackbar sits below a modal.
  const [undoNote, setUndoNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [energyDraft, setEnergyDraft] = useState<number | null>(null);
  const [queued, setQueued] = useState<
    Partial<Record<Dimension, DailyCheckInUpdate>>
  >({});
  const [announcementText, setAnnouncementText] = useState('');
  const [revealKey, setRevealKey] = useState(0);
  // Send flight: the values that still travel to the badge, the slots that
  // just arrived, and whether Fertig waits for the server.
  const [flightHidden, setFlightHidden] =
    useState<ReadonlySet<FlightKind>>(NO_KINDS);
  const [flightLanding, setFlightLanding] =
    useState<ReadonlySet<FlightKind>>(NO_KINDS);
  const [flightWaiting, setFlightWaiting] = useState(false);
  const flightRef = useRef<ActiveFlight | null>(null);
  // Partner arrival: the values still travelling, the slots that just landed.
  const [arrivalHidden, setArrivalHidden] =
    useState<ReadonlySet<FlightKind>>(NO_KINDS);
  const [arrivalLanding, setArrivalLanding] =
    useState<ReadonlySet<FlightKind>>(NO_KINDS);
  // The feeling this device saw before the partner changed it; it stays in
  // its place until the new one lands.
  const [arrivalOldVibe, setArrivalOldVibe] = useState<DailyVibeValue | null>(
    null,
  );
  const arrivalRef = useRef<PartnerArrival | null>(null);
  const partnerBadgeRef = useRef<HTMLSpanElement | null>(null);
  const pageVisible = useSyncExternalStore(
    subscribeVisibility,
    visibilitySnapshot,
    () => true,
  );
  const baselineRef = useRef<OwnDay>({ vibe: null, energy: null, note: null });
  const panelId = useId();
  const ownTriggerRef = useRef<HTMLButtonElement>(null);
  const ownBadgeRef = useRef<HTMLSpanElement | null>(null);
  const panelBodyRef = useRef<HTMLDivElement>(null);

  // Privacy: present the private partner projection (and own values) only
  // from an authoritative read. A denied or failed read, or being offline,
  // must not keep showing the last cached partner state.
  const authoritative = online && !dailyQuery.isError;
  const snapshot = authoritative ? dailyQuery.data : undefined;
  const projection = snapshot?.projection;
  const vibeView = projection?.vibe;
  const energyView = projection?.energy;
  const vibeOn = vibeEnabled && vibeView !== null;
  const energyOn = energyEnabled && energyView !== null;
  const serverModuleOff =
    Boolean(projection) &&
    ((vibeEnabled && vibeView === null) ||
      (energyEnabled && energyView === null));

  useEffect(() => {
    if (!serverModuleOff || !accountId) return;
    void refreshSpaceConfiguration(queryClient, accountId, spaceId);
  }, [accountId, queryClient, serverModuleOff, spaceId]);

  // Own values: queued intent, then the in-flight request, then the server.
  const vibePending = vibeWrite.pendingUpdate;
  const energyPending = energyWrite.pendingUpdate;
  const serverVibe = projection?.own.vibe ?? null;
  const serverNote = projection?.own.vibeNote?.trim() || null;
  const serverEnergy = projection?.own.energyLevel ?? null;
  // A queued note must not hide a feeling that is still being saved: each
  // field reads the newest intent that actually mentions it.
  const vibeIntents = [queued.vibe, vibePending];
  const vibeIntent = vibeIntents.find((update) => update && 'vibe' in update);
  const noteIntent = vibeIntents.find(
    (update) => update && 'vibeNote' in update,
  );
  const ownVibe = vibeIntent ? (vibeIntent.vibe ?? null) : serverVibe;
  const ownNote =
    vibeIntent && !vibeIntent.vibe
      ? null
      : noteIntent
        ? noteIntent.vibeNote?.trim() || null
        : serverNote;
  const pendingEnergySource = queued.energy ?? energyPending ?? null;
  const ownEnergy =
    pendingEnergySource && pendingEnergySource.energyLevel !== undefined
      ? pendingEnergySource.energyLevel
      : serverEnergy;
  const ownPending = Boolean(
    vibePending || energyPending || queued.vibe || queued.energy,
  );

  // Partner values exist only as the server's privacy-bounded projection.
  const partnerVibe = vibeOn ? vibeView?.partner : undefined;
  const partnerEnergy = energyOn ? energyView?.partner : undefined;
  const partnerVibeValue =
    partnerVibe?.state === 'VISIBLE' ? partnerVibe.value : null;
  const partnerEnergyValue =
    partnerEnergy?.state === 'VISIBLE' ? partnerEnergy.value : null;
  const partnerNote =
    partnerVibeValue !== null ? vibeView?.partnerNote?.trim() || null : null;
  const partnerState: PartnerDayState = !projection
    ? 'off'
    : partnerVibeValue !== null || partnerEnergyValue !== null
      ? 'visible'
      : partnerVibe?.state === 'HIDDEN_UNTIL_SELF_CHECK_IN' ||
          partnerEnergy?.state === 'HIDDEN_UNTIL_SELF_CHECK_IN'
        ? 'hidden'
        : partnerVibe || partnerEnergy
          ? 'none'
          : 'off';
  const day = projection
    ? `${projection.checkedOn.toISOString().slice(0, 10)}:${projection.dailyContextTimezone}`
    : null;
  const noteSeen = usePartnerNoteSeen(account, spaceId, day, partnerNote);

  // Arrival: when the partner's revealed values are new or changed since this
  // device last saw them, they arrive in one movement. It waits until no own
  // sheet or flight is on screen and the page is visible, and each state is
  // played at most once.
  const arrivalKey = `eimir.wir.partnerArrivalSeen:${account}:${spaceId}`;
  useLayoutEffect(() => {
    if (partnerState !== 'visible' || !day) return;
    if (
      !pageVisible ||
      panelOpen ||
      flightWaiting ||
      flightHidden.size > 0 ||
      arrivalRef.current
    )
      return;
    const current: ArrivalSeen = {
      day,
      vibe: partnerVibeValue,
      energy: partnerEnergyValue,
      note: partnerNote ? noteFingerprint(partnerNote) : null,
    };
    const stored = readArrivalSeen(arrivalKey);
    const base: ArrivalSeen =
      stored && stored.day === day
        ? stored
        : { day, vibe: null, energy: null, note: null };
    const kinds = (
      [
        current.vibe !== null && current.vibe !== base.vibe ? 'vibe' : null,
        current.energy !== null && current.energy !== base.energy
          ? 'energy'
          : null,
        current.note !== null && current.note !== base.note ? 'note' : null,
      ] as (FlightKind | null)[]
    ).filter((kind): kind is FlightKind => kind !== null);
    if (
      kinds.length === 0 &&
      current.vibe === base.vibe &&
      current.energy === base.energy &&
      current.note === base.note
    )
      return;
    // From now on this state counts as seen: it never plays twice.
    writeArrivalSeen(arrivalKey, current);
    if (kinds.length === 0) return;
    const badge = partnerBadgeRef.current;
    const avatar =
      badge?.closest('.partner-avatar-slot') ?? badge?.parentElement;
    if (!badge || !avatar) return;
    const slotOf = (kind: FlightKind) =>
      kind === 'note'
        ? (badge.parentElement?.querySelector('[data-flight-slot="note"]') ??
          null)
        : badge.querySelector(`[data-flight-slot="${kind}"]`);
    const arrival = startPartnerArrival(
      {
        avatar,
        badge,
        items: kinds.map((kind) => ({ kind, slot: () => slotOf(kind) })),
      },
      {
        onLand: (kind) => {
          if (kind === 'vibe') setArrivalOldVibe(null);
          setArrivalHidden((current) => withoutKind(current, kind));
          setArrivalLanding((current) => withKind(current, kind));
        },
      },
    );
    if (!arrival) return;
    arrivalRef.current = arrival;
    if (arrivalMode(kinds) === 'travel') setArrivalHidden(new Set(kinds));
    if (kinds.includes('vibe') && base.vibe && base.vibe !== current.vibe)
      setArrivalOldVibe(base.vibe);
    void arrival.done.finally(() => {
      if (arrivalRef.current === arrival) arrivalRef.current = null;
      setArrivalHidden(NO_KINDS);
      setArrivalOldVibe(null);
    });
  }, [
    arrivalKey,
    day,
    flightHidden,
    flightWaiting,
    pageVisible,
    panelOpen,
    partnerEnergyValue,
    partnerNote,
    partnerState,
    partnerVibeValue,
  ]);
  // The arrival never outlives the values it shows or its screen.
  useEffect(() => {
    if (partnerState === 'visible') return;
    arrivalRef.current?.cancel();
    arrivalRef.current = null;
    setArrivalHidden(NO_KINDS);
    setArrivalOldVibe(null);
  }, [partnerState]);
  useEffect(
    () => () => {
      arrivalRef.current?.cancel();
      arrivalRef.current = null;
    },
    [],
  );

  const vibeLabel = (value: DailyVibeValue) => t(`dailyVibe.values.${value}`);
  const summary = (parts: string[]) =>
    parts.join(t('wirCheckIn.summarySeparator'));
  const ownParts = [
    ...(ownVibe ? [vibeLabel(ownVibe)] : []),
    ...(ownEnergy !== null
      ? [t('wirCheckIn.summaryEnergy', { value: ownEnergy })]
      : []),
    ...(ownNote ? [t('wirCheckIn.summaryNote')] : []),
  ];
  const ownAriaLabel = !projection
    ? t('wirCheckIn.ownAriaPending')
    : ownParts.length
      ? t('wirCheckIn.ownAria', { summary: summary(ownParts) })
      : t('wirCheckIn.ownAriaEmpty');
  const partnerParts = [
    ...(partnerVibeValue ? [vibeLabel(partnerVibeValue)] : []),
    ...(partnerEnergyValue !== null
      ? [t('wirCheckIn.summaryEnergy', { value: partnerEnergyValue })]
      : []),
    ...(partnerNote
      ? [
          noteSeen.unread
            ? t('wirCheckIn.summaryNewNote')
            : t('wirCheckIn.summaryNote'),
        ]
      : []),
  ];
  const partnerAriaLabel =
    partnerState === 'visible'
      ? t('wirCheckIn.partnerAria', {
          name: partnerName,
          summary: summary(partnerParts),
        })
      : partnerState === 'hidden'
        ? t('wirCheckIn.partnerHiddenAria', { name: partnerName })
        : partnerState === 'none'
          ? t('wirCheckIn.partnerNoneAria', { name: partnerName })
          : null;

  // Partner reveal: the lock cross-fades into the values after the own entry.
  const previousPartnerState = useRef<PartnerDayState>(partnerState);
  const partnerSummary = summary(partnerParts);
  useEffect(() => {
    const previous = previousPartnerState.current;
    previousPartnerState.current = partnerState;
    if (previous === 'hidden' && partnerState === 'visible') {
      setRevealKey((value) => value + 1);
      setAnnouncementText(
        t('wirCheckIn.revealed', {
          summary: `${partnerName}: ${partnerSummary}`,
        }),
      );
    }
  }, [partnerName, partnerState, partnerSummary, t]);

  // A new account, Space or day starts from the server again.
  const scopeRef = useRef(vibeWrite.scopeId);
  useEffect(() => {
    if (scopeRef.current === vibeWrite.scopeId) return;
    scopeRef.current = vibeWrite.scopeId;
    flightRef.current?.handle.cancel();
    flightRef.current = null;
    setFlightWaiting(false);
    setFlightHidden(NO_KINDS);
    setPanelOpen(false);
    setNoteDraft(null);
    setEnergyDraft(null);
    setQueued({});
    setAnnouncementText('');
  }, [vibeWrite.scopeId]);

  const writers = { vibe: vibeWrite, energy: energyWrite };
  const write = (dimension: Dimension, update: DailyCheckInUpdate) => {
    if (!online) return;
    const writer = writers[dimension];
    if (writer.isInFlight()) {
      setQueued((current) => ({
        ...current,
        [dimension]: mergeUpdate(current[dimension], update),
      }));
      return;
    }
    writer.reset();
    // A read that cannot admit the write (e.g. replaced after a conflict)
    // returns false; the display then honestly stays on the server value.
    writer.submit(update);
  };
  const writeRef = useRef(write);
  writeRef.current = write;

  // Flush queued intent one write at a time, after each confirmed response.
  const anyPending = vibeWrite.isPending;
  const readyEtag = snapshot?.etag;
  const writersRef = useRef(writers);
  writersRef.current = writers;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new validator (readyEtag) re-checks queued intent once the confirmed read lands.
  useEffect(() => {
    if (anyPending || !online) return;
    const dimension = (['vibe', 'energy'] as const).find(
      (candidate) => queued[candidate],
    );
    if (!dimension) return;
    const writer = writersRef.current[dimension];
    if (writer.isInFlight()) return;
    const update = queued[dimension];
    if (!update) return;
    writer.reset();
    writer.submit(update);
    // One attempt per queued intent: a value that cannot be admitted is
    // dropped instead of staying "pending" indefinitely.
    setQueued((current) => {
      const next = { ...current };
      delete next[dimension];
      return next;
    });
  }, [anyPending, online, queued, readyEtag]);

  // Queued intent never survives a connectivity loss: nothing is replayed
  // automatically on reconnect.
  useEffect(() => {
    if (!online) setQueued({});
  }, [online]);

  const serverOwnRef = useRef({
    vibe: serverVibe,
    note: serverNote,
    energy: serverEnergy,
  });
  serverOwnRef.current = {
    vibe: serverVibe,
    note: serverNote,
    energy: serverEnergy,
  };
  // Fertig: wait until the writes settled, then fly what the server holds and
  // let what failed return. A flight never outlives its screen.
  const anyWriteFailed = [vibeWrite, energyWrite].some(
    (writer) => writer.error !== null,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-evaluated whenever the writes, the confirmed read or connectivity change.
  useEffect(() => {
    const flight = flightRef.current;
    if (!flight || !flightWaiting) return;
    const { expected } = flight;
    const confirmed = {
      vibe: serverVibe,
      note: serverNote,
      energy: serverEnergy,
    };
    const matches: Record<FlightKind, boolean> = {
      vibe: alreadyApplied({ vibe: expected.vibe }, confirmed),
      energy: alreadyApplied(
        expected.energy === null
          ? {}
          : { energyLevel: expected.energy as EnergyLevel },
        confirmed,
      ),
      note: alreadyApplied({ vibeNote: expected.note }, confirmed),
    };
    const settled = flight.kinds.every((kind) => matches[kind]);
    const stuck = anyWriteFailed || !online;
    if (!settled && !stuck) return;
    setFlightWaiting(false);
    const outcome: Record<FlightKind, boolean> = {
      vibe: matches.vibe,
      energy: matches.energy,
      note: matches.note,
    };
    // Values that did not make it show their own state again at once.
    setFlightHidden(
      (current) =>
        new Set(
          [...current].filter(
            (kind) => outcome[kind] || !flight.kinds.includes(kind),
          ),
        ),
    );
    if (settled) {
      setUndoNote(null);
      setPanelOpen(false);
    }
    void flight.handle
      .settle(outcome, {
        onLand: (kind) => {
          setFlightHidden((current) => withoutKind(current, kind));
          setFlightLanding((current) => withKind(current, kind));
        },
      })
      .finally(() => {
        if (flightRef.current === flight) flightRef.current = null;
        setFlightHidden(NO_KINDS);
      });
  }, [
    anyPending,
    anyWriteFailed,
    flightWaiting,
    online,
    queued.energy,
    queued.vibe,
    serverEnergy,
    serverNote,
    serverVibe,
  ]);
  useEffect(() => {
    if (!flightWaiting) return;
    const timer = window.setTimeout(() => {
      const flight = flightRef.current;
      if (!flight) return;
      // Give up waiting: treat what is not confirmed as failed.
      setFlightWaiting(false);
      setFlightHidden(NO_KINDS);
      void flight.handle
        .settle(
          { vibe: false, energy: false, note: false },
          { onLand: () => undefined },
        )
        .finally(() => {
          if (flightRef.current === flight) flightRef.current = null;
        });
    }, FLIGHT_WAIT_LIMIT);
    return () => window.clearTimeout(timer);
  }, [flightWaiting]);
  useEffect(
    () => () => {
      flightRef.current?.handle.cancel();
      flightRef.current = null;
    },
    [],
  );

  // Server feedback per dimension (conflict, module disabled, errors).
  useEffect(() => {
    if (!vibeWrite.claimFeedback()) return;
    const error = vibeWrite.error;
    if (!error) return;
    if (error.code === 'SPACE_MODULE_DISABLED') {
      setPanelOpen(false);
      postSnackbar('snackbar.dailyVibeModuleDisabled');
    } else if (error.kind === 'conflict') {
      setQueued((current) => ({ ...current, vibe: undefined }));
      setPanelOpen(false);
      postSnackbar('snackbar.dailyVibeConflict');
    } else if (
      alreadyApplied(vibeWrite.request?.update, serverOwnRef.current)
    ) {
      // A lost acknowledgement for a change a newer read already confirms.
      vibeWrite.reset();
    } else {
      setPanelOpen(true);
    }
  }, [
    vibeWrite.claimFeedback,
    vibeWrite.error,
    vibeWrite.request,
    vibeWrite.reset,
  ]);
  useEffect(() => {
    if (!energyWrite.claimFeedback()) return;
    const error = energyWrite.error;
    if (!error) return;
    if (error.code === 'SPACE_MODULE_DISABLED') {
      setPanelOpen(false);
      postSnackbar('snackbar.dailyEnergyModuleDisabled');
    } else if (error.kind === 'conflict') {
      setQueued((current) => ({ ...current, energy: undefined }));
      setPanelOpen(false);
      postSnackbar('snackbar.dailyEnergyConflict');
    } else if (
      alreadyApplied(energyWrite.request?.update, serverOwnRef.current)
    ) {
      // A lost acknowledgement for a change a newer read already confirms.
      energyWrite.reset();
    } else {
      setPanelOpen(true);
    }
  }, [
    energyWrite.claimFeedback,
    energyWrite.error,
    energyWrite.request,
    energyWrite.reset,
  ]);

  // The "Wie geht's?" line invites today's check-in and explains the plus on
  // the own ring. It shows once per app session while today has no own value,
  // holds for a moment and then sinks into the plus. It is the day's
  // invitation, not a feature hint, so it no longer retires for good after
  // three sessions (Product Owner, 2026-11-19: the line had stopped showing).
  const ownDayHasValue = Boolean(ownVibe) || ownEnergy !== null;
  const promptKey = `${accountId}:${spaceId}`;
  const [promptGone, setPromptGone] = useState(() =>
    promptSettled.has(promptKey),
  );
  const promptShown =
    Boolean(snapshot) &&
    !ownDayHasValue &&
    !promptGone &&
    !promptSettled.has(promptKey) &&
    !panelOpen;
  useEffect(() => {
    if (!promptShown) return;
    let flight: PromptFlight | null = null;
    const settle = () => {
      promptSettled.add(promptKey);
      setPromptGone(true);
    };
    const timer = window.setTimeout(() => {
      const badge = ownBadgeRef.current;
      const source = badge?.querySelector<HTMLElement>('.wir-checkin-prompt');
      const target = badge
        ?.closest('.partner-avatar-stack')
        ?.querySelector<HTMLElement>('.wir-stage-gesture-own');
      flight = source && target ? startPromptFlight(source, target) : null;
      if (flight) void flight.finished.then(settle);
      else settle();
    }, PROMPT_HOLD_MS);
    return () => {
      window.clearTimeout(timer);
      flight?.cancel();
    };
  }, [promptShown, promptKey]);

  if (!active || !accountId || !api) return null;

  const loaded = Boolean(snapshot);
  const failedWriter = [vibeWrite, energyWrite].find(
    (writer) =>
      writer.error &&
      writer.error.kind !== 'conflict' &&
      writer.error.code !== 'SPACE_MODULE_DISABLED' &&
      !(
        loaded &&
        alreadyApplied(writer.request?.update, {
          vibe: serverVibe,
          note: serverNote,
          energy: serverEnergy,
        })
      ),
  );
  const failedProblem =
    failedWriter?.error instanceof ClientProblemError
      ? failedWriter.error
      : null;

  function commitNote(): void {
    if (noteDraft === null) return;
    const normalized = noteDraft.trim();
    setNoteDraft(null);
    if (normalized === (ownNote ?? '') || !ownVibe) return;
    write('vibe', { vibeNote: normalized.length ? normalized : null });
  }

  function commitEnergy(): void {
    if (energyDraft === null) return;
    const value = energyDraft;
    setEnergyDraft(null);
    if (value === ownEnergy) return;
    write('energy', { energyLevel: value as EnergyLevel });
  }

  function chooseVibe(value: DailyVibeValue): void {
    setUndoNote(null);
    commitEnergy();
    if (value === ownVibe) {
      setNoteDraft(null);
      write('vibe', { vibe: null });
      return;
    }
    const pendingNote = noteDraft?.trim();
    setNoteDraft(null);
    write(
      'vibe',
      pendingNote !== undefined && pendingNote !== (ownNote ?? '')
        ? { vibe: value, vibeNote: pendingNote.length ? pendingNote : null }
        : { vibe: value },
    );
  }

  function deleteNote(): void {
    const previous = ownNote;
    setNoteDraft(null);
    if (!previous) return;
    write('vibe', { vibeNote: null });
    setUndoNote(previous);
  }

  function undoNoteDelete(): void {
    const previous = undoNote;
    setUndoNote(null);
    if (previous) write('vibe', { vibeNote: previous });
  }

  function retryFailed(): void {
    const writer = failedWriter;
    const update = writer?.request?.update;
    if (!writer || !update) return;
    write(writer === vibeWrite ? 'vibe' : 'energy', update);
  }

  // The sheet owns Escape, outside press, drag-down and focus restoration;
  // every dismissal saves the open note and energy like Done does.
  function cancelFlight(): void {
    flightRef.current?.handle.cancel();
    flightRef.current = null;
    setFlightWaiting(false);
    setFlightHidden(NO_KINDS);
  }

  /**
   * Fertig: when something changed, the chosen values fly to the badge after
   * the server confirmed them. Without a flight (nothing changed, reduced
   * motion, no top-layer support) the sheet simply closes.
   */
  function finishPanel(): void {
    if (flightRef.current) return;
    const expected: OwnDay = {
      vibe: ownVibe,
      energy: energyDraft ?? ownEnergy,
      note: noteDraft !== null ? noteDraft.trim() || null : ownNote,
    };
    const baseline = baselineRef.current;
    const changed =
      expected.vibe !== baseline.vibe ||
      expected.energy !== baseline.energy ||
      expected.note !== baseline.note;
    const body = panelBodyRef.current;
    const slot = (kind: FlightKind) =>
      ownBadgeRef.current?.querySelector(`[data-flight-slot="${kind}"]`) ??
      null;
    const items: FlightItem[] = [];
    if (body && changed) {
      const face = body.querySelector(
        '.wir-checkin-vibe.is-selected .wir-checkin-vibe-circle',
      );
      if (expected.vibe && face)
        items.push({ kind: 'vibe', source: face, target: () => slot('vibe') });
      const battery = body.querySelector(
        '.wir-checkin-energy-label .daily-energy-battery-icon',
      );
      if (expected.energy !== null && battery)
        items.push({
          kind: 'energy',
          source: battery,
          target: () => slot('energy'),
        });
      const note = body.querySelector('.wir-checkin-note-field textarea');
      if (expected.note && note)
        items.push({ kind: 'note', source: note, target: () => slot('note') });
    }
    const handle = items.length ? startSendFlight(items) : null;
    if (!handle) {
      closePanel();
      return;
    }
    const kinds = items.map((item) => item.kind);
    commitNote();
    commitEnergy();
    flightRef.current = { handle, expected, kinds };
    setFlightHidden(new Set(kinds));
    setFlightLanding(NO_KINDS);
    setFlightWaiting(true);
  }

  function closePanel(): void {
    cancelFlight();
    commitNote();
    commitEnergy();
    setUndoNote(null);
    setPanelOpen(false);
  }

  const ownAction: PartnerAvatarAction = {
    onActivate: () => {
      baselineRef.current = { vibe: ownVibe, energy: ownEnergy, note: ownNote };
      setPanelOpen(true);
    },
    label: ownAriaLabel,
    ref: ownTriggerRef,
    expanded: panelOpen,
    controls: panelId,
    hasPopup: 'dialog',
  };

  const ownHasValue = Boolean(ownVibe) || ownEnergy !== null;
  const slotState = {
    hidden: flightHidden,
    landing: flightLanding,
    onLanded: (kind: FlightKind) =>
      setFlightLanding((current) => withoutKind(current, kind)),
  };
  const ownBadge = loaded ? (
    <ClampedBadge
      className="wir-checkin-badge wir-checkin-badge-own"
      badgeRef={ownBadgeRef}
      data-pending={ownPending ? 'true' : undefined}
      data-empty={!ownHasValue && !promptShown ? 'true' : undefined}
      data-testid="wir-checkin-own-badge"
      aria-hidden="true"
    >
      <span
        key={ownHasValue ? `${ownVibe}:${ownEnergy === null}` : 'empty'}
        className="wir-checkin-badge-content"
      >
        {ownHasValue ? (
          <>
            {ownVibe ? (
              <FlightSlot kind="vibe" {...slotState}>
                <DailyVibeIcon value={ownVibe} className="wir-checkin-glyph" />
              </FlightSlot>
            ) : null}
            {ownEnergy !== null ? (
              <FlightSlot kind="energy" {...slotState}>
                <BatteryIcon value={ownEnergy} />
              </FlightSlot>
            ) : null}
          </>
        ) : (
          <span className="wir-checkin-prompt">
            <span aria-hidden="true">+</span> {t('wirCheckIn.ownPrompt')}
          </span>
        )}
      </span>
      {ownNote ? (
        <FlightSlot
          kind="note"
          className="wir-checkin-badge-note"
          {...slotState}
        >
          <EimirIcon name="nachrichten" />
        </FlightSlot>
      ) : null}
    </ClampedBadge>
  ) : null;

  const partnerSlotState = {
    hidden: arrivalHidden,
    landing: arrivalLanding,
    onLanded: (kind: FlightKind) =>
      setArrivalLanding((current) => withoutKind(current, kind)),
  };
  const partnerBadge =
    partnerState === 'visible' || partnerState === 'hidden' ? (
      <>
        <ClampedBadge
          className="wir-checkin-badge wir-checkin-badge-partner"
          badgeRef={partnerBadgeRef}
          data-state={partnerState}
          data-testid="wir-checkin-partner-badge"
          aria-hidden="true"
        >
          <span
            key={`${partnerState}:${revealKey}:${partnerVibeValue}:${partnerEnergyValue === null}`}
            className={`wir-checkin-badge-content${revealKey > 0 && partnerState === 'visible' ? ' is-revealed' : ''}`}
          >
            {partnerState === 'hidden' ? (
              <EimirIcon name="privatsphaere" className="wir-checkin-lock" />
            ) : (
              <>
                {partnerVibeValue ? (
                  <FlightSlot kind="vibe" {...partnerSlotState}>
                    <DailyVibeIcon
                      value={partnerVibeValue}
                      className="wir-checkin-glyph"
                    />
                    {arrivalOldVibe && arrivalHidden.has('vibe') ? (
                      <span
                        className="wir-checkin-farewell"
                        data-flight-farewell="true"
                      >
                        <DailyVibeIcon
                          value={arrivalOldVibe}
                          className="wir-checkin-glyph"
                        />
                      </span>
                    ) : null}
                  </FlightSlot>
                ) : null}
                {partnerEnergyValue !== null ? (
                  <FlightSlot kind="energy" {...partnerSlotState}>
                    <BatteryIcon value={partnerEnergyValue} />
                  </FlightSlot>
                ) : null}
              </>
            )}
          </span>
        </ClampedBadge>
        {partnerNote && noteSeen.unread ? (
          <FlightSlot
            key={`dot:${revealKey}`}
            kind="note"
            className="wir-checkin-note-dot"
            testId="wir-checkin-note-dot"
            {...partnerSlotState}
          >
            <EimirIcon name="nachrichten" />
          </FlightSlot>
        ) : null}
      </>
    ) : null;

  const offline = !online;
  const disabled = offline || !loaded || flightWaiting;
  const noteValue = noteDraft ?? ownNote ?? '';
  const energyValue = energyDraft ?? ownEnergy ?? DEFAULT_ENERGY_DRAFT;
  const sliderStyle = {
    '--wir-checkin-energy-progress': `${((energyValue - 10) / 90) * 100}%`,
  } as CSSProperties;
  const feelings = DAILY_VIBE_FEELINGS.includes(ownVibe as DailyVibeValue)
    ? DAILY_VIBE_FEELINGS
    : ownVibe
      ? [...DAILY_VIBE_FEELINGS, ownVibe]
      : DAILY_VIBE_FEELINGS;
  const savingText = vibePending || energyPending ? t('wirCheckIn.saving') : '';

  const panel = (
    <ShortTaskSheet
      id={panelId}
      open={panelOpen}
      title={t('wirCheckIn.panelTitle')}
      onClose={closePanel}
      restoreFocusRef={ownTriggerRef}
      className="wir-checkin-own-sheet"
    >
      <div
        className="wir-checkin-panel-inner"
        data-testid="wir-checkin-panel"
        ref={panelBodyRef}
      >
        {!loaded && online ? (
          <p className="wir-checkin-status" role="status">
            {dailyQuery.isError
              ? t('wirCheckIn.unavailable')
              : t('dailyVibe.loading')}
          </p>
        ) : null}

        {offline ? (
          <p className="wir-checkin-status" role="status">
            {t('wirCheckIn.offline')}
          </p>
        ) : null}

        {vibeOn ? (
          <fieldset className="wir-checkin-vibes" disabled={disabled}>
            <legend className="sr-only">{t('wirCheckIn.vibeLegend')}</legend>
            <div className="wir-checkin-vibe-options">
              {feelings.map((value) => {
                const selected = ownVibe === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`wir-checkin-vibe${selected ? ' is-selected' : ''}`}
                    aria-pressed={selected}
                    data-vibe={value}
                    onClick={() => chooseVibe(value)}
                  >
                    <span className="wir-checkin-vibe-circle">
                      <DailyVibeIcon value={value} />
                      {selected ? (
                        <span
                          className="wir-checkin-vibe-clear"
                          aria-hidden="true"
                        >
                          <EimirIcon name="close" />
                        </span>
                      ) : null}
                    </span>
                    <span className="wir-checkin-vibe-label">
                      {vibeLabel(value)}
                    </span>
                  </button>
                );
              })}
            </div>
            {ownVibe ? (
              <p className="wir-checkin-hint">
                {ownNote
                  ? t('wirCheckIn.vibeSelectedHintWithNote')
                  : t('wirCheckIn.vibeSelectedHint')}
              </p>
            ) : null}
          </fieldset>
        ) : serverVibe ? (
          <div className="wir-checkin-disabled">
            <p>{t('wirCheckIn.vibeDisabled')}</p>
            <button
              type="button"
              className="tertiary"
              disabled={disabled}
              onClick={() => write('vibe', { vibe: null })}
            >
              {t('wirCheckIn.vibeDisabledRemove')}
            </button>
          </div>
        ) : null}

        {energyOn || serverEnergy !== null ? (
          <div className="wir-checkin-energy">
            <div className="wir-checkin-energy-heading">
              <span className="wir-checkin-energy-label">
                <BatteryIcon
                  value={energyDraft ?? ownEnergy}
                  showQuestion={energyDraft === null && ownEnergy === null}
                />
                <span>{t('wirCheckIn.energyLabel')}</span>
                {ownEnergy === null && energyDraft === null ? (
                  <span className="wir-checkin-muted">
                    {' · '}
                    {t('wirCheckIn.energyNotSet')}
                  </span>
                ) : null}
              </span>
              {ownEnergy !== null ? (
                <button
                  type="button"
                  className="tertiary wir-checkin-energy-remove"
                  aria-label={t('wirCheckIn.energyRemoveAria')}
                  disabled={disabled}
                  onClick={() => {
                    setEnergyDraft(null);
                    write('energy', { energyLevel: null });
                  }}
                >
                  {t('wirCheckIn.energyRemove')}
                </button>
              ) : null}
            </div>
            {energyOn ? (
              <>
                <input
                  className="wir-checkin-energy-slider"
                  type="range"
                  min={10}
                  max={100}
                  step={10}
                  value={energyValue}
                  disabled={disabled}
                  style={sliderStyle}
                  data-unset={
                    ownEnergy === null && energyDraft === null
                      ? 'true'
                      : undefined
                  }
                  aria-label={t('wirCheckIn.energySliderLabel')}
                  aria-valuetext={
                    ownEnergy === null && energyDraft === null
                      ? t('wirCheckIn.energyNotSet')
                      : t('dailyEnergy.optionAria', { value: energyValue })
                  }
                  onChange={(event) =>
                    setEnergyDraft(Number(event.currentTarget.value))
                  }
                  onPointerUp={commitEnergy}
                  onKeyUp={commitEnergy}
                  onBlur={commitEnergy}
                />
                <div className="wir-checkin-energy-scale" aria-hidden="true">
                  <span>{t('wirCheckIn.energyScaleLow')}</span>
                  <span>{t('wirCheckIn.energyScaleHigh')}</span>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {vibeOn ? (
          <div className="wir-checkin-note">
            <label className="sr-only" htmlFor={`${panelId}-note`}>
              {t('wirCheckIn.noteLabel')}
            </label>
            <div className="wir-checkin-note-field">
              <textarea
                id={`${panelId}-note`}
                value={noteValue}
                maxLength={DAILY_NOTE_MAX_LENGTH}
                rows={2}
                disabled={disabled || !ownVibe}
                placeholder={t(
                  ownVibe
                    ? 'wirCheckIn.notePlaceholder'
                    : 'wirCheckIn.notePlaceholderLocked',
                )}
                aria-describedby={`${panelId}-note-hint`}
                onChange={(event) => {
                  setUndoNote(null);
                  setNoteDraft(event.currentTarget.value);
                }}
                onBlur={commitNote}
              />
              {ownNote ? (
                <button
                  type="button"
                  className="wir-checkin-note-delete"
                  aria-label={t('wirCheckIn.noteDelete')}
                  disabled={disabled}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={deleteNote}
                >
                  <EimirIcon name="trash" />
                </button>
              ) : null}
            </div>
            <p id={`${panelId}-note-hint`} className="wir-checkin-hint">
              {ownVibe
                ? t('wirCheckIn.noteCount', { count: noteValue.length })
                : t('wirCheckIn.noteRequiresVibe')}
            </p>
          </div>
        ) : null}

        {undoNote ? (
          <div className="wir-checkin-undo" role="status">
            <span>{t('wirCheckIn.noteDeleted')}</span>
            <button
              type="button"
              className="tertiary"
              disabled={disabled}
              onClick={undoNoteDelete}
            >
              {t('wirCheckIn.undo')}
            </button>
          </div>
        ) : null}

        {failedWriter ? (
          <div className="wir-checkin-error" role="status">
            <span>
              {failedProblem?.code === 'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE'
                ? t('dailyVibe.contextUnavailable')
                : t('wirCheckIn.saveError')}
            </span>
            {failedProblem?.code !== 'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE' ? (
              <button
                type="button"
                className="tertiary"
                disabled={disabled || failedWriter.isPending}
                onClick={retryFailed}
              >
                {t('wirCheckIn.retry')}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="wir-checkin-footer">
          <span className="wir-checkin-saving" role="status">
            {savingText}
          </span>
          <button
            type="button"
            className="primary wir-checkin-done"
            disabled={flightWaiting}
            onClick={() => finishPanel()}
          >
            {t('wirCheckIn.done')}
          </button>
        </div>
      </div>
    </ShortTaskSheet>
  );

  const partnerBlock =
    partnerState === 'off' ? null : (
      <PartnerDayBlock
        partnerName={partnerName}
        state={partnerState}
        vibe={partnerVibeValue}
        energy={partnerEnergyValue}
        note={partnerNote}
        onSeen={noteSeen.markSeen}
      />
    );

  return {
    ownAction,
    ownAriaLabel,
    ownBadge,
    ownHasValue,
    partnerBadge,
    partnerAriaLabel,
    partnerState,
    panel,
    partnerBlock,
    announcement: (
      <span className="sr-only" role="status" aria-live="polite">
        {announcementText}
      </span>
    ),
  };
}

/**
 * One value on the own badge. While its value is still travelling from the
 * sheet it keeps its place but stays invisible; when it arrives it settles in.
 */
function FlightSlot({
  kind,
  hidden,
  landing,
  onLanded,
  className = 'wir-checkin-slot',
  testId,
  children,
}: {
  kind: FlightKind;
  hidden: ReadonlySet<FlightKind>;
  landing: ReadonlySet<FlightKind>;
  onLanded: (kind: FlightKind) => void;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={className}
      aria-hidden="true"
      data-testid={testId}
      data-flight-slot={kind}
      data-flight-hidden={hidden.has(kind) ? 'true' : undefined}
      data-flight-landing={landing.has(kind) ? 'true' : undefined}
      onAnimationEnd={() => onLanded(kind)}
    >
      {children}
    </span>
  );
}

/** Keeps an avatar badge inside the viewport at any text size (#1790 A). */
function ClampedBadge({
  className,
  children,
  badgeRef,
  ...data
}: {
  className: string;
  children: ReactNode;
  badgeRef?: { current: HTMLSpanElement | null };
  'data-pending'?: string;
  'data-state'?: string;
  'data-testid'?: string;
  'aria-hidden'?: 'true';
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useViewportClamp(ref);
  return (
    <span
      ref={(node) => {
        ref.current = node;
        if (badgeRef) badgeRef.current = node;
      }}
      className={className}
      {...data}
    >
      {children}
    </span>
  );
}

function PartnerDayBlock({
  partnerName,
  state,
  vibe,
  energy,
  note,
  onSeen,
}: {
  partnerName: string;
  state: PartnerDayState;
  vibe: DailyVibeValue | null;
  energy: number | null;
  note: string | null;
  onSeen: () => void;
}) {
  const { t } = useTranslation();
  // Rendering inside the open sheet is the "opened" moment for the note dot.
  useEffect(() => {
    if (note) onSeen();
  }, [note, onSeen]);

  if (state !== 'visible') {
    return (
      <div
        className="wir-checkin-partner-block is-quiet"
        data-testid="wir-checkin-partner-block"
      >
        <p>
          {state === 'hidden'
            ? t('wirCheckIn.partnerHidden')
            : t('wirCheckIn.partnerNone', { name: partnerName })}
        </p>
      </div>
    );
  }
  return (
    <div
      className="wir-checkin-partner-block"
      data-testid="wir-checkin-partner-block"
    >
      <div className="wir-checkin-partner-values">
        {vibe ? (
          <span className="wir-checkin-partner-vibe">
            <DailyVibeIcon value={vibe} />
            <strong>{t(`dailyVibe.values.${vibe}`)}</strong>
          </span>
        ) : null}
        {energy !== null ? (
          <span
            className="wir-checkin-partner-energy"
            role="img"
            aria-label={t('wirCheckIn.partnerEnergyAria', { value: energy })}
          >
            <BatteryIcon value={energy} />
          </span>
        ) : null}
        <span className="wir-checkin-partner-time">
          {t('wirCheckIn.partnerToday')}
        </span>
      </div>
      {note ? (
        <blockquote className="wir-checkin-partner-note">{note}</blockquote>
      ) : null}
    </div>
  );
}

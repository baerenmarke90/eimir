import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
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
import { useDailyCheckInWrite } from './useDailyCheckInWrite';
import { usePresentationPresence } from './useOverlayPresence';
import { useViewportClamp } from './useViewportClamp';
import './WirDailyCheckIn.css';

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

export type PartnerDayState = 'visible' | 'hidden' | 'none' | 'off';

export interface WirDailyCheckIn {
  ownAction: PartnerAvatarAction;
  ownAriaLabel: string;
  ownBadge: ReactNode;
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
  const panelPresence = usePresentationPresence(panelOpen);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [energyDraft, setEnergyDraft] = useState<number | null>(null);
  const [queued, setQueued] = useState<
    Partial<Record<Dimension, DailyCheckInUpdate>>
  >({});
  const [announcementText, setAnnouncementText] = useState('');
  const [revealKey, setRevealKey] = useState(0);
  const panelId = useId();
  const panelTitleId = useId();
  const ownTriggerRef = useRef<HTMLButtonElement>(null);

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
  const pendingVibeSource = queued.vibe ?? vibePending ?? null;
  const ownVibe =
    pendingVibeSource && 'vibe' in pendingVibeSource
      ? (pendingVibeSource.vibe ?? null)
      : serverVibe;
  const ownNote =
    pendingVibeSource && 'vibe' in pendingVibeSource && !pendingVibeSource.vibe
      ? null
      : pendingVibeSource && 'vibeNote' in pendingVibeSource
        ? pendingVibeSource.vibeNote?.trim() || null
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
  // Server feedback per dimension (conflict, module disabled, errors).
  useEffect(() => {
    if (!vibeWrite.claimFeedback()) return;
    const error = vibeWrite.error;
    if (!error) return;
    if (error.code === 'SPACE_MODULE_DISABLED') {
      postSnackbar('snackbar.dailyVibeModuleDisabled');
    } else if (error.kind === 'conflict') {
      setQueued((current) => ({ ...current, vibe: undefined }));
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
      postSnackbar('snackbar.dailyEnergyModuleDisabled');
    } else if (error.kind === 'conflict') {
      setQueued((current) => ({ ...current, energy: undefined }));
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

  // Escape closes the inline panel from the panel or the own avatar; an open
  // modal sheet owns Escape first.
  const closePanelRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (!panelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('dialog[open]')) return;
      const target = event.target as Node | null;
      const panel = document.getElementById(panelId);
      if (
        target !== document.body &&
        !panel?.contains(target) &&
        target !== ownTriggerRef.current
      )
        return;
      event.preventDefault();
      closePanelRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [panelId, panelOpen]);

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
    postSnackbar('wirCheckIn.noteDeleted', undefined, {
      labelKey: 'wirCheckIn.undo',
      run: () => writeRef.current('vibe', { vibeNote: previous }),
    });
  }

  function retryFailed(): void {
    const writer = failedWriter;
    const update = writer?.request?.update;
    if (!writer || !update) return;
    write(writer === vibeWrite ? 'vibe' : 'energy', update);
  }

  function closePanel(): void {
    commitNote();
    commitEnergy();
    setPanelOpen(false);
    ownTriggerRef.current?.focus({ preventScroll: true });
  }

  closePanelRef.current = closePanel;

  const ownAction: PartnerAvatarAction = {
    onActivate: () => {
      if (panelOpen) closePanel();
      else setPanelOpen(true);
    },
    label: ownAriaLabel,
    ref: ownTriggerRef,
    expanded: panelOpen,
    controls: panelOpen ? panelId : undefined,
  };

  const ownHasValue = Boolean(ownVibe) || ownEnergy !== null;
  const ownBadge = loaded ? (
    <ClampedBadge
      className="wir-checkin-badge wir-checkin-badge-own"
      data-pending={ownPending ? 'true' : undefined}
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
              <DailyVibeIcon
                value={ownVibe}
                className="wir-checkin-glyph"
                compact
              />
            ) : null}
            {ownEnergy !== null ? <BatteryIcon value={ownEnergy} /> : null}
          </>
        ) : (
          <span className="wir-checkin-prompt">
            <span aria-hidden="true">+</span> {t('wirCheckIn.ownPrompt')}
          </span>
        )}
      </span>
    </ClampedBadge>
  ) : null;

  const partnerBadge =
    partnerState === 'visible' || partnerState === 'hidden' ? (
      <>
        <ClampedBadge
          className="wir-checkin-badge wir-checkin-badge-partner"
          data-state={partnerState}
          data-testid="wir-checkin-partner-badge"
          aria-hidden="true"
        >
          <span
            key={`${partnerState}:${revealKey}:${partnerVibeValue}:${partnerEnergyValue === null}`}
            className={`wir-checkin-badge-content${revealKey > 0 && partnerState === 'visible' ? ' is-revealed' : ''}`}
          >
            {partnerState === 'hidden' ? (
              <EimirIcon
                name="privatsphaere"
                className="wir-checkin-lock"
                compact
              />
            ) : (
              <>
                {partnerVibeValue ? (
                  <DailyVibeIcon
                    value={partnerVibeValue}
                    className="wir-checkin-glyph"
                    compact
                  />
                ) : null}
                {partnerEnergyValue !== null ? (
                  <BatteryIcon value={partnerEnergyValue} />
                ) : null}
              </>
            )}
          </span>
        </ClampedBadge>
        {partnerNote && noteSeen.unread ? (
          <span
            key={`dot:${revealKey}`}
            className="wir-checkin-note-dot"
            data-testid="wir-checkin-note-dot"
            aria-hidden="true"
          >
            <EimirIcon name="nachrichten" compact />
          </span>
        ) : null}
      </>
    ) : null;

  const offline = !online;
  const disabled = offline || !loaded;
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
    <section
      id={panelId}
      className="wir-checkin-panel"
      aria-labelledby={panelPresence.present ? panelTitleId : undefined}
      hidden={!panelPresence.present}
      data-presence={panelPresence.presenceState}
      data-testid="wir-checkin-panel"
      onAnimationEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          panelPresence.presenceState === 'exiting'
        )
          panelPresence.completeExit();
      }}
    >
      {panelPresence.present ? (
        <div className="wir-checkin-panel-clip">
          <div className="wir-checkin-panel-inner" inert={!panelOpen}>
            <h2 id={panelTitleId} className="wir-checkin-panel-title">
              {t('wirCheckIn.panelTitle')}
            </h2>

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
                <legend className="sr-only">
                  {t('wirCheckIn.vibeLegend')}
                </legend>
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
                    <div
                      className="wir-checkin-energy-scale"
                      aria-hidden="true"
                    >
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
                    placeholder={t('wirCheckIn.notePlaceholder')}
                    aria-describedby={`${panelId}-note-hint`}
                    onChange={(event) =>
                      setNoteDraft(event.currentTarget.value)
                    }
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

            {failedWriter ? (
              <div className="wir-checkin-error" role="status">
                <span>
                  {failedProblem?.code === 'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE'
                    ? t('dailyVibe.contextUnavailable')
                    : t('wirCheckIn.saveError')}
                </span>
                {failedProblem?.code !==
                'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE' ? (
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
                onClick={closePanel}
              >
                {t('wirCheckIn.done')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
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

/** Keeps an avatar badge inside the viewport at any text size (#1790 A). */
function ClampedBadge({
  className,
  children,
  ...data
}: {
  className: string;
  children: ReactNode;
  'data-pending'?: string;
  'data-state'?: string;
  'data-testid'?: string;
  'aria-hidden'?: 'true';
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useViewportClamp(ref);
  return (
    <span ref={ref} className={className} {...data}>
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

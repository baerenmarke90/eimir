import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { GamesApi } from '../api/generated/apis/GamesApi';
import { PartnerLocationApi } from '../api/generated/apis/PartnerLocationApi';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { DistanceBandView } from '../api/generated/models/DistanceBandView';
import type { HeartHuntRoundView } from '../api/generated/models/HeartHuntRoundView';
import type { HeartHuntState } from '../api/generated/models/HeartHuntState';
import type { HeartHuntTapResult } from '../api/generated/models/HeartHuntTapResult';
import type { PartnerLocationSettingsView } from '../api/generated/models/PartnerLocationSettingsView';
import type { PartnerView } from '../api/generated/models/PartnerView';
import { Configuration } from '../client/apiConfiguration';
import { liveGameQueryOptions } from '../client/liveGameSync';
import {
  arcPoints,
  composeHeartPhoto,
  FOG_RADIUS,
  FRAME_SCALE,
  type FramePoint,
  flightPlan,
  framePoint,
  placeKey,
  warmthKey,
} from '../client/heartHunt';
import {
  createMemoryWithReadyAttachments,
  uploadMemoryDraftAttachment,
} from '../client/memoryAttachmentDraft';
import {
  isDistanceFresh,
  usePartnerDistanceLine,
} from '../client/partnerDistance';
import {
  PARTNER_LOCATION_CAPABILITY,
  partnerLocationSettingsQueryKey,
} from '../client/partnerLocation';
import type { PersonRole } from '../client/personColours';
import { normalizeClientError } from '../client/problemDetails';
import { createReferenceApis } from '../client/referenceFlow';
import {
  entitlementLoader,
  useSpaceCapability,
} from '../client/spaceEntitlement';
import { loadAuthorizedStoryImageResource } from '../client/storyMediaLoader';
import { useObjectUrlResource } from '../client/useObjectUrlResources';
import { useTranslation } from '../i18n';
import { DeviceMediaPicker } from './DeviceMediaPicker';
import { MediaIntakeButton } from './MediaIntakeButton';
import { PageHeader } from './PageHeader';
import { useDistanceShortText } from './PartnerDistanceLine';
import { PartnerMarker } from './PartnerMarker';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import './HeartHuntGamePage.css';

export interface HeartHuntApi {
  getHeartHunt(request: { spaceId: string }): Promise<HeartHuntState>;
  createHeartHuntRound(request: {
    spaceId: string;
    heartHuntRoundCreate: {
      requestId: string;
      attachmentId: string;
      heart: FramePoint;
    };
  }): Promise<HeartHuntRoundView>;
  tapHeartHuntRound(request: {
    spaceId: string;
    roundId: string;
    heartHuntTap: FramePoint;
  }): Promise<HeartHuntTapResult>;
  keepHeartHuntRound(request: {
    spaceId: string;
    roundId: string;
    heartHuntKept: { memoryId: string };
  }): Promise<HeartHuntRoundView>;
}

export interface HeartHuntPeople {
  me: { id: string; displayName: string };
  partner: { id: string; displayName: string };
}

function orderPeople(
  partners: readonly PartnerView[],
  accountId: string,
): HeartHuntPeople | null {
  const me = partners.find((partner) => partner.id === accountId);
  const partner = partners.find((entry) => entry.id !== accountId);
  return me && partner
    ? {
        me: { id: me.id, displayName: me.displayName },
        partner: { id: partner.id, displayName: partner.displayName },
      }
    : null;
}

const WARMTH_FOR_METER = (meter: number) => Math.min(100, Math.max(0, meter));

/** One flight along the arc; the same shape with or without a distance band. */
interface FlightHandle {
  run(): Promise<void>;
}

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function tokenMilliseconds(name: string): number {
  if (typeof document === 'undefined') return 0;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  return raw.endsWith('ms') ? value : value * 1000;
}

const OWN: PersonRole = 'own';
const PARTNER: PersonRole = 'partner';
const BAND_WIDTH = 340;
const BAND_HEIGHT = 96;
const LEFT = { x: 34, y: 66 };
const RIGHT = { x: 306, y: 66 };

function FlightBand({
  people,
  band,
  label,
  flightRef,
}: {
  people: HeartHuntPeople;
  band: DistanceBandView | null;
  label: string | null;
  flightRef: React.Ref<FlightHandle>;
}) {
  const { t } = useTranslation();
  const plan = useMemo(() => flightPlan(band), [band]);
  const lift = plan.height * 1.6 - 14;
  const control = { x: (LEFT.x + RIGHT.x) / 2, y: LEFT.y - lift };
  const traveler = useRef<SVGGElement>(null);

  useImperativeHandle(
    flightRef,
    () => ({
      run: () =>
        new Promise<void>((resolve) => {
          const node = traveler.current;
          const base = tokenMilliseconds(
            plan.far
              ? '--duration-connection-travel-far'
              : '--duration-connection-travel',
          );
          if (!node || reducedMotion() || base === 0) {
            // Instant variant: the heart simply arrives.
            if (node) {
              node.setAttribute(
                'transform',
                `translate(${RIGHT.x} ${RIGHT.y - 26})`,
              );
              node.setAttribute('opacity', '1');
            }
            window.setTimeout(() => {
              node?.setAttribute('opacity', '0');
              resolve();
            }, 250);
            return;
          }
          const points = arcPoints(LEFT, RIGHT, lift);
          const frames = points.map((point, index) => ({
            transform: `translate(${point.x}px, ${point.y - 26}px) scale(${
              1 - 0.25 * Math.sin((Math.PI * index) / (points.length - 1))
            })`,
            opacity: 1,
          }));
          node.setAttribute('opacity', '1');
          const animation = node.animate(frames, {
            duration: base * plan.durationShare,
            easing: 'ease-in-out',
            fill: 'forwards',
          });
          const done = () => {
            node.setAttribute('opacity', '0');
            animation.cancel();
            resolve();
          };
          animation.onfinish = done;
          animation.oncancel = () => resolve();
        }),
    }),
    [plan, lift],
  );

  const arcLabel = label
    ? t('games.heartHunt.band.between', { label })
    : t('games.heartHunt.band.plain', { name: people.partner.displayName });
  return (
    <figure className="heart-hunt-band" aria-label={arcLabel}>
      <svg
        viewBox={`0 0 ${BAND_WIDTH} ${BAND_HEIGHT}`}
        role="img"
        aria-label={arcLabel}
        focusable="false"
      >
        <path
          className="heart-hunt-band-arc"
          d={`M${LEFT.x} ${LEFT.y} Q${control.x} ${control.y} ${RIGHT.x} ${RIGHT.y}`}
        />
        <g className="heart-hunt-band-traveler" opacity="0" ref={traveler}>
          <path
            className="heart-hunt-band-heart"
            transform="translate(-10 -10) scale(.85)"
            d="M12 21s-8.5-5-8.5-11A4.6 4.6 0 0 1 12 7.5 4.6 4.6 0 0 1 20.5 10c0 6-8.5 11-8.5 11Z"
          />
        </g>
      </svg>
      <span className="heart-hunt-band-person is-own" aria-hidden="true">
        <PartnerMarker name={people.me.displayName} role={OWN} />
      </span>
      <span className="heart-hunt-band-person is-partner" aria-hidden="true">
        <PartnerMarker name={people.partner.displayName} role={PARTNER} />
      </span>
      {label ? (
        <figcaption className="heart-hunt-band-label">{label}</figcaption>
      ) : null}
    </figure>
  );
}

/**
 * The server band for the flight. It reads the existing distance projection
 * only (Pro `presence.location`, both partners' consent) and keeps nothing;
 * without it the flight is the same, with no label and no hint.
 */
function useHeartDistance({
  configuration,
  accountId,
  spaceId,
  override,
}: {
  configuration: Configuration;
  accountId: string;
  spaceId: string;
  override?: DistanceBandView | null;
}): DistanceBandView | null {
  const locationApi = useMemo(
    () => new PartnerLocationApi(configuration),
    [configuration],
  );
  const entitlements = useMemo(
    () => new EntitlementsApi(configuration),
    [configuration],
  );
  const load = useMemo(
    () => entitlementLoader(entitlements, spaceId),
    [entitlements, spaceId],
  );
  const capability = useSpaceCapability({
    accountId,
    spaceId,
    load,
    capability: PARTNER_LOCATION_CAPABILITY,
  });
  const settings = useQuery<PartnerLocationSettingsView>({
    queryKey: partnerLocationSettingsQueryKey(accountId, spaceId),
    enabled: false,
  }).data;
  const enabled =
    override === undefined &&
    capability.data === true &&
    !capability.isError &&
    settings?.available === true;
  const line = usePartnerDistanceLine({
    api: locationApi,
    accountId,
    spaceId,
    enabled,
  });
  if (override !== undefined) return override;
  if (!enabled || line.isError || line.data?.kind !== 'distance') return null;
  return isDistanceFresh(line.data.asOf) ? line.data.band : null;
}

function FrameOverlayHeart({
  point,
  person,
  pop,
}: {
  point: FramePoint;
  person: PersonRole;
  pop?: boolean;
}) {
  return (
    <svg
      className={`heart-hunt-heart person-role-${person}${pop ? ' is-found' : ''}`}
      style={{
        left: `${(point.x / FRAME_SCALE) * 100}%`,
        top: `${(point.y / FRAME_SCALE) * 100}%`,
      }}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 21s-8.5-5-8.5-11A4.6 4.6 0 0 1 12 7.5 4.6 4.6 0 0 1 20.5 10c0 6-8.5 11-8.5 11Z" />
    </svg>
  );
}

function fogMask(taps: readonly FramePoint[]): string | undefined {
  if (!taps.length) return undefined;
  const radius = `${FOG_RADIUS * 100}cqw`;
  return taps
    .map(
      (tap) =>
        `radial-gradient(circle ${radius} at ${(tap.x / FRAME_SCALE) * 100}% ${(tap.y / FRAME_SCALE) * 100}%, transparent 0, transparent calc(${radius} * 0.45), #000 ${radius})`,
    )
    .join(',');
}

/**
 * A 4:5 photo frame that reports taps in per-mille of the frame. The keyboard
 * moves a visible reticle and Enter or Space taps it, so the game does not
 * depend on a pointer.
 */
function PhotoFrame({
  url,
  label,
  onPoint,
  disabled,
  fog,
  fogLifting,
  taps,
  children,
}: {
  url: string | null;
  label: string;
  onPoint?: (point: FramePoint) => void;
  disabled?: boolean;
  fog?: boolean;
  fogLifting?: boolean;
  taps?: readonly FramePoint[];
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const frame = useRef<HTMLElement | null>(null);
  const [cursor, setCursor] = useState<FramePoint | null>(null);
  const interactive = Boolean(onPoint) && !disabled;
  const mask = fog ? fogMask(taps ?? []) : undefined;

  const tapAt = (event: PointerEvent<HTMLElement>) => {
    if (!interactive || !frame.current) return;
    setCursor(null);
    onPoint?.(
      framePoint(
        event.clientX,
        event.clientY,
        frame.current.getBoundingClientRect(),
      ),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!interactive) return;
    const step = 50;
    const current = cursor ?? { x: FRAME_SCALE / 2, y: FRAME_SCALE / 2 };
    const move = (dx: number, dy: number) => {
      event.preventDefault();
      setCursor({
        x: Math.min(FRAME_SCALE, Math.max(0, current.x + dx)),
        y: Math.min(FRAME_SCALE, Math.max(0, current.y + dy)),
      });
    };
    if (event.key === 'ArrowLeft') move(-step, 0);
    else if (event.key === 'ArrowRight') move(step, 0);
    else if (event.key === 'ArrowUp') move(0, -step);
    else if (event.key === 'ArrowDown') move(0, step);
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onPoint?.(current);
    }
  };

  const content = (
    <>
      {url ? (
        <img className="heart-hunt-photo" src={url} alt="" draggable={false} />
      ) : (
        <span className="heart-hunt-photo-placeholder" aria-hidden="true" />
      )}
      {fog ? (
        <span
          className={`heart-hunt-fog${fogLifting ? ' is-lifting' : ''}`}
          aria-hidden="true"
          style={
            mask
              ? {
                  maskImage: mask,
                  WebkitMaskImage: mask,
                  maskComposite: 'intersect',
                  WebkitMaskComposite: 'source-in',
                }
              : undefined
          }
        />
      ) : null}
      {children}
      {cursor ? (
        <span
          className="heart-hunt-reticle"
          aria-hidden="true"
          style={{
            left: `${(cursor.x / FRAME_SCALE) * 100}%`,
            top: `${(cursor.y / FRAME_SCALE) * 100}%`,
          }}
        />
      ) : null}
      {interactive ? (
        <span className="sr-only">{t('games.heartHunt.keyboardHint')}</span>
      ) : null}
    </>
  );
  const setFrame = (node: HTMLElement | null) => {
    frame.current = node;
  };
  return interactive ? (
    <button
      type="button"
      ref={setFrame}
      className="heart-hunt-frame is-interactive"
      aria-label={label}
      onPointerUp={tapAt}
      onKeyDown={onKeyDown}
    >
      {content}
    </button>
  ) : (
    <div
      ref={setFrame}
      className="heart-hunt-frame"
      role="img"
      aria-label={label}
    >
      {content}
    </div>
  );
}

function useRoundPhoto({
  apis,
  spaceId,
  accountId,
  round,
}: {
  apis: ReturnType<typeof createReferenceApis>;
  spaceId: string;
  accountId: string;
  round: HeartHuntRoundView | null;
}) {
  return useObjectUrlResource(
    `heart-hunt:${accountId}:${spaceId}:${round?.id ?? 'none'}`,
    round?.attachmentId ?? null,
    (attachmentId, signal) =>
      loadAuthorizedStoryImageResource(
        apis,
        spaceId,
        'HEART_HUNT_ROUND',
        round?.id ?? '',
        attachmentId,
        // The photo is private to the pair: never persist it on the device.
        { persist: false, signal },
      ),
  );
}

function SeekPanel({
  round,
  people,
  url,
  loading,
  api,
  spaceId,
  onFound,
  onSettling,
}: {
  round: HeartHuntRoundView;
  people: HeartHuntPeople;
  url: string | null;
  loading: boolean;
  api: HeartHuntApi;
  spaceId: string;
  onFound: () => void;
  /** The fog is lifting; live reads wait so the found view follows it. */
  onSettling?: () => void;
}) {
  const { t } = useTranslation();
  const [taps, setTaps] = useState<FramePoint[]>(() => [...round.taps]);
  const [level, setLevel] = useState<number>(
    round.tapCount ? round.bestLevel : -1,
  );
  const [meter, setMeter] = useState(0);
  const [found, setFound] = useState(false);
  const [failed, setFailed] = useState(false);
  const foundTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (foundTimer.current !== null) window.clearTimeout(foundTimer.current);
    },
    [],
  );

  const tap = useCallback(
    (point: FramePoint) => {
      if (found) return;
      setTaps((current) => [...current, point].slice(-150));
      setFailed(false);
      api
        .tapHeartHuntRound({
          spaceId,
          roundId: round.id,
          heartHuntTap: point,
        })
        .then((result) => {
          setLevel(result.level);
          setMeter(WARMTH_FOR_METER(result.meter));
          if (result.found) {
            setFound(true);
            onSettling?.();
            // The fog lifts first; the found view follows once it is gone.
            foundTimer.current = window.setTimeout(
              onFound,
              reducedMotion() ? 0 : 700,
            );
          }
        })
        .catch(() => setFailed(true));
    },
    [api, found, onFound, onSettling, round.id, spaceId],
  );

  const word =
    level < 0 ? null : t(`games.heartHunt.warmth.${warmthKey(level)}`);
  return (
    <section
      className="heart-hunt-seek"
      aria-labelledby="heart-hunt-seek-title"
    >
      <div className="heart-hunt-card">
        <h2 id="heart-hunt-seek-title">
          {t('games.heartHunt.seek.title', {
            name: people.partner.displayName,
          })}
        </h2>
        <div className="heart-hunt-warmth" aria-live="polite">
          <span className="heart-hunt-warmth-word">
            {found
              ? t('games.heartHunt.found.title')
              : (word ?? t('games.heartHunt.seek.tapHint'))}
          </span>
          <span className="heart-hunt-meter" aria-hidden="true">
            <b style={{ width: `${found ? 100 : meter}%` }} />
          </span>
          <meter
            className="sr-only"
            min={0}
            max={100}
            value={found ? 100 : meter}
            aria-label={t('games.heartHunt.seek.meterLabel')}
          />
        </div>
      </div>
      <PhotoFrame
        url={url}
        label={t('games.heartHunt.seek.photoLabel')}
        onPoint={loading ? undefined : tap}
        disabled={found}
        fog
        fogLifting={found}
        taps={taps}
      />
      {failed ? (
        <p className="heart-hunt-quiet" role="status">
          {t('games.heartHunt.seek.tapFailed')}
        </p>
      ) : (
        <p className="heart-hunt-quiet">{t('games.heartHunt.seek.quiet')}</p>
      )}
    </section>
  );
}

function FoundPanel({
  round,
  people,
  url,
  onSwap,
  onKeep,
  keeping,
  keepFailed,
}: {
  round: HeartHuntRoundView;
  people: HeartHuntPeople;
  url: string | null;
  onSwap: () => void;
  onKeep: (frame: HTMLElement | null) => void;
  keeping: boolean;
  keepFailed: boolean;
}) {
  const { t, i18n } = useTranslation();
  const hider = round.role === 'HIDER';
  const hiderRole: PersonRole = hider ? 'own' : 'partner';
  const place = round.heart
    ? t(`games.heartHunt.places.${placeKey(round.heart)}`)
    : '';
  const wrapper = useRef<HTMLDivElement>(null);
  const deleteOn = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
  }).format(round.deleteAfter);
  return (
    <section
      className="heart-hunt-found"
      aria-labelledby="heart-hunt-found-title"
    >
      <div ref={wrapper}>
        <PhotoFrame url={url} label={t('games.heartHunt.found.photoLabel')}>
          {round.heart ? (
            <FrameOverlayHeart point={round.heart} person={hiderRole} pop />
          ) : null}
        </PhotoFrame>
      </div>
      <div className="heart-hunt-card">
        <h2 id="heart-hunt-found-title">{t('games.heartHunt.found.title')}</h2>
        <p>
          {hider
            ? t('games.heartHunt.found.bodyHider', {
                name: people.partner.displayName,
                place,
              })
            : t('games.heartHunt.found.bodySeeker', {
                name: people.partner.displayName,
                place,
              })}
        </p>
        <p className="heart-hunt-quiet">
          {round.kept
            ? t('games.heartHunt.found.keptNote')
            : t('games.heartHunt.found.deleteNote', { date: deleteOn })}
        </p>
        <button type="button" className="heart-hunt-primary" onClick={onSwap}>
          {t('games.heartHunt.found.swap')}
        </button>
        <button
          type="button"
          className="heart-hunt-secondary"
          disabled={round.kept || keeping || !url}
          onClick={() => onKeep(wrapper.current)}
        >
          {round.kept
            ? t('games.heartHunt.found.kept')
            : keeping
              ? t('games.heartHunt.found.keeping')
              : t('games.heartHunt.found.keep')}
        </button>
        {keepFailed ? (
          <p className="heart-hunt-quiet" role="status">
            {t('games.heartHunt.found.keepFailed')}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function WaitingPanel({
  round,
  people,
  url,
}: {
  round: HeartHuntRoundView;
  people: HeartHuntPeople;
  url: string | null;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="heart-hunt-waiting"
      aria-labelledby="heart-hunt-waiting-title"
    >
      <PhotoFrame url={url} label={t('games.heartHunt.waiting.photoLabel')}>
        {round.heart ? (
          <FrameOverlayHeart point={round.heart} person="own" />
        ) : null}
      </PhotoFrame>
      <div className="heart-hunt-card">
        <h2 id="heart-hunt-waiting-title">
          {t('games.heartHunt.waiting.title', {
            name: people.partner.displayName,
          })}
        </h2>
        <p>{t('games.heartHunt.waiting.body')}</p>
        {/* Live: the partner's search arrives while both are in the game. */}
        <p className="heart-hunt-live" aria-live="polite">
          {round.tapCount > 0
            ? t('games.heartHunt.waiting.searching', {
                name: people.partner.displayName,
                count: round.tapCount,
              })
            : null}
        </p>
      </div>
    </section>
  );
}

type HidePhase = 'idle' | 'uploading' | 'ready' | 'sending';

function HidePanel({
  people,
  apis,
  api,
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  flight,
  onSent,
  onDraftChange,
  partnerWaiting,
}: {
  people: HeartHuntPeople;
  apis: ReturnType<typeof createReferenceApis>;
  api: HeartHuntApi;
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  flight: React.RefObject<FlightHandle | null>;
  onSent: () => void;
  /** A started hiding place keeps this panel even if a partner round arrives. */
  onDraftChange?: (active: boolean) => void;
  /** The partner hid a heart for this person while the draft was open. */
  partnerWaiting?: boolean;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<HidePhase>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [attachmentId, setAttachmentId] = useState<string | null>(null);
  const [heart, setHeart] = useState<FramePoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const drafting = phase !== 'idle' || preview !== null;
  useEffect(() => {
    onDraftChange?.(drafting);
  }, [drafting, onDraftChange]);
  useEffect(() => () => onDraftChange?.(false), [onDraftChange]);

  const choose = async (files: FileList) => {
    const file = files[0];
    if (!file) return;
    setError(null);
    setHeart(null);
    setAttachmentId(null);
    setPhase('uploading');
    setPreview(URL.createObjectURL(file));
    requestId.current = null;
    try {
      const ready = await uploadMemoryDraftAttachment(
        apis,
        apiBaseUrl,
        accessToken,
        spaceId,
        file,
        undefined,
        fetch,
        // The photo's metadata (including location) is stripped, like every upload.
        { accountId, preserveMetadata: false },
      );
      setAttachmentId(ready.attachmentId);
      setPhase('ready');
    } catch {
      setError(t('games.heartHunt.hide.uploadFailed'));
      setPreview(null);
      setPhase('idle');
    }
  };

  const send = async () => {
    if (!attachmentId || !heart) return;
    setPhase('sending');
    setError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      await api.createHeartHuntRound({
        spaceId,
        heartHuntRoundCreate: {
          requestId: requestId.current,
          attachmentId,
          heart,
        },
      });
      await flight.current?.run();
      onSent();
    } catch (problem) {
      const normalized = await normalizeClientError(problem).catch(() => null);
      setError(
        normalized &&
          'code' in normalized &&
          normalized.code === 'HEART_ROUND_OPEN'
          ? t('games.heartHunt.hide.roundOpen')
          : t('games.heartHunt.hide.sendFailed'),
      );
      setPhase('ready');
    }
  };

  return (
    <section
      className="heart-hunt-hide"
      aria-labelledby="heart-hunt-hide-title"
    >
      <div className="heart-hunt-card">
        <h2 id="heart-hunt-hide-title">
          {t('games.heartHunt.hide.title', {
            name: people.partner.displayName,
          })}
        </h2>
        <p>{t('games.heartHunt.hide.body')}</p>
        {partnerWaiting ? (
          <p className="heart-hunt-quiet" role="status">
            {t('games.heartHunt.hide.partnerHidToo', {
              name: people.partner.displayName,
            })}
          </p>
        ) : null}
        <DeviceMediaPicker
          id="heart-hunt-photo"
          multiple={false}
          disabled={phase === 'uploading' || phase === 'sending'}
          onFiles={(files) => void choose(files)}
          renderTrigger={(open) => (
            <MediaIntakeButton
              label={
                preview
                  ? t('games.heartHunt.hide.changePhoto')
                  : t('games.heartHunt.hide.pickPhoto')
              }
              description={t('games.heartHunt.hide.pickHint')}
              icon="foto"
              variant="source"
              disabled={phase === 'uploading' || phase === 'sending'}
              onClick={open}
            />
          )}
        />
      </div>
      {preview ? (
        <>
          <PhotoFrame
            url={preview}
            label={t('games.heartHunt.hide.photoLabel')}
            onPoint={phase === 'ready' ? setHeart : undefined}
          >
            {heart ? <FrameOverlayHeart point={heart} person="own" /> : null}
          </PhotoFrame>
          <div className="heart-hunt-card">
            <p role="status">
              {phase === 'uploading'
                ? t('games.heartHunt.hide.uploading')
                : heart
                  ? t('games.heartHunt.hide.placed')
                  : t('games.heartHunt.hide.placeHint')}
            </p>
            <button
              type="button"
              className="heart-hunt-primary"
              disabled={phase !== 'ready' || !heart}
              onClick={() => void send()}
            >
              {t('games.heartHunt.hide.send', {
                name: people.partner.displayName,
              })}
            </button>
          </div>
        </>
      ) : null}
      {error ? (
        <p className="heart-hunt-quiet" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function todayAsDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function HeartHuntGamePage({
  apiBaseUrl,
  accessToken,
  spaceId,
  currentAccountId,
  api: injectedApi,
  loadPeople,
  distanceBand,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  currentAccountId: string;
  /** Test seam for the four game calls. */
  api?: HeartHuntApi;
  loadPeople?: () => Promise<HeartHuntPeople | null>;
  /** Test seam: replaces the distance projection; `null` means not shared. */
  distanceBand?: DistanceBandView | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const configuration = useMemo(
    () =>
      new Configuration({
        basePath: apiBaseUrl,
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    [apiBaseUrl, accessToken],
  );
  const api = useMemo<HeartHuntApi>(
    () => injectedApi ?? new GamesApi(configuration),
    [injectedApi, configuration],
  );
  const apis = useMemo(
    () => createReferenceApis(apiBaseUrl, accessToken),
    [apiBaseUrl, accessToken],
  );
  const flight = useRef<FlightHandle>(null);
  const [mode, setMode] = useState<'auto' | 'hide'>('auto');
  // A hiding place in progress stays on screen when the partner's heart
  // arrives live; the search follows once this one is sent.
  const [hideDraft, setHideDraft] = useState(false);
  // The found transition holds live reads until the fog has lifted.
  const [settling, setSettling] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [keepFailed, setKeepFailed] = useState(false);

  const peopleQuery = useQuery({
    queryKey: ['games', 'heart-hunt', 'people', spaceId, currentAccountId],
    queryFn: async () => {
      try {
        if (loadPeople) return await loadPeople();
        const space = await new SpacesApi(
          configuration,
        ).getSpaceApiV1SpacesSpaceIdGet({ spaceId });
        return orderPeople(space.partners, currentAccountId);
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });
  const stateKey = useMemo(
    () => ['games', 'heart-hunt', 'state', spaceId, currentAccountId],
    [spaceId, currentAccountId],
  );
  const stateQuery = useQuery({
    queryKey: stateKey,
    queryFn: async () => {
      try {
        return await api.getHeartHunt({ spaceId });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    gcTime: 0,
    // Live while open: a heart hidden for me, the partner's search taps and
    // the moment my heart is found arrive while both are in the game.
    ...liveGameQueryOptions({ paused: settling || keeping }),
  });

  const rounds = stateQuery.data?.rounds ?? [];
  const seeking = rounds.find(
    (r) => r.role === 'SEEKER' && r.state === 'HIDDEN',
  );
  const waiting = rounds.find(
    (r) => r.role === 'HIDER' && r.state === 'HIDDEN',
  );
  const lastFound = rounds.find((r) => r.state === 'FOUND');
  // The hold belongs to one search; it never outlives that round's panel.
  const seekingId = seeking?.id ?? null;
  useEffect(() => {
    if (!seekingId) setSettling(false);
  }, [seekingId]);
  const view: 'seek' | 'hide' | 'waiting' | 'found' =
    hideDraft && !waiting
      ? 'hide'
      : seeking
        ? 'seek'
        : mode === 'hide' && !waiting
          ? 'hide'
          : waiting
            ? 'waiting'
            : lastFound
              ? 'found'
              : 'hide';
  const current =
    view === 'seek'
      ? seeking
      : view === 'waiting'
        ? waiting
        : view === 'found'
          ? lastFound
          : null;

  const photo = useRoundPhoto({
    apis,
    spaceId,
    accountId: currentAccountId,
    round: current ?? null,
  });
  const band = useHeartDistance({
    configuration,
    accountId: currentAccountId,
    spaceId,
    override: distanceBand,
  });
  const shortText = useDistanceShortText();
  const label = band ? shortText(band) : null;

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: stateKey }),
    [queryClient, stateKey],
  );

  const keep = async (wrapper: HTMLElement | null) => {
    if (!lastFound || !photo.url || !lastFound.heart) return;
    setKeeping(true);
    setKeepFailed(false);
    try {
      const blob = await (await fetch(photo.url)).blob();
      const accent = wrapper
        ? getComputedStyle(
            wrapper.querySelector('.heart-hunt-heart') ?? wrapper,
          )
            .getPropertyValue('--person-accent')
            .trim()
        : '';
      const file = await composeHeartPhoto(
        blob,
        lastFound.heart,
        accent || '#d6437a',
      );
      const ready = await uploadMemoryDraftAttachment(
        apis,
        apiBaseUrl,
        accessToken,
        spaceId,
        file,
        undefined,
        fetch,
        { accountId: currentAccountId, preserveMetadata: false },
      );
      const { memory } = await createMemoryWithReadyAttachments(
        apis,
        spaceId,
        {
          title: t('games.heartHunt.memoryTitle'),
          body: '',
          happenedOn: todayAsDate(),
          attachments: [{ attachmentId: ready.attachmentId, position: 0 }],
        },
        [ready.attachmentId],
      );
      await api.keepHeartHuntRound({
        spaceId,
        roundId: lastFound.id,
        heartHuntKept: { memoryId: memory.id },
      });
      await refresh();
    } catch {
      setKeepFailed(true);
    } finally {
      setKeeping(false);
    }
  };

  const people = peopleQuery.data ?? null;
  return (
    <div className="page heart-hunt-page">
      <PageHeader
        eyebrow={t('games.entries.heartHunt.role')}
        title={t('games.entries.heartHunt.title')}
        description={t('games.heartHunt.intro')}
        className="heart-hunt-heading"
      />
      {peopleQuery.isPending || stateQuery.isPending ? (
        <UiState
          kind="loading"
          title={t('games.heartHunt.loadingTitle')}
          body={t('games.heartHunt.loadingBody')}
        />
      ) : peopleQuery.error || (stateQuery.error && !stateQuery.data) ? (
        <ProblemState
          error={peopleQuery.error ?? stateQuery.error}
          onRetry={() => {
            void peopleQuery.refetch();
            void stateQuery.refetch();
          }}
        />
      ) : !people ? (
        <UiState
          kind="empty"
          title={t('games.heartHunt.coupleRequiredTitle')}
          body={t('games.heartHunt.coupleRequiredBody')}
        />
      ) : (
        <>
          <FlightBand
            people={people}
            band={band}
            label={label}
            flightRef={flight}
          />
          {view === 'seek' && seeking ? (
            <SeekPanel
              key={seeking.id}
              round={seeking}
              people={people}
              url={photo.url}
              loading={photo.loading}
              api={api}
              spaceId={spaceId}
              onSettling={() => setSettling(true)}
              onFound={() => {
                setSettling(false);
                void refresh();
              }}
            />
          ) : view === 'waiting' && waiting ? (
            <WaitingPanel round={waiting} people={people} url={photo.url} />
          ) : view === 'found' && lastFound ? (
            <FoundPanel
              round={lastFound}
              people={people}
              url={photo.url}
              onSwap={() => setMode('hide')}
              onKeep={(wrapper) => void keep(wrapper)}
              keeping={keeping}
              keepFailed={keepFailed}
            />
          ) : (
            <HidePanel
              people={people}
              apis={apis}
              api={api}
              apiBaseUrl={apiBaseUrl}
              accessToken={accessToken}
              accountId={currentAccountId}
              spaceId={spaceId}
              flight={flight}
              onDraftChange={setHideDraft}
              partnerWaiting={Boolean(seeking)}
              onSent={() => {
                setMode('auto');
                setHideDraft(false);
                void refresh();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

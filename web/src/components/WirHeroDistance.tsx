import { isDemoModeConfigured } from '../client/demoMode';
import {
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { PartnerLocationApi } from '../api/generated/apis/PartnerLocationApi';
import {
  DISTANCE_STAGE_MAX,
  distanceStage,
  isDistanceFresh,
} from '../client/partnerDistance';
import {
  PARTNER_LOCATION_MAP_ROUTE,
  PARTNER_LOCATION_SETTINGS_ROUTE,
} from '../client/routes';
import {
  distanceChangeMayPlay,
  forgetDistanceSeen,
  readDistanceSeen,
  rememberDistanceSeen,
} from '../client/wirDistanceSeen';
import { useTranslation } from '../i18n';
import { type AttentionTicket, attentionScheduler } from '../motion/attention';
import { feedback } from '../motion/feedback';
import { useStagePhase } from '../motion/stage';
import { isVisibleNow, observeVisibility } from '../motion/visibility';
import {
  PartnerDistanceGlyph,
  useDistanceAsOfLabel,
  useDistanceShortText,
  useDistanceText,
  useWirDistanceRead,
} from './PartnerDistanceLine';
import { type DistanceHop, playDistanceHop } from './wirDistanceHop';
import { WIR_STAGE } from './wirStageMotion';

/** How long the word stays after a tap or a change (a dwell, not a motion). */
export const WIR_DISTANCE_WORD_MS = 3000;
/** Margin for a hop whose end event never arrives. */
const HOP_GUARD_MS = 160;

const HEART_OWN = 'M16 26.5C4 17.5 1 11.5 1 7.5 1 3.5 4 1 8 1c3.5 0 6.5 2 8 5';
const HEART_PARTNER =
  'M16 26.5c12-9 15-15 15-19 0-4-3-6.5-7-6.5-3.5 0-6.5 2-8 5';

type TellPhase = 'rest' | 'hopping' | 'told';

export interface WirHeroDistanceSignal {
  /** 0 (together) to 1 (far apart); null without a distance to show. */
  closeness: number | null;
  /** The value is older than the freshness window: never shown as live. */
  earlier: boolean;
  phase: TellPhase;
  word: string;
  /** The heart control's accessible name. */
  label: string;
  /** Where the word leads, when it leads anywhere. */
  href: string | null;
  wordLabel: string | null;
  /** Read out once when a change was shown. */
  announcement: string;
  anchorRef: RefObject<HTMLSpanElement | null>;
  tell: (event: MouseEvent<HTMLButtonElement>) => void;
  holdWord: () => void;
  releaseWord: () => void;
}

interface WirHeroDistanceOptions {
  api:
    | Pick<PartnerLocationApi, 'getPartnerDistance' | 'getPartnerLocationMap'>
    | undefined;
  entitlementApi: EntitlementsApi | undefined;
  accountId: string;
  spaceId: string;
  /** Paired, in the Verbunden hero, and the module sits directly below it. */
  enabled: boolean;
  /** Today's important day owns the heart: a change is shown without a hop. */
  occasion: boolean;
}

/**
 * The partner distance in the Verbunden hero (Product Owner, 2026-11-22). It
 * takes no place of its own: the heart's moon phase and the two lights carry
 * it, and a tap on the heart hops a light from each portrait to the heart and
 * shows the word above it for a moment. When the app opens and the band has
 * changed since this device last showed it, the same hop plays once and the
 * heart and light move to the new value.
 */
export function useWirHeroDistance({
  api,
  entitlementApi,
  accountId,
  spaceId,
  enabled,
  occasion,
}: WirHeroDistanceOptions): WirHeroDistanceSignal | null {
  const { t } = useTranslation();
  const line = useWirDistanceRead({
    api,
    entitlementApi,
    accountId,
    spaceId,
    enabled,
    holdOpening: true,
  });
  const shortText = useDistanceShortText();
  const longText = useDistanceText();
  const asOfLabel = useDistanceAsOfLabel();
  const openingPhase = useStagePhase(WIR_STAGE);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const owner = `${accountId}:${spaceId}`;
  const [shown, setShown] = useState<{ owner: string; stage: number } | null>(
    null,
  );
  const [phase, setPhase] = useState<TellPhase>('rest');
  const [announcement, setAnnouncement] = useState('');
  const hopRef = useRef<DistanceHop | null>(null);
  const hopToken = useRef(0);
  const guardRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepWordRef = useRef(false);
  const ticketRef = useRef<AttentionTicket | null>(null);
  const settleRef = useRef<(() => void) | null>(null);

  const introduceInDemo = isDemoModeConfigured();
  const distance = line?.kind === 'distance' ? line : null;
  const liveStage = distance ? distanceStage(distance.band) : null;
  const fresh = distance ? isDistanceFresh(distance.asOf) : false;

  // The first value is compared with what this device showed last, during
  // render, so the old state is what the first frame paints.
  let shownStage = shown?.owner === owner ? shown.stage : null;
  if (liveStage !== null && shownStage === null) {
    const seen = fresh ? readDistanceSeen(accountId, spaceId) : null;
    // The public Demo has no earlier visit to compare with, so its first view
    // starts from the farthest step and plays the hop to the live one (Product
    // Owner, 2026-11-25). Every other deployment shows its first value quietly.
    shownStage =
      seen?.stage ??
      (introduceInDemo && fresh && liveStage > 0 ? 0 : liveStage);
    setShown({ owner, stage: shownStage });
  }

  const sentence = distance ? longText(distance.band) : '';
  const sentenceRef = useRef(sentence);
  sentenceRef.current = sentence;

  const startDwell = useCallback(() => {
    if (dwellRef.current !== null) clearTimeout(dwellRef.current);
    dwellRef.current = null;
    if (keepWordRef.current) return;
    dwellRef.current = setTimeout(() => {
      dwellRef.current = null;
      setPhase('rest');
    }, WIR_DISTANCE_WORD_MS);
  }, []);

  /** Ends a running hop; a change it carried is simply shown. */
  const stopHop = useCallback(() => {
    hopToken.current += 1;
    hopRef.current?.cancel();
    hopRef.current = null;
    if (guardRef.current !== null) clearTimeout(guardRef.current);
    guardRef.current = null;
    ticketRef.current?.release();
    ticketRef.current = null;
    const settle = settleRef.current;
    settleRef.current = null;
    settle?.();
  }, []);

  const closeWord = useCallback(() => {
    if (dwellRef.current !== null) clearTimeout(dwellRef.current);
    dwellRef.current = null;
    keepWordRef.current = false;
    setPhase('rest');
  }, []);

  const showWord = useCallback(() => {
    setPhase('told');
    feedback(
      anchorRef.current
        ?.closest('.wir-bridge-slot')
        ?.querySelector('.wir-bridge-moon-beat') ?? null,
      'affection',
    );
    startDwell();
  }, [startDwell]);

  const runHop = useCallback(
    (closeness: number, land: () => void) => {
      stopHop();
      const stage = anchorRef.current?.closest('.wir-stage');
      const hop = stage ? playDistanceHop(stage, closeness) : null;
      if (!hop) {
        land();
        return;
      }
      const token = hopToken.current;
      hopRef.current = hop;
      setPhase('hopping');
      const arrive = () => {
        if (hopToken.current !== token) return;
        hopToken.current += 1;
        hopRef.current = null;
        if (guardRef.current !== null) clearTimeout(guardRef.current);
        guardRef.current = null;
        land();
      };
      void hop.arrived.then(arrive);
      guardRef.current = setTimeout(arrive, hop.duration + HOP_GUARD_MS);
    },
    [stopHop],
  );

  const lineKind = line?.kind ?? null;
  useEffect(() => {
    if (lineKind === 'hidden' || lineKind === 'sharing') {
      forgetDistanceSeen(accountId, spaceId);
      setShown(null);
      return;
    }
    if (lineKind !== 'distance' || liveStage === null || shownStage === null)
      return;
    if (!fresh) {
      if (shownStage !== liveStage) setShown({ owner, stage: liveStage });
      return;
    }
    if (shownStage === liveStage) {
      if (!hopRef.current) rememberDistanceSeen(accountId, spaceId, liveStage);
      return;
    }
    // A change waits for the opening; a running hop finishes first.
    if (openingPhase !== 'ended' || hopRef.current) return;
    const settle = (played: boolean) => {
      setShown({ owner, stage: liveStage });
      rememberDistanceSeen(accountId, spaceId, liveStage, { played });
    };
    const stage = anchorRef.current?.closest('.wir-stage');
    const mayPlay =
      !occasion &&
      Boolean(stage && isVisibleNow(stage).visible) &&
      distanceChangeMayPlay(readDistanceSeen(accountId, spaceId));
    const ticket = mayPlay
      ? attentionScheduler().request('arrival', {
          visible: true,
          onPreempt: () => {
            stopHop();
            closeWord();
          },
        })
      : null;
    if (!ticket) {
      settle(false);
      return;
    }
    settleRef.current = () => settle(false);
    runHop(liveStage / DISTANCE_STAGE_MAX, () => {
      settleRef.current = null;
      ticket.release();
      ticketRef.current = null;
      settle(true);
      setAnnouncement(sentenceRef.current);
      showWord();
    });
    if (hopRef.current) ticketRef.current = ticket;
  }, [
    accountId,
    closeWord,
    fresh,
    lineKind,
    liveStage,
    occasion,
    openingPhase,
    owner,
    runHop,
    shownStage,
    showWord,
    spaceId,
    stopHop,
  ]);

  // A hidden page or kept view shows the final state (Motion Contract M12).
  useEffect(() => {
    if (phase === 'rest') return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    return observeVisibility(
      anchor,
      (state) => {
        if (state.visible) return;
        stopHop();
        closeWord();
      },
      { onScreen: false },
    );
  }, [closeWord, phase, stopHop]);

  useEffect(
    () => () => {
      stopHop();
      if (dwellRef.current !== null) clearTimeout(dwellRef.current);
    },
    [stopHop],
  );

  const closeness =
    distance && shownStage !== null ? shownStage / DISTANCE_STAGE_MAX : null;
  const tell = (event: MouseEvent<HTMLButtonElement>) => {
    if (hopRef.current) return;
    // Keyboard and assistive technology keep the word until focus leaves.
    keepWordRef.current = event.detail === 0;
    if (dwellRef.current !== null) clearTimeout(dwellRef.current);
    dwellRef.current = null;
    runHop(closeness ?? 0.5, showWord);
  };
  const holdWord = () => {
    keepWordRef.current = true;
    if (dwellRef.current !== null) clearTimeout(dwellRef.current);
    dwellRef.current = null;
  };
  const releaseWord = () => {
    keepWordRef.current = false;
    if (phase === 'told') startDwell();
  };

  if (line?.kind === 'ownMissing') {
    const label = t('partnerLocation.distanceOwnMissingLabel');
    return {
      closeness: null,
      earlier: false,
      phase,
      word: t('partnerLocation.distanceShareShort'),
      label,
      href: PARTNER_LOCATION_SETTINGS_ROUTE,
      wordLabel: label,
      announcement: '',
      anchorRef,
      tell,
      holdWord,
      releaseWord,
    };
  }
  if (!distance) return null;
  const label = fresh
    ? sentence
    : `${sentence}, ${t('partnerLocation.distanceAsOfLabel', {
        time: asOfLabel(distance.asOf),
      })}`;
  return {
    closeness,
    earlier: !fresh,
    phase,
    word: shortText(distance.band),
    label,
    href: distance.mapAvailable ? PARTNER_LOCATION_MAP_ROUTE : null,
    wordLabel: distance.mapAvailable
      ? `${label}. ${t('partnerLocation.distanceOpenMap')}`
      : null,
    announcement,
    anchorRef,
    tell,
    holdWord,
    releaseWord,
  };
}

/** Keeps the signal's state above the hero, which remounts its members. */
export function WirHeroDistance({
  children,
  ...options
}: WirHeroDistanceOptions & {
  children: (signal: WirHeroDistanceSignal | null) => ReactNode;
}) {
  return <>{children(useWirHeroDistance(options))}</>;
}

/**
 * The heart between the portraits. With a distance it fills like the moon: a
 * round shadow moves off it as the two come closer, and at the closest step
 * the heart is completely full.
 */
export function WirBridgeHeart({
  occasion,
  closeness,
  earlier,
}: {
  occasion: boolean;
  closeness: number | null;
  earlier: boolean;
}) {
  const maskId = `wir-heart-moon-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg
      viewBox="0 0 32 28"
      aria-hidden="true"
      focusable="false"
      style={
        closeness === null
          ? undefined
          : ({ '--wir-distance-closeness': closeness } as CSSProperties)
      }
    >
      {closeness === null ? null : (
        <>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x="-2"
            y="-2"
            width="36"
            height="32"
          >
            <rect x="-2" y="-2" width="36" height="32" fill="#fff" />
            <circle
              className="wir-bridge-moon-shadow"
              cx="59"
              cy="13.8"
              r="24.8"
              fill="#000"
            />
          </mask>
          <g
            className={`wir-bridge-moon${earlier ? ' is-earlier' : ''}`}
            data-motion-join=""
            mask={`url(#${maskId})`}
          >
            <g className="wir-bridge-moon-beat">
              <path className="wir-bridge-moon-own" d={`${HEART_OWN}z`} />
              <path
                className="wir-bridge-moon-partner"
                d={`${HEART_PARTNER}z`}
              />
            </g>
          </g>
        </>
      )}
      {occasion ? (
        <>
          <path
            className="wir-bridge-heart-fill wir-bridge-heart-fill-own"
            d={`${HEART_OWN}z`}
          />
          <path
            className="wir-bridge-heart-fill wir-bridge-heart-fill-partner"
            d={`${HEART_PARTNER}z`}
          />
        </>
      ) : null}
      <path className="wir-bridge-heart-own" pathLength={100} d={HEART_OWN} />
      <path
        className="wir-bridge-heart-partner"
        pathLength={100}
        d={HEART_PARTNER}
      />
    </svg>
  );
}

/**
 * The soft light behind the portraits. Each person's small glow stays; the
 * wide glows and the shared light in the middle fade in as the two come
 * closer. Opacity only, so nothing is scaled or repainted.
 */
export function WirDistanceLight({ closeness }: { closeness: number }) {
  return (
    <span
      className="wir-distance-light"
      aria-hidden="true"
      data-motion-join=""
      style={{ '--wir-distance-closeness': closeness } as CSSProperties}
    >
      <span className="wir-distance-glow is-own" />
      <span className="wir-distance-glow is-partner" />
      <span className="wir-distance-glow is-own is-near" />
      <span className="wir-distance-glow is-partner is-near" />
      <span className="wir-distance-glow is-shared" />
    </span>
  );
}

/**
 * The control on the heart and the word it brings up, as siblings of the
 * story link so that neither is nested in the other.
 */
export function WirDistanceTell({ signal }: { signal: WirHeroDistanceSignal }) {
  // Focus moving between the heart and the word keeps the word open.
  const leave = (event: FocusEvent<HTMLElement>) => {
    if (!signal.anchorRef.current?.contains(event.relatedTarget))
      signal.releaseWord();
  };
  const content = (
    <>
      <PartnerDistanceGlyph kind="pin" />
      <span>{signal.word}</span>
    </>
  );
  return (
    <span ref={signal.anchorRef} className="wir-distance-tell">
      <span className="wir-distance-flash" aria-hidden="true" />
      <button
        type="button"
        className="wir-distance-heart"
        aria-label={signal.label}
        title={signal.label}
        onClick={signal.tell}
        onBlur={leave}
      />
      {signal.phase === 'told' ? (
        <span className="wir-distance-word-slot">
          {signal.href ? (
            <Link
              className={`wir-distance-word${signal.earlier ? ' is-earlier' : ''}`}
              to={signal.href}
              aria-label={signal.wordLabel ?? undefined}
              onFocus={signal.holdWord}
              onBlur={leave}
            >
              {content}
            </Link>
          ) : (
            <span
              className={`wir-distance-word${signal.earlier ? ' is-earlier' : ''}`}
              aria-hidden="true"
            >
              {content}
            </span>
          )}
        </span>
      ) : null}
      <span className="sr-only" role="status">
        {signal.announcement}
      </span>
    </span>
  );
}

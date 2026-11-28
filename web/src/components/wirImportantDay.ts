/**
 * The important-day Moment on Wir (#2072; Motion Contract 4.7, approved by
 * the Product Owner on 2026-11-20).
 *
 * On the couple's anniversary, a round day together (#2370), either
 * partner's birthday or a shared important date, the Wir stage plays one
 * short Moment after its opening:
 * the heart fills, about six small hearts rise and fade (about 1.5 s), one
 * haptic tick accompanies the first beat, and the middle line cross-fades to
 * the occasion copy. On a birthday that person's ring takes a warm accent, a
 * soft opacity-only halo and a cake mark. On the anniversary and on a round
 * day the days-together count in that copy rolls into place (`RollingCount`).
 *
 * - Only occasions visible to the viewer qualify (`collectSpaceOccasions`):
 *   private dates, dates linked to a related person and discreet or
 *   surprise plans never surface.
 * - It plays once per local day per device. The device keeps only the day
 *   and an opaque hash of the occasion key; nothing is sent or shared.
 * - The static state (filled heart, copy, accent) stays for the rest of the
 *   day; a return, refetch, remount or resume never replays it.
 * - With reduced motion the final state shows at once, with no rising hearts
 *   and no haptic (the Moment primitive does not play).
 * - There is no "Gratulieren" action (Product Owner, 2026-11-20).
 *
 * Today's occasion comes from `wirOccasion.tsx`.
 */
import { type RefObject, useEffect, useRef, useState } from 'react';
import { animateFlight, flightEnded, openFlightLayer } from '../motion/flight';
import { type MomentTicket, startMoment } from '../motion/moment';
import { stageFinished } from '../motion/stage';
import { durationMs, easing } from '../motion/tokens';
import { observeVisibility } from '../motion/visibility';
import { holdRingBreath, WIR_STAGE } from './wirStageMotion';

export const IMPORTANT_DAY_MOMENT = 'wir.important-day';
export const IMPORTANT_DAY_STORAGE_KEY = 'eimir.wir.importantDay';
/** The small hearts that rise from the filled heart. */
export const IMPORTANT_DAY_HEARTS = 6;

export interface WirOccasion {
  /** `YYYY-MM-DD|hash`: the play identity of the day and the occasion. */
  playKey: string;
  /** The middle line above the heart. */
  primary: string;
  /** The quiet line below the heart that names the occasion. */
  secondary: string;
  /** Whose ring gets the birthday accent. */
  birthday: 'own' | 'partner' | null;
  /**
   * The days-together count that rolls into place during the Moment (#2370):
   * which line shows it and the number as formatted inside that line.
   */
  count: { line: 'primary' | 'secondary'; formatted: string } | null;
}

export type ImportantDayPhase = 'none' | 'before' | 'playing' | 'final';

/** The device's local calendar day. */
export function localDay(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function playedToday(playKey: string): boolean {
  try {
    return storage()?.getItem(IMPORTANT_DAY_STORAGE_KEY) === playKey;
  } catch {
    return false;
  }
}

function rememberPlayed(playKey: string): void {
  try {
    storage()?.setItem(IMPORTANT_DAY_STORAGE_KEY, playKey);
  } catch {
    // Without storage the in-memory Moment registry still prevents replays.
  }
}

const shownThisSession = new Set<string>();

function initialPhase(occasion: WirOccasion | null): ImportantDayPhase {
  if (!occasion) return 'none';
  return shownThisSession.has(occasion.playKey) || playedToday(occasion.playKey)
    ? 'final'
    : 'before';
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const HEART_PATH =
  'M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.6.7-1.4 2.2-2.6 4.3-2.6 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21z';
/** Horizontal spread of the rising hearts, in px. */
const HEART_SPREAD = [-22, 14, -8, 24, -16, 6];
/** How far the hearts rise, in px (decorative travel, not a duration). */
const HEART_RISE = 44;

/** The whole Moment: the last heart's start plus its own rise. */
export function importantDayDuration(): number {
  return (
    durationMs('gesture-moment') +
    (IMPORTANT_DAY_HEARTS - 1) * durationMs('feedback')
  );
}

/** About six small hearts rise from the heart and fade, in the flight layer. */
function riseHearts(stage: Element): void {
  const heart = stage.querySelector('.wir-bridge-line svg');
  if (!heart) return;
  const flight = openFlightLayer();
  if (!flight) return;
  const box = heart.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const travel = durationMs('gesture-moment');
  const step = durationMs('feedback');
  const animations = HEART_SPREAD.slice(0, IMPORTANT_DAY_HEARTS).map(
    (spread, index) => {
      const element = document.createElement('span');
      element.className = 'wir-important-day-heart';
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', HEART_PATH);
      svg.append(path);
      element.append(svg);
      flight.layer.append(element);
      const rise = HEART_RISE + (index % 3) * 6;
      return animateFlight(
        element,
        [
          { opacity: 0, transform: 'translate(-50%, -50%) scale(0.5)' },
          { opacity: 1, offset: 0.2 },
          {
            opacity: 0,
            transform: `translate(calc(-50% + ${spread}px), calc(-50% - ${rise}px)) scale(1)`,
          },
        ],
        {
          duration: travel,
          delay: index * step,
          easing: easing('enter'),
          fill: 'backwards',
        },
      );
    },
  );
  void Promise.all(animations.map(flightEnded)).then(flight.dispose);
}

/**
 * The Moment's phase on the stage. `before` waits for the opening to end on
 * its own clock and for Wir to be visible; then it plays once (`playing`)
 * and rests in `final` for the rest of the day.
 */
export function useImportantDayMoment(
  occasion: WirOccasion | null,
  stageRef: RefObject<HTMLElement | null>,
): ImportantDayPhase {
  const playKey = occasion?.playKey ?? null;
  const [state, setState] = useState(() => ({
    playKey,
    phase: initialPhase(occasion),
  }));
  const phase =
    state.playKey === playKey ? state.phase : initialPhase(occasion);
  const ticket = useRef<MomentTicket | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (state.playKey !== playKey)
      setState({ playKey, phase: initialPhase(occasion) });
  });

  useEffect(() => {
    // Started once per occasion of the day; its own timers end it, so a
    // phase change does not cancel them (only an unmount or a new day does).
    if (phaseRef.current !== 'before' || !playKey) return;
    let cancelled = false;
    let triggered = false;
    let stopWatching: (() => void) | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const show = (next: ImportantDayPhase) => {
      if (!cancelled) setState({ playKey, phase: next });
    };
    const play = () => {
      const stage = stageRef.current;
      if (!stage || cancelled || triggered) return;
      triggered = true;
      shownThisSession.add(playKey);
      rememberPlayed(playKey);
      const granted = startMoment(IMPORTANT_DAY_MOMENT, playKey, {
        visible: true,
        haptic: true,
        duration: importantDayDuration(),
      });
      if (!granted) {
        show('final');
        return;
      }
      ticket.current = granted;
      timers.push(
        setTimeout(() => {
          holdRingBreath(stage);
          show('playing');
          riseHearts(stage);
          timers.push(
            setTimeout(() => {
              granted.end();
              ticket.current = null;
              show('final');
            }, granted.duration),
          );
        }, granted.delay),
      );
    };
    void stageFinished(WIR_STAGE).then(() => {
      const stage = stageRef.current;
      if (cancelled || !stage) return;
      stopWatching = observeVisibility(stage, (visibility) => {
        if (visibility.visible) play();
      });
      if (triggered) stopWatching();
    });
    return () => {
      cancelled = true;
      stopWatching?.();
      for (const timer of timers) clearTimeout(timer);
      ticket.current?.end();
      ticket.current = null;
    };
  }, [playKey, stageRef]);

  return phase;
}

/** Test support. */
export function resetImportantDayForTests(): void {
  shownThisSession.clear();
}

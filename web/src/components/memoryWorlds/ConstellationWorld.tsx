/**
 * Sternbild (#2283): every memory from the diary is a star on an old star
 * chart above a hill where the two of you sit under one blanket, a
 * telescope next to you. The stars are placed by time from left to right
 * and joined by your constellation line, which draws itself on when the
 * chart opens; memories that were not stars on the last visit are born
 * when the line reaches them.
 *
 * A swipe across the sky flings a shooting star that lands on the nearest
 * star in that direction; dragging from star to star traces the
 * constellation; tapping a star lights it. The telescope swings to a star
 * on a tap, or follows the finger when it is dragged from the hill, and
 * opens a porthole view of the star it settles on. The lit star's memory
 * waits on a little star-chart card below the sky.
 *
 * The sky follows the device clock (`starChart.ts`): its palette blends
 * through night, dawn, day and dusk, the star field turns slowly over the
 * night, the moon shows tonight's phase, and August and December bring
 * shooting star showers (the winter months frost and snow). The palettes
 * are roles in `ConstellationWorld.css`, Light and Dark.
 *
 * Keyboard and screen reader users get one star button per memory in a
 * named group (a roving tab stop; the arrow keys, Home and End go from
 * star to star in the order of time), a named telescope button, a "send a
 * shooting star" button that shows itself on focus, and live announcements
 * of where a shooting star, a traced constellation or the telescope led.
 * With reduced motion every landing shows its result at once.
 *
 * The ambient loops (the twinkling, the halo, the moon's glow, the lean,
 * the frost and the snow) run for `--motion-ambient-repeat` cycles and
 * pause while the world is not seen (`data-ambient`, M8); the shooting
 * stars that cross the sky on their own are as few and wait meanwhile.
 * Keyframes and timing roles: src/motion/memory-worlds.css; the flight,
 * the trail and the telescope's spring: src/motion/constellation.ts.
 */
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import {
  ambientWait,
  dropDust,
  frameLoop,
  flightAt,
  headScale,
  planFlight,
  type ScopeMotion,
  STARS_TIMING,
  type StarFlight,
  scopeSettled,
  settleScope,
  stepScope,
  type TrailSample,
  trimTrail,
} from '../../motion/constellation';
import { haptic } from '../../motion/haptics';
import { motionCount } from '../../motion/tokens';
import { observeVisibility } from '../../motion/visibility';
import { Keepsake } from './MemoryPhoto';
import {
  type MemoryWorldProps,
  prefersReducedMotion,
  seasonLabel,
} from './model';
import {
  ambientShootingStarsAt,
  angleTo,
  birthDelays,
  DUST_STARS,
  FIELD_R,
  FRAME_TICKS,
  fieldAt,
  HILL,
  HILL_EDGE,
  hillY,
  isShowerMonth,
  isWinterMonth,
  layoutStars,
  lensAt,
  MOON_R,
  moonAt,
  moonFace,
  moonLitPath,
  moonPhase,
  nightArc,
  normalize,
  POLE,
  type Pt,
  pathOf,
  pencilInk,
  pickTarget,
  readSeenStars,
  rotateAbout,
  SCOPE,
  SCOPE_REST_DEG,
  SKY_H,
  SKY_ROLES,
  SKY_W,
  SNOW,
  type Star,
  seasonMarks,
  skyAt,
  skyTurn,
  starInField,
  starNear,
  starsInField,
  visibleEntries,
  writeSeenStars,
} from './starChart';
import '../../motion/memory-worlds.css';
import './MemoryWorld.css';
import './ConstellationWorld.css';

/** Pointer travel before a press becomes a gesture (px). */
const DRAG_SLOP = 8;
/** A fling needs this much travel (px) and either speed or a long swipe. */
const FLING_MIN_PX = 36;
const FLING_LONG_PX = 90;
/** px per ms. */
const FLING_SPEED = 0.3;
/** Pointer samples older than this are dropped while moving (ms). */
const SAMPLE_WINDOW_MS = 160;
/** The release speed is measured over the last samples of this age (ms). */
const RELEASE_WINDOW_MS = 100;
/** A finger in the sky this far above the pivot aims the field at itself. */
const SCOPE_SKY_MARGIN = 40;

interface Sample extends Pt {
  t: number;
}

interface Gesture {
  id: number;
  x0: number;
  y0: number;
  rect: DOMRect;
  mode: 'pending' | 'fling' | 'trace' | 'scope';
  /** Started on the telescope or the hill: a drag aims the telescope. */
  scope: boolean;
  origin: Star | null;
  chain: Star[];
  samples: Sample[];
  armed: boolean;
}

type LandingKind = 'fling' | 'trace' | 'tap' | 'key' | 'scope';

interface ScopeState extends ScopeMotion {
  lock: Star | null;
  inField: Set<string>;
}

interface View {
  key: string;
  /** Offset from the porthole's resting centre back to the lens (px). */
  fx: number;
  fy: number;
  phase: 'open' | 'closing';
}

/** The device clock, re-read every minute and when the page is shown again. */
function useSkyClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => {
      const next = new Date();
      setNow((current) =>
        current.getHours() === next.getHours() &&
        current.getMinutes() === next.getMinutes() &&
        current.getDate() === next.getDate()
          ? current
          : next,
      );
    };
    const timer = window.setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return now;
}

/** The sky's palette roles for this hour, as inline custom properties. */
function skyStyle(hours: number, turn: number): CSSProperties {
  const { from, to, blend } = skyAt(hours);
  const style: Record<string, string | number> = {
    '--memory-stars-blend': blend,
    '--memory-stars-turn': turn,
  };
  for (const role of SKY_ROLES) {
    style[`--memory-stars-from-${role}`] =
      `var(--memory-stars-${from}-${role})`;
    style[`--memory-stars-to-${role}`] = `var(--memory-stars-${to}-${role})`;
  }
  return style as CSSProperties;
}

export function ConstellationWorld({
  entries,
  loadMemoryImage,
  onOpen,
}: MemoryWorldProps) {
  const { t } = useTranslation();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const descriptionId = useId();
  const lead = entries.find((entry) => entry.isLead) ?? entries[0];
  const [selectedKey, setSelectedKey] = useState<string | null>(
    lead?.key ?? null,
  );
  // The lit star is always one of the visible ones, so the visible set only
  // needs recomputing when the memories change; it then keeps the lit one.
  const selectedRef = useRef(selectedKey);
  selectedRef.current = selectedKey;
  const baseStars = useMemo(
    () =>
      layoutStars(visibleEntries(entries, [lead?.key, selectedRef.current])),
    [entries, lead?.key],
  );
  // The season scale belongs to the paper chart, so it does not turn.
  const marks = useMemo(() => seasonMarks(baseStars, t), [baseStars, t]);
  const total = entries.length;

  /* The live sky. */
  const clock = useSkyClock();
  const hours = clock.getHours() + clock.getMinutes() / 60;
  const turn = skyTurn(hours);
  const phase = moonPhase(clock);
  const moon = moonAt(nightArc(hours));
  const face = moonFace(phase);
  const month = clock.getMonth();
  const shower = isShowerMonth(month);
  const winter = isWinterMonth(month);
  // Every star turns with the sky; gestures, telescope and hit areas use these.
  const stars = useMemo(
    () => baseStars.map((star) => ({ ...star, ...rotateAbout(star, turn) })),
    [baseStars, turn],
  );

  /* Growth: memories that were not stars on the last visit are newborn. */
  const [seenBefore] = useState(readSeenStars);
  useEffect(() => {
    const seen = readSeenStars() ?? new Set<string>();
    for (const entry of entries) seen.add(entry.key);
    writeSeenStars(seen);
  }, [entries]);
  const births = useMemo(
    () =>
      birthDelays(
        baseStars,
        seenBefore,
        STARS_TIMING.lineDelay,
        STARS_TIMING.lineDraw,
      ),
    [seenBefore, baseStars],
  );

  const [flare, setFlare] = useState<{ key: string; run: number } | null>(null);
  const [traced, setTraced] = useState<string[]>([]);
  const [taught, setTaught] = useState(false);
  const [heartRun, setHeartRun] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [view, setView] = useState<View | null>(null);
  const [looking, setLooking] = useState(false);
  const [ambient, setAmbient] = useState<{
    run: number;
    x: number;
    y: number;
    angle: number;
  } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const scopeButtonRef = useRef<HTMLButtonElement>(null);
  const viewRef = useRef<HTMLButtonElement>(null);
  const starButtons = useRef(new Map<string, HTMLButtonElement>());
  const tubeRef = useRef<SVGGElement>(null);
  const fieldRef = useRef<SVGGElement>(null);
  const fieldConeRef = useRef<SVGPathElement>(null);
  const fieldRingRef = useRef<SVGCircleElement>(null);
  const fieldGlowRef = useRef<SVGCircleElement>(null);
  const trailGradRef = useRef<SVGLinearGradientElement>(null);
  const trailGlowRef = useRef<SVGPathElement>(null);
  const trailMidRef = useRef<SVGPathElement>(null);
  const trailCoreRef = useRef<SVGPathElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const dustRef = useRef<SVGGElement>(null);
  const traceGroupRef = useRef<SVGGElement>(null);
  const traceGlowRef = useRef<SVGPathElement>(null);
  const traceCoreRef = useRef<SVGPathElement>(null);

  const aiming = useRef(false);
  const scope = useRef<ScopeState>({
    deg: SCOPE_REST_DEG,
    vel: 0,
    target: SCOPE_REST_DEG,
    reach: 160,
    reachTarget: 160,
    maxStep: 4,
    lock: null,
    inField: new Set(),
  });
  const gesture = useRef<Gesture | null>(null);
  const flight = useRef<
    (StarFlight & { start: number; target: Star; lastDust: number }) | null
  >(null);
  const trail = useRef<TrailSample[]>([]);
  const timers = useRef<number[]>([]);
  const suppressClick = useRef(false);
  const runRef = useRef(0);
  const traceRun = useRef(0);
  const seen = useRef(true);
  const ambientLeft = useRef(0);

  // The frame loops call the latest render's steps.
  const skyStep = useRef<(now: number) => boolean>(() => false);
  const scopeStep = useRef<() => boolean>(() => false);
  const [skyLoop] = useState(() => frameLoop((now) => skyStep.current(now)));
  const [scopeLoop] = useState(() => frameLoop(() => scopeStep.current()));

  useEffect(
    () => () => {
      skyLoop.stop();
      scopeLoop.stop();
      for (const id of timers.current) window.clearTimeout(id);
    },
    [skyLoop, scopeLoop],
  );

  // The ambient loops and the shooting stars rest while the sky is not seen.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return observeVisibility(root, (state) => {
      seen.current = state.visible;
      root.dataset.ambient = state.visible ? 'on' : 'paused';
    });
  }, []);

  // Now and then a shooting star crosses the sky on its own (not by day),
  // as many as the ambient loops repeat; each landing brings them back.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    ambientLeft.current = motionCount('ambient-repeat');
    let handle = 0;
    const schedule = () => {
      handle = window.setTimeout(() => {
        if (
          seen.current &&
          ambientLeft.current > 0 &&
          !flight.current &&
          ambientShootingStarsAt(new Date().getHours())
        ) {
          ambientLeft.current -= 1;
          setAmbient({
            run: Date.now(),
            x: 6 + Math.random() * 50,
            y: 8 + Math.random() * 22,
            angle: 18 + Math.random() * 24,
          });
        }
        schedule();
      }, ambientWait(shower));
    };
    schedule();
    return () => window.clearTimeout(handle);
  }, [shower]);

  // Focus follows into the telescope view, so Enter leads on to the card.
  const viewKey = view?.phase === 'open' ? view.key : null;
  useEffect(() => {
    if (viewKey) viewRef.current?.focus({ preventScroll: true });
  }, [viewKey]);

  if (stars.length === 0) return null;
  const selected =
    stars.find((star) => star.entry.key === selectedKey) ??
    stars.find((star) => star.entry.key === lead?.key) ??
    stars[0];

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((handle) => handle !== id);
      fn();
    }, ms);
    timers.current.push(id);
  };

  const toSky = (clientX: number, clientY: number, rect: DOMRect): Pt => ({
    x: ((clientX - rect.left) / (rect.width || 1)) * SKY_W,
    y: ((clientY - rect.top) / (rect.height || 1)) * SKY_H,
  });

  /* ----- Drawing (direct DOM updates, no re-render per frame) ----- */

  const drawTrail = () => {
    const points = trail.current;
    const d = pathOf(points);
    for (const ref of [trailGlowRef, trailMidRef, trailCoreRef])
      ref.current?.setAttribute('d', d);
    const gradient = trailGradRef.current;
    if (gradient && points.length >= 2) {
      const tail = points[0];
      const head = points[points.length - 1];
      gradient.setAttribute('x1', tail.x.toFixed(1));
      gradient.setAttribute('y1', tail.y.toFixed(1));
      gradient.setAttribute('x2', head.x.toFixed(1));
      gradient.setAttribute('y2', head.y.toFixed(1));
    }
  };

  const showHead = (at: Pt, scale: number) => {
    const head = headRef.current;
    if (!head) return;
    head.setAttribute(
      'transform',
      `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)}) scale(${scale.toFixed(2)})`,
    );
    head.setAttribute('data-on', 'true');
  };
  const hideHead = () => headRef.current?.removeAttribute('data-on');

  const drawTrace = (
    chain: readonly Star[],
    finger: Pt | null,
    state: 'drawing' | 'fading' | 'idle',
  ) => {
    const points: Pt[] = chain.map((star) => ({ x: star.x, y: star.y }));
    if (finger) points.push(finger);
    const d = pathOf(points);
    traceGlowRef.current?.setAttribute('d', d);
    traceCoreRef.current?.setAttribute('d', d);
    traceGroupRef.current?.setAttribute('data-state', state);
  };

  /* ----- Selecting and landing ----- */

  const bringCardIntoView = (threshold = 0.6) => {
    const card = cardRef.current;
    if (!card) return;
    // Only ever scroll down, and only when the card is mostly out of view.
    if (card.getBoundingClientRect().top > window.innerHeight * threshold)
      card.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
  };

  const landedLine = (how: 'fling' | 'trace' | 'scope', star: Star) =>
    t(`memoryWorlds.stars.landed.${how}`, {
      title: star.entry.title,
      date: star.entry.dateLabel,
    });

  const land = (star: Star, how: LandingKind) => {
    runRef.current += 1;
    const run = runRef.current;
    setSelectedKey(star.entry.key);
    ambientLeft.current = motionCount('ambient-repeat');
    if (how === 'key') {
      haptic('threshold');
      return;
    }
    setFlare({ key: star.entry.key, run });
    if (how === 'tap') {
      haptic('commit');
    } else if (how === 'scope') {
      // The card waits until you look away from the telescope.
      haptic('moment');
      setAnnouncement(landedLine('scope', star));
      return;
    } else {
      haptic('moment');
      setHeartRun(run);
      setAnnouncement(landedLine(how, star));
      if (how === 'fling') setTaught(true);
    }
    later(
      () => bringCardIntoView(),
      prefersReducedMotion()
        ? 0
        : how === 'tap'
          ? STARS_TIMING.cardAfterTap
          : STARS_TIMING.cardAfterLanding,
    );
  };

  /* ----- The telescope: aim it freely, it locks onto a star ----- */

  /** Turns the tube and moves its field of view; stars in the field glint. */
  const drawScope = (deg: number, showField: boolean) => {
    tubeRef.current?.style.setProperty('rotate', `${deg.toFixed(2)}deg`);
    const field = fieldRef.current;
    if (!field) return;
    if (!showField) {
      field.removeAttribute('data-on');
      return;
    }
    const s = scope.current;
    const lens = lensAt(deg);
    const centre = fieldAt(deg, s.reach);
    const dir = normalize(centre.x - lens.x, centre.y - lens.y);
    const side = { x: -dir.y * FIELD_R * 0.92, y: dir.x * FIELD_R * 0.92 };
    fieldConeRef.current?.setAttribute(
      'd',
      `M${lens.x.toFixed(1)} ${lens.y.toFixed(1)}L${(centre.x + side.x).toFixed(1)} ${(centre.y + side.y).toFixed(1)}L${(centre.x - side.x).toFixed(1)} ${(centre.y - side.y).toFixed(1)}Z`,
    );
    for (const circle of [fieldRingRef.current, fieldGlowRef.current]) {
      circle?.setAttribute('cx', centre.x.toFixed(1));
      circle?.setAttribute('cy', centre.y.toFixed(1));
    }
    field.setAttribute('data-on', 'true');
    const inside = starsInField(stars, centre);
    let entered = false;
    for (const key of inside)
      if (!s.inField.has(key)) {
        entered = true;
        starButtons.current.get(key)?.setAttribute('data-in-field', 'true');
      }
    for (const key of s.inField)
      if (!inside.has(key))
        starButtons.current.get(key)?.removeAttribute('data-in-field');
    s.inField = inside;
    if (entered) haptic('threshold');
  };

  const clearField = () => {
    const s = scope.current;
    for (const key of s.inField)
      starButtons.current.get(key)?.removeAttribute('data-in-field');
    s.inField = new Set();
    fieldRef.current?.removeAttribute('data-on');
  };

  const openView = (star: Star) => {
    const sky = skyRef.current;
    if (!sky) return;
    const rect = sky.getBoundingClientRect();
    // The porthole's resting centre (see .memory-stars-view) and the lens.
    const size = Math.min(rect.width * 0.54, 220);
    const centreX = rect.width * 0.46;
    const centreY = rect.height * 0.04 + size / 2;
    const lens = lensAt(scope.current.deg);
    setView({
      key: star.entry.key,
      fx: (lens.x / SKY_W) * rect.width - centreX,
      fy: (lens.y / SKY_H) * rect.height - centreY,
      phase: 'open',
    });
  };

  const lockOn = (star: Star) => {
    scope.current.lock = null;
    aiming.current = false;
    clearField();
    land(star, 'scope');
    openView(star);
  };

  scopeStep.current = () => {
    const s = scope.current;
    const dragging = gesture.current?.mode === 'scope';
    stepScope(s);
    drawScope(s.deg, true);
    if (!dragging && s.lock && scopeSettled(s)) {
      s.deg = s.target;
      drawScope(s.deg, true);
      lockOn(s.lock);
      return false;
    }
    return dragging || s.lock !== null;
  };

  /** Turns the telescope to a star and opens the view once it settles. */
  const aimAt = (star: Star, maxStep: number) => {
    const s = scope.current;
    s.target = angleTo(star);
    s.reachTarget = Math.hypot(star.x - SCOPE.x, star.y - SCOPE.y);
    s.lock = star;
    s.maxStep = maxStep;
    aiming.current = true;
    setLooking(true);
    if (prefersReducedMotion()) {
      settleScope(s);
      drawScope(s.deg, false);
      lockOn(star);
      return;
    }
    scopeLoop.start();
  };

  const closeView = (returnFocus: boolean) => {
    setLooking(false);
    if (returnFocus) scopeButtonRef.current?.focus({ preventScroll: true });
    if (prefersReducedMotion()) {
      setView(null);
      return;
    }
    // Back into the lens, then gone.
    setView((current) => (current ? { ...current, phase: 'closing' } : null));
    later(
      () =>
        setView((current) => (current?.phase === 'closing' ? null : current)),
      STARS_TIMING.viewClose,
    );
  };

  /** Tap (or keyboard): the telescope swings to some other star. */
  const tapScope = () => {
    if (aiming.current || flight.current) return;
    if (view) closeView(false);
    const pool = stars.filter((star) => star.entry.key !== selected.entry.key);
    const target = pool[Math.floor(Math.random() * pool.length)] ?? selected;
    aimAt(target, 1.6);
  };

  const startScopeDrag = () => {
    const s = scope.current;
    s.lock = null;
    s.maxStep = 4;
    aiming.current = true;
    setLooking(true);
    scopeLoop.start();
  };

  const aimScopeAt = (finger: Pt) => {
    // A finger low on the hill still aims upwards, into the sky; up in the
    // sky, the field of view follows the finger itself.
    const s = scope.current;
    s.target = angleTo({
      x: finger.x,
      y: Math.min(finger.y, SCOPE.y - SCOPE_SKY_MARGIN),
    });
    if (finger.y < SCOPE.y - SCOPE_SKY_MARGIN)
      s.reachTarget = Math.hypot(finger.x - SCOPE.x, finger.y - SCOPE.y);
    scopeLoop.start();
  };

  const releaseScope = () => {
    const s = scope.current;
    aimAt(starInField(stars, s.target, s.reachTarget), 2);
  };

  const fromView = () => {
    if (view?.phase !== 'open') return;
    closeView(false);
    later(
      () => bringCardIntoView(0.3),
      prefersReducedMotion() ? 0 : STARS_TIMING.cardAfterView,
    );
  };

  /* ----- The animation loop: drag streak, flight, fading trail ----- */

  skyStep.current = (now: number) => {
    const current = flight.current;
    if (current) {
      const { at, eased, done } = flightAt(current, now - current.start);
      trail.current.push({ ...at, t: now });
      showHead(at, headScale(eased));
      const group = dustRef.current;
      if (group && now - current.lastDust > STARS_TIMING.dustEvery) {
        current.lastDust = now;
        const mote = dropDust(group, at);
        if (mote) later(() => mote.remove(), STARS_TIMING.dustLife);
      }
      if (done) {
        flight.current = null;
        hideHead();
        land(current.target, 'fling');
      }
    }
    const dragging = gesture.current?.mode === 'fling';
    const keep =
      dragging && !current ? STARS_TIMING.dragTrail : STARS_TIMING.trail;
    trail.current = trimTrail(trail.current, now, keep);
    drawTrail();
    return !!flight.current || dragging || trail.current.length > 0;
  };

  const launch = (from: Pt, dir: Pt, target: Star) => {
    if (prefersReducedMotion()) {
      // A direct, static result: the star simply lights up.
      trail.current = [];
      drawTrail();
      hideHead();
      land(target, 'fling');
      return;
    }
    flight.current = {
      ...planFlight(from, dir, target),
      start: performance.now(),
      target,
      lastDust: 0,
    };
    haptic('commit');
    skyLoop.start();
  };

  /** Keyboard and screen reader: a shooting star from the far corner. */
  const wish = () => {
    if (flight.current || aiming.current) return;
    if (view) closeView(false);
    const pool = stars.filter((star) => star.entry.key !== selected.entry.key);
    const target = pool[Math.floor(Math.random() * pool.length)] ?? selected;
    const left = target.x < SKY_W / 2;
    const from = { x: left ? SKY_W + 24 : -24, y: 14 + Math.random() * 30 };
    const straight = normalize(target.x - from.x, target.y - from.y);
    // Leave slightly upwards, so the path bends like a real streak.
    const tilt = left ? 0.22 : -0.22;
    const dir = normalize(
      straight.x * Math.cos(tilt) - straight.y * Math.sin(tilt),
      straight.x * Math.sin(tilt) + straight.y * Math.cos(tilt),
    );
    launch(from, dir, target);
  };

  /* ----- Gestures on the sky ----- */

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (flight.current || aiming.current || !skyRef.current) return;
    const pressed = event.target as Element;
    // The view through the telescope handles its own taps.
    if (pressed.closest('.memory-stars-view')) return;
    if (view) closeView(false);
    const rect = skyRef.current.getBoundingClientRect();
    const down = toSky(event.clientX, event.clientY, rect);
    // On the telescope or anywhere on the hill, a drag aims the telescope.
    const onScope =
      !!pressed.closest('.memory-stars-scope-button') ||
      down.y >= hillY(down.x) - 4;
    const starElement = pressed.closest<HTMLElement>('[data-stars-star]');
    const origin = starElement
      ? (stars.find(
          (star) => star.entry.key === starElement.dataset.starsStar,
        ) ?? null)
      : null;
    gesture.current = {
      id: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      rect,
      mode: 'pending',
      scope: onScope,
      origin: onScope ? null : origin,
      chain: origin && !onScope ? [origin] : [],
      samples: [{ x: event.clientX, y: event.clientY, t: performance.now() }],
      armed: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const now = performance.now();
    g.samples.push({ x: event.clientX, y: event.clientY, t: now });
    if (g.samples.length > 4)
      g.samples = g.samples.filter(
        (sample) => now - sample.t <= SAMPLE_WINDOW_MS,
      );
    const travel = Math.hypot(event.clientX - g.x0, event.clientY - g.y0);
    const at = toSky(event.clientX, event.clientY, g.rect);
    if (g.mode === 'pending') {
      if (travel < DRAG_SLOP) return;
      g.mode = g.scope ? 'scope' : g.origin ? 'trace' : 'fling';
      suppressClick.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may already be gone (e.g. a cancelled touch).
      }
      if (g.mode === 'scope') {
        startScopeDrag();
      } else if (g.mode === 'trace') {
        traceRun.current += 1;
        setTraced(g.chain.map((star) => star.entry.key));
      } else {
        trail.current = [{ ...toSky(g.x0, g.y0, g.rect), t: g.samples[0].t }];
      }
    }
    if (g.mode === 'scope') {
      aimScopeAt(at);
      return;
    }
    if (g.mode === 'fling') {
      trail.current.push({ ...at, t: now });
      showHead(at, 0.75);
      if (!g.armed && travel >= FLING_MIN_PX) {
        g.armed = true;
        haptic('threshold');
      }
      skyLoop.start();
      return;
    }
    // Tracing: the thread follows the finger and hooks onto stars it passes.
    const hit = starNear(stars, at, g.chain);
    if (hit) {
      g.chain.push(hit);
      haptic('threshold');
      setTraced(g.chain.map((star) => star.entry.key));
    }
    drawTrace(g.chain, at, 'drawing');
  };

  const endGesture = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    if (g.mode === 'pending') return; // A tap: the click selects the star.
    later(() => {
      suppressClick.current = false;
    }, STARS_TIMING.clickReset);
    const now = performance.now();
    g.samples.push({ x: event.clientX, y: event.clientY, t: now });
    const travel = Math.hypot(event.clientX - g.x0, event.clientY - g.y0);
    const recent = g.samples.filter(
      (sample) => now - sample.t <= RELEASE_WINDOW_MS,
    );
    const first = recent[0] ?? g.samples[0];
    const last = g.samples[g.samples.length - 1];
    const dt = Math.max(1, last.t - first.t);
    const speed = Math.hypot(last.x - first.x, last.y - first.y) / dt;
    const flung =
      !cancelled &&
      travel >= FLING_MIN_PX &&
      (speed >= FLING_SPEED || travel >= FLING_LONG_PX);
    const dir =
      speed > 0.08
        ? normalize(last.x - first.x, last.y - first.y)
        : normalize(event.clientX - g.x0, event.clientY - g.y0);
    const release = toSky(event.clientX, event.clientY, g.rect);
    const from = {
      x: Math.min(SKY_W - 4, Math.max(4, release.x)),
      y: Math.min(SKY_H - 4, Math.max(4, release.y)),
    };
    const exclude = new Set([selected.entry.key]);

    if (g.mode === 'scope') {
      releaseScope();
      return;
    }

    if (g.mode === 'trace') {
      const origin = g.chain[0];
      if (g.chain.length >= 2 && !cancelled) {
        drawTrace(g.chain, null, 'fading');
        const run = traceRun.current;
        later(() => {
          if (traceRun.current !== run) return;
          drawTrace([], null, 'idle');
          setTraced([]);
        }, STARS_TIMING.traceLinger);
        land(g.chain[g.chain.length - 1], 'trace');
        return;
      }
      drawTrace([], null, 'idle');
      setTraced([]);
      if (cancelled) return;
      if (flung) {
        // A flick off a star sends a shooting star from it.
        exclude.add(origin.entry.key);
        const start = { x: origin.x, y: origin.y };
        launch(start, dir, pickTarget(stars, [start], dir, exclude).star);
      } else {
        land(origin, 'tap');
      }
      return;
    }

    if (!flung) {
      hideHead();
      skyLoop.start(); // The streak fades away on its own.
      return;
    }
    const picked = pickTarget(
      stars,
      [from, toSky(g.x0, g.y0, g.rect)],
      dir,
      exclude,
    );
    launch(from, dir, picked.star);
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const tapStar = (star: Star) => {
    if (flight.current) return;
    land(star, 'tap');
  };

  const onStarKey = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = Math.min(stars.length - 1, index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = Math.max(0, index - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = stars.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next === index || flight.current) return;
    const star = stars[next];
    land(star, 'key');
    starButtons.current.get(star.entry.key)?.focus();
  };

  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const viewStar = view
    ? (stars.find((star) => star.entry.key === view.key) ?? null)
    : null;
  // The newest of the newborn stars gets the handwritten note.
  const newest =
    [...stars].reverse().find((star) => births.has(star.entry.key)) ?? null;
  const entryLine = (star: Star) => ({
    title: star.entry.title,
    date: star.entry.dateLabel,
  });

  return (
    <div
      ref={rootRef}
      className="memory-stars-world"
      data-pencil={pencilInk(hours) ? 'ink' : undefined}
      style={skyStyle(hours, turn)}
    >
      <div className="memory-world-head">
        <h2>{t('memoryWorlds.stars.heading')}</h2>
      </div>

      <div className="memory-stars-chart">
        {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
          <span
            key={corner}
            className="memory-stars-corner"
            data-at={corner}
            aria-hidden="true"
          >
            ✦
          </span>
        ))}
        {/* biome-ignore lint/a11y/useSemanticElements: the sky is a named group of star buttons, not a form fieldset. */}
        <div
          ref={skyRef}
          className="memory-stars-sky"
          role="group"
          aria-roledescription={t('memoryWorlds.stars.roleDescription')}
          aria-label={
            total > stars.length
              ? t('memoryWorlds.stars.labelSome', {
                  shown: stars.length,
                  count: total,
                })
              : t('memoryWorlds.stars.label')
          }
          aria-describedby={descriptionId}
          data-primary-tab-swipe-block
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => endGesture(event, false)}
          onPointerCancel={(event) => endGesture(event, true)}
          onClickCapture={onClickCapture}
        >
          <svg
            className="memory-stars-back"
            viewBox={`0 0 ${SKY_W} ${SKY_H}`}
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <radialGradient id={id('moon-halo')}>
                <stop offset="0" className="memory-stars-moon-halo-in" />
                <stop offset="1" className="memory-stars-moon-halo-out" />
              </radialGradient>
              <clipPath id={id('moon-lit')}>
                <path d={moonLitPath(phase, MOON_R)} />
              </clipPath>
            </defs>

            {/* The old chart: rings and meridians, the frame and its scale. */}
            <g className="memory-stars-grid">
              {[430, 490, 550, 610, 670].map((r) => (
                <circle key={r} cx={200} cy={700} r={r} />
              ))}
              {[-36, -24, -12, 0, 12, 24, 36].map((angle) => {
                const rad = ((angle - 90) * Math.PI) / 180;
                return (
                  <line
                    key={angle}
                    x1={200}
                    y1={700}
                    x2={200 + Math.cos(rad) * 720}
                    y2={700 + Math.sin(rad) * 720}
                  />
                );
              })}
            </g>
            <g className="memory-stars-frame">
              <rect
                x={5}
                y={5}
                width={SKY_W - 10}
                height={SKY_H - 10}
                rx={10}
              />
              <rect
                x={12.5}
                y={12.5}
                width={SKY_W - 25}
                height={SKY_H - 25}
                rx={6}
              />
              <path d={FRAME_TICKS} />
            </g>
            <g className="memory-stars-seasons">
              {marks.map((mark) => (
                <g key={mark.key}>
                  <path d={`M${mark.x} 12.5V18.5`} />
                  <text x={mark.x} y={28.5}>
                    {mark.label}
                  </text>
                </g>
              ))}
            </g>

            <g
              className="memory-stars-dust-stars"
              transform={`rotate(${turn} ${POLE.x} ${POLE.y})`}
            >
              {DUST_STARS.map((dust) => (
                <g
                  key={dust.id}
                  style={
                    {
                      '--memory-stars-delay': `${dust.delay.toFixed(2)}s`,
                      '--memory-stars-period': `${dust.period.toFixed(2)}s`,
                      '--memory-stars-depth': (dust.y / SKY_H).toFixed(2),
                    } as CSSProperties
                  }
                >
                  <circle cx={dust.x} cy={dust.y} r={dust.r} />
                  {dust.glint ? (
                    <path
                      d={`M${dust.x - 3.2} ${dust.y}H${dust.x + 3.2}M${dust.x} ${dust.y - 3.2}V${dust.y + 3.2}`}
                    />
                  ) : null}
                </g>
              ))}
            </g>

            {/* Tonight's moon, with its sleepy face. */}
            <g
              className="memory-stars-moon"
              transform={`translate(${moon.x.toFixed(1)} ${moon.y.toFixed(1)})`}
            >
              <circle
                r={44}
                fill={url('moon-halo')}
                className="memory-stars-moon-glow"
              />
              <circle r={MOON_R} className="memory-stars-moon-shade" />
              <path
                d={moonLitPath(phase, MOON_R)}
                className="memory-stars-moon-body"
              />
              <g clipPath={url('moon-lit')}>
                <circle
                  cx={-6}
                  cy={6}
                  r={1.6}
                  className="memory-stars-moon-crater"
                />
                <circle
                  cx={7}
                  cy={-6}
                  r={1.2}
                  className="memory-stars-moon-crater"
                />
                <circle
                  cx={4}
                  cy={8}
                  r={0.9}
                  className="memory-stars-moon-crater"
                />
                <g
                  transform={`translate(${face.x.toFixed(2)} 0.5) scale(${face.scale.toFixed(2)})`}
                >
                  <path
                    d="M-6 -1.6q2 1.8 4 0M2 -1.6q2 1.8 4 0"
                    className="memory-stars-moon-face"
                  />
                  <path
                    d="M-1.8 3.4q1.8 1.5 3.6 0"
                    className="memory-stars-moon-face"
                  />
                  <circle
                    cx={-6.4}
                    cy={1.8}
                    r={1.4}
                    className="memory-stars-moon-blush"
                  />
                  <circle
                    cx={6.4}
                    cy={1.8}
                    r={1.4}
                    className="memory-stars-moon-blush"
                  />
                </g>
              </g>
            </g>

            {/* Your constellation, joined in the order of time. */}
            <polyline
              className="memory-stars-line"
              pathLength={1}
              points={stars.map((star) => `${star.x},${star.y}`).join(' ')}
            />
            <g
              ref={traceGroupRef}
              className="memory-stars-trace"
              data-state="idle"
            >
              <path
                ref={traceGlowRef}
                className="memory-stars-trace-glow"
                d=""
              />
              <path
                ref={traceCoreRef}
                className="memory-stars-trace-core"
                d=""
              />
            </g>
          </svg>

          {stars.map((star) => {
            const isSelected = star.entry.key === selected.entry.key;
            const newborn = births.has(star.entry.key);
            return (
              <button
                key={star.entry.key}
                ref={(element) => {
                  if (element) starButtons.current.set(star.entry.key, element);
                  else starButtons.current.delete(star.entry.key);
                }}
                type="button"
                className="memory-stars-star"
                data-stars-star={star.entry.key}
                data-kind={star.entry.kind}
                data-traced={
                  traced.includes(star.entry.key) ? 'true' : undefined
                }
                data-newborn={newborn ? 'true' : undefined}
                aria-pressed={isSelected}
                aria-label={t(
                  newborn
                    ? 'memoryWorlds.stars.starNew'
                    : 'memoryWorlds.stars.star',
                  entryLine(star),
                )}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => tapStar(star)}
                onKeyDown={(event) => onStarKey(event, star.index)}
                style={
                  {
                    left: `${(star.x / SKY_W) * 100}%`,
                    top: `${(star.y / SKY_H) * 100}%`,
                    '--memory-stars-size': star.size,
                    '--memory-stars-delay': `${star.delay}s`,
                    '--memory-stars-born': `${births.get(star.entry.key) ?? 0}ms`,
                  } as CSSProperties
                }
              >
                <span className="memory-stars-halo" aria-hidden="true" />
                {newborn ? (
                  <span className="memory-stars-birth" aria-hidden="true" />
                ) : null}
                {flare && flare.key === star.entry.key ? (
                  <span
                    key={flare.run}
                    className="memory-stars-flare"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}

          <svg
            className="memory-stars-front"
            viewBox={`0 0 ${SKY_W} ${SKY_H}`}
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <linearGradient
                ref={trailGradRef}
                id={id('trail')}
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0" className="memory-stars-trail-tail" />
                <stop offset="0.65" className="memory-stars-trail-body" />
                <stop offset="1" className="memory-stars-trail-head" />
              </linearGradient>
              <radialGradient id={id('head')}>
                <stop offset="0" className="memory-stars-head-in" />
                <stop offset="0.35" className="memory-stars-head-mid" />
                <stop offset="1" className="memory-stars-head-out" />
              </radialGradient>
              <linearGradient id={id('brass')} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" className="memory-stars-brass-a" />
                <stop offset="0.45" className="memory-stars-brass-b" />
                <stop offset="1" className="memory-stars-brass-c" />
              </linearGradient>
              <pattern
                id={id('plaid')}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
              >
                <rect
                  width="6"
                  height="6"
                  className="memory-stars-plaid-base"
                />
                <path
                  d="M0 2H6M0 4.6H6M2 0V6M4.6 0V6"
                  className="memory-stars-plaid-check"
                />
              </pattern>
            </defs>

            {/* The shooting star: a glowing trail, falling dust and its head. */}
            <g className="memory-stars-trail" stroke={url('trail')}>
              <path
                ref={trailGlowRef}
                className="memory-stars-trail-glow"
                d=""
              />
              <path ref={trailMidRef} className="memory-stars-trail-mid" d="" />
              <path
                ref={trailCoreRef}
                className="memory-stars-trail-core"
                d=""
              />
            </g>
            <g ref={dustRef} />
            <g ref={headRef} className="memory-stars-head">
              <circle r={9} fill={url('head')} />
              <path
                d="M-6.5 0H6.5M0 -6.5V6.5"
                className="memory-stars-head-rays"
              />
              <circle r={1.9} className="memory-stars-head-core" />
            </g>

            {/* The telescope's field of view, sweeping over the sky. */}
            <g ref={fieldRef} className="memory-stars-field">
              <path
                ref={fieldConeRef}
                className="memory-stars-field-cone"
                d=""
              />
              <circle
                ref={fieldGlowRef}
                className="memory-stars-field-glow"
                r={FIELD_R}
              />
              <circle
                ref={fieldRingRef}
                className="memory-stars-field-ring"
                r={FIELD_R}
              />
            </g>

            {/* The hill, and the two of you sharing one blanket. */}
            <path className="memory-stars-hill" d={HILL} />
            <path className="memory-stars-hill-rim" d={HILL_EDGE} />
            {winter ? (
              <>
                <path className="memory-stars-frost" d={HILL_EDGE} />
                <g className="memory-stars-snow">
                  {SNOW.map((flake) => (
                    <circle
                      key={flake.id}
                      cx={flake.x}
                      cy={0}
                      r={flake.r}
                      style={
                        {
                          '--memory-stars-delay': `${flake.delay.toFixed(1)}s`,
                          '--memory-stars-period': `${flake.period.toFixed(1)}s`,
                          '--memory-stars-drift': `${flake.drift.toFixed(1)}px`,
                        } as CSSProperties
                      }
                    />
                  ))}
                </g>
              </>
            ) : null}
            <path
              className="memory-stars-grass"
              d="M58 283l1.4-6 1 6M61 282.4l2-7.4.7 7.2M64 282l1.6-4.8.8 4.6M98 273l1.4-6 1 6M101.4 272.4l2.2-7.6.6 7.4M136 268l1.6-5.4.9 5.2M288 274l1.2-5.6 1 5.6M291 274.2l2-7 .8 7M362 268l1.4-6 .9 6M365.2 267.4l2-7.2.7 7"
            />
            <g
              className="memory-stars-telescope"
              data-looking={looking ? 'true' : undefined}
            >
              <path
                className="memory-stars-tripod"
                d="M240 244L231 267M240 244L240.5 268M240 244L249 266"
              />
              <g ref={tubeRef} className="memory-stars-tube">
                <rect
                  x={223.5}
                  y={242.4}
                  width={4}
                  height={3.2}
                  rx={0.8}
                  className="memory-stars-brass-dark"
                />
                <rect
                  x={227}
                  y={241.4}
                  width={26}
                  height={5.2}
                  rx={1.4}
                  fill={url('brass')}
                />
                <rect
                  x={236}
                  y={241}
                  width={2.2}
                  height={6}
                  rx={0.6}
                  className="memory-stars-brass-dark"
                />
                <rect
                  x={251.5}
                  y={240}
                  width={4.4}
                  height={8}
                  rx={1.2}
                  fill={url('brass')}
                />
                <path d="M229 242.7H250" className="memory-stars-brass-shine" />
                <circle
                  cx={255.6}
                  cy={244}
                  r={0.9}
                  className="memory-stars-lens"
                />
              </g>
              <circle
                cx={240}
                cy={244}
                r={1.5}
                className="memory-stars-brass-dark"
              />
            </g>
            {/* The two of you, seen from behind, next to each other: one
                head leans on the other's shoulder, one blanket around both. */}
            <g
              className="memory-stars-couple"
              transform="translate(165 222.5) scale(1.1)"
              data-looking={looking ? 'true' : undefined}
            >
              <path
                d="M3 39.5C2.4 31.5 4.6 24.4 10 21C13.6 18.8 18.6 18.9 21.8 21.2C25 23.6 26.2 30.6 24.6 39.5Z"
                className="memory-stars-figure"
              />
              <path
                d="M21.8 21.2C25 23.6 26.2 30.6 24.6 39.5"
                className="memory-stars-rim"
              />
              <path
                d="M29.8 39.5C28.6 30.5 30.2 23 34.6 20C37.8 17.8 43.2 17.7 46.6 20C51 23 52.8 30.4 51.8 39.5Z"
                className="memory-stars-figure"
              />
              <path
                d="M46.6 20C51 23 52.8 30.4 51.8 39.5"
                className="memory-stars-rim"
              />
              {/* The blanket around both shoulders, pinched between you. */}
              <path
                d="M4.4 27C6 22.4 11 19.6 16 19.8C19.8 20 22.6 21.6 24.4 23.4C26.4 24.6 28.4 24.4 30.4 22.6C33 20 37.6 18.6 41.6 18.8C46.6 19.2 50 22.6 51.2 27.4L51.8 31.6C47 33.6 41.6 33.4 37.4 31.8C34 30.6 30.6 30.6 27.4 31.6C24.6 32.8 21 33.4 17 33.2C11.6 33 7 31.6 3.6 30.6Z"
                fill={url('plaid')}
                className="memory-stars-blanket"
              />
              <path
                d="M3.6 30.6C7 31.6 11.6 33 17 33.2C21 33.4 24.6 32.8 27.4 31.6C30.6 30.6 34 30.6 37.4 31.8C41.6 33.4 47 33.6 51.8 31.6"
                className="memory-stars-hem"
              />
              <path
                d="M14 21.6C14.8 25 14.6 29 13.6 32.6M41 20.4C41.8 24 41.6 28.6 40.6 32.4"
                className="memory-stars-fold"
              />
              {/* The left one leans over onto the other's shoulder. */}
              <g className="memory-stars-lean">
                <circle
                  cx={23.4}
                  cy={15.2}
                  r={6}
                  className="memory-stars-figure"
                />
                <circle
                  cx={18.6}
                  cy={9.6}
                  r={2.9}
                  className="memory-stars-figure"
                />
                <circle
                  cx={23.4}
                  cy={15.2}
                  r={6}
                  pathLength={100}
                  strokeDasharray="22 78"
                  strokeDashoffset={25}
                  className="memory-stars-rim-arc"
                />
              </g>
              {/* The right one minds the telescope and turns to it. */}
              <g className="memory-stars-gazer">
                <circle
                  cx={40.4}
                  cy={13}
                  r={6.6}
                  className="memory-stars-figure"
                />
                <path
                  d="M33.6 13.2C33.6 5.6 47.2 5.6 47.2 13.2C43 12 38 12 33.6 13.2Z"
                  className="memory-stars-beanie"
                />
                <path
                  d="M34 12.8C38 11.8 43 11.8 46.8 12.8"
                  className="memory-stars-beanie-rib"
                />
                <circle
                  cx={40.4}
                  cy={5.6}
                  r={2.2}
                  className="memory-stars-beanie"
                />
                <circle
                  cx={40.4}
                  cy={13}
                  r={6.6}
                  pathLength={100}
                  strokeDasharray="18 82"
                  strokeDashoffset={10}
                  className="memory-stars-rim-arc"
                />
              </g>
            </g>
            {heartRun > 0 ? (
              <g key={heartRun} className="memory-stars-heart">
                <path
                  transform="translate(200 213)"
                  d="M0 2.6C-0.8 -0.6 -5 -0.4 -5 2.6C-5 5 -2 6.8 0 8.6C2 6.8 5 5 5 2.6C5 -0.4 0.8 -0.6 0 2.6Z"
                />
              </g>
            ) : null}
          </svg>

          {newest ? (
            <p
              className="memory-stars-newborn-note"
              data-side={newest.x > 250 ? 'left' : 'right'}
              aria-hidden="true"
              style={
                {
                  left: `${(newest.x / SKY_W) * 100}%`,
                  top: `${(newest.y / SKY_H) * 100}%`,
                  '--memory-stars-born': `${births.get(newest.entry.key) ?? 0}ms`,
                } as CSSProperties
              }
            >
              {t('memoryWorlds.stars.newborn')}
            </p>
          ) : null}

          {ambient ? (
            <span
              key={ambient.run}
              className="memory-stars-ambient"
              aria-hidden="true"
              style={
                {
                  left: `${ambient.x}%`,
                  top: `${ambient.y}%`,
                  '--memory-stars-angle': `${ambient.angle}deg`,
                } as CSSProperties
              }
            />
          ) : null}

          {/* A pencil note on the chart, until the first wish is made. */}
          <p
            className="memory-stars-note"
            data-hidden={taught ? 'true' : undefined}
            aria-hidden="true"
          >
            {t('memoryWorlds.stars.note')}
          </p>

          <button
            ref={scopeButtonRef}
            type="button"
            className="memory-stars-scope-button"
            aria-label={t('memoryWorlds.stars.scope')}
            onClick={tapScope}
          />

          {view && viewStar ? (
            <button
              ref={viewRef}
              type="button"
              className="memory-stars-view"
              data-kind={viewStar.entry.kind}
              data-phase={view.phase}
              aria-label={t('memoryWorlds.stars.view', entryLine(viewStar))}
              onClick={fromView}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                closeView(true);
              }}
              style={
                {
                  '--memory-stars-fx': `${view.fx.toFixed(1)}px`,
                  '--memory-stars-fy': `${view.fy.toFixed(1)}px`,
                } as CSSProperties
              }
            >
              <span className="memory-stars-view-lens" aria-hidden="true">
                <span className="memory-stars-view-far" />
                <span className="memory-stars-view-near" />
                <span className="memory-stars-view-haze" />
                <span className="memory-stars-view-bloom" />
                <span className="memory-stars-view-star" />
                <span className="memory-stars-view-reticle" />
              </span>
              <span className="memory-stars-view-label" aria-hidden="true">
                <span className="memory-stars-view-title">
                  {viewStar.entry.title}
                </span>
                <span className="memory-stars-view-date">
                  {viewStar.entry.dateLabel}
                </span>
                <span className="memory-stars-view-more">
                  {t('memoryWorlds.stars.viewMore')}
                </span>
              </span>
            </button>
          ) : null}
        </div>
        <button type="button" className="memory-stars-wish" onClick={wish}>
          {t('memoryWorlds.stars.wish')}
        </button>
      </div>

      <p id={descriptionId} className="sr-only">
        {t('memoryWorlds.stars.description')}
      </p>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {/* A little star-chart card for the star that is lit. */}
      <div className="memory-stars-card" ref={cardRef}>
        <span className="memory-stars-card-pin" aria-hidden="true" />
        <div className="memory-stars-card-body" key={selected.entry.key}>
          <p className="memory-stars-card-meta">
            <span>
              {total === 1
                ? t('memoryWorlds.stars.first')
                : total > stars.length
                  ? t('memoryWorlds.stars.oneOf', { count: total })
                  : t('memoryWorlds.stars.position', {
                      position: selected.index + 1,
                      count: total,
                    })}
            </span>
            <span>{seasonLabel(selected.entry.date, t)}</span>
          </p>
          <p className="memory-stars-card-kicker">
            {t('memoryWorlds.stars.since')}
          </p>
          <p className="memory-stars-card-date">
            <time dateTime={selected.entry.dateTime}>
              {selected.entry.dateLabel}
            </time>
          </p>
          <Link
            to={selected.entry.path}
            onClick={(event) =>
              onOpen(event, selected.entry.path, selected.entry.key)
            }
            className="memory-stars-card-memory"
            data-kind={selected.entry.kind}
            aria-label={t('memoryWorlds.stars.open', entryLine(selected))}
            draggable={false}
          >
            <Keepsake
              entry={selected.entry}
              loadMemoryImage={loadMemoryImage}
              develop
            />
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Mochis (#2283): the two of you as two little mochis on a pastel hill,
 * played with by touch. Push one over to the other to cuddle, pinch them
 * together with two fingers to hug, press one long for a kiss, tickle one
 * to make them laugh, tap a rhythm on the meadow (or shake the phone) to
 * make them dance. Each action lets a heart balloon with a memory from the
 * diary rise between them; earlier balloons float up into the sky and stay
 * openable. Thought bubbles hint at the gestures, the ones not tried yet
 * first; left alone, the two fall asleep.
 *
 * The left mochi wears the viewer's own person colour, the right one the
 * partner's (`--person-own-*`, `--person-partner-*`). Keyboard and screen
 * reader users get one named button per action and live announcements of
 * the action and the arriving memory. With reduced motion an action shows
 * its result (the balloon with its memory) at once.
 *
 * The idle loops (breathing, blinking, the balloon's sway, the sky's bob,
 * the clouds and stars) run for `--motion-ambient-repeat` cycles, pause
 * while the world is not seen (`data-ambient`, M8) and start again with
 * the next interaction once they have come to rest. Keyframes and timing
 * roles: src/motion/memory-worlds.css.
 */
import {
  type CSSProperties,
  type AnimationEvent as ReactAnimationEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { useFitText } from '../../client/fitText';
import { useTranslation } from '../../i18n';
import { type HapticKind, haptic } from '../../motion/haptics';
import { observeVisibility } from '../../motion/visibility';
import { MemoryPhoto } from './MemoryPhoto';
import {
  type LoadMemoryImage,
  type MemoryWorldEntry,
  type MemoryWorldProps,
  prefersReducedMotion,
} from './model';
import '../../motion/memory-worlds.css';
import './MemoryWorld.css';
import './MochiWorld.css';
import { WorldHead } from './WorldHead';

/** How long one action plays; the hop on a first action adds `FIRST_HOP_MS`. */
const ACT_MS = 2900;
const FIRST_HOP_MS = 550;
/** Where earlier balloons hang in the sky (x %, y %), newest last. */
const SKY_SLOTS: readonly [number, number][] = [
  [30, 4],
  [72, 9],
  [88, 3],
  [48, 1],
  [14, 14],
  [60, 15],
];
/** Without play for this long, the two fall asleep. */
const SLEEP_MS = 30000;
/** A press turns the face into a kiss mouth, and becomes a kiss. */
const PRESS_FACE_MS = 250;
const LONG_PRESS_MS = 650;
/** Thought bubbles: the first soon, later ones now and then. */
const HINT_FIRST_MS = 2200;
const HINT_NEXT_MS = 9000;
const HINT_SHOW_MS = 4200;
/** Travel that turns a press into a move. */
const MOVE_PX = 10;
/** Two fingers this much closer than they started: a hug. */
const PINCH_PX = 40;
/** Tickling: back-and-forth steps of at least this size, this often. */
const TICKLE_STEP_PX = 3;
const TICKLE_REVERSALS = 4;
/** Pushing: far enough towards the other one, without tickling. */
const CUDDLE_PX = 30;
const CUDDLE_MAX_REVERSALS = 3;
/** How far a mochi follows the finger towards (and away from) the other. */
const DRAG_TOWARD_PX = 46;
const DRAG_AWAY_PX = 24;
/** Three taps on the meadow in a steady rhythm start a dance. */
const TAP_COUNT = 3;
const TAP_WINDOW_MS = 1600;
const TAP_GAP_MIN_MS = 180;
const TAP_GAP_MAX_MS = 750;
/** The little notes where the meadow was tapped stay this many at most. */
const TAP_NOTES = 5;
/** Shaking: separate jolts of this strength, three within the window. */
const SHAKE_STRENGTH = 12;
const SHAKE_PEAKS = 3;
const SHAKE_PEAK_GAP_MS = 120;
const SHAKE_WINDOW_MS = 1100;
const SHAKE_COOLDOWN_MS = 1500;
/** How quickly the tracked gravity follows the device (0..1 per sample). */
const GRAVITY_FOLLOW = 0.1;
/** Sideways spread of the little things that fly up, in px, by index. */
const PARTICLE_SPREAD = [-38, 30, -14, 44, 8, -30];

export type MochiAction = 'cuddle' | 'kiss' | 'hug' | 'laugh' | 'dance';
type MochiPerson = 'own' | 'partner';
type MochiMouth = 'smile' | 'kiss' | 'laugh';
type MochiSound = 'kiss' | 'laugh' | 'giggle' | 'chuckle';
type Particle = { glyph: string } | { sound: MochiSound };

const PEOPLE: readonly MochiPerson[] = ['own', 'partner'];

const heart = { glyph: '♥' };
const sparkle = { glyph: '✦' };
const twinkle = { glyph: '✧' };
const note = { glyph: '♪' };
const notes = { glyph: '♫' };

/** What the two can do together, with the little things that fly up. */
export const MOCHI_ACTIONS: readonly {
  kind: MochiAction;
  particles: readonly Particle[];
  mouth: MochiMouth;
  /** Haptic beats after the action starts (a first action's hop comes first). */
  beats: readonly { at: number; kind: HapticKind }[];
}[] = [
  {
    kind: 'cuddle',
    particles: [heart, heart, heart, heart, heart, heart],
    mouth: 'smile',
    beats: [{ at: 150, kind: 'affection' }],
  },
  {
    kind: 'kiss',
    particles: [{ sound: 'kiss' }, heart, heart, heart],
    mouth: 'kiss',
    beats: [{ at: 420, kind: 'affection' }],
  },
  {
    kind: 'hug',
    particles: [sparkle, twinkle, sparkle, twinkle, sparkle, twinkle],
    mouth: 'smile',
    beats: [{ at: 350, kind: 'affection' }],
  },
  {
    kind: 'laugh',
    particles: [
      { sound: 'laugh' },
      { sound: 'giggle' },
      { sound: 'chuckle' },
      { sound: 'laugh' },
    ],
    mouth: 'laugh',
    beats: [
      { at: 100, kind: 'threshold' },
      { at: 420, kind: 'threshold' },
      { at: 740, kind: 'threshold' },
    ],
  },
  {
    kind: 'dance',
    particles: [note, notes, note, notes, note],
    mouth: 'smile',
    beats: [
      { at: 100, kind: 'threshold' },
      { at: 500, kind: 'threshold' },
      { at: 900, kind: 'threshold' },
      { at: 1300, kind: 'threshold' },
    ],
  },
];

const MOUTHS: Record<MochiMouth, string> = {
  smile: 'M0.8 1.6 Q 2.9 4.8 5 1.9 Q 7.1 4.8 9.2 1.6',
  kiss: 'M4.4 0.6 Q 7.4 1.4 5.2 2.9 Q 7.4 4.4 4.4 5.4',
  laugh: 'M1.4 1 Q 5 8.2 8.6 1 Z',
};

type HintKey = 'cuddle' | 'kiss' | 'hug' | 'laugh' | 'danceTap' | 'danceShake';

/** What the mochis wish for in their thought bubbles: the gesture for each action. */
const HINTS: Record<MochiAction, readonly { key: HintKey; by: MochiPerson }[]> =
  {
    cuddle: [{ key: 'cuddle', by: 'own' }],
    kiss: [{ key: 'kiss', by: 'partner' }],
    hug: [{ key: 'hug', by: 'own' }],
    laugh: [{ key: 'laugh', by: 'partner' }],
    dance: [
      { key: 'danceTap', by: 'own' },
      { key: 'danceShake', by: 'partner' },
    ],
  };

/** The idle loops that rest after their cycles and start again on play. */
const AMBIENT_KEYFRAMES = new Set(
  ['breathe', 'blink', 'sway', 'bob', 'drift', 'twinkle'].map(
    (name) => `eimir-motion-memory-mochi-${name}`,
  ),
);

type MochiPointer = {
  id: number;
  person: MochiPerson | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  lastX: number;
  dir: number;
  reversals: number;
  moved: boolean;
};

type Balloon = { index: number; run: number };

function personAt(target: EventTarget | null): MochiPerson | null {
  const element =
    target instanceof Element ? target.closest('.memory-mochi') : null;
  const person = element?.getAttribute('data-person');
  return person === 'own' || person === 'partner' ? person : null;
}

/** Restarts the idle loops that rested, on the next interaction. */
function useAmbientRestart() {
  const [epochs, setEpochs] = useState<Readonly<Record<string, number>>>({});
  const rested = useRef(new Set<string>());
  const onAnimationEnd = useCallback(
    (event: ReactAnimationEvent<HTMLElement>) => {
      if (!AMBIENT_KEYFRAMES.has(event.animationName)) return;
      const target = event.target as Element;
      const id = target
        .closest('[data-mochi-ambient]')
        ?.getAttribute('data-mochi-ambient');
      if (id) rested.current.add(id);
    },
    [],
  );
  const restart = useCallback(() => {
    if (rested.current.size === 0) return;
    const ids = [...rested.current];
    rested.current.clear();
    setEpochs((previous) => {
      const next = { ...previous };
      for (const id of ids) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
  }, []);
  const keyOf = (id: string) => `${id}-${epochs[id] ?? 0}`;
  return { onAnimationEnd, restart, keyOf };
}

/** One of the two little mochis: a soft round body with a face and tiny arms. */
function Mochi({
  person,
  happy,
  asleep,
  mouth,
  bodyKey,
  poke,
  dragX,
  snore,
}: {
  person: MochiPerson;
  happy: boolean;
  asleep: boolean;
  mouth: MochiMouth;
  bodyKey: string;
  poke: number;
  dragX: number;
  snore: string;
}) {
  return (
    <span
      className="memory-mochi"
      data-person={person}
      data-happy={happy ? 'true' : undefined}
      data-asleep={asleep && !happy ? 'true' : undefined}
      data-dragging={dragX !== 0 ? 'true' : undefined}
      style={{ '--memory-mochi-drag': dragX } as CSSProperties}
      aria-hidden="true"
    >
      <span className="memory-mochi-shadow" />
      <span
        className="memory-mochi-body"
        key={bodyKey}
        data-mochi-ambient={person}
        data-poked={poke > 0 ? 'true' : undefined}
      >
        <span className="memory-mochi-arm" data-side="start" />
        <span className="memory-mochi-arm" data-side="end" />
        {person === 'own' ? (
          <span className="memory-mochi-sprout" />
        ) : (
          <span className="memory-mochi-bow" />
        )}
        <span className="memory-mochi-eye" data-side="start" />
        <span className="memory-mochi-eye" data-side="end" />
        <span className="memory-mochi-blush" data-side="start" />
        <span className="memory-mochi-blush" data-side="end" />
        <svg
          className="memory-mochi-mouth"
          data-shape={mouth}
          viewBox="0 0 10 6"
          aria-hidden="true"
          focusable="false"
        >
          <path d={MOUTHS[mouth]} />
        </svg>
      </span>
      {poke > 0 ? (
        <span className="memory-mochi-giggle" key={`giggle-${poke}`}>
          ♥
        </span>
      ) : null}
      {asleep && !happy && person === 'own' ? (
        <span className="memory-mochi-zzz">{snore}</span>
      ) : null}
    </span>
  );
}

/** Words inside a heart that always fit it (`client/fitText`). */
function HeartWords({ text, minPx }: { text: string; minPx: number }) {
  const { boxRef, textRef } = useFitText<HTMLSpanElement, HTMLSpanElement>(
    text,
    minPx,
  );
  return (
    <span ref={boxRef} className="memory-mochi-heart-text">
      {/* The text is written by the fitting, outside React. */}
      <span ref={textRef} className="memory-mochi-heart-words" />
    </span>
  );
}

/** Words in the big balloon never shrink below this, in px. */
const HEART_TEXT_MIN_PX = 12;
/** The small balloons in the sky may get tiny: they are a glimpse. */
const SKY_TEXT_MIN_PX = 5;

/** A heart-shaped balloon showing one memory. */
function MochiHeart({
  entry,
  loadMemoryImage,
  size,
}: {
  entry: MemoryWorldEntry;
  loadMemoryImage: LoadMemoryImage;
  size: 'large' | 'small';
}) {
  return (
    <div className="memory-mochi-heart" data-kind={entry.kind} data-size={size}>
      <div className="memory-mochi-heart-inner">
        {entry.kind === 'photo' ? (
          <MemoryPhoto entry={entry} loadMemoryImage={loadMemoryImage} />
        ) : (
          <HeartWords
            text={entry.title}
            minPx={size === 'large' ? HEART_TEXT_MIN_PX : SKY_TEXT_MIN_PX}
          />
        )}
      </div>
      <span className="memory-mochi-heart-shine" aria-hidden="true" />
    </div>
  );
}

/** Pauses the idle loops while the world is not seen (M8). */
function useAmbientVisibility(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return observeVisibility(root, (state) => {
      root.dataset.ambient = state.visible ? 'on' : 'paused';
    });
  }, [rootRef]);
}

export function MochiWorld({
  entries,
  loadMemoryImage,
  onOpen,
}: MemoryWorldProps) {
  const { t } = useTranslation();
  const order = useMemo(() => {
    const lead = entries.find((entry) => entry.isLead) ?? entries[0];
    return lead ? [lead, ...entries.filter((entry) => entry !== lead)] : [];
  }, [entries]);
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const [acting, setActing] = useState<{
    kind: MochiAction;
    run: number;
    first: boolean;
  } | null>(null);
  const [together, setTogether] = useState(false);
  const [pokes, setPokes] = useState<Record<MochiPerson, number>>({
    own: 0,
    partner: 0,
  });
  const [drag, setDrag] = useState<Record<MochiPerson, number>>({
    own: 0,
    partner: 0,
  });
  const [pressing, setPressing] = useState<MochiPerson | null>(null);
  const [asleep, setAsleep] = useState(false);
  const [hint, setHint] = useState<{
    key: HintKey;
    by: MochiPerson;
    id: number;
  } | null>(null);
  const [taps, setTaps] = useState<{ x: number; y: number; id: number }[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const discovered = useRef(new Set<MochiAction>());
  const timers = useRef<number[]>([]);
  const pointers = useRef(new Map<number, MochiPointer>());
  const pinchStart = useRef<number | null>(null);
  const longPress = useRef<number | undefined>(undefined);
  const tapTimes = useRef<number[]>([]);
  const idle = useRef<number | undefined>(undefined);
  const actingRef = useRef(false);
  const actRef = useRef<(kind: MochiAction) => void>(() => undefined);
  const nextId = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  const ambient = useAmbientRestart();
  const restartAmbient = ambient.restart;
  useAmbientVisibility(rootRef);

  // Falling asleep after a while without play; any play wakes them.
  const wake = useCallback(() => {
    setAsleep(false);
    restartAmbient();
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => {
      setAsleep(true);
      setHint(null);
      setAnnouncement(t('memoryWorlds.mochi.asleep'));
    }, SLEEP_MS);
  }, [restartAmbient, t]);
  useEffect(() => {
    wake();
    return () => {
      window.clearTimeout(idle.current);
      window.clearTimeout(longPress.current);
      for (const timer of timers.current) window.clearTimeout(timer);
    };
  }, [wake]);

  // Thought bubbles: now and then one of them wishes for something, first
  // for the things not tried yet.
  useEffect(() => {
    if (asleep || acting || order.length === 0) return;
    const timer = window.setTimeout(
      () => {
        const kinds = MOCHI_ACTIONS.map((item) => item.kind);
        const open = kinds.filter((kind) => !discovered.current.has(kind));
        const pool = open.length ? open : kinds;
        const kind = pool[Math.floor(Math.random() * pool.length)];
        const options = HINTS[kind];
        const choice = options[Math.floor(Math.random() * options.length)];
        nextId.current += 1;
        setHint({ ...choice, id: nextId.current });
        timers.current.push(
          window.setTimeout(() => setHint(null), HINT_SHOW_MS),
        );
      },
      hint === null && balloons.length === 0 ? HINT_FIRST_MS : HINT_NEXT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [asleep, acting, hint, balloons.length, order.length]);

  // Shaking the phone makes them dance (where motion events need no prompt).
  useEffect(() => {
    let peaks: number[] = [];
    let lastShake = 0;
    // Many Android devices only report acceleration including gravity:
    // track gravity slowly and use what is left as the shake.
    const gravity = { x: 0, y: 0, z: 0, ready: false };
    const onMotion = (event: DeviceMotionEvent) => {
      const raw = event.accelerationIncludingGravity;
      if (!raw || raw.x === null || raw.y === null || raw.z === null) return;
      if (!gravity.ready) {
        gravity.x = raw.x;
        gravity.y = raw.y;
        gravity.z = raw.z;
        gravity.ready = true;
        return;
      }
      gravity.x += (raw.x - gravity.x) * GRAVITY_FOLLOW;
      gravity.y += (raw.y - gravity.y) * GRAVITY_FOLLOW;
      gravity.z += (raw.z - gravity.z) * GRAVITY_FOLLOW;
      const strength = Math.hypot(
        raw.x - gravity.x,
        raw.y - gravity.y,
        raw.z - gravity.z,
      );
      if (strength < SHAKE_STRENGTH) return;
      const now = performance.now();
      if (now - lastShake < SHAKE_COOLDOWN_MS) return;
      // Count separate peaks, not every sample of one jolt.
      if (peaks.length && now - peaks[peaks.length - 1] < SHAKE_PEAK_GAP_MS)
        return;
      peaks = [...peaks.filter((at) => now - at < SHAKE_WINDOW_MS), now];
      if (peaks.length >= SHAKE_PEAKS) {
        peaks = [];
        lastShake = now;
        actRef.current('dance');
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, []);

  if (order.length === 0) return null;
  const current = balloons[balloons.length - 1];
  // Earlier balloons in the sky: each memory once, never the one held now.
  const sky = balloons
    .slice(0, -1)
    .filter(
      (balloon, position, all) =>
        balloon.index !== current?.index &&
        !all.slice(position + 1).some((other) => other.index === balloon.index),
    )
    .slice(-SKY_SLOTS.length);
  const reduce = prefersReducedMotion();
  const action = acting
    ? MOCHI_ACTIONS.find((item) => item.kind === acting.kind)
    : undefined;

  const act = (kind: MochiAction) => {
    if (actingRef.current) return;
    const spec = MOCHI_ACTIONS.find((item) => item.kind === kind);
    if (!spec) return;
    discovered.current.add(kind);
    wake();
    setHint(null);
    setPressing(null);
    setDrag({ own: 0, partner: 0 });
    const index = current ? (current.index + 1) % order.length : 0;
    const run = (current?.run ?? 0) + 1;
    setBalloons((previous) => [...previous, { index, run }]);
    const arriving = order[index];
    setAnnouncement(
      `${t(`memoryWorlds.mochi.acted.${kind}`)} ${t(
        'memoryWorlds.mochi.rises',
        {
          title: arriving.title,
          date: arriving.dateLabel,
        },
      )}`,
    );
    const first = !together;
    setTogether(true);
    if (reduce) {
      haptic('affection');
      return;
    }
    actingRef.current = true;
    setActing({ kind, run, first });
    for (const timer of timers.current) window.clearTimeout(timer);
    const lead = first ? FIRST_HOP_MS : 0;
    timers.current = [
      ...spec.beats.map((beat) =>
        window.setTimeout(() => haptic(beat.kind), lead + beat.at),
      ),
      window.setTimeout(() => {
        actingRef.current = false;
        setActing(null);
      }, ACT_MS + lead),
    ];
  };
  actRef.current = act;

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    wake();
    if (actingRef.current) return;
    if (event.target instanceof Element && event.target.closest('a')) return;
    const person = personAt(event.target);
    pointers.current.set(event.pointerId, {
      id: event.pointerId,
      person,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      dir: 0,
      reversals: 0,
      moved: false,
    });
    if (person) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture can fail for pointers the browser no longer tracks.
      }
    }
    if (pointers.current.size === 2) {
      // Two fingers: a pinch, no long press.
      window.clearTimeout(longPress.current);
      setPressing(null);
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }
    if (person) {
      const pointerId = event.pointerId;
      window.clearTimeout(longPress.current);
      longPress.current = window.setTimeout(
        () => setPressing(person),
        PRESS_FACE_MS,
      );
      timers.current.push(
        window.setTimeout(() => {
          const pointer = pointers.current.get(pointerId);
          if (pointer && !pointer.moved && pointers.current.size === 1)
            actRef.current('kiss');
        }, LONG_PRESS_MS),
      );
    }
  };

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointers.current.get(event.pointerId);
    if (!pointer || actingRef.current) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const dx = pointer.x - pointer.startX;
    if (
      !pointer.moved &&
      Math.hypot(dx, pointer.y - pointer.startY) > MOVE_PX
    ) {
      pointer.moved = true;
      window.clearTimeout(longPress.current);
      setPressing(null);
    }
    if (pointers.current.size === 2 && pinchStart.current !== null) {
      const [a, b] = [...pointers.current.values()];
      if (Math.hypot(a.x - b.x, a.y - b.y) < pinchStart.current - PINCH_PX) {
        pinchStart.current = null;
        act('hug');
      }
      return;
    }
    if (!pointer.person) return;
    // Tickling: quick back and forth on one of them.
    const step = pointer.x - pointer.lastX;
    if (Math.abs(step) >= TICKLE_STEP_PX) {
      const dir = Math.sign(step);
      if (pointer.dir !== 0 && dir !== pointer.dir) {
        pointer.reversals += 1;
        haptic('threshold');
        if (pointer.reversals >= TICKLE_REVERSALS) {
          act('laugh');
          return;
        }
      }
      pointer.dir = dir;
      pointer.lastX = pointer.x;
    }
    // Pushing: the mochi follows the finger a little.
    const person = pointer.person;
    const toward = person === 'own' ? dx : -dx;
    const limited = Math.max(-DRAG_AWAY_PX, Math.min(DRAG_TOWARD_PX, toward));
    setDrag((previous) => ({
      ...previous,
      [person]: person === 'own' ? limited : -limited,
    }));
  };

  const onUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    window.clearTimeout(longPress.current);
    setPressing(null);
    if (!pointer || actingRef.current) {
      setDrag({ own: 0, partner: 0 });
      return;
    }
    const dx = pointer.x - pointer.startX;
    if (pointer.person) {
      const person = pointer.person;
      const toward = person === 'own' ? dx : -dx;
      setDrag({ own: 0, partner: 0 });
      if (
        pointer.moved &&
        toward > CUDDLE_PX &&
        pointer.reversals < CUDDLE_MAX_REVERSALS
      ) {
        act('cuddle');
      } else if (!pointer.moved) {
        haptic('press');
        setPokes((previous) => ({
          ...previous,
          [person]: previous[person] + 1,
        }));
      }
      return;
    }
    // A tap on the meadow: three in a row, in rhythm, start a dance.
    if (!pointer.moved) {
      const box = scene.current?.getBoundingClientRect();
      if (box) {
        nextId.current += 1;
        const id = nextId.current;
        setTaps((previous) => [
          ...previous.slice(-(TAP_NOTES - 1)),
          { x: pointer.x - box.left, y: pointer.y - box.top, id },
        ]);
      }
      haptic('threshold');
      const now = performance.now();
      const recent = [
        ...tapTimes.current.filter((at) => now - at < TAP_WINDOW_MS),
        now,
      ];
      tapTimes.current = recent;
      if (recent.length >= TAP_COUNT) {
        const gaps = recent.slice(1).map((at, index) => at - recent[index]);
        const steady = gaps.every(
          (gap) => gap > TAP_GAP_MIN_MS && gap < TAP_GAP_MAX_MS,
        );
        if (steady) {
          tapTimes.current = [];
          act('dance');
        }
      }
    }
  };

  const onCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    pinchStart.current = null;
    window.clearTimeout(longPress.current);
    setPressing(null);
    setDrag({ own: 0, partner: 0 });
  };

  const currentEntry = current ? order[current.index] : null;
  const mouthFor = (person: MochiPerson): MochiMouth =>
    action?.mouth ?? (pressing === person ? 'kiss' : 'smile');
  const bodyKey = (person: MochiPerson) =>
    `${pokes[person]}-${acting?.run ?? 0}-${asleep ? 'asleep' : 'awake'}-${ambient.keyOf(person)}`;
  const openLabel = (entry: MemoryWorldEntry) =>
    t('memoryWorlds.mochi.open', { title: entry.title, date: entry.dateLabel });

  return (
    <div ref={rootRef} className="memory-mochi-world">
      <WorldHead heading={t('memoryWorlds.mochi.heading')} />
      {/* biome-ignore lint/a11y/useSemanticElements: the meadow is a named group of the mochis and their balloons, not a form fieldset. */}
      <div
        ref={scene}
        className="memory-mochi-scene"
        role="group"
        aria-roledescription={t('memoryWorlds.mochi.roleDescription')}
        aria-label={t('memoryWorlds.mochi.label')}
        aria-describedby={descriptionId}
        data-together={together ? 'true' : undefined}
        data-action={acting?.kind}
        data-first={acting?.first ? 'true' : undefined}
        data-asleep={asleep && !acting ? 'true' : undefined}
        data-primary-tab-swipe-block
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onAnimationEnd={ambient.onAnimationEnd}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="memory-mochi-sky-body" aria-hidden="true">
          <span className="memory-mochi-face-eye" data-side="start" />
          <span className="memory-mochi-face-eye" data-side="end" />
          <span className="memory-mochi-face-mouth" />
          <span className="memory-mochi-moon-z">
            {t('memoryWorlds.mochi.sound.moon')}
          </span>
        </span>
        <span
          key={ambient.keyOf('stars')}
          className="memory-mochi-stars"
          data-mochi-ambient="stars"
          aria-hidden="true"
        />
        {(['1', '2'] as const).map((n) => (
          <span
            key={ambient.keyOf(`cloud-${n}`)}
            className="memory-mochi-cloud"
            data-n={n}
            data-mochi-ambient={`cloud-${n}`}
            aria-hidden="true"
          />
        ))}
        {sky.length > 0 ? (
          <ul
            className="memory-mochi-sky"
            aria-label={t('memoryWorlds.mochi.sky')}
          >
            {sky.map((balloon, index) => {
              const entry = order[balloon.index];
              const [x, y] = SKY_SLOTS[index % SKY_SLOTS.length];
              const id = `sky-${balloon.run}`;
              return (
                <li
                  key={balloon.run}
                  className="memory-mochi-sky-slot"
                  style={
                    {
                      '--memory-mochi-x': `${x}%`,
                      '--memory-mochi-y': `${y}%`,
                      '--memory-mochi-sky-index': index,
                    } as CSSProperties
                  }
                >
                  <Link
                    to={entry.path}
                    onClick={(event) => onOpen(event, entry.path, entry.key)}
                    className="memory-mochi-sky-balloon"
                    aria-label={openLabel(entry)}
                    draggable={false}
                  >
                    <span
                      key={ambient.keyOf(id)}
                      className="memory-mochi-sky-float"
                      data-mochi-ambient={id}
                    >
                      <MochiHeart
                        entry={entry}
                        loadMemoryImage={loadMemoryImage}
                        size="small"
                      />
                      <span
                        className="memory-mochi-sky-string"
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
        <span className="memory-mochi-hill" aria-hidden="true" />
        {taps.map((tap) => (
          <span
            key={tap.id}
            className="memory-mochi-tap"
            style={
              {
                '--memory-mochi-tap-x': `${tap.x}px`,
                '--memory-mochi-tap-y': `${tap.y}px`,
              } as CSSProperties
            }
            aria-hidden="true"
          >
            ♪
          </span>
        ))}
        {current && currentEntry ? (
          <Link
            key={current.run}
            to={currentEntry.path}
            onClick={(event) =>
              onOpen(event, currentEntry.path, currentEntry.key)
            }
            className="memory-mochi-balloon"
            data-animate={reduce ? undefined : 'true'}
            data-first={current.run === 1 ? 'true' : undefined}
            aria-label={openLabel(currentEntry)}
            draggable={false}
          >
            <span
              key={ambient.keyOf(`balloon-${current.run}`)}
              className="memory-mochi-balloon-sway"
              data-mochi-ambient={`balloon-${current.run}`}
            >
              <MochiHeart
                entry={currentEntry}
                loadMemoryImage={loadMemoryImage}
                size="large"
              />
              <span className="memory-mochi-tag">
                <strong>{currentEntry.title}</strong>
                <time dateTime={currentEntry.dateTime}>
                  {currentEntry.dateLabel}
                </time>
              </span>
              <svg
                className="memory-mochi-string"
                viewBox="0 0 20 80"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M10 0 C 16 20, 4 40, 10 58 S 8 74, 10 80" />
              </svg>
            </span>
          </Link>
        ) : null}
        <div className="memory-mochi-pair">
          {PEOPLE.map((person) => (
            <Mochi
              key={person}
              person={person}
              happy={!!acting}
              asleep={asleep}
              mouth={mouthFor(person)}
              bodyKey={bodyKey(person)}
              poke={pokes[person]}
              dragX={drag[person]}
              snore={t('memoryWorlds.mochi.sound.snore')}
            />
          ))}
          {hint && !acting ? (
            <span
              className="memory-mochi-thought"
              data-person={hint.by}
              key={hint.id}
              aria-hidden="true"
            >
              {t(`memoryWorlds.mochi.hint.${hint.key}`)}
            </span>
          ) : null}
          {acting && action ? (
            <span
              className="memory-mochi-particles"
              key={acting.run}
              aria-hidden="true"
            >
              {action.particles.map((particle, index) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: the particles of one action never change.
                  key={index}
                  data-word={'sound' in particle ? 'true' : undefined}
                  style={
                    {
                      '--memory-mochi-particle-dx': `${PARTICLE_SPREAD[index % PARTICLE_SPREAD.length]}px`,
                      '--memory-mochi-particle-index': index,
                    } as CSSProperties
                  }
                >
                  {'sound' in particle
                    ? t(`memoryWorlds.mochi.sound.${particle.sound}`)
                    : particle.glyph}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      </div>
      <p id={descriptionId} className="sr-only">
        {t('memoryWorlds.mochi.description')}
      </p>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {/* The gestures have keyboard and screen reader equivalents; the row
          shows itself while one of its buttons has the keyboard focus. */}
      {/* biome-ignore lint/a11y/useSemanticElements: a named row of buttons, not a form fieldset. */}
      <div
        className="memory-mochi-actions"
        role="group"
        aria-label={t('memoryWorlds.mochi.actions')}
      >
        {MOCHI_ACTIONS.map((item) => (
          <button
            key={item.kind}
            type="button"
            className="memory-mochi-action"
            data-kind={item.kind}
            onClick={() => act(item.kind)}
            aria-disabled={acting ? true : undefined}
          >
            {t(`memoryWorlds.mochi.action.${item.kind}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

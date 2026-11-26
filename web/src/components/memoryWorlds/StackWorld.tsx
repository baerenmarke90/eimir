/**
 * Stapel (#2283): the rediscovery selection as a loose pile of prints. On
 * first open every print is tossed onto the pile from another side; then the
 * top print is swiped sideways to the back of the pile, or tapped to open
 * the memory. A sideways drag captures the pointer only once it is a drag,
 * so a tap still reaches the link. Keyboard and screen reader users get a
 * hidden "next" button and live announcements.
 */
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { haptic } from '../../motion/haptics';
import { Keepsake } from './MemoryPhoto';
import {
  type MemoryWorldEntry,
  type MemoryWorldProps,
  prefersReducedMotion,
} from './model';
import '../../motion/memory-worlds.css';
import './MemoryWorld.css';
import './StackWorld.css';
import { useWorldEntered } from './WorldEnter';
import { WorldHead } from './WorldHead';

/** The top print travelling to the back (or from the back), in ms. */
const TUCK_MS = 760;
/** Opening the pile: every print falls onto it, one after another. */
const FALL_STAGGER_MS = 230;
const FALL_MS = 700;
/** At most this many prints are thrown; the whole throw stays under ~3 s. */
const FALL_MAX = 10;
const FALL_SPAN_MS = 2100;
/** Browsing starts this long after the last print has landed. */
const LANDED_PAUSE_MS = 300;
/** Sideways travel that starts a drag, and that puts the print back. */
const DRAG_START_PX = 8;
const VERTICAL_CANCEL_PX = 10;
const TUCK_THRESHOLD_PX = 60;
/** Drag distance at which the next print has fully come up. */
const PULL_FULL_PX = 160;
/** A click right after a drag is not a tap. */
const CLICK_GUARD_MS = 80;

function fallStep(falls: number) {
  return falls > 1 ? Math.min(FALL_STAGGER_MS, FALL_SPAN_MS / (falls - 1)) : 0;
}

/** Resting poses of the pile, from the top print backwards. */
const POSES = [
  'translate(0px, 0px) rotate(-1.5deg) scale(1)',
  'translate(3%, -24px) rotate(2.5deg) scale(0.95)',
  'translate(-3%, -48px) rotate(-3deg) scale(0.9)',
];
const BACK_POSE = 'translate(2%, -72px) rotate(1.5deg) scale(0.85)';

/** Each print is tossed in from another side (vw, vh). */
const FLY_FROM: readonly [number, number][] = [
  [-110, -10],
  [95, -80],
  [-90, 70],
  [110, 15],
  [-85, -85],
  [90, 75],
  [0, -110],
  [-110, 40],
];

type Slot = number | 'back';

function wrap(index: number, count: number) {
  return ((index % count) + count) % count;
}

function pileLayout(entries: MemoryWorldEntry[], index: number) {
  const count = entries.length;
  const at = (offset: number) => entries[wrap(index + offset, count)];
  const cards: { entry: MemoryWorldEntry; depth: Slot }[] = Array.from(
    { length: Math.min(3, count) },
    (_, depth) => ({ entry: at(depth), depth }),
  );
  // With more than three prints the back of the pile is visible too: that is
  // where the top print goes, and where a print comes back from.
  if (count > 3) cards.push({ entry: at(-1), depth: 'back' });
  return cards;
}

function fallStyle(fall: number) {
  const [x, y] = FLY_FROM[fall % FLY_FROM.length];
  return {
    '--fall-i': fall,
    '--fall-x': `${x}vw`,
    '--fall-y': `${y}vh`,
    '--fall-r': `${(((fall * 47) % 80) - 40) * 1.5}deg`,
  };
}

export function StackWorld({
  entries,
  kicker,
  loadMemoryImage,
  onOpen,
}: MemoryWorldProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  // The print that is travelling: to the back (tuck) or from the back (untuck).
  const [travel, setTravel] = useState<{
    key: string;
    kind: 'tuck' | 'untuck';
    dir: 1 | -1;
    from: number;
  } | null>(null);
  // Prints that leave the visible pile fade out where they are.
  const [ghosts, setGhosts] = useState<
    { entry: MemoryWorldEntry; depth: Slot }[]
  >([]);
  // A print develops the first time it reaches the top and stays developed.
  const [developed, setDeveloped] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const start = useRef<{
    x: number;
    y: number;
    id: number;
    dragging: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const busy = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // The pile can only be browsed once every print has landed on it.
  const [landed, setLanded] = useState(() => prefersReducedMotion());
  // The prints fall only once the world is seen (WorldEnter).
  const entered = useWorldEntered();
  const count = entries.length;
  const hasEntries = count > 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the throw runs once when the prints are there; later changes do not replay it.
  useEffect(() => {
    if (landed || !hasEntries || !entered) return;
    const falls = Math.min(count, FALL_MAX);
    const step = fallStep(falls);
    const timers = Array.from({ length: falls }, (_, fall) =>
      window.setTimeout(() => haptic('threshold'), fall * step + FALL_MS),
    );
    timers.push(
      window.setTimeout(
        () => setLanded(true),
        (falls - 1) * step + FALL_MS + LANDED_PAUSE_MS,
      ),
    );
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [hasEntries, entered]);
  if (count === 0) return null;

  const cards = pileLayout(entries, index);
  // Fall order: a handful of the prints hidden in the pile first, then the
  // visible ones from the back to the top.
  const fallers = landed
    ? []
    : entries
        .filter((entry) => !cards.some((card) => card.entry.key === entry.key))
        .slice(0, Math.max(0, FALL_MAX - cards.length));
  const step = fallStep(fallers.length + cards.length);
  const visible = Math.min(3, count);
  const fallIndex = (depth: Slot) =>
    depth === 'back'
      ? fallers.length
      : fallers.length + (count > 3 ? 1 : 0) + (visible - 1 - depth);
  const current = cards[0].entry;
  const backPose = count > 3 ? BACK_POSE : POSES[Math.min(3, count) - 1];

  const move = (direction: 1 | -1, side: 1 | -1) => {
    if (count < 2 || busy.current) return;
    const key = current.key;
    setDeveloped((previous) =>
      previous.has(key) ? previous : new Set(previous).add(key),
    );
    const nextIndex = index + direction;
    const nextKeys = new Set(
      pileLayout(entries, nextIndex).map((card) => card.entry.key),
    );
    setIndex(nextIndex);
    setDrag(0);
    if (prefersReducedMotion()) return;
    busy.current = true;
    setGhosts(cards.filter((card) => !nextKeys.has(card.entry.key)));
    setTravel({
      key: direction === 1 ? key : entries[wrap(nextIndex, count)].key,
      kind: direction === 1 ? 'tuck' : 'untuck',
      dir: side,
      from: direction === 1 ? drag : 0,
    });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setTravel(null);
      setGhosts([]);
      busy.current = false;
    }, TUCK_MS);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (busy.current || !landed) return;
    start.current = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
      dragging: false,
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = start.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.dragging) {
      if (Math.abs(dy) > VERTICAL_CANCEL_PX && Math.abs(dy) > Math.abs(dx)) {
        start.current = null;
        return;
      }
      if (Math.abs(dx) < DRAG_START_PX) return;
      gesture.dragging = true;
      suppressClick.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may already be gone (e.g. a cancelled touch).
      }
    }
    setDrag(dx);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = start.current;
    start.current = null;
    if (!gesture?.dragging) return;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, CLICK_GUARD_MS);
    const dx = event.clientX - gesture.x;
    if (Math.abs(dx) > TUCK_THRESHOLD_PX) move(1, dx < 0 ? -1 : 1);
    else setDrag(0);
  };

  const pull = Math.min(1, Math.abs(drag) / PULL_FULL_PX);
  const rendered = [
    ...cards.map((card) => ({ ...card, ghost: false })),
    ...ghosts
      .filter(
        (ghost) => !cards.some((card) => card.entry.key === ghost.entry.key),
      )
      .map((ghost) => ({ ...ghost, ghost: true })),
  ];
  const order = (depth: Slot) => (depth === 'back' ? 3 : depth);

  return (
    <div className="memory-stack-world">
      <WorldHead heading={t('memoryWorlds.stack.heading')}>
        <span className="memory-world-muted" aria-live="polite">
          {t('memoryWorlds.stack.position', {
            position: wrap(index, count) + 1,
            count,
          })}
        </span>
      </WorldHead>
      {/* biome-ignore lint/a11y/useSemanticElements: the pile is a named group of prints, not a form fieldset. */}
      <div
        className="memory-stack"
        data-primary-tab-swipe-block
        data-pulling={drag !== 0 ? 'true' : undefined}
        data-landing={landed ? undefined : 'true'}
        style={
          {
            '--pull': pull,
            '--fall-step': `${step}ms`,
            '--memory-stack-tuck-duration': `${TUCK_MS}ms`,
          } as CSSProperties
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          start.current = null;
          setDrag(0);
        }}
        onClickCapture={(event) => {
          if (!landed) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (!suppressClick.current) return;
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        role="group"
        aria-roledescription={t('memoryWorlds.stack.roleDescription')}
        aria-label={t('memoryWorlds.stack.label')}
        aria-busy={landed ? undefined : true}
      >
        {fallers.map((entry, fall) => (
          <div
            key={`fall-${entry.key}`}
            className="memory-stack-card"
            data-depth="back"
            data-faller="true"
            style={
              { ...fallStyle(fall), '--back-pose': backPose } as CSSProperties
            }
            aria-hidden="true"
          >
            <Keepsake entry={entry} loadMemoryImage={loadMemoryImage} />
          </div>
        ))}
        {rendered
          .slice()
          .sort((a, b) => order(b.depth) - order(a.depth))
          .map(({ entry, depth, ghost }) => {
            const isTop = depth === 0 && !ghost;
            const travelling = travel?.key === entry.key ? travel : null;
            const wasDeveloped = developed.has(entry.key);
            return (
              <div
                key={entry.key}
                className="memory-stack-card"
                data-depth={depth}
                data-ghost={ghost ? 'true' : undefined}
                data-motion={travelling?.kind}
                data-developed={wasDeveloped ? 'true' : undefined}
                data-dragging={isTop && drag !== 0 ? 'true' : undefined}
                style={
                  {
                    '--drag': isTop ? drag : 0,
                    '--tuck-from': travelling?.from ?? 0,
                    '--tuck-dir': travelling?.dir ?? -1,
                    '--back-pose': backPose,
                    ...(landed || ghost ? {} : fallStyle(fallIndex(depth))),
                  } as CSSProperties
                }
                aria-hidden={!isTop}
              >
                {isTop ? (
                  <Link
                    to={entry.path}
                    className="memory-stack-open"
                    onClick={(event) => onOpen(event, entry.path, entry.key)}
                    aria-label={t('memoryWorlds.stack.open', {
                      title: entry.title,
                    })}
                    draggable={false}
                  >
                    <Keepsake
                      entry={entry}
                      loadMemoryImage={loadMemoryImage}
                      develop={entry.kind === 'milestone' && !wasDeveloped}
                      kicker={entry.isLead ? kicker : undefined}
                    />
                  </Link>
                ) : (
                  <Keepsake
                    entry={entry}
                    loadMemoryImage={loadMemoryImage}
                    kicker={entry.isLead ? kicker : undefined}
                  />
                )}
              </div>
            );
          })}
      </div>
      {/* Without a visible button row, keyboard and screen reader users still
          get a way to the next print. */}
      <button
        type="button"
        className="sr-only"
        onClick={() => move(1, -1)}
        disabled={count < 2 || !landed}
      >
        {t('memoryWorlds.stack.next')}
      </button>
      <p className="sr-only" aria-live="polite">
        {!landed
          ? t('memoryWorlds.stack.landing')
          : count < 2
            ? t('memoryWorlds.stack.hintSingle')
            : t('memoryWorlds.stack.hint')}
      </p>
    </div>
  );
}

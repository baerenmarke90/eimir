/**
 * Life in the shared garden (#1907 H3, PR 3): visiting animals that wander
 * while the page is open and react to a tap, and a small plane that crosses
 * the sky now and then, sometimes towing a banner with `liebe Worte`.
 *
 * The garden stays continuously animated while it is open (Product Owner
 * decision 2026-11-16, "so bleibt er lebhaft"). Movement runs on animation
 * frames that write transforms directly, so the page does not re-render per
 * frame. With reduced motion the visitors stand still, nothing flies, and a
 * tap shows its reaction as a pose change without movement.
 */

import {
  type KeyboardEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { GardenUnlock } from '../api/generated/models/GardenUnlock';
import { blob, groundBack, groundFront } from '../client/garden';
import {
  ANIMAL_LAYER,
  type AnimalLayer,
  availableAnimals,
  type GardenAnimal,
  maxVisitors,
  POND,
  TREE_X,
} from '../client/gardenGrowth';

type Pose = 'rest' | 'graze' | 'curl' | 'hide' | 'alert' | 'quack';
type Style = 'walk' | 'hop' | 'leap' | 'climb';

interface Animal {
  id: number;
  kind: GardenAnimal;
  x: number;
  dir: 1 | -1;
  pose: Pose;
  moving: boolean;
  frame: number;
}

const TICK_MS = 3200;
const r1 = (n: number) => Math.round(n * 10) / 10;

function animalY(kind: GardenAnimal, x: number): number {
  const layer = ANIMAL_LAYER[kind];
  if (layer === 'back') return groundBack(x) + 8;
  if (layer === 'pond') return POND.cy + 3;
  return groundFront(x) + 26;
}

function Eye({ x, y, r = 0.9 }: { x: number; y: number; r?: number }) {
  return (
    <path
      d={`M${x} ${y - r} C${r1(x + r * 1.1)} ${y - r} ${r1(x + r * 1.1)} ${y + r} ${x} ${y + r} C${r1(x - r * 1.1)} ${y + r} ${r1(x - r * 1.1)} ${y - r} ${x} ${y - r}Z`}
      fill="var(--garden-dark)"
    />
  );
}

function DeerLeg({ x, bend }: { x: number; bend: number }) {
  return (
    <path
      d={`M${r1(x - 1.3)} -14 C${r1(x - 1.5)} -9 ${r1(x - 0.7 + bend)} -5 ${r1(x - 0.7 + bend)} -0.4 L${r1(x + 0.9 + bend)} -0.4 C${r1(x + 1)} -5 ${r1(x + 1.2)} -9 ${r1(x + 1.3)} -14Z`}
      fill="var(--garden-deer)"
    />
  );
}

function hedgehogCoat(
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
  n: number,
): string {
  let d = '';
  for (let k = 0; k <= n; k += 1) {
    const a = from + (to - from) * (k / n);
    const a2 = from + (to - from) * ((k + 0.5) / n);
    if (k === 0)
      d += `M${r1(cx + Math.cos(a) * r)} ${r1(cy + Math.sin(a) * r * 0.86)}`;
    if (k < n) {
      const next = from + (to - from) * ((k + 1) / n);
      d += ` Q${r1(cx + Math.cos(a2) * r * 1.22)} ${r1(cy + Math.sin(a2) * r * 1.05)} ${r1(cx + Math.cos(next) * r)} ${r1(cy + Math.sin(next) * r * 0.86)}`;
    }
  }
  return d;
}

function snailShell(): string {
  let d = '';
  for (let k = 0; k <= 26; k += 1) {
    const t = k / 26;
    const a = -Math.PI / 2 + t * Math.PI * 3.4;
    const r = 5.6 * (1 - t * 0.86);
    d += `${k ? ' L' : 'M'}${r1(-1 + Math.cos(a) * r)} ${r1(-7.6 + Math.sin(a) * r)}`;
  }
  return d;
}

const SHELL = snailShell();

/** Animals face right with their feet at y = 0. */
export function AnimalArt({
  kind,
  pose,
  quack,
}: {
  kind: GardenAnimal;
  pose: Pose;
  quack?: string;
}): ReactElement {
  if (kind === 'rabbit') {
    return (
      <g>
        <path
          d="M-10.6 0 C-13.6 -6 -9.6 -14.6 -1.4 -14.6 C4.6 -14.6 8 -9.6 7.2 -3.6 C6.8 -1.2 5.2 0 3 0Z"
          fill="var(--garden-fur)"
        />
        <path
          d="M5.6 -17.6 C3.8 -23.6 3.6 -30.6 6.6 -31.8 C9 -32.2 9 -25 8.6 -17.6Z"
          fill="var(--garden-fur)"
        />
        <path
          d="M6 -19.6 C5 -24 5.2 -28.4 6.6 -29.6 C7.6 -28 7.6 -23.6 7.4 -19.6Z"
          fill="var(--person-own-accent)"
          opacity={0.45}
        />
        <path
          d="M8.8 -17.6 C8.8 -23.6 10.8 -29.8 13.4 -30 C15.4 -29.2 13.4 -23 11.2 -17.2Z"
          fill="var(--garden-fur)"
        />
        <path
          d="M2.6 -12 C1.6 -16.6 5.4 -20 9.6 -19.4 C13.8 -18.8 15.4 -15 13.4 -11.6 C11.6 -8.8 5.6 -8.4 2.6 -12Z"
          fill="var(--garden-fur)"
        />
        <Eye x={10} y={-15} />
        <path
          d="M-10.4 -8 C-13.4 -8.6 -14.2 -4.6 -11.6 -3.6 C-9.6 -3 -8.4 -6.6 -10.4 -8Z"
          fill="var(--garden-tail)"
        />
      </g>
    );
  }
  if (kind === 'squirrel') {
    return (
      <g>
        <path
          d="M-3 -2 C-12 -1 -16.6 -9 -13.6 -16.6 C-10.6 -23.6 -2.6 -24.6 -1.2 -19.2 C-.2 -15.4 -5 -15.2 -7 -12 C-9 -8.4 -7.2 -4.2 -3 -2Z"
          fill="var(--garden-squirrel)"
        />
        <path
          d="M-4.4 0 C-7.4 -3 -6.4 -11.4 -1 -13.2 C3.4 -14.4 6.4 -10.4 5.2 -5 C4.8 -2 3 0 0 0Z"
          fill="var(--garden-squirrel)"
        />
        <path
          d="M1 -12 C0 -16.2 3.4 -19.2 7.4 -18.4 C10.6 -17.8 11.4 -14.8 9.8 -12.6 C8.2 -10.8 4.2 -10.4 1 -12Z"
          fill="var(--garden-squirrel)"
        />
        <path
          d="M3.4 -17.4 C3.4 -19.4 3.8 -21.4 4.4 -22.4 C5.6 -21 5.8 -19 5.4 -17.6Z"
          fill="var(--garden-squirrel)"
        />
        <Eye x={6.6} y={-15} r={0.8} />
        <path
          d="M4.6 -7.2 C5.4 -8 7.4 -7.8 7.6 -6.2 C7.6 -4.6 5.4 -4.4 4.8 -5.6Z"
          fill="var(--garden-trunk)"
        />
      </g>
    );
  }
  if (kind === 'hedgehog') {
    if (pose === 'curl') {
      return (
        <g>
          <path
            d={`${hedgehogCoat(0, -7.4, 7, 0, Math.PI * 2, 14)}Z`}
            fill="var(--garden-spike)"
          />
          <path
            d={blob(0, -7.4, 6.2, 5.6, 6, 0.05)}
            fill="var(--garden-hedgehog)"
          />
        </g>
      );
    }
    return (
      <g>
        <path
          d={`${hedgehogCoat(-1, -1, 11, Math.PI, Math.PI * 1.92, 11)} L9 0 L-12 0Z`}
          fill="var(--garden-spike)"
        />
        <path
          d="M-10 -1 C-10 -8 -4 -10.4 1 -10.4 C5 -10.4 8 -8 8.6 -4.6 L8 0 L-10 0Z"
          fill="var(--garden-hedgehog)"
        />
        <path
          d="M5.6 -6.6 C9 -6.6 12.6 -4 14.6 -1.6 C13.6 -.4 11 0 7.4 0 C5.6 -1.6 4.8 -4.6 5.6 -6.6Z"
          fill="var(--garden-face)"
        />
        <path
          d="M14 -2.6 C15.2 -2.8 15.8 -1.6 14.8 -1 C14.2 -.8 13.6 -1.6 14 -2.6Z"
          fill="var(--garden-dark)"
        />
        <Eye x={9.6} y={-4.4} r={0.75} />
      </g>
    );
  }
  if (kind === 'snail') {
    return (
      <g>
        {pose === 'hide' ? null : (
          <g>
            <path
              d="M-12 0 C-12 -2.2 -8 -3 0 -3 C6 -3 9.4 -4 11.6 -8 C12.6 -9.8 14.6 -10 15.2 -8 C15.8 -5 13.8 -1 8.6 0Z"
              fill="var(--garden-snail)"
            />
            <path
              d="M12 -8.6 C11.4 -11 11 -13 11.4 -14.6 M13.6 -8.8 C13.8 -11.2 14.4 -13 15.4 -14.2"
              stroke="var(--garden-snail)"
              strokeWidth={1.1}
              strokeLinecap="round"
              fill="none"
            />
            <Eye x={11.4} y={-15} r={0.7} />
            <Eye x={15.4} y={-14.6} r={0.7} />
          </g>
        )}
        <path
          d={blob(-1, -7.6, 7, 6.6, 6, 0.04, 0.3)}
          fill="var(--garden-shell)"
        />
        <path
          d={SHELL}
          stroke="var(--garden-soil)"
          strokeWidth={1.2}
          strokeLinecap="round"
          fill="none"
          opacity={0.55}
        />
      </g>
    );
  }
  if (kind === 'ducks') {
    // A duck pair; each wing carries one person colour.
    const duck = (x: number, wing: string) => (
      <g transform={`translate(${x} 0)`}>
        <path
          d="M-9.6 -3.4 C-11.6 -4.4 -12.4 -7 -11.4 -8 C-9.6 -6.6 -7 -6.2 -1 -6.8 C2 -7 3.6 -8.2 4.6 -10.6 C5.4 -13.4 8 -15 10.6 -14 C13 -13 13.2 -10.4 12.2 -9 C10.6 -7.2 10.2 -4.6 8.8 -2.4 C7 0 3 .6 -1 .4 C-5 .2 -8 -1.2 -9.6 -3.4Z"
          fill="var(--garden-duck)"
        />
        <path
          d="M12 -10.8 C13.4 -11.2 15.6 -10.8 16.6 -10 C15.6 -9 13.6 -8.8 12 -9.4Z"
          fill="var(--garden-sun)"
        />
        <path
          d="M-6.4 -4.6 C-4.4 -8.4 2.6 -8.4 4 -5 C1.4 -3 -3.6 -2.8 -6.4 -4.6Z"
          fill={wing}
        />
        <Eye x={9.6} y={-11.4} r={0.7} />
        <path
          d="M-12 .6 C-6 2.4 6 2.4 11 .6"
          stroke="var(--garden-water-highlight)"
          strokeWidth={1}
          strokeLinecap="round"
          fill="none"
          opacity={0.7}
        />
      </g>
    );
    return (
      <g>
        {duck(0, 'var(--person-own-accent)')}
        {duck(-17, 'var(--person-partner-accent)')}
        {pose === 'quack' && quack ? (
          <g className="garden-quack">
            <path
              d="M-8 -26 C-8 -28 -6 -28.4 -3 -28.4 L14 -28.4 C17 -28.4 18.6 -28 18.6 -26 L18.6 -19.6 C18.6 -17.6 17 -17 14 -17 L-3 -17 C-6 -17 -8 -17.6 -8 -19.6Z"
              fill="var(--garden-card)"
            />
            <text
              x={5}
              y={-20.4}
              textAnchor="middle"
              className="garden-quack-text"
            >
              {quack}
            </text>
          </g>
        ) : null}
      </g>
    );
  }
  // Deer: grazing with the head down, alert with the head up.
  return (
    <g>
      <DeerLeg x={-9} bend={-0.6} />
      <DeerLeg x={-6.2} bend={0.6} />
      <DeerLeg x={6.4} bend={-0.6} />
      <DeerLeg x={9.2} bend={0.6} />
      <path
        d="M-12.4 -16 C-13.4 -21 -8 -23.2 -2 -22.6 C4 -22 8 -23 11 -21 C13.2 -19.4 13.2 -16 11.6 -14 C8 -12.4 -2 -12 -8 -12.6 C-11 -13 -12.4 -14 -12.4 -16Z"
        fill="var(--garden-deer)"
      />
      <path
        d="M-12.6 -17.6 C-14.2 -15.6 -13 -13.2 -10.8 -13.2 C-11.4 -14.8 -11.4 -16.4 -12.6 -17.6Z"
        fill="var(--garden-tail)"
      />
      <g transform={pose === 'graze' ? 'rotate(64 10 -20)' : undefined}>
        <path
          d="M8 -21 C9 -26 11 -31 13 -33 C14.6 -35 18 -35.6 20.2 -34 C21.8 -33 21.8 -31.4 20.2 -31 C18 -30.6 16.6 -30 15.6 -28 C14 -25 13 -21 11.6 -18Z"
          fill="var(--garden-deer)"
        />
        <path
          d="M13.6 -34 C12 -37.4 12 -40 13.6 -40.4 C15.2 -39.6 15.4 -36.6 14.8 -34.4Z"
          fill="var(--garden-deer)"
        />
        <path
          d="M15.6 -34.6 C16.2 -37.8 17.8 -39.4 18.8 -38.8 C19.4 -37.2 18 -35.2 16.8 -34Z"
          fill="var(--garden-deer)"
        />
        <Eye x={16.6} y={-33} r={0.75} />
      </g>
    </g>
  );
}

export function Plane() {
  return (
    <g>
      <path
        d="M-14 0 C-14 -2.6 -8 -3.6 2 -3.6 C8 -3.6 12 -2.2 14.4 0 C12 2.2 8 3.2 2 3.2 C-8 3.2 -14 2.6 -14 0Z"
        fill="var(--garden-plane)"
      />
      <path
        d="M-12.6 -1.2 C-13.6 -5.4 -12 -8.6 -9.6 -8.8 C-9.2 -6.4 -8.6 -3.6 -7.4 -2.4Z"
        fill="var(--person-own-accent)"
      />
      <path
        d="M-2 .6 C-4 3.6 -6 7.2 -7 9.4 C-5.6 9.8 -4.4 9.6 -3.6 9 C-1 6.4 1.6 3.4 3 1.2Z"
        fill="var(--garden-plane)"
      />
      <path
        d="M-12 1.4 C-6 2.6 6 2.6 12.6 .8"
        stroke="var(--person-partner-accent)"
        strokeWidth={1}
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

function Banner({ text }: { text: string }) {
  const width = Math.max(60, text.length * 4.6 + 16);
  return (
    <g>
      <path
        d="M-14 1 L-26 1"
        stroke="var(--garden-ink)"
        strokeWidth={0.6}
        opacity={0.6}
      />
      <g transform={`translate(${r1(-26 - width)} -6)`}>
        <path
          d={`M0 0 C${r1(width * 0.3)} -2 ${r1(width * 0.7)} 2 ${r1(width)} 0 C${r1(width - 1)} 4 ${r1(width - 1)} 8 ${r1(width)} 12 C${r1(width * 0.7)} 14 ${r1(width * 0.3)} 10 0 12 C2 10 3.4 8 4 6 C3.4 4 2 2 0 0Z`}
          fill="var(--garden-banner)"
        />
        <text
          x={r1(width / 2 + 2)}
          y={8.4}
          textAnchor="middle"
          className="garden-banner-text"
        >
          {text}
        </text>
      </g>
    </g>
  );
}

export interface PlaneFlight {
  key: number;
  text: string | null;
  onDone?: () => void;
}

export interface GardenLifeLabels {
  animal: (kind: GardenAnimal) => string;
  quack: string;
}

/**
 * Visitors and the occasional plane. Returns the art for each scene layer and
 * the tap targets, which the scene places after its plants.
 */
export function useGardenLife({
  width,
  sharedDays,
  unlocks,
  lively,
  reduced,
  visitors,
  labels,
  onReaction,
}: {
  width: number;
  sharedDays: number;
  unlocks: ReadonlyArray<GardenUnlock>;
  /** Continuous ambient motion while the page is open. */
  lively: boolean;
  reduced: boolean;
  /** False while nobody may visit (for example a sleeping garden). */
  visitors: boolean;
  labels: GardenLifeLabels;
  onReaction?: (kind: GardenAnimal) => void;
}) {
  const animals = useRef(new Map<number, Animal>());
  const arts = useRef(new Map<number, SVGGElement>());
  const targets = useRef(new Map<number, SVGGElement>());
  const timers = useRef<number[]>([]);
  const sequence = useRef(0);
  const [, setVersion] = useState(0);
  const [plane, setPlane] = useState<PlaneFlight | null>(null);
  const planeRef = useRef<SVGGElement | null>(null);
  const trailRef = useRef<SVGPathElement | null>(null);
  const settings = useRef({ width, sharedDays, unlocks, reduced, visitors });
  settings.current = { width, sharedDays, unlocks, reduced, visitors };

  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  const place = useCallback((animal: Animal, lift = 0) => {
    const y = animalY(animal.kind, animal.x) - lift;
    const transform = `translate(${r1(animal.x)} ${r1(y)}) scale(${animal.dir} 1)`;
    arts.current.get(animal.id)?.setAttribute('transform', transform);
    targets.current
      .get(animal.id)
      ?.setAttribute('transform', `translate(${r1(animal.x)} ${r1(y)})`);
  }, []);

  const remove = useCallback(
    (animal: Animal) => {
      window.cancelAnimationFrame(animal.frame);
      animals.current.delete(animal.id);
      refresh();
    },
    [refresh],
  );

  const move = useCallback(
    (
      animal: Animal,
      toX: number,
      ms: number,
      style: Style,
      done?: () => void,
    ) => {
      window.cancelAnimationFrame(animal.frame);
      if (settings.current.reduced) {
        animal.x = toX;
        place(animal);
        done?.();
        return;
      }
      const from = animal.x;
      const start = performance.now();
      animal.dir = toX >= from ? 1 : -1;
      animal.moving = true;
      const hops = Math.max(
        1,
        Math.round(Math.abs(toX - from) / (style === 'leap' ? 45 : 22)),
      );
      const art = arts.current.get(animal.id);
      const step = (now: number) => {
        if (!animals.current.has(animal.id)) return;
        const k = Math.min(1, (now - start) / ms);
        animal.x = from + (toX - from) * k;
        const phase = (k * hops) % 1;
        const lift =
          style === 'hop'
            ? Math.sin(phase * Math.PI) * 9
            : style === 'leap'
              ? Math.sin(phase * Math.PI) * 22
              : style === 'climb'
                ? k * 52
                : Math.abs(Math.sin(k * hops * Math.PI)) * 1.2;
        place(animal, lift);
        if (style === 'climb') art?.setAttribute('opacity', String(1 - k));
        if (k < 1) animal.frame = window.requestAnimationFrame(step);
        else {
          animal.moving = false;
          done?.();
        }
      };
      animal.frame = window.requestAnimationFrame(step);
    },
    [place],
  );

  const spawn = useCallback(() => {
    const { width: w, sharedDays: days, unlocks: found } = settings.current;
    const present = new Set(
      [...animals.current.values()].map((animal) => animal.kind),
    );
    const free = availableAnimals(days, found).filter(
      (kind) => !present.has(kind),
    );
    if (free.length === 0) return;
    const kind = free[Math.floor(Math.random() * free.length)];
    sequence.current += 1;
    const animal: Animal = {
      id: sequence.current,
      kind,
      x: 0,
      dir: 1,
      pose: kind === 'deer' ? 'graze' : 'rest',
      moving: false,
      frame: 0,
    };
    const target = 40 + Math.random() * (w - 110);
    const arrivals: Record<GardenAnimal, () => void> = {
      rabbit: () => {
        animal.x = -24;
        move(animal, target, 2600, 'hop');
      },
      hedgehog: () => {
        animal.x = w + 20;
        move(animal, w - 60 - Math.random() * (w / 2), 5200, 'walk');
      },
      snail: () => {
        animal.x = 30 + Math.random() * (w - 80);
        move(animal, animal.x + 26, 9000, 'walk');
      },
      ducks: () => {
        animal.x = POND.cx - POND.rx + 12;
        move(animal, POND.cx + 6, 4200, 'walk');
      },
      squirrel: () => {
        animal.x = -20;
        move(animal, TREE_X - 12, 2200, 'hop');
      },
      deer: () => {
        animal.x = w - 70;
        animal.dir = -1;
        place(animal);
      },
    };
    animals.current.set(animal.id, animal);
    refresh();
    // Wait one frame so the new element exists before it starts to move.
    window.requestAnimationFrame(() => {
      if (animals.current.has(animal.id)) arrivals[kind]();
    });
  }, [move, place, refresh]);

  const inFlight = useRef<PlaneFlight | null>(null);
  const fly = useCallback((text: string | null, onDone?: () => void) => {
    if (settings.current.reduced) {
      onDone?.();
      return;
    }
    // A plane already in the sky stays; only words may take over a plain flight.
    if (inFlight.current && (text === null || inFlight.current.text !== null))
      return;
    const flight = { key: Date.now(), text, onDone };
    inFlight.current = flight;
    setPlane(flight);
  }, []);

  // Visitors arrive when the garden opens; the plane comes by now and then.
  useEffect(() => {
    if (!visitors) {
      for (const animal of animals.current.values())
        window.cancelAnimationFrame(animal.frame);
      animals.current.clear();
      refresh();
      return;
    }
    const max = maxVisitors(settings.current.sharedDays);
    const count = Math.max(
      0,
      Math.min(max, 1 + Math.floor(Math.random() * max)) - animals.current.size,
    );
    for (let k = 0; k < count; k += 1) later(spawn, 500 + k * 900);
    if (!settings.current.reduced && Math.random() < 0.25)
      later(() => fly(null), 1500);
  }, [visitors, spawn, fly, later, refresh]);

  // Ambient life while the page is open (stops with reduced motion).
  useEffect(() => {
    if (!lively || reduced || !visitors) return;
    const tick = () => {
      if (document.hidden) return;
      const { width: w, sharedDays: days } = settings.current;
      const idle = [...animals.current.values()].filter(
        (animal) =>
          !animal.moving && !['curl', 'hide', 'alert'].includes(animal.pose),
      );
      if (idle.length > 0) {
        const animal = idle[Math.floor(Math.random() * idle.length)];
        const span = {
          rabbit: 44,
          snail: 12,
          hedgehog: 34,
          ducks: 16,
          squirrel: 34,
          deer: 18,
        }[animal.kind];
        const low = animal.kind === 'ducks' ? POND.cx - POND.rx + 14 : 24;
        const high = animal.kind === 'ducks' ? POND.cx + POND.rx - 6 : w - 30;
        const to = Math.max(
          low,
          Math.min(
            high,
            animal.x +
              (Math.random() < 0.5 ? -1 : 1) *
                span *
                (0.5 + Math.random() * 0.5),
          ),
        );
        if (animal.kind === 'deer') {
          animal.pose = Math.random() < 0.6 ? 'graze' : 'rest';
          refresh();
        }
        move(
          animal,
          to,
          {
            rabbit: 1400,
            snail: 6500,
            hedgehog: 2800,
            ducks: 3200,
            squirrel: 900,
            deer: 3400,
          }[animal.kind],
          animal.kind === 'rabbit' || animal.kind === 'squirrel'
            ? 'hop'
            : 'walk',
        );
      }
      const max = maxVisitors(days);
      if (animals.current.size < max && Math.random() < 0.3) spawn();
      else if (animals.current.size >= max && Math.random() < 0.07) {
        const leaver = [...animals.current.values()].find(
          (animal) =>
            !animal.moving &&
            animal.kind !== 'ducks' &&
            animal.kind !== 'snail',
        );
        if (leaver)
          move(
            leaver,
            leaver.x > w / 2 ? w + 40 : -40,
            leaver.kind === 'deer' ? 3000 : 2000,
            leaver.kind === 'deer' ? 'leap' : 'hop',
            () => remove(leaver),
          );
      }
      if (Math.random() < 0.05) fly(null);
    };
    const interval = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(interval);
  }, [lively, reduced, visitors, move, spawn, remove, fly, refresh]);

  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
      for (const animal of animals.current.values())
        window.cancelAnimationFrame(animal.frame);
    },
    [],
  );

  // The plane crosses the sky once per flight.
  useEffect(() => {
    if (!plane || !planeRef.current) return;
    const element = planeRef.current;
    const trail = trailRef.current;
    const w = settings.current.width;
    const y = plane.text ? 34 : 24 + Math.random() * 14;
    const bannerWidth = plane.text
      ? Math.max(60, plane.text.length * 4.6 + 16)
      : 0;
    const startX = -40 - bannerWidth;
    const endX = w + 30;
    const ms = (plane.text ? 9000 : 7000) * Math.max(1, w / 420);
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const x = startX + (endX - startX) * k;
      element.setAttribute(
        'transform',
        `translate(${r1(x)} ${r1(y + Math.sin(k * 6) * 2)})`,
      );
      if (trail && !plane.text) {
        trail.setAttribute(
          'd',
          `M${r1(Math.max(startX, x - 120))} ${r1(y)} H${r1(x - 12)}`,
        );
      }
      if (k < 1) frame = window.requestAnimationFrame(step);
      else {
        inFlight.current = null;
        setPlane(null);
        plane.onDone?.();
      }
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [plane]);

  const tap = useCallback(
    (id: number) => {
      const animal = animals.current.get(id);
      if (!animal) return;
      const w = settings.current.width;
      const quiet = settings.current.reduced;
      // A tap always answers, even while the visitor is on its way.
      if (animal.moving) {
        window.cancelAnimationFrame(animal.frame);
        animal.moving = false;
        place(animal);
      }
      onReaction?.(animal.kind);
      const pose = (next: Pose, ms: number) => {
        animal.pose = next;
        refresh();
        later(() => {
          if (!animals.current.has(animal.id)) return;
          animal.pose = animal.kind === 'deer' ? 'graze' : 'rest';
          refresh();
        }, ms);
      };
      switch (animal.kind) {
        case 'rabbit':
          move(animal, w + 30, 1300, 'hop', () => remove(animal));
          break;
        case 'squirrel':
          move(animal, animal.x + 12, 700, 'climb', () => remove(animal));
          break;
        case 'hedgehog':
          pose('curl', 2200);
          break;
        case 'snail':
          pose('hide', 1800);
          break;
        case 'ducks':
          pose('quack', 1400);
          move(
            animal,
            animal.x + (Math.random() < 0.5 ? -14 : 14),
            1200,
            'walk',
          );
          break;
        case 'deer':
          // Startled: head up, a short pause, then it bounds away.
          animal.pose = 'alert';
          refresh();
          later(
            () =>
              move(animal, animal.x > w / 2 ? w + 40 : -40, 1400, 'leap', () =>
                remove(animal),
              ),
            quiet ? 0 : 280,
          );
          break;
      }
    },
    [later, move, onReaction, place, refresh, remove],
  );

  const bindArt = (animal: Animal) => (element: SVGGElement | null) => {
    if (element) {
      arts.current.set(animal.id, element);
      place(animal);
    } else arts.current.delete(animal.id);
  };
  const bindTarget = (animal: Animal) => (element: SVGGElement | null) => {
    if (element) {
      targets.current.set(animal.id, element);
      place(animal);
    } else targets.current.delete(animal.id);
  };

  const list = [...animals.current.values()];

  const layer = (which: AnimalLayer) => (
    <g data-testid={`garden-animals-${which}`}>
      {list
        .filter(
          (animal) =>
            ANIMAL_LAYER[animal.kind] === which &&
            (which !== 'pond' || unlocks.includes('POND')),
        )
        .map((animal) => (
          <g key={animal.id} ref={bindArt(animal)} className="garden-animal">
            <AnimalArt
              kind={animal.kind}
              pose={animal.pose}
              quack={labels.quack}
            />
          </g>
        ))}
    </g>
  );

  const onKey = (event: KeyboardEvent<SVGGElement>, id: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      tap(id);
    }
  };

  const tapTargets = (
    <g>
      {list.map((animal) => (
        // biome-ignore lint/a11y/useSemanticElements: an SVG animal cannot be a native button
        <g
          key={animal.id}
          ref={bindTarget(animal)}
          role="button"
          tabIndex={0}
          aria-label={labels.animal(animal.kind)}
          className="garden-animal-target"
          data-testid={`garden-animal-${animal.kind}`}
          data-pose={animal.pose}
          onClick={() => tap(animal.id)}
          onKeyDown={(event) => onKey(event, animal.id)}
        >
          <rect
            x={animal.kind === 'ducks' ? -30 : -16}
            y={animal.kind === 'deer' ? -42 : -26}
            width={animal.kind === 'ducks' ? 50 : 34}
            height={animal.kind === 'deer' ? 46 : 30}
            rx={10}
            fill="transparent"
          />
        </g>
      ))}
    </g>
  );

  const sky = plane ? (
    <g key={plane.key} data-testid="garden-plane">
      {plane.text ? null : (
        <path
          ref={trailRef}
          d="M-200 0 H-200"
          stroke="var(--garden-contrail)"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      )}
      <g ref={planeRef} transform="translate(-200 0)">
        {plane.text ? <Banner text={plane.text} /> : null}
        <Plane />
      </g>
    </g>
  ) : null;

  return { layer, tapTargets, sky, fly, spawn };
}

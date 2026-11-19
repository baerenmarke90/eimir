/**
 * Life in the shared garden (#1907 H3, PR 3): visiting animals that wander
 * while the page is open and react to a tap, and a small plane that crosses
 * the sky now and then, sometimes towing a banner with `liebe Worte`.
 *
 * The garden stays continuously animated while it is open (Product Owner
 * decision 2026-11-16, "so bleibt er lebhaft"). Movement runs on animation
 * frames that write transforms directly, so the page does not re-render per
 * frame; idle micro-motion (blinking, nibbling, bobbing, a tail flick) is CSS
 * on the art's groups. With reduced motion the visitors stand still, nothing
 * flies, and a tap shows its reaction as a pose change without movement.
 *
 * A tap plays each visitor's own little scene (#1907 H3 follow-up): the snail
 * pulls its stalks in and slides into its shell, the rabbit hops away and
 * comes back from the other side, the hedgehog rolls up, the ducks quack and
 * paddle, the squirrel climbs into the tree crown and peeks out, the deer
 * looks up, leaps away and later walks back. A named visitor's name floats
 * above it for a moment.
 */

import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { GardenUnlock } from '../api/generated/models/GardenUnlock';
import { blob, groundBack, groundFront } from '../client/garden';
import { sceneElement } from '../client/gardenSceneLayers';
import {
  ANIMAL_LAYER,
  type AnimalLayer,
  availableAnimals,
  type GardenAnimal,
  maxVisitors,
  POND,
  TREE_X,
} from '../client/gardenGrowth';

type Pose =
  | 'rest'
  | 'graze'
  | 'curl'
  | 'hide'
  | 'alert'
  | 'quack'
  | 'perk'
  | 'climb'
  | 'peek'
  | 'hello';
type Style = 'walk' | 'hop' | 'leap';

interface Animal {
  id: number;
  kind: GardenAnimal;
  x: number;
  dir: 1 | -1;
  pose: Pose;
  moving: boolean;
  /** Playing its tap reaction; idle wandering and leaving wait for it. */
  reacting: boolean;
  /** Degrees; the squirrel turns upright to climb the trunk. */
  tilt: number;
  frame: number;
}

interface Hearts {
  key: number;
  x: number;
  y: number;
}

interface NameTag {
  key: number;
  x: number;
  y: number;
  width: number;
  text: string;
}

/** How long each reaction pose lasts (ms). */
const REACTION_MS: Record<GardenAnimal, number> = {
  snail: 2000,
  rabbit: 1600,
  hedgehog: 3000,
  ducks: 2600,
  squirrel: 1600,
  deer: 2000,
};
/** The snail takes its time to come out again; the hedgehog uncurls. */
const RECOVER_MS = 1300;
const NAME_TAG_MS = 1900;
/** A called visitor hops or waves this long, with a few hearts. */
const GREET_MS = 1800;
/** When a called visitor that just arrives is close enough to greet. */
const CALL_ARRIVAL_MS: Record<GardenAnimal, number> = {
  snail: 800,
  rabbit: 2700,
  hedgehog: 2000,
  ducks: 1200,
  squirrel: 2300,
  deer: 600,
};

const TICK_MS = 3200;
const r1 = (n: number) => Math.round(n * 10) / 10;

function animalY(kind: GardenAnimal, x: number): number {
  const layer = ANIMAL_LAYER[kind];
  if (layer === 'back') return groundBack(x) + 8;
  if (layer === 'pond') return POND.cy + 3;
  return groundFront(x) + 26;
}

function Eye({
  x,
  y,
  r = 0.9,
  blink = false,
}: {
  x: number;
  y: number;
  r?: number;
  blink?: boolean;
}) {
  return (
    <path
      className={blink ? 'garden-blink' : undefined}
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

/**
 * Animals face right with their feet at y = 0. Each moving part is its own
 * group so CSS can animate it (`transform-box: fill-box`): idle micro-motion
 * runs only in a lively scene, and the pose (`data-pose` on the wrapper)
 * drives each tap reaction. Without the scene (the garden book) the art is
 * still.
 */
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
        <g className="garden-rabbit-head">
          <g className="garden-rabbit-ears">
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
          </g>
          <path
            d="M2.6 -12 C1.6 -16.6 5.4 -20 9.6 -19.4 C13.8 -18.8 15.4 -15 13.4 -11.6 C11.6 -8.8 5.6 -8.4 2.6 -12Z"
            fill="var(--garden-fur)"
          />
          <Eye x={10} y={-15} blink />
        </g>
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
        <g className="garden-squirrel-tail">
          <path
            d="M-3 -2 C-12 -1 -16.6 -9 -13.6 -16.6 C-10.6 -23.6 -2.6 -24.6 -1.2 -19.2 C-.2 -15.4 -5 -15.2 -7 -12 C-9 -8.4 -7.2 -4.2 -3 -2Z"
            fill="var(--garden-squirrel)"
          />
        </g>
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
        <Eye x={6.6} y={-15} r={0.8} blink />
        <path
          d="M4.6 -7.2 C5.4 -8 7.4 -7.8 7.6 -6.2 C7.6 -4.6 5.4 -4.4 4.8 -5.6Z"
          fill="var(--garden-trunk)"
        />
      </g>
    );
  }
  if (kind === 'hedgehog') {
    // Curling up: the face tucks in, the spikes bristle and it rolls.
    return (
      <g className="garden-hedgehog-roll">
        <path
          className="garden-hedgehog-spikes"
          d={`${hedgehogCoat(-1, -1, 11, Math.PI, Math.PI * 1.92, 11)} L9 0 L-12 0Z`}
          fill="var(--garden-spike)"
        />
        <path
          d="M-10 -1 C-10 -8 -4 -10.4 1 -10.4 C5 -10.4 8 -8 8.6 -4.6 L8 0 L-10 0Z"
          fill="var(--garden-hedgehog)"
        />
        <g className="garden-hedgehog-face">
          <path
            d="M5.6 -6.6 C9 -6.6 12.6 -4 14.6 -1.6 C13.6 -.4 11 0 7.4 0 C5.6 -1.6 4.8 -4.6 5.6 -6.6Z"
            fill="var(--garden-face)"
          />
          <path
            d="M14 -2.6 C15.2 -2.8 15.8 -1.6 14.8 -1 C14.2 -.8 13.6 -1.6 14 -2.6Z"
            fill="var(--garden-dark)"
          />
          <Eye x={9.6} y={-4.4} r={0.75} blink />
        </g>
      </g>
    );
  }
  if (kind === 'snail') {
    // Hiding: the stalks retract first, then the body slides into the shell.
    return (
      <g>
        <g className="garden-snail-body">
          <path
            className="garden-snail-foot"
            d="M-12 0 C-12 -2.2 -8 -3 0 -3 C6 -3 9.4 -4 11.6 -8 C12.6 -9.8 14.6 -10 15.2 -8 C15.8 -5 13.8 -1 8.6 0Z"
            fill="var(--garden-snail)"
          />
        </g>
        <g className="garden-snail-stalks">
          <path
            d="M12 -8.6 C11.4 -11 11 -13 11.4 -14.6 M13.6 -8.8 C13.8 -11.2 14.4 -13 15.4 -14.2"
            stroke="var(--garden-snail)"
            strokeWidth={1.1}
            strokeLinecap="round"
            fill="none"
          />
          <Eye x={11.4} y={-15} r={0.7} blink />
          <Eye x={15.4} y={-14.6} r={0.7} blink />
        </g>
        <g className="garden-snail-shell">
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
      </g>
    );
  }
  if (kind === 'ducks') {
    // A duck pair; each wing carries one person colour.
    const duck = (x: number, wing: string, second: boolean) => (
      <g transform={`translate(${x} 0)`}>
        <ellipse
          className="garden-duck-ripple"
          cx={0}
          cy={0.6}
          rx={13}
          ry={3}
          stroke="var(--garden-water-highlight)"
          strokeWidth={1}
          fill="none"
        />
        <g className={`garden-duck${second ? ' is-second' : ''}`}>
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
          <Eye x={9.6} y={-11.4} r={0.7} blink />
        </g>
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
        {duck(0, 'var(--person-own-accent)', false)}
        {duck(-17, 'var(--person-partner-accent)', true)}
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
      <g className="garden-deer-legs">
        <DeerLeg x={-9} bend={-0.6} />
        <DeerLeg x={-6.2} bend={0.6} />
        <DeerLeg x={6.4} bend={-0.6} />
        <DeerLeg x={9.2} bend={0.6} />
      </g>
      <path
        d="M-12.4 -16 C-13.4 -21 -8 -23.2 -2 -22.6 C4 -22 8 -23 11 -21 C13.2 -19.4 13.2 -16 11.6 -14 C8 -12.4 -2 -12 -8 -12.6 C-11 -13 -12.4 -14 -12.4 -16Z"
        fill="var(--garden-deer)"
      />
      <path
        d="M-12.6 -17.6 C-14.2 -15.6 -13 -13.2 -10.8 -13.2 C-11.4 -14.8 -11.4 -16.4 -12.6 -17.6Z"
        fill="var(--garden-tail)"
      />
      <g className="garden-deer-head">
        <path
          d="M8 -21 C9 -26 11 -31 13 -33 C14.6 -35 18 -35.6 20.2 -34 C21.8 -33 21.8 -31.4 20.2 -31 C18 -30.6 16.6 -30 15.6 -28 C14 -25 13 -21 11.6 -18Z"
          fill="var(--garden-deer)"
        />
        <g className="garden-deer-ears">
          <path
            d="M13.6 -34 C12 -37.4 12 -40 13.6 -40.4 C15.2 -39.6 15.4 -36.6 14.8 -34.4Z"
            fill="var(--garden-deer)"
          />
          <path
            d="M15.6 -34.6 C16.2 -37.8 17.8 -39.4 18.8 -38.8 C19.4 -37.2 18 -35.2 16.8 -34Z"
            fill="var(--garden-deer)"
          />
        </g>
        <Eye x={16.6} y={-33} r={0.75} blink />
      </g>
    </g>
  );
}

/** The little head that peeks out of the tree crown while the squirrel hides. */
function SquirrelPeek() {
  return (
    <g className="garden-squirrel-peek">
      <path
        d="M-1.6 -4.4 C-1.6 -6.4 -1.2 -8.4 -.6 -9.4 C.6 -8 .8 -6 .4 -4.6Z"
        fill="var(--garden-squirrel)"
      />
      <path
        d="M-4.4 0 C-5.4 -4.2 -2 -7.2 2 -6.4 C5.2 -5.8 6 -2.8 4.4 -.6 C2.8 1.2 -1.2 1.6 -4.4 0Z"
        fill="var(--garden-squirrel)"
      />
      <Eye x={1.4} y={-3} r={0.75} />
    </g>
  );
}

/** Where each visitor's head is, for the floating name tag. */
const TAG_LIFT: Record<GardenAnimal, number> = {
  snail: 20,
  rabbit: 36,
  hedgehog: 16,
  ducks: 22,
  squirrel: 27,
  deer: 46,
};

/** A small frame around each visitor for its static portrait in the book. */
export const PORTRAIT_BOX: Record<GardenAnimal, string> = {
  snail: '-15 -21 32 24',
  rabbit: '-17 -34 34 36',
  hedgehog: '-15 -16 32 18',
  ducks: '-31 -17 49 20',
  squirrel: '-17 -25 30 27',
  deer: '-16 -43 40 45',
};

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
  /** The visitor's accessible name (it includes the couple's name for it). */
  animal: (kind: GardenAnimal) => string;
  quack: string;
  /** The couple's name for a visitor; it floats above the visitor on a tap. */
  name?: (kind: GardenAnimal) => string | null;
}

const easeInOut = (k: number) =>
  k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;

/** The couple's tree is smaller until the swing joins it. */
function treeScale(unlocks: ReadonlyArray<GardenUnlock>): number {
  return unlocks.includes('SWING') ? 1 : 0.68;
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
  /** `at` is where the visitor stands, for a find it may leave there. */
  onReaction?: (kind: GardenAnimal, at: { x: number; y: number }) => void;
}) {
  const animals = useRef(new Map<number, Animal>());
  const arts = useRef(new Map<number, SVGGElement>());
  const targets = useRef(new Map<number, SVGGElement>());
  const timers = useRef<number[]>([]);
  const sequence = useRef(0);
  const [, setVersion] = useState(0);
  const [plane, setPlane] = useState<PlaneFlight | null>(null);
  const [tag, setTag] = useState<NameTag | null>(null);
  const [hearts, setHearts] = useState<Hearts | null>(null);
  const planeRef = useRef<SVGGElement | null>(null);
  const trailRef = useRef<SVGPathElement | null>(null);
  const settings = useRef({
    width,
    sharedDays,
    unlocks,
    reduced,
    visitors,
    labels,
  });
  settings.current = { width, sharedDays, unlocks, reduced, visitors, labels };

  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  const place = useCallback((animal: Animal, lift = 0) => {
    const y = animalY(animal.kind, animal.x) - lift;
    const turn = animal.tilt ? ` rotate(${animal.tilt})` : '';
    const transform = `translate(${r1(animal.x)} ${r1(y)})${turn} scale(${animal.dir} 1)`;
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
              : Math.abs(Math.sin(k * hops * Math.PI)) * 1.2;
        place(animal, lift);
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

  /** Up or down the trunk; the squirrel fades into the crown near the top. */
  const climb = useCallback(
    (
      animal: Animal,
      fromLift: number,
      toLift: number,
      ms: number,
      done: () => void,
    ) => {
      window.cancelAnimationFrame(animal.frame);
      const art = arts.current.get(animal.id);
      const top = Math.max(fromLift, toLift);
      const start = performance.now();
      animal.moving = true;
      const step = (now: number) => {
        if (!animals.current.has(animal.id)) return;
        const k = Math.min(1, (now - start) / ms);
        const lift = fromLift + (toLift - fromLift) * easeInOut(k);
        place(animal, lift);
        const hidden = Math.min(
          1,
          Math.max(0, (lift - top * 0.72) / (top * 0.28)),
        );
        art?.setAttribute('opacity', String(r1(1 - hidden)));
        if (k < 1) animal.frame = window.requestAnimationFrame(step);
        else {
          animal.moving = false;
          done();
        }
      };
      animal.frame = window.requestAnimationFrame(step);
    },
    [place],
  );

  const spawn = useCallback(
    (wanted?: GardenAnimal): Animal | null => {
      const { width: w, sharedDays: days, unlocks: found } = settings.current;
      const present = new Set(
        [...animals.current.values()].map((animal) => animal.kind),
      );
      const free = availableAnimals(days, found).filter(
        (kind) => !present.has(kind) && (!wanted || kind === wanted),
      );
      if (free.length === 0) return null;
      const kind = free[Math.floor(Math.random() * free.length)];
      sequence.current += 1;
      const animal: Animal = {
        id: sequence.current,
        kind,
        x: 0,
        dir: 1,
        pose: kind === 'deer' ? 'graze' : 'rest',
        moving: false,
        reacting: false,
        tilt: 0,
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
      return animal;
    },
    [move, place, refresh],
  );

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
    for (let k = 0; k < count; k += 1) later(() => spawn(), 500 + k * 900);
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
        (animal) => !animal.moving && !animal.reacting,
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
            !animal.reacting &&
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
  }, [lively, reduced, visitors, move, spawn, remove, fly]);

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

  /** The couple's name for a visitor floats above it, inside the scene. */
  const showName = useCallback(
    (animal: Animal) => {
      const text = settings.current.labels.name?.(animal.kind);
      if (!text) return;
      const w = settings.current.width;
      const tagWidth = Math.min(w - 8, text.length * 5.2 + 16);
      const x = Math.min(
        w - tagWidth / 2 - 4,
        Math.max(tagWidth / 2 + 4, animal.x),
      );
      const y = Math.max(
        18,
        animalY(animal.kind, animal.x) - TAG_LIFT[animal.kind],
      );
      const key = Date.now();
      setTag({ key, x, y, text, width: tagWidth });
      later(
        () => setTag((current) => (current?.key === key ? null : current)),
        NAME_TAG_MS,
      );
    },
    [later],
  );

  /** A short shake of the tree crown while the squirrel hides in it. */
  const rustle = useCallback((animal: Animal) => {
    const crown = sceneElement(
      arts.current.get(animal.id)?.ownerSVGElement,
      '.garden-tree-crown',
    );
    if (!crown) return;
    crown.classList.remove('is-rustling');
    // Restart the one-shot animation on a repeated visit.
    void crown.getBoundingClientRect();
    crown.classList.add('is-rustling');
  }, []);

  const tap = useCallback(
    (id: number) => {
      const animal = animals.current.get(id);
      // A visitor finishes one reaction before it starts the next.
      if (!animal || animal.reacting) return;
      const w = settings.current.width;
      const quiet = settings.current.reduced;
      // A tap always answers, even while the visitor is on its way.
      if (animal.moving) {
        window.cancelAnimationFrame(animal.frame);
        animal.moving = false;
        place(animal);
      }
      animal.reacting = true;
      onReaction?.(animal.kind, {
        x: animal.x,
        y: animalY(animal.kind, animal.x),
      });
      showName(animal);
      const alive = () => animals.current.has(animal.id);
      const pose = (next: Pose) => {
        animal.pose = next;
        refresh();
      };
      const rest: Pose = animal.kind === 'deer' ? 'graze' : 'rest';
      const settle = (after = 0) =>
        later(() => {
          if (!alive()) return;
          animal.reacting = false;
          if (animal.pose !== rest) pose(rest);
        }, after);
      const back = (ms: number, recover = 0) =>
        later(() => {
          if (!alive()) return;
          pose(rest);
          settle(recover);
        }, ms);
      const reactionMs = REACTION_MS[animal.kind];

      switch (animal.kind) {
        case 'snail':
          // The stalks go first, then the body; it comes out slowly again.
          pose('hide');
          back(reactionMs, RECOVER_MS);
          return;
        case 'hedgehog':
          pose('curl');
          back(reactionMs, quiet ? 0 : 500);
          return;
        case 'ducks': {
          pose('quack');
          if (!quiet) {
            const from = animal.x;
            const to = Math.max(
              POND.cx - POND.rx + 14,
              Math.min(
                POND.cx + POND.rx - 6,
                from + (from < POND.cx ? 16 : -16),
              ),
            );
            move(animal, to, reactionMs * 0.45, 'walk', () =>
              move(animal, from, reactionMs * 0.45, 'walk'),
            );
          }
          back(reactionMs);
          return;
        }
        case 'rabbit': {
          // Ears up, then it hops off one side and comes back from the other.
          pose('perk');
          if (quiet) {
            back(reactionMs);
            return;
          }
          const right = animal.x >= w / 2;
          later(() => {
            if (!alive()) return;
            pose('rest');
            move(animal, right ? w + 30 : -30, 1700, 'hop', () => {
              later(() => {
                if (!alive()) return;
                animal.x = right ? -30 : w + 30;
                place(animal);
                const target = right
                  ? 40 + Math.random() * (w / 3)
                  : w - 50 - Math.random() * (w / 3);
                move(animal, target, 2400, 'hop', () => settle());
              }, 900);
            });
          }, 320);
          return;
        }
        case 'squirrel': {
          if (quiet) {
            pose('perk');
            back(reactionMs);
            return;
          }
          // Up the trunk into the crown, a peek out, and back down.
          const scale = treeScale(settings.current.unlocks);
          const height = 44 * scale;
          const trunk = TREE_X - 3 * scale;
          const up = () => {
            if (!alive()) return;
            animal.dir = 1;
            animal.tilt = -90;
            pose('climb');
            climb(animal, 0, height, 1300, () => {
              pose('peek');
              rustle(animal);
              later(() => {
                if (!alive()) return;
                animal.dir = -1;
                pose('climb');
                climb(animal, height, 0, 1200, () => {
                  animal.tilt = 0;
                  animal.dir = 1;
                  place(animal);
                  arts.current.get(animal.id)?.setAttribute('opacity', '1');
                  pose('rest');
                  settle();
                });
              }, 1800);
            });
          };
          const distance = Math.abs(animal.x - trunk);
          if (distance > 3)
            move(animal, trunk, Math.min(900, 200 + distance * 8), 'hop', up);
          else up();
          return;
        }
        case 'deer': {
          // Head up, ears twitch, a leap away and later a calm walk back.
          pose('alert');
          if (quiet) {
            back(reactionMs);
            return;
          }
          const right = animal.x > w / 2;
          later(() => {
            if (!alive()) return;
            move(animal, right ? w + 40 : -40, 1500, 'leap', () => {
              later(() => {
                if (!alive()) return;
                pose('graze');
                const target = right
                  ? w - 60 - Math.random() * (w / 4)
                  : 50 + Math.random() * (w / 4);
                move(animal, target, 3600, 'walk', () => settle());
              }, 1400);
            });
          }, 450);
          return;
        }
      }
    },
    [climb, later, move, onReaction, place, refresh, rustle, showName],
  );

  /** A called visitor greets: a hop or a wave, its name tag and hearts. */
  const greet = useCallback(
    (animal: Animal) => {
      if (!animals.current.has(animal.id)) return;
      if (animal.moving) {
        window.cancelAnimationFrame(animal.frame);
        animal.moving = false;
        place(animal);
      }
      animal.reacting = true;
      animal.pose = 'hello';
      refresh();
      showName(animal);
      sequence.current += 1;
      const key = sequence.current;
      const w = settings.current.width;
      setHearts({
        key,
        x: Math.min(w - 12, Math.max(12, animal.x)),
        y: Math.max(
          24,
          animalY(animal.kind, animal.x) - TAG_LIFT[animal.kind] + 2,
        ),
      });
      later(() => {
        setHearts((current) => (current?.key === key ? null : current));
        if (!animals.current.has(animal.id)) return;
        animal.reacting = false;
        animal.pose = animal.kind === 'deer' ? 'graze' : 'rest';
        refresh();
      }, GREET_MS);
    },
    [later, place, refresh, showName],
  );

  /**
   * "Rufen" from the garden book: the visitor greets where it is, or comes
   * into the garden first. False when nobody may visit right now.
   */
  const call = useCallback(
    (kind: GardenAnimal): boolean => {
      const {
        visitors: open,
        sharedDays: days,
        unlocks: found,
      } = settings.current;
      if (!open || !availableAnimals(days, found).includes(kind)) return false;
      const present = [...animals.current.values()].find(
        (animal) => animal.kind === kind,
      );
      if (present) {
        if (!present.reacting) greet(present);
        return true;
      }
      const arrived = spawn(kind);
      if (!arrived) return false;
      later(
        () => greet(arrived),
        settings.current.reduced ? 80 : CALL_ARRIVAL_MS[kind],
      );
      return true;
    },
    [greet, later, spawn],
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

  const peek = (animal: Animal) => {
    const scale = treeScale(unlocks);
    const x = TREE_X + 21 * scale;
    const y = groundBack(TREE_X) + 6 - 76 * scale;
    return (
      <g
        key={`peek-${animal.id}`}
        transform={`translate(${r1(x)} ${r1(y)})`}
        data-testid="garden-squirrel-peek"
      >
        <SquirrelPeek />
      </g>
    );
  };

  const layer = (which: AnimalLayer) => (
    <g data-testid={`garden-animals-${which}`}>
      {list
        .filter(
          (animal) =>
            ANIMAL_LAYER[animal.kind] === which &&
            (which !== 'pond' || unlocks.includes('POND')),
        )
        .map((animal) => [
          <g
            key={animal.id}
            ref={bindArt(animal)}
            className="garden-animal"
            data-kind={animal.kind}
            data-pose={animal.pose}
          >
            <AnimalArt
              kind={animal.kind}
              pose={animal.pose}
              quack={labels.quack}
            />
          </g>,
          animal.kind === 'squirrel' && animal.pose === 'peek'
            ? peek(animal)
            : null,
        ])}
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
      {hearts ? (
        // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a decorative SVG group that takes no focus; the status line announces the greeting
        <g
          key={hearts.key}
          transform={`translate(${r1(hearts.x)} ${r1(hearts.y)})`}
          className="garden-greet-hearts"
          aria-hidden="true"
          pointerEvents="none"
          data-testid="garden-greet-hearts"
        >
          {[-9, 0, 9].map((dx, k) => (
            <g key={dx} transform={`translate(${dx} ${k === 1 ? -4 : 0})`}>
              <path
                className="garden-greet-heart"
                style={
                  {
                    '--garden-delay': `${k * 160}ms`,
                  } as CSSProperties
                }
                d="M0 2.6 C-4.4 -.6 -3.6 -4.6 -1 -4 C-.2 -3.8 0 -3 0 -2.6 C0 -3 .2 -3.8 1 -4 C3.6 -4.6 4.4 -.6 0 2.6Z"
                fill="var(--garden-heart)"
              />
            </g>
          ))}
        </g>
      ) : null}
      {tag ? (
        // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a decorative SVG group that takes no focus; the status line announces the name
        <g
          key={tag.key}
          transform={`translate(${r1(tag.x)} ${r1(tag.y)})`}
          className="garden-name-tag"
          aria-hidden="true"
          pointerEvents="none"
          data-testid="garden-name-tag"
        >
          <g className="garden-name-tag-float">
            <rect
              x={r1(-tag.width / 2)}
              y={-15}
              width={r1(tag.width)}
              height={15}
              rx={7.5}
              fill="var(--garden-card)"
            />
            <text y={-4.6} textAnchor="middle" className="garden-name-tag-text">
              {tag.text}
            </text>
          </g>
        </g>
      ) : null}
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

  return { layer, tapTargets, sky, fly, spawn, call };
}

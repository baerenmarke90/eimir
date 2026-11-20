/**
 * Ambience and small interactions of the shared garden (#1907 H3
 * extensions): the time of day and seasonal particles, taps on the tree, the
 * pond, the plants and the clouds, the watering can, rainbows, the together
 * moments of today and the decorations of a birthday or the anniversary.
 *
 * Motion is CSS only (transforms and opacity); React renders a moment once
 * and removes it after its time, never per frame. Ambient loops pause while
 * the document is hidden. With reduced motion every state is still shown
 * without movement and each tap keeps its text in the status line.
 *
 * Nothing here says whether the partner is looking right now: the moments
 * only show what both did today (partner presence stays product-disabled).
 */

import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { GardenUnlock } from '../api/generated/models/GardenUnlock';
import {
  blob,
  groundBack,
  groundFront,
  PLANT_HEIGHT,
  petalPath,
  STAGE_HEIGHT_SHARE,
  seededRandom,
  slotPosition,
} from '../client/garden';
import {
  ambientParticles,
  type GardenCelebration,
  type GardenDaytime,
  gardenDaytime,
  localCalendarDay,
  moonbowWeather,
  type TogetherMoments,
  togetherSeat,
} from '../client/gardenAmbience';
import {
  ARCH_X,
  BIRDHOUSE_X,
  benchX,
  POND,
  pondSlotPosition,
  SPECIES_HEIGHT,
  TREE_X,
} from '../client/gardenGrowth';
import type { GardenSeason } from '../client/gardenPresentation';
import { useTranslation } from '../i18n';
import { Butterfly, cloudDriftStyle, WateringCan } from './GardenArt';
import { SmallBird } from './GardenFeatures';
import type { ScenePlant } from './GardenScene';
import { sceneElement } from '../client/gardenSceneLayers';
import './GardenAmbience.css';

type Style = CSSProperties & Record<`--${string}`, string>;

const OWN = 'var(--person-own-accent)';
const PARTNER = 'var(--person-partner-accent)';
const r1 = (n: number) => Math.round(n * 10) / 10;

/** How long each one-shot moment stays in the scene (ms). */
const CAN_MS = 2800;
const PERK_AT_MS = 1700;
const RAINBOW_AT_MS = 2000;
const RAINBOW_MS = 4800;
const REVEAL_MS = 5600;
const EFFECT_MS = 2600;

/* Clock and visibility ------------------------------------------------------- */

function dayKey(now: Date): string {
  return localCalendarDay(now).toISOString().slice(0, 10);
}

/**
 * The time of day and the calendar day of the device, re-read on a minute
 * tick and whenever the page becomes visible again.
 */
export function useGardenClock(): { daytime: GardenDaytime; day: Date } {
  const [now, setNow] = useState(() => {
    const date = new Date();
    return { daytime: gardenDaytime(date), day: dayKey(date) };
  });
  useEffect(() => {
    const update = () => {
      const date = new Date();
      const next = { daytime: gardenDaytime(date), day: dayKey(date) };
      setNow((current) =>
        current.daytime === next.daytime && current.day === next.day
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
  const day = useMemo(() => new Date(`${now.day}T00:00:00Z`), [now.day]);
  return { daytime: now.daytime, day };
}

/** False while the document is hidden; ambient loops pause meanwhile. */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  );
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

/* Geometry ------------------------------------------------------------------- */

/** The clouds of the scene; their tap targets drift in step with them. */
export function sceneClouds(
  width: number,
): Array<{ x: number; y: number; scale: number; flip?: boolean }> {
  const clouds: Array<{ x: number; y: number; scale: number; flip?: boolean }> =
    [
      { x: 74, y: 44, scale: 0.9 },
      { x: 212, y: 68, scale: 0.62, flip: true },
    ];
  if (width > 340) clouds.push({ x: width - 150, y: 36, scale: 0.75 });
  return clouds;
}

function treeScale(unlocks: ReadonlyArray<GardenUnlock>): number {
  return unlocks.includes('SWING') ? 1 : 0.68;
}

function treeBase(): { x: number; y: number } {
  return { x: TREE_X, y: groundBack(TREE_X) + 6 };
}

function birdhouseHole(): { x: number; y: number } {
  return { x: BIRDHOUSE_X, y: groundBack(BIRDHOUSE_X) + 8 - 37.6 };
}

/** The top of a plant as drawn, where water drops land and petals burst. */
export function plantTop(
  plant: Pick<ScenePlant, 'slot' | 'inPond' | 'stage' | 'species'>,
): { x: number; y: number } {
  const base = plant.inPond
    ? pondSlotPosition(plant.slot)
    : slotPosition(plant.slot);
  if (plant.inPond) return { x: base.x, y: base.y - 4 };
  if (plant.stage === 0) return { x: base.x, y: base.y - 2 };
  if (plant.species === 'STRAWBERRY')
    return { x: base.x, y: base.y - 6 - plant.stage * 3 };
  const full = SPECIES_HEIGHT[plant.species] ?? PLANT_HEIGHT;
  const h = STAGE_HEIGHT_SHARE[plant.stage] * full;
  return { x: base.x, y: base.y - h - (plant.stage === 3 ? 6 : 2) };
}

/** Restarts a one-shot CSS animation class on an element. */
function replay(element: Element | null | undefined, className: string) {
  if (!element) return;
  element.classList.remove(className);
  // Reading layout restarts the animation on a repeated tap.
  void element.getBoundingClientRect();
  element.classList.add(className);
}

/* Art ------------------------------------------------------------------------ */

const HEART =
  'M0 2.6 C-4.4 -.6 -3.6 -4.6 -1 -4 C-.2 -3.8 0 -3 0 -2.6 C0 -3 .2 -3.8 1 -4 C3.6 -4.6 4.4 -.6 0 2.6Z';

export function Heart({ colour }: { colour: string }) {
  return <path d={HEART} fill={colour} />;
}

/** A small abstract figure sitting on a seat; one in each person colour. */
function Figure({ x, colour }: { x: number; colour: string }) {
  return (
    <g transform={`translate(${r1(x)} 0)`}>
      <path
        d="M-1.4 0 C-1.4 1.6 -1.6 3.2 -2.2 4.4 M1.4 0 C1.4 1.6 1.6 3.2 2.2 4.4"
        stroke={colour}
        strokeWidth={1.3}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M-2.8 .4 C-3 -2.8 -2.4 -6.2 0 -6.4 C2.4 -6.2 3 -2.8 2.8 .4 C1 1 -1 1 -2.8 .4Z"
        fill={colour}
      />
      <path d={blob(0, -9, 2.5, 2.5, 6, 0.04)} fill={colour} />
    </g>
  );
}

/** The two of you next to each other, with a small heart floating between. */
function TwoTogether({ arriving }: { arriving: boolean }) {
  return (
    <g
      className={arriving ? 'garden-pop' : undefined}
      style={{ '--garden-origin': '50% 100%' } as Style}
    >
      <Figure x={-3.4} colour={OWN} />
      <Figure x={3.4} colour={PARTNER} />
      <g transform="translate(0 -15)">
        <g className="garden-together-heart">
          <Heart colour="var(--garden-heart)" />
        </g>
      </g>
    </g>
  );
}

function MiniBench() {
  return (
    <g>
      <path
        d="M-10 -1 C-10.4 1 -10.6 2.6 -11 4.4 M10 -1 C10.4 1 10.6 2.6 11 4.4 M-9 -2 C-9.2 -5 -9.4 -7 -9.4 -9 M9 -2 C9.2 -5 9.4 -7 9.4 -9"
        stroke="var(--garden-trunk)"
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M-12 -1.4 C-12 -2.6 12 -2.6 12 -1.4 L12 .2 C12 1.2 -12 1.2 -12 .2Z"
        fill="var(--garden-trunk)"
      />
      <path
        d="M-11 -9.6 C-11 -10.8 11 -10.8 11 -9.6 L11 -8 C11 -7.2 -11 -7.2 -11 -8Z"
        fill="var(--garden-trunk)"
      />
    </g>
  );
}

function Blossom({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <g transform={`translate(${r1(x)} ${r1(y)})`}>
      {[0, 72, 144, 216, 288].map((angle) => (
        <path
          key={angle}
          transform={`rotate(${angle})`}
          d={petalPath(size, size * 0.62)}
          fill="var(--garden-blossom)"
        />
      ))}
      <path
        d={blob(0, 0, size * 0.32, size * 0.32, 5, 0.12)}
        fill="var(--garden-sun)"
      />
    </g>
  );
}

/** Spring blossoms in the crown of the couple's tree (tree coordinates). */
const CROWN_BLOSSOMS: ReadonlyArray<[number, number]> = [
  [-20, -60],
  [-9, -49],
  [-17, -45],
  [0, -73],
  [12, -67],
  [7, -55],
  [24, -57],
  [29, -46],
  [16, -44],
  [-5, -63],
];

/**
 * Lights strung along a soft curve. By day they are little flags in both
 * person colours; in the evening and at night they glow like lanterns.
 */
function LightString({
  from,
  via,
  to,
  count,
  lit,
}: {
  from: [number, number];
  via: [number, number];
  to: [number, number];
  count: number;
  lit: boolean;
}) {
  const at = (t: number): [number, number] => [
    (1 - t) ** 2 * from[0] + 2 * (1 - t) * t * via[0] + t * t * to[0],
    (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * via[1] + t * t * to[1],
  ];
  const points = Array.from({ length: count }, (_, k) => at((k + 0.5) / count));
  return (
    <g
      className="garden-lights"
      data-testid="garden-celebration-lights"
      data-lit={lit ? 'true' : 'false'}
    >
      <path
        d={`M${r1(from[0])} ${r1(from[1])} Q${r1(via[0])} ${r1(via[1])} ${r1(to[0])} ${r1(to[1])}`}
        stroke="var(--garden-ink)"
        strokeWidth={0.6}
        opacity={0.5}
        fill="none"
      />
      {points.map(([x, y], k) =>
        lit ? (
          <g key={`${r1(x)}-${r1(y)}`}>
            <g
              className="garden-flicker"
              style={{ '--garden-delay': `${k * 120}ms` } as Style}
            >
              <path
                d={blob(x, y + 3, 5, 5, 6, 0.05)}
                fill="var(--garden-light-glow)"
              />
            </g>
            <path
              d={blob(x, y + 3, 1.8, 2.3, 5, 0.06)}
              fill={k % 2 ? PARTNER : OWN}
            />
          </g>
        ) : (
          <path
            key={`${r1(x)}-${r1(y)}`}
            d={`M${r1(x - 2.6)} ${r1(y)} C${r1(x - 1)} ${r1(y + 0.4)} ${r1(x + 1)} ${r1(y + 0.4)} ${r1(x + 2.6)} ${r1(y)} C${r1(x + 1.4)} ${r1(y + 2.4)} ${r1(x + 0.4)} ${r1(y + 4.4)} ${r1(x)} ${r1(y + 5.4)} C${r1(x - 0.4)} ${r1(y + 4.4)} ${r1(x - 1.4)} ${r1(y + 2.4)} ${r1(x - 2.6)} ${r1(y)}Z`}
            fill={k % 2 ? PARTNER : OWN}
          />
        ),
      )}
    </g>
  );
}

const RAINBOW_BANDS = [1, 2, 3, 4, 5, 6] as const;

/**
 * A rainbow; the double one has a fainter second bow with mirrored colours.
 * At night it is a moonbow (#2048): the same bows in pale, silvery bands.
 */
export function Rainbow({
  cx,
  width,
  double,
  mode,
  moon = false,
  delay = 0,
}: {
  cx: number;
  width: number;
  double: boolean;
  /** `moment` fades in and out once; `stay` fades in and remains. */
  mode: 'moment' | 'stay';
  moon?: boolean;
  delay?: number;
}) {
  const band = (index: number) =>
    `var(--garden-${moon ? 'moonbow' : 'rainbow'}-${index})`;
  const radius = Math.min(132, width * 0.36);
  const x = Math.max(radius + 6, Math.min(width - radius - 6, cx));
  const cy = groundBack(x) + 10;
  const bow = (r: number) =>
    `M${r1(x - r)} ${r1(cy)} A${r1(r)} ${r1(r)} 0 0 1 ${r1(x + r)} ${r1(cy)}`;
  return (
    <g
      className={`garden-rainbow is-${mode}${moon ? ' is-moon' : ''}`}
      style={{ '--garden-delay': `${delay}ms` } as Style}
      data-testid={double ? 'garden-double-rainbow' : 'garden-rainbow'}
      data-bow={moon ? 'moon' : 'sun'}
      fill="none"
      strokeLinecap="round"
    >
      {RAINBOW_BANDS.map((index, k) => (
        <path
          key={index}
          d={bow(radius - k * 3.2)}
          stroke={band(index)}
          strokeWidth={3.4}
        />
      ))}
      {double ? (
        <g opacity={0.5}>
          {RAINBOW_BANDS.map((index, k) => (
            <path
              key={index}
              d={bow(radius + 14 + (5 - k) * 2.6)}
              stroke={band(index)}
              strokeWidth={2.6}
            />
          ))}
        </g>
      ) : null}
    </g>
  );
}

/** Petals, motes, leaves or flakes, looping with CSS only. */
export function SeasonParticles({
  season,
  width,
  paused,
}: {
  season: GardenSeason;
  width: number;
  paused: boolean;
}) {
  const particles = useMemo(
    () => ambientParticles(season, width),
    [season, width],
  );
  const rising = season === 'summer';
  return (
    <g
      className={`garden-particles${paused ? ' is-paused' : ''}`}
      data-testid="garden-particles"
      data-season={season}
      data-count={particles.length}
    >
      {particles.map((particle, k) => {
        const y = rising ? groundFront(particle.x) + 8 : -10;
        const s = particle.size;
        const d =
          season === 'winter'
            ? blob(0, 0, 1.7 * s, 1.7 * s, 6, 0.05)
            : season === 'summer'
              ? blob(0, 0, 1 * s, 1 * s, 5, 0.05)
              : season === 'autumn'
                ? `M0 ${r1(-4 * s)} C${r1(2.6 * s)} ${r1(-2.6 * s)} ${r1(2.6 * s)} ${r1(2.6 * s)} 0 ${r1(4 * s)} C${r1(-2.6 * s)} ${r1(2.6 * s)} ${r1(-2.6 * s)} ${r1(-2.6 * s)} 0 ${r1(-4 * s)}Z`
                : `M0 ${r1(-2.6 * s)} C${r1(2.4 * s)} ${r1(-1.4 * s)} ${r1(2 * s)} ${r1(2 * s)} 0 ${r1(2.6 * s)} C${r1(-1.4 * s)} ${r1(1.2 * s)} ${r1(-1.6 * s)} ${r1(-1.6 * s)} 0 ${r1(-2.6 * s)}Z`;
        const fill =
          season === 'winter'
            ? 'var(--garden-flake)'
            : season === 'summer'
              ? 'var(--garden-sun)'
              : season === 'autumn'
                ? k % 2
                  ? 'var(--garden-leaf-autumn)'
                  : 'var(--garden-crown-autumn-2)'
                : 'var(--garden-petal)';
        return (
          <g
            // biome-ignore lint/suspicious/noArrayIndexKey: deterministic decoration
            key={k}
            transform={`translate(${particle.x} ${r1(y)})`}
          >
            <path
              className={`garden-particle ${rising ? 'is-rising' : 'is-falling'}`}
              style={
                {
                  '--garden-delay': `${particle.delay}ms`,
                  '--garden-particle-duration': `${particle.duration}ms`,
                  '--garden-dx': `${particle.dx}px`,
                  '--garden-rotate': `${particle.rotate}deg`,
                } as Style
              }
              d={d}
              fill={fill}
              stroke={
                season === 'winter' ? 'var(--garden-flake-edge)' : undefined
              }
              strokeWidth={season === 'winter' ? 0.6 : undefined}
            />
          </g>
        );
      })}
    </g>
  );
}

/** The watering can tilts with its spout down onto the plant. */
export function WateringMoment({
  x,
  top,
  who,
}: {
  x: number;
  top: number;
  who: 'own' | 'partner';
}) {
  // The pivot is the spout's rose, just above and left of the plant's top.
  return (
    <g
      transform={`translate(${r1(x - 3)} ${r1(top - 10)})`}
      className="garden-can-moment"
      data-testid="garden-watering-can"
      data-who={who}
      style={{ '--garden-can': who === 'own' ? OWN : PARTNER } as Style}
    >
      <g className="garden-can-tilt">
        <g transform="translate(-4.4 9.2)">
          <WateringCan />
        </g>
      </g>
      {[-1, 1.6, 3.4, 0.4, 2.4].map((dx, k) => (
        <path
          key={dx}
          className="garden-can-drop"
          style={{ '--garden-delay': `${820 + k * 190}ms` } as Style}
          transform={`translate(${dx} 2)`}
          d="M0 -2 Q 1.6 .8 0 2.4 Q -1.6 .8 0 -2Z"
          fill="var(--garden-dew)"
        />
      ))}
    </g>
  );
}

function Fish() {
  return (
    <g>
      <path
        d="M-5 0 C-3 -2.6 3 -2.8 5 0 C3 2.6 -3 2.6 -5 0Z"
        fill="var(--garden-fish)"
      />
      <path d="M-4.6 0 L-8 -2.6 L-7.4 0 L-8 2.6Z" fill="var(--garden-fish)" />
    </g>
  );
}

/* The ambience of one scene -------------------------------------------------- */

export interface SceneAmbience {
  daytime: GardenDaytime;
  season: GardenSeason;
  together: TogetherMoments;
  /** A moment the live sync just brought; a new key plays it once. */
  arrival: {
    key: number;
    bothWatered: boolean;
    bothSent: boolean;
    words: boolean;
  } | null;
  /** The watering choreography; a new key plays it once. */
  watering: { key: number; plantId: string; who: 'own' | 'partner' } | null;
  /** A plant was tapped to open its story; it bounces. */
  bounce: { key: number; plantId: string } | null;
  celebration: GardenCelebration | null;
  partnerName: string;
  /** Today's kind words of the partner, already localized. */
  partnerWordsText: string | null;
  onStatus: (text: string) => void;
}

type Effect =
  | { key: number; kind: 'leaves'; x: number; y: number; tint: string }
  | { key: number; kind: 'bird'; x: number; y: number }
  | { key: number; kind: 'ripple'; x: number; y: number }
  | { key: number; kind: 'fish'; x: number; y: number }
  | { key: number; kind: 'petals'; x: number; y: number; colour: string }
  | { key: number; kind: 'butterfly'; x: number; y: number }
  | { key: number; kind: 'shower'; cloud: number; snow: boolean };

function onActivate(handler: () => void) {
  return (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handler();
    }
  };
}

/**
 * Builds the ambience layers of the scene: what goes into the sky, into the
 * couple's tree, behind and in front of the plants, the tap targets and a
 * shower inside a cloud.
 */
export function useGardenAmbience({
  ambience,
  width,
  plants,
  unlocks,
  reduced,
  svg,
}: {
  ambience: SceneAmbience | undefined;
  width: number;
  plants: ReadonlyArray<ScenePlant>;
  unlocks: ReadonlyArray<GardenUnlock>;
  reduced: boolean;
  svg: RefObject<SVGSVGElement | null>;
}) {
  const { t } = useTranslation();
  const visible = useDocumentVisible();
  const [effects, setEffects] = useState<Effect[]>([]);
  const [can, setCan] = useState<{
    key: number;
    x: number;
    top: number;
    who: 'own' | 'partner';
  } | null>(null);
  const [rainbow, setRainbow] = useState<{
    key: number;
    cx: number;
    moon: boolean;
  } | null>(null);
  const [reveal, setReveal] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const sequence = useRef(0);
  const latest = useRef({ ambience, plants, reduced, unlocks });
  latest.current = { ambience, plants, reduced, unlocks };

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
    },
    [],
  );
  const nextKey = useCallback(() => {
    sequence.current += 1;
    return sequence.current;
  }, []);
  const add = useCallback(
    (effect: Effect, ms = EFFECT_MS) => {
      setEffects((current) => [...current, effect]);
      later(
        () =>
          setEffects((current) =>
            current.filter((entry) => entry.key !== effect.key),
          ),
        ms,
      );
    },
    [later],
  );
  const status = (text: string) => latest.current.ambience?.onStatus(text);
  const daytime = ambience?.daytime ?? 'day';
  const season = ambience?.season ?? 'summer';
  const night = daytime === 'night';

  // The watering choreography: the can, the drops, the plant perks up and,
  // in the morning or by day, a rainbow.
  const wateringKey = ambience?.watering?.key ?? null;
  useEffect(() => {
    const event = latest.current.ambience?.watering;
    if (wateringKey === null || !event) return;
    const plant = latest.current.plants.find(
      (entry) => entry.id === event.plantId,
    );
    if (!plant) return;
    const top = plantTop(plant);
    setCan({ key: event.key, x: top.x, top: top.y, who: event.who });
    later(
      () => setCan((current) => (current?.key === event.key ? null : current)),
      CAN_MS,
    );
    later(
      () =>
        replay(
          sceneElement(svg.current, `[data-plant-art="${plant.id}"]`),
          'is-perking',
        ),
      latest.current.reduced ? 0 : PERK_AT_MS,
    );
    later(() => {
      const now = latest.current.ambience;
      if (!now || now.together.bothWatered) return;
      setRainbow({
        key: event.key,
        cx: top.x,
        moon: moonbowWeather(now.daytime),
      });
      later(
        () =>
          setRainbow((current) =>
            current?.key === event.key ? null : current,
          ),
        RAINBOW_MS,
      );
    }, RAINBOW_AT_MS);
  }, [wateringKey, later, svg]);

  // A plant opened for its story: a springy boing, a petal burst and a
  // butterfly that flutters off (not in winter, not at night).
  const bounceKey = ambience?.bounce?.key ?? null;
  useEffect(() => {
    const now = latest.current.ambience;
    const event = now?.bounce;
    if (bounceKey === null || !event || !now) return;
    const plant = latest.current.plants.find(
      (entry) => entry.id === event.plantId,
    );
    if (!plant) return;
    if (plant.stage > 0)
      replay(
        sceneElement(svg.current, `[data-plant-art="${plant.id}"]`),
        'is-boing',
      );
    const blooming = plant.stage === 3 && plant.species !== 'SURPRISE';
    const butterfly =
      blooming && now.season !== 'winter' && now.daytime !== 'night';
    if (!latest.current.reduced && blooming) {
      const top = plantTop(plant);
      add({
        key: nextKey(),
        kind: 'petals',
        x: top.x,
        y: top.y,
        colour: plant.role === 'own' ? OWN : PARTNER,
      });
      if (butterfly)
        add({ key: nextKey(), kind: 'butterfly', x: top.x, y: top.y });
    }
    now.onStatus(
      plant.stage === 0
        ? t('games.garden.ambience.tap.seed')
        : !blooming
          ? t('games.garden.ambience.tap.sprout')
          : now.season === 'winter'
            ? t('games.garden.ambience.tap.flowerWinter')
            : now.daytime === 'night'
              ? t('games.garden.ambience.tap.flowerNight')
              : t('games.garden.ambience.tap.flower'),
    );
  }, [bounceKey, add, nextKey, svg, t]);

  const tapTree = () => {
    replay(sceneElement(svg.current, '.garden-tree-crown'), 'is-rustling');
    const s = treeScale(unlocks);
    const base = treeBase();
    const crown = { x: base.x + 4 * s, y: base.y - 54 * s };
    if (!reduced) {
      add({
        key: nextKey(),
        kind: 'leaves',
        x: crown.x,
        y: crown.y,
        tint:
          season === 'autumn'
            ? 'var(--garden-leaf-autumn)'
            : season === 'winter'
              ? 'var(--garden-flake)'
              : season === 'spring'
                ? 'var(--garden-blossom)'
                : 'var(--garden-leaf)',
      });
      if (!night)
        add({ key: nextKey(), kind: 'bird', x: crown.x, y: crown.y - 6 });
    }
    status(
      night
        ? t('games.garden.ambience.tap.treeNight')
        : season === 'autumn'
          ? t('games.garden.ambience.tap.treeAutumn')
          : season === 'winter'
            ? t('games.garden.ambience.tap.treeWinter')
            : t('games.garden.ambience.tap.tree'),
    );
  };

  const tapPond = (event?: MouseEvent<SVGGElement>) => {
    let x: number = POND.cx;
    const element = svg.current;
    const matrix = element?.getScreenCTM?.();
    if (event && matrix && typeof DOMPoint !== 'undefined') {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
        matrix.inverse(),
      );
      x = point.x;
    }
    x = Math.max(POND.cx - POND.rx + 10, Math.min(POND.cx + POND.rx - 10, x));
    if (!reduced) {
      add({ key: nextKey(), kind: 'ripple', x, y: POND.cy });
      add({ key: nextKey(), kind: 'fish', x, y: POND.cy });
    }
    status(t('games.garden.ambience.tap.pond'));
  };

  const tapCloud = (index: number) => {
    const snow = season === 'winter';
    if (!reduced) add({ key: nextKey(), kind: 'shower', cloud: index, snow });
    status(
      snow
        ? t('games.garden.ambience.tap.cloudSnow')
        : t('games.garden.ambience.tap.cloud'),
    );
  };

  const together = ambience?.together;
  const words = ambience?.partnerWordsText ?? null;
  const hasWords =
    unlocks.includes('BIRDHOUSE') &&
    together?.partnerWords != null &&
    words !== null;
  const tapBirdhouse = () => {
    if (!hasWords || !words) return;
    const key = nextKey();
    setReveal(key);
    later(
      () => setReveal((current) => (current === key ? null : current)),
      REVEAL_MS,
    );
    status(
      t('games.garden.ambience.birdhouseStatus', {
        name: ambience?.partnerName ?? '',
        words,
      }),
    );
  };

  if (!ambience) {
    return {
      sky: null,
      treeDecor: null,
      back: null,
      tint: null,
      front: null,
      targets: null,
      shower: () => null,
    };
  }

  const arrival = ambience.arrival;
  const seat = togetherSeat(unlocks);
  const s = treeScale(unlocks);
  const base = treeBase();
  const celebration = ambience.celebration;
  const lit = daytime === 'evening' || night;
  const hasTree = unlocks.includes('TREE');
  const hasArch = unlocks.includes('ROSE_ARCH');
  const visibleWidth = Math.min(width, 340);

  const doubleRainbow = together?.bothWatered ? (
    <Rainbow
      key={`double-${arrival?.bothWatered ? arrival.key : 0}`}
      cx={visibleWidth * 0.45}
      width={width}
      double
      moon={night}
      mode="stay"
      delay={arrival?.bothWatered && can ? RAINBOW_AT_MS : 0}
    />
  ) : null;
  const sky = (
    <g data-testid="garden-ambience-sky">
      {doubleRainbow}
      {rainbow && !together?.bothWatered ? (
        <Rainbow
          key={rainbow.key}
          cx={rainbow.cx}
          width={width}
          double={false}
          moon={rainbow.moon}
          mode="moment"
        />
      ) : null}
      {celebration && !hasTree && !hasArch ? (
        <LightString
          from={[6, 22]}
          via={[width / 2, 64]}
          to={[width - 6, 22]}
          count={Math.min(18, Math.round((11 * width) / 340))}
          lit={lit}
        />
      ) : null}
    </g>
  );

  const treeDecor = hasTree ? (
    <g>
      {season === 'spring' ? (
        <g data-testid="garden-tree-blossoms">
          {CROWN_BLOSSOMS.map(([x, y]) => (
            <Blossom key={`${x}-${y}`} x={x} y={y} size={2.4} />
          ))}
        </g>
      ) : null}
      {celebration ? (
        <LightString
          from={[-30, -48]}
          via={[4, -28]}
          to={[37, -46]}
          count={9}
          lit={lit}
        />
      ) : null}
      {together?.bothSent && seat === 'swing' ? (
        <g transform="translate(29 -14)" data-testid="garden-together">
          <TwoTogether arriving={arrival?.bothSent === true} />
        </g>
      ) : null}
    </g>
  ) : null;

  let bench: ReactNode = null;
  if (together?.bothSent && seat !== 'swing') {
    const x = seat === 'tree' ? base.x - 30 : benchX(unlocks);
    const ground = groundBack(x) + 9;
    const ownBench = seat === 'bench' && unlocks.includes('BENCH');
    bench = (
      <g
        key={`bench-${arrival?.bothSent ? arrival.key : 0}`}
        transform={`translate(${r1(x)} ${r1(ground)})`}
        data-testid="garden-together"
        data-seat={seat}
      >
        {ownBench ? null : (
          <g transform="translate(0 -4.4)">
            <MiniBench />
          </g>
        )}
        <g transform={`translate(0 ${ownBench ? -11 : -6.4})`}>
          <TwoTogether arriving={arrival?.bothSent === true} />
        </g>
      </g>
    );
  }

  const hole = birdhouseHole();
  const back = (
    <g data-testid="garden-ambience-back">
      {bench}
      {hasWords ? (
        <g
          key={`note-${arrival?.words ? arrival.key : 0}`}
          transform={`translate(${r1(hole.x)} ${r1(hole.y)})`}
          data-testid="garden-birdhouse-note"
        >
          <g
            className={`garden-note-paper${arrival?.words ? ' garden-pop' : ''}`}
            style={{ '--garden-origin': '50% 100%' } as Style}
          >
            <path
              d="M-3.4 1.4 C-3.6 -1 -3 -3.6 -2.6 -4.4 C-.4 -4.8 2.4 -4.8 3.6 -4.2 C3.8 -2 3.6 .4 3.2 1.6 C1 2 -1.4 2 -3.4 1.4Z"
              fill="var(--garden-banner)"
              stroke={PARTNER}
              strokeWidth={0.7}
              transform="rotate(-12)"
            />
          </g>
        </g>
      ) : null}
    </g>
  );

  const tint = (
    <rect
      className="garden-night-tint"
      width={width}
      height={210}
      fill="var(--garden-night-tint)"
      data-testid="garden-night-tint"
    />
  );

  const revealWidth = words ? Math.min(width - 12, words.length * 4.8 + 22) : 0;
  const revealX = Math.max(
    revealWidth / 2 + 6,
    Math.min(width - revealWidth / 2 - 6, hole.x),
  );
  const front = (
    <g
      className={`garden-ambience${visible ? '' : ' is-paused'}`}
      data-testid="garden-ambience-front"
    >
      {celebration && hasArch && !hasTree ? (
        <g transform={`translate(${ARCH_X} ${r1(groundFront(ARCH_X) + 14)})`}>
          <LightString
            from={[-17, -42]}
            via={[0, -30]}
            to={[17, -42]}
            count={5}
            lit={lit}
          />
        </g>
      ) : null}
      {reduced ? null : (
        <SeasonParticles season={season} width={width} paused={!visible} />
      )}
      {effects.map((effect) => {
        switch (effect.kind) {
          case 'leaves':
            return (
              <g
                key={effect.key}
                transform={`translate(${r1(effect.x)} ${r1(effect.y)})`}
                data-testid="garden-tap-leaves"
              >
                {[-14, -4, 8, 16].map((dx, k) => (
                  <path
                    key={dx}
                    className="garden-tap-leaf"
                    style={
                      {
                        '--garden-dx': `${dx * 1.6}px`,
                        '--garden-delay': `${k * 140}ms`,
                        '--garden-rotate': `${(k % 2 ? 1 : -1) * 260}deg`,
                      } as Style
                    }
                    transform={`translate(${dx} ${k * 3})`}
                    d="M0 -3 C2 -2 2 2 0 3 C-2 2 -2 -2 0 -3Z"
                    fill={effect.tint}
                  />
                ))}
              </g>
            );
          case 'bird':
            return (
              <g
                key={effect.key}
                transform={`translate(${r1(effect.x)} ${r1(effect.y)})`}
                data-testid="garden-tap-bird"
              >
                <g className="garden-tap-bird">
                  <g transform="scale(-.6 .6)">
                    <SmallBird wingClass="garden-flap-y" />
                  </g>
                </g>
              </g>
            );
          case 'ripple':
            return (
              <g
                key={effect.key}
                transform={`translate(${r1(effect.x)} ${r1(effect.y)})`}
                data-testid="garden-tap-ripple"
              >
                {[0, 260, 900].map((delay) => (
                  <ellipse
                    key={delay}
                    className="garden-tap-ring"
                    style={{ '--garden-delay': `${delay}ms` } as Style}
                    rx={6}
                    ry={1.8}
                    stroke="var(--garden-water-highlight)"
                    strokeWidth={1}
                    fill="none"
                  />
                ))}
              </g>
            );
          case 'fish':
            return (
              <g
                key={effect.key}
                transform={`translate(${r1(effect.x - 8)} ${r1(effect.y)})`}
                data-testid="garden-tap-fish"
              >
                <g className="garden-tap-fish">
                  <Fish />
                </g>
              </g>
            );
          case 'petals':
            return (
              <g
                key={effect.key}
                transform={`translate(${r1(effect.x)} ${r1(effect.y)})`}
                data-testid="garden-tap-petals"
              >
                {Array.from({ length: 7 }, (_, k) => {
                  const a = (k / 7) * Math.PI * 2;
                  return (
                    <path
                      key={a}
                      className="garden-tap-petal"
                      style={
                        {
                          '--garden-dx': `${r1(Math.cos(a) * 16)}px`,
                          '--garden-dy': `${r1(Math.sin(a) * 16)}px`,
                        } as Style
                      }
                      d={blob(0, 0, 1.8, 1.4, 5, 0.1)}
                      fill={effect.colour}
                    />
                  );
                })}
              </g>
            );
          case 'butterfly':
            return (
              <g
                key={effect.key}
                transform={`translate(${r1(effect.x)} ${r1(effect.y)})`}
                data-testid="garden-tap-butterfly"
              >
                <g className="garden-tap-butterfly">
                  <g transform="scale(.55)">
                    <Butterfly />
                  </g>
                </g>
              </g>
            );
          default:
            return null;
        }
      })}
      {can ? (
        <WateringMoment key={can.key} x={can.x} top={can.top} who={can.who} />
      ) : null}
      {reveal !== null && words ? (
        <g
          key={reveal}
          transform={`translate(${r1(revealX)} ${r1(hole.y - 22)})`}
          data-testid="garden-birdhouse-words"
        >
          <g className="garden-words-reveal">
            <path
              d={`M${r1(-revealWidth / 2)} -9 C${r1(-revealWidth / 2)} -11 ${r1(-revealWidth / 2 + 2)} -12 ${r1(-revealWidth / 2 + 5)} -12 L${r1(revealWidth / 2 - 5)} -12 C${r1(revealWidth / 2 - 2)} -12 ${r1(revealWidth / 2)} -11 ${r1(revealWidth / 2)} -9 L${r1(revealWidth / 2)} 1 C${r1(revealWidth / 2)} 3 ${r1(revealWidth / 2 - 2)} 4 ${r1(revealWidth / 2 - 5)} 4 L4 4 L${r1(hole.x - revealX)} 12 L-2 4 L${r1(-revealWidth / 2 + 5)} 4 C${r1(-revealWidth / 2 + 2)} 4 ${r1(-revealWidth / 2)} 3 ${r1(-revealWidth / 2)} 1Z`}
              fill="var(--garden-card)"
              stroke={PARTNER}
              strokeWidth={0.8}
            />
            <text y={-1.6} textAnchor="middle" className="garden-reveal-text">
              {words}
            </text>
          </g>
        </g>
      ) : null}
    </g>
  );

  const shower = (index: number) => {
    const cloud = sceneClouds(width)[index];
    if (!cloud) return null;
    return effects
      .filter(
        (effect): effect is Extract<Effect, { kind: 'shower' }> =>
          effect.kind === 'shower' && effect.cloud === index,
      )
      .map((effect) => {
        const random = seededRandom(effect.key);
        return (
          <g key={effect.key} data-testid="garden-tap-shower">
            {Array.from({ length: 12 }, (_, k) => {
              const x = cloud.x + (random() - 0.5) * 48 * cloud.scale;
              const y = cloud.y + 6 * cloud.scale;
              return (
                <path
                  // biome-ignore lint/suspicious/noArrayIndexKey: one shower
                  key={k}
                  className="garden-tap-drop"
                  style={
                    {
                      '--garden-delay': `${Math.round(random() * 900)}ms`,
                    } as Style
                  }
                  d={
                    effect.snow
                      ? blob(x, y, 1.4, 1.4, 5, 0.05)
                      : `M${r1(x)} ${r1(y - 2)} Q${r1(x + 1.4)} ${r1(y + 0.8)} ${r1(x)} ${r1(y + 2.4)} Q${r1(x - 1.4)} ${r1(y + 0.8)} ${r1(x)} ${r1(y - 2)}Z`
                  }
                  fill={
                    effect.snow ? 'var(--garden-flake)' : 'var(--garden-dew)'
                  }
                />
              );
            })}
          </g>
        );
      });
  };

  const crown = { x: base.x + 4 * s, y: base.y - 54 * s };
  const targets = (
    <g data-testid="garden-ambience-targets">
      {sceneClouds(width).map((cloud, index) => (
        <g
          key={`${cloud.x}-${cloud.y}`}
          className="garden-drift"
          style={cloudDriftStyle(cloud.x, cloud.scale)}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: an SVG cloud cannot be a native button */}
          <g
            role="button"
            tabIndex={0}
            className="garden-ambient-target"
            aria-label={t('games.garden.ambience.labels.cloud')}
            data-testid={`garden-cloud-${index}`}
            onClick={() => tapCloud(index)}
            onKeyDown={onActivate(() => tapCloud(index))}
          >
            <rect
              x={r1(cloud.x - 36 * cloud.scale)}
              y={r1(cloud.y - 22 * cloud.scale)}
              width={r1(72 * cloud.scale)}
              height={r1(30 * cloud.scale)}
              rx={10}
              fill="transparent"
            />
          </g>
        </g>
      ))}
      {hasTree ? (
        // biome-ignore lint/a11y/useSemanticElements: an SVG tree cannot be a native button
        <g
          role="button"
          tabIndex={0}
          className="garden-ambient-target"
          aria-label={t('games.garden.ambience.labels.tree')}
          data-testid="garden-tree"
          onClick={tapTree}
          onKeyDown={onActivate(tapTree)}
        >
          <rect
            x={r1(crown.x - 34 * s)}
            y={r1(crown.y - 30 * s)}
            width={r1(70 * s)}
            height={r1(base.y - crown.y + 30 * s)}
            rx={14}
            fill="transparent"
          />
        </g>
      ) : null}
      {unlocks.includes('POND') ? (
        // biome-ignore lint/a11y/useSemanticElements: an SVG pond cannot be a native button
        <g
          role="button"
          tabIndex={0}
          className="garden-ambient-target"
          aria-label={t('games.garden.ambience.labels.pond')}
          data-testid="garden-pond"
          onClick={(event) => tapPond(event)}
          onKeyDown={onActivate(() => tapPond())}
        >
          <rect
            x={POND.cx - POND.rx - 2}
            y={POND.cy - POND.ry - 6}
            width={POND.rx * 2 + 4}
            height={POND.ry * 2 + 8}
            rx={12}
            fill="transparent"
          />
        </g>
      ) : null}
      {hasWords ? (
        // biome-ignore lint/a11y/useSemanticElements: an SVG birdhouse cannot be a native button
        <g
          role="button"
          tabIndex={0}
          className="garden-ambient-target"
          aria-label={t('games.garden.ambience.labels.birdhouse', {
            name: ambience.partnerName,
          })}
          data-testid="garden-birdhouse"
          onClick={tapBirdhouse}
          onKeyDown={onActivate(tapBirdhouse)}
        >
          <rect
            x={BIRDHOUSE_X - 13}
            y={r1(hole.y - 14)}
            width={26}
            height={r1(groundBack(BIRDHOUSE_X) + 8 - hole.y + 14)}
            rx={8}
            fill="transparent"
          />
        </g>
      ) : null}
    </g>
  );

  return { sky, treeDecor, back, tint, front, targets, shower };
}

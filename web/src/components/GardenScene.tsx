import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { GardenSpecies } from '../api/generated/models/GardenSpecies';
import type { GardenUnlock } from '../api/generated/models/GardenUnlock';
import {
  GARDEN_HEIGHT,
  grassTufts,
  groundBack,
  groundFront,
  groundPath,
  PLANT_HEIGHT,
  STAGE_HEIGHT_SHARE,
  seededRandom,
  slotPosition,
} from '../client/garden';
import { sunPlace } from '../client/gardenAmbience';
import {
  backgroundTrees,
  type GardenAnimal,
  pondSlotPosition,
  SPECIES_HEIGHT,
} from '../client/gardenGrowth';
import {
  type SceneAmbience,
  sceneClouds,
  useGardenAmbience,
} from './GardenAmbience';
import { Butterfly, Cloud, FlowerHead, SunAndMoon } from './GardenArt';
import { BackgroundTrees, Fireflies, GardenFeatures } from './GardenFeatures';
import { Bulb, PondLily, StrawberryPlant } from './GardenFlora';
import { type GardenLifeLabels, useGardenLife } from './GardenLife';

type Style = CSSProperties & Record<`--${string}`, string>;

/** Grass groups per row of a garden 340 wide (#2063). */
const TUFT_GROUPS = 3;

export interface ScenePlant {
  id: string;
  species: GardenSpecies;
  stage: number;
  slot: number;
  role: 'own' | 'partner';
  /** Stage before this render (`-1` = just planted) for one-shot growth. */
  grewFrom?: number;
  watered: boolean;
  label: string;
  /** A water lily lives in the pond (#1907 H3, PR 3). */
  inPond?: boolean;
  /** Marked while the couple picks flowers for a bouquet. */
  picked?: boolean;
}

/** Growth and life of the garden (#1907 H3, PR 3). */
export interface SceneGrowth {
  unlocks: ReadonlyArray<GardenUnlock>;
  sharedDays: number;
  /** Unlocks announced right now; they pop in once. */
  fresh: ReadonlySet<GardenUnlock>;
  /** False while nobody may visit. */
  visitors: boolean;
  reduced: boolean;
  labels: GardenLifeLabels;
  onReaction?: Parameters<typeof useGardenLife>[0]['onReaction'];
  /** `liebe Worte` towed by the plane; a new key starts a flight. */
  banner?: { key: number; text: string; onDone: () => void } | null;
  /** "Rufen" from the garden book; a new key calls the visitor once. */
  call?: { key: number; kind: GardenAnimal } | null;
  /** Whether the called visitor came (false while nobody may visit). */
  onCall?: (kind: GardenAnimal, came: boolean) => void;
}

const NO_GROWTH: SceneGrowth = {
  unlocks: [],
  sharedDays: 0,
  fresh: new Set(),
  visitors: false,
  reduced: true,
  labels: { animal: () => '', quack: '' },
};

/** Where a plant stands: a land slot or a place in the pond. */
export function plantPosition(plant: Pick<ScenePlant, 'slot' | 'inPond'>) {
  return plant.inPond ? pondSlotPosition(plant.slot) : slotPosition(plant.slot);
}

function plantHeight(species: GardenSpecies): number {
  return SPECIES_HEIGHT[species] ?? PLANT_HEIGHT;
}

const COLOUR = {
  own: 'var(--person-own-accent)',
  partner: 'var(--person-partner-accent)',
} as const;

const GUST_MS = 3600;

function Tufts({
  ground,
  count,
  seed,
  minHeight,
  maxHeight,
  width,
  fill,
}: {
  ground: (x: number) => number;
  count: number;
  seed: number;
  minHeight: number;
  maxHeight: number;
  width: number;
  fill: string;
}) {
  // A few wide groups sway, not every tuft (#2063, Product Owner
  // 2026-11-20: three groups per row of a 340-wide garden). Each group is
  // one animation, so the meadow moves in a few offset waves while the
  // garden's per-frame work stays small.
  const groups = useMemo(() => {
    const tufts = grassTufts(ground, {
      count,
      seed,
      minHeight,
      maxHeight,
      width,
    });
    const total = Math.max(1, Math.round((TUFT_GROUPS * width) / 340));
    const span = width / total;
    return Array.from({ length: total }, (_, index) => ({
      index,
      center: (index + 0.5) * span,
      blades: tufts
        .filter(
          (tuft) => Math.min(total - 1, Math.floor(tuft.x / span)) === index,
        )
        .flatMap((tuft) => tuft.blades),
    })).filter((group) => group.blades.length > 0);
  }, [ground, count, seed, minHeight, maxHeight, width]);
  return (
    <g fill={fill}>
      {groups.map((group) => (
        <g
          key={group.index}
          className="garden-tuft"
          style={
            {
              '--garden-wave': `${Math.round(group.center * 3.2)}ms`,
              '--garden-breeze': `${-((group.index * 1600 + seed * 64) % 4800)}ms`,
            } as Style
          }
        >
          {group.blades.map((blade) => (
            <path key={blade} d={blade} />
          ))}
        </g>
      ))}
    </g>
  );
}

function Plant({ plant }: { plant: ScenePlant }) {
  const { x, y } = plantPosition(plant);
  const colour = COLOUR[plant.role];
  if (plant.inPond) {
    return (
      <g transform={`translate(${x} ${y})`}>
        <PondLily
          stage={plant.stage}
          grewFrom={plant.grewFrom}
          colour={colour}
        />
      </g>
    );
  }
  const soil = (
    <path
      d="M-11 2.6 C-9 -1 9 -1 11 2.6 C6 4.2 -6 4.2 -11 2.6Z"
      fill="var(--garden-soil)"
      opacity={0.75}
    />
  );
  if (plant.stage === 0) {
    const dropped = plant.grewFrom === -1;
    const seed =
      plant.species === 'TULIP' ? (
        <Bulb colour={colour} />
      ) : (
        <path
          d="M-3.2 -1 C-3.2 -3.4 3.2 -3.6 3.4 -1 C3.4 1.2 -3.2 1.4 -3.2 -1Z"
          fill={colour}
        />
      );
    return (
      <g transform={`translate(${x} ${y})`}>
        {soil}
        {dropped ? <g className="garden-drop">{seed}</g> : seed}
        {dropped
          ? [-9, -4, 4, 9].map((dx) => (
              <path
                key={dx}
                className="garden-puff"
                style={{ '--garden-dx': `${dx}px` } as Style}
                d="M-2 0 C-2 -1.4 2 -1.4 2 0 C2 1.4 -2 1.4 -2 0Z"
                fill="var(--garden-soil)"
              />
            ))
          : null}
      </g>
    );
  }
  if (plant.species === 'STRAWBERRY') {
    return (
      <g transform={`translate(${x} ${y})`}>
        {soil}
        <g
          className="garden-sway"
          style={
            {
              '--garden-wave': `${Math.round(x * 3.2)}ms`,
              '--garden-breeze': `${Math.round(-x * 13)}ms`,
            } as Style
          }
        >
          <StrawberryPlant
            stage={plant.stage}
            grewFrom={plant.grewFrom}
            colour={colour}
          />
        </g>
      </g>
    );
  }
  const fullHeight = plantHeight(plant.species);
  const h = STAGE_HEIGHT_SHARE[plant.stage] * fullHeight;
  const from = plant.grewFrom;
  const grew = from !== undefined && from < plant.stage;
  const sprouting = grew && (from ?? 0) <= 0;
  const leafPop = (
    child: ReactElement,
    origin: string,
    delay: number,
    on: boolean,
  ) =>
    on ? (
      <g
        className="garden-pop"
        style={
          { '--garden-origin': origin, '--garden-delay': `${delay}ms` } as Style
        }
      >
        {child}
      </g>
    ) : (
      child
    );
  const previousHeight =
    from !== undefined && from >= 1 ? STAGE_HEIGHT_SHARE[from] * fullHeight : 0;
  const stretch = grew && (from ?? 0) >= 1;
  return (
    <g transform={`translate(${x} ${y})`}>
      {soil}
      <g
        className="garden-sway"
        style={
          {
            '--garden-wave': `${Math.round(x * 3.2)}ms`,
            '--garden-breeze': `${Math.round(-x * 13)}ms`,
          } as Style
        }
      >
        <g
          className={stretch ? 'garden-stretch' : undefined}
          style={
            stretch
              ? ({
                  '--garden-from': (previousHeight / h).toFixed(2),
                } as Style)
              : undefined
          }
        >
          <path
            className={sprouting ? 'garden-draw' : undefined}
            pathLength={1}
            d={`M0 0 C 2 ${-h / 3} -2 ${(-h * 2) / 3} 0 ${-h}`}
            stroke="var(--garden-stem)"
            strokeWidth={plant.species === 'SUNFLOWER' ? 3.4 : 2.6}
            fill="none"
            strokeLinecap="round"
          />
          {leafPop(
            <path
              d={`M0 ${-h * 0.35} q -10 -2 -12 -10 q 9 0 12 10Z`}
              fill="var(--garden-leaf)"
            />,
            '100% 100%',
            380,
            sprouting,
          )}
          {plant.stage >= 2
            ? leafPop(
                <path
                  d={`M0 ${-h * 0.55} q 10 -2 12 -10 q -9 0 -12 10Z`}
                  fill="var(--garden-leaf)"
                />,
                '0% 100%',
                260,
                grew && (from ?? 0) <= 1,
              )
            : null}
          {plant.stage === 2
            ? leafPop(
                <path
                  d={`M0 ${-h - 11} C4.6 ${-h - 9} 4.6 ${-h + 1} 0 ${-h + 2} C-4.6 ${-h + 1} -4.6 ${-h - 9} 0 ${-h - 11}Z`}
                  fill={colour}
                />,
                '50% 100%',
                420,
                grew && (from ?? 0) <= 1,
              )
            : null}
          {plant.stage === 3 ? (
            <g transform={`translate(0 ${-h - 4})`}>
              {grew && (from ?? 0) <= 2 ? (
                <g className="garden-open">
                  <FlowerHead
                    species={plant.species}
                    colour={colour}
                    opening
                    delay={360}
                  />
                </g>
              ) : (
                <FlowerHead species={plant.species} colour={colour} />
              )}
            </g>
          ) : null}
        </g>
        {plant.watered ? (
          <g fill="var(--garden-dew)">
            <path
              d={`M-7 ${-h * 0.35 - 7.6} C-5.8 ${-h * 0.35 - 6} -5.8 ${-h * 0.35 - 4.4} -7 ${-h * 0.35 - 4.4} C-8.2 ${-h * 0.35 - 4.4} -8.2 ${-h * 0.35 - 6} -7 ${-h * 0.35 - 7.6}Z`}
            />
            <path
              d={`M6 ${-h * 0.55 - 6.4} C7 ${-h * 0.55 - 5} 7 ${-h * 0.55 - 3.6} 6 ${-h * 0.55 - 3.6} C5 ${-h * 0.55 - 3.6} 5 ${-h * 0.55 - 5} 6 ${-h * 0.55 - 6.4}Z`}
            />
          </g>
        ) : null}
      </g>
    </g>
  );
}

/** A plant's art in a group that can bounce or perk up from its base. */
function PlantArt({ plant }: { plant: ScenePlant }) {
  const { x, y } = plantPosition(plant);
  return (
    <g
      className="garden-plant-art"
      data-plant-art={plant.id}
      style={{ '--garden-plant-origin': `${x}px ${y}px` } as Style}
    >
      <Plant plant={plant} />
    </g>
  );
}

/**
 * The garden scene. Decoration is hidden from assistive technology; each
 * plant is a named button so its story can be opened by keyboard too.
 */
export function GardenScene({
  plants,
  width,
  selectedId,
  watering,
  onSelect,
  gustKey,
  celebrationKey,
  lively,
  label,
  layers,
  growth = NO_GROWTH,
  ambience,
  story,
  variant = 'game',
  cover = false,
}: {
  plants: ScenePlant[];
  width: number;
  selectedId: string | null;
  watering: boolean;
  onSelect: (id: string) => void;
  gustKey: number;
  celebrationKey: number;
  lively: boolean;
  label: string;
  /** Presentation layers (seasons, lanterns, reunion, mist; PR 2). */
  layers?: {
    sky?: ReactNode;
    ground?: ReactNode;
    meadow?: ReactNode;
    overlay?: ReactNode;
  };
  growth?: SceneGrowth;
  /** Time of day, seasonal particles, taps and together moments. */
  ambience?: SceneAmbience;
  /**
   * The couple's story in the garden (#1907 H3 follow-up): rare visitors on
   * the back hill and the pond, Milestone plants at the meadow's front edge,
   * a find in front, and their named tap targets.
   */
  story?: {
    back?: ReactNode;
    meadow?: ReactNode;
    pond?: ReactNode;
    front?: ReactNode;
    targets?: ReactNode;
  };
  /**
   * `preview` draws the same garden as a decorative, read-only picture (the
   * Wir module): no plant or visitor targets, hidden from assistive
   * technology because the surrounding link names it.
   */
  variant?: 'game' | 'preview';
  /**
   * Full screen (#2048): the picture covers its box like a photo and keeps
   * the ground in view; only sky is cut when the box is wider.
   */
  cover?: boolean;
}) {
  const preview = variant === 'preview';
  const id = useId().replace(/:/g, '');
  const svg = useRef<SVGSVGElement | null>(null);
  const life = useGardenLife({
    width,
    sharedDays: growth.sharedDays,
    unlocks: growth.unlocks,
    lively,
    reduced: growth.reduced,
    visitors: growth.visitors,
    labels: growth.labels,
    onReaction: growth.onReaction,
  });
  const fly = life.fly;
  const banner = growth.banner;
  useEffect(() => {
    if (banner) fly(banner.text, banner.onDone);
  }, [banner, fly]);
  // "Rufen": each new call reaches the visitor once.
  const call = growth.call;
  const calling = useRef({ visit: life.call, done: growth.onCall });
  calling.current = { visit: life.call, done: growth.onCall };
  useEffect(() => {
    if (!call) return;
    const came = calling.current.visit(call.kind);
    calling.current.done?.(call.kind, came);
  }, [call]);
  const scene = useGardenAmbience({
    ambience,
    width,
    plants,
    unlocks: growth.unlocks,
    reduced: growth.reduced,
    svg,
  });
  const sun = sunPlace(ambience?.daytime ?? 'day', width);
  const trees = useMemo(
    () => backgroundTrees(growth.sharedDays, width),
    [growth.sharedDays, width],
  );
  const landPlants = plants.filter((plant) => !plant.inPond);
  const pondPlants = plants.filter((plant) => plant.inPond);
  const skyId = `garden-sky-${id}`;
  const hillBackId = `garden-hill-back-${id}`;
  const hillFrontId = `garden-hill-front-${id}`;
  const haloId = `garden-halo-${id}`;
  const [gusting, setGusting] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const gustTimer = useRef<number | null>(null);

  // A one-shot gust whenever the parent asks for one (open, plant, shared day).
  useEffect(() => {
    if (gustKey === 0) return;
    setGusting(false);
    const frame = window.requestAnimationFrame(() => setGusting(true));
    if (gustTimer.current !== null) window.clearTimeout(gustTimer.current);
    gustTimer.current = window.setTimeout(() => setGusting(false), GUST_MS);
    return () => window.cancelAnimationFrame(frame);
  }, [gustKey]);
  useEffect(() => {
    if (celebrationKey === 0) return;
    setCelebrating(true);
    const timer = window.setTimeout(() => setCelebrating(false), 5200);
    return () => window.clearTimeout(timer);
  }, [celebrationKey]);
  useEffect(
    () => () => {
      if (gustTimer.current !== null) window.clearTimeout(gustTimer.current);
    },
    [],
  );

  const stars = useMemo(() => {
    const random = seededRandom(3);
    return Array.from({ length: Math.round((10 * width) / 340) }, (_, k) => {
      const x = random() * width;
      const y = 12 + random() * 60;
      const r = k % 3 ? 1.7 : 2.6;
      return {
        d: `M${x.toFixed(1)} ${(y - r).toFixed(1)} Q${x.toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)} Q${x.toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${(y + r).toFixed(1)} Q${x.toFixed(1)} ${y.toFixed(1)} ${(x - r).toFixed(1)} ${y.toFixed(1)} Q${x.toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${(y - r).toFixed(1)}Z`,
        delay: k * 160,
      };
    });
  }, [width]);
  const dots = useMemo(() => {
    const random = seededRandom(7);
    return Array.from({ length: Math.round((26 * width) / 340) }, (_, k) => {
      const x = random() * width;
      const y = groundFront(x) + 6 + random() * 30;
      const r = 0.9 + random() * 1.1;
      return { x, y, r, sun: k % 3 === 0 };
    });
  }, [width]);
  const pollen = useMemo(() => {
    const random = seededRandom(41);
    return Array.from({ length: Math.round((14 * width) / 340) }, () => {
      const x = 20 + random() * (width - 40);
      return {
        x,
        y: groundFront(x) - 4,
        delay: Math.round(300 + random() * 900),
        dx: Math.round((random() - 0.5) * 30),
      };
    });
  }, [width]);

  const rays = Array.from({ length: 8 }, (_, k) => {
    const a = ((k * 45 + 22.5) * Math.PI) / 180;
    return `M0 0 L${(Math.cos(a) * 240).toFixed(1)} ${(Math.sin(a) * 240).toFixed(1)}`;
  });

  const onKey = (event: KeyboardEvent<SVGGElement>, plantId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(plantId);
    }
  };

  const sceneClass = `garden-scene${lively ? ' is-lively' : ''}${gusting ? ' is-gusting' : ''}${celebrating ? ' is-celebrating' : ''}${preview ? ' is-preview' : ''}`;
  const viewBox = `0 0 ${width} ${GARDEN_HEIGHT}`;
  const aspect = preview || cover ? 'xMidYMax slice' : undefined;
  // Each depth band is its own SVG on its own compositor layer (#2063): a
  // moving tuft or cloud then re-rasters only its band, never the sky and
  // the hills underneath, which stay painted from the first frame.
  const band = (name: string, content: ReactNode) => (
    <SceneBand
      name={name}
      className={sceneClass}
      viewBox={viewBox}
      aspect={aspect}
    >
      {content}
    </SceneBand>
  );

  return (
    <div
      className={`garden-scene-stack${preview ? ' is-preview' : ''}`}
      style={
        preview ? undefined : { width: `${((width / 340) * 100).toFixed(1)}%` }
      }
    >
      {band(
        'sky',
        <>
          <defs>
            <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--garden-sky-top)" />
              <stop offset="1" stopColor="var(--garden-sky-bottom)" />
            </linearGradient>
            <linearGradient id={hillBackId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--garden-hill-back)" />
              <stop offset="1" stopColor="var(--garden-hill)" />
            </linearGradient>
            <linearGradient id={hillFrontId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--garden-hill)" />
              <stop offset="1" stopColor="var(--garden-grass-mid)" />
            </linearGradient>
            <radialGradient id={haloId}>
              <stop
                offset=".3"
                stopColor="var(--garden-sun)"
                stopOpacity=".5"
              />
              <stop offset="1" stopColor="var(--garden-sun)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width={width} height={GARDEN_HEIGHT} fill={`url(#${skyId})`} />
        </>,
      )}
      {band(
        'sky-life',
        <>
          {stars.map((star) => (
            <path
              key={star.d}
              className="garden-star"
              style={{ '--garden-delay': `${star.delay}ms` } as Style}
              d={star.d}
              fill="var(--garden-star)"
            />
          ))}
          {scene.sky}
          <g className="garden-clouds">
            {sceneClouds(width).map((cloud, index) => (
              <Cloud
                key={`${cloud.x}-${cloud.y}`}
                x={cloud.x}
                y={cloud.y}
                scale={cloud.scale}
                flip={cloud.flip}
              >
                {scene.shower(index)}
              </Cloud>
            ))}
          </g>
          <g
            className="garden-sun-place"
            style={{ transform: `translate(${sun.x}px, ${sun.y}px)` }}
            data-testid="garden-sun"
          >
            <g className="garden-rays">
              {rays.map((d) => (
                <path
                  key={d}
                  d={d}
                  stroke="var(--garden-sun)"
                  strokeWidth={16}
                  strokeLinecap="round"
                  opacity={0.22}
                />
              ))}
            </g>
            <SunAndMoon haloId={haloId} />
          </g>
          {layers?.sky}
          <g data-testid="garden-sky-life">{life.sky}</g>
        </>,
      )}
      {band(
        'hill-back',
        <path d={groundPath(groundBack, width)} fill={`url(#${hillBackId})`} />,
      )}
      {band(
        'back',
        <>
          <BackgroundTrees trees={trees} />
          <GardenFeatures
            layer="back"
            unlocks={growth.unlocks}
            width={width}
            fresh={growth.fresh}
            treeDecor={scene.treeDecor}
          />
          {scene.back}
          {life.layer('back')}
          {story?.back}
          <Tufts
            ground={groundBack}
            count={Math.round((34 * width) / 340)}
            seed={3}
            minHeight={4}
            maxHeight={8}
            width={width}
            fill="var(--garden-grass-back)"
          />
        </>,
      )}
      {band(
        'hill-front',
        <>
          <path
            d={groundPath(groundFront, width)}
            fill={`url(#${hillFrontId})`}
          />
          {layers?.ground}
        </>,
      )}
      {band(
        'meadow',
        <>
          <GardenFeatures
            layer="ground"
            unlocks={growth.unlocks}
            width={width}
            fresh={growth.fresh}
          />
          {pondPlants.map((plant) => (
            <PlantArt key={plant.id} plant={plant} />
          ))}
          {life.layer('pond')}
          {story?.pond}
          <Tufts
            ground={groundFront}
            count={Math.round((40 * width) / 340)}
            seed={11}
            minHeight={6}
            maxHeight={12}
            width={width}
            fill="var(--garden-grass-mid)"
          />
          {dots.map((dot) => (
            <path
              key={`${dot.x}-${dot.y}`}
              d={`M${dot.x.toFixed(1)} ${(dot.y - dot.r).toFixed(1)} C${(dot.x + dot.r * 1.1).toFixed(1)} ${(dot.y - dot.r).toFixed(1)} ${(dot.x + dot.r * 1.1).toFixed(1)} ${(dot.y + dot.r).toFixed(1)} ${dot.x.toFixed(1)} ${(dot.y + dot.r).toFixed(1)} C${(dot.x - dot.r * 1.1).toFixed(1)} ${(dot.y + dot.r).toFixed(1)} ${(dot.x - dot.r * 1.1).toFixed(1)} ${(dot.y - dot.r).toFixed(1)} ${dot.x.toFixed(1)} ${(dot.y - dot.r).toFixed(1)}Z`}
              fill={dot.sun ? 'var(--garden-sun)' : 'var(--garden-meadow-dot)'}
            />
          ))}
          {layers?.meadow}
          <GardenFeatures
            layer="arch"
            unlocks={growth.unlocks}
            width={width}
            fresh={growth.fresh}
          />
          {landPlants.map((plant) => (
            <PlantArt key={plant.id} plant={plant} />
          ))}
          <Tufts
            ground={() => 214}
            count={Math.round((30 * width) / 340)}
            seed={23}
            minHeight={10}
            maxHeight={22}
            width={width}
            fill="var(--garden-grass-front)"
          />
          {story?.meadow}
          {life.layer('front')}
          {story?.front}
        </>,
      )}
      {band('tint', scene.tint)}
      {band(
        'front',
        <>
          {growth.unlocks.includes('STREAM') && growth.visitors ? (
            <Fireflies width={width} />
          ) : null}
          {celebrating ? (
            <g>
              {pollen.map((dot) => (
                <path
                  key={`${dot.x}`}
                  className="garden-pollen"
                  style={
                    {
                      '--garden-delay': `${dot.delay}ms`,
                      '--garden-dx': `${dot.dx}px`,
                    } as Style
                  }
                  d={`M${dot.x.toFixed(1)} ${(dot.y - 1.4).toFixed(1)} C${(dot.x + 1.5).toFixed(1)} ${(dot.y - 1.4).toFixed(1)} ${(dot.x + 1.5).toFixed(1)} ${(dot.y + 1.4).toFixed(1)} ${dot.x.toFixed(1)} ${(dot.y + 1.4).toFixed(1)} C${(dot.x - 1.5).toFixed(1)} ${(dot.y + 1.4).toFixed(1)} ${(dot.x - 1.5).toFixed(1)} ${(dot.y - 1.4).toFixed(1)} ${dot.x.toFixed(1)} ${(dot.y - 1.4).toFixed(1)}Z`}
                  fill="var(--garden-sun)"
                />
              ))}
              <g
                className="garden-butterfly"
                style={{ '--garden-width': `${width + 32}px` } as Style}
              >
                <g className="garden-butterfly-wobble">
                  <Butterfly />
                </g>
              </g>
            </g>
          ) : null}
          {scene.front}
          {layers?.overlay}
        </>,
      )}
      {/* The top band carries the scene's name and every tap target; it is
          the one in flow, so it sizes the stack the bands are laid over. */}
      <svg
        ref={svg}
        className={`${sceneClass} garden-scene-targets`}
        viewBox={viewBox}
        preserveAspectRatio={aspect}
        aria-label={preview ? undefined : label}
        aria-hidden={preview ? true : undefined}
        focusable={preview ? 'false' : undefined}
        data-testid={preview ? 'garden-scene-preview' : 'garden-scene'}
      >
        {/* Tree, pond and clouds, then visitors, so a plant stays on top. */}
        {preview ? null : scene.targets}
        {preview ? null : life.tapTargets}
        {preview ? null : story?.targets}
        {(preview ? [] : plants).map((plant) => {
          const { x, y } = plantPosition(plant);
          const reach = plant.inPond ? 8 : plantHeight(plant.species);
          const selected = plant.id === selectedId || plant.picked === true;
          return (
            // biome-ignore lint/a11y/useSemanticElements: an SVG plant cannot be a native button
            <g
              key={plant.id}
              className={`garden-plant-target${selected ? ' is-selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={watering ? undefined : selected}
              data-in-pond={plant.inPond ? 'true' : undefined}
              aria-label={plant.label}
              onClick={() => onSelect(plant.id)}
              onKeyDown={(event) => onKey(event, plant.id)}
              data-testid={`garden-plant-${plant.slot}`}
            >
              <rect
                x={x - 12}
                y={y - (14 + reach)}
                width={24}
                height={20 + reach}
                rx={8}
                fill="transparent"
              />
              {selected ? (
                <path
                  d={`M${x - 15} ${y + 3} C${x - 15} ${y - 3} ${x + 15} ${y - 3} ${x + 15} ${y + 3} C${x + 15} ${y + 9} ${x - 15} ${y + 9} ${x - 15} ${y + 3}Z`}
                  fill="none"
                  stroke="var(--color-focus)"
                  strokeWidth={1.6}
                  strokeDasharray="3 3"
                />
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * One depth band of the garden: decorative, laid exactly over the top band
 * (same viewBox and box), and never a tap target itself.
 */
function SceneBand({
  name,
  className,
  viewBox,
  aspect,
  children,
}: {
  name: string;
  className: string;
  viewBox: string;
  aspect: string | undefined;
  children: ReactNode;
}) {
  return (
    <svg
      className={`${className} garden-scene-band`}
      data-band={name}
      viewBox={viewBox}
      preserveAspectRatio={aspect}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

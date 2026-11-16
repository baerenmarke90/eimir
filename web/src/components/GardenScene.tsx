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
import {
  Butterfly,
  Cloud,
  FlowerHead,
  SunAndMoon,
  WateringCan,
} from './GardenArt';

type Style = CSSProperties & Record<`--${string}`, string>;

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
  const tufts = useMemo(
    () => grassTufts(ground, { count, seed, minHeight, maxHeight, width }),
    [ground, count, seed, minHeight, maxHeight, width],
  );
  return (
    <g fill={fill}>
      {tufts.map((tuft, index) => (
        <g
          // biome-ignore lint/suspicious/noArrayIndexKey: deterministic decoration
          key={index}
          className="garden-tuft"
          style={
            {
              '--garden-wave': `${Math.round(tuft.x * 3.2)}ms`,
              '--garden-breeze': `${Math.round(-((tuft.x * 37) % 5000))}ms`,
            } as Style
          }
        >
          {tuft.blades.map((blade) => (
            <path key={blade} d={blade} />
          ))}
        </g>
      ))}
    </g>
  );
}

function Plant({ plant }: { plant: ScenePlant }) {
  const { x, y } = slotPosition(plant.slot);
  const colour = COLOUR[plant.role];
  const soil = (
    <path
      d="M-11 2.6 C-9 -1 9 -1 11 2.6 C6 4.2 -6 4.2 -11 2.6Z"
      fill="var(--garden-soil)"
      opacity={0.75}
    />
  );
  if (plant.stage === 0) {
    const dropped = plant.grewFrom === -1;
    const seed = (
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
  const h = STAGE_HEIGHT_SHARE[plant.stage] * PLANT_HEIGHT;
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
    from !== undefined && from >= 1
      ? STAGE_HEIGHT_SHARE[from] * PLANT_HEIGHT
      : 0;
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
            strokeWidth={2.6}
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
  wateredPlantId,
  lively,
  label,
  layers,
}: {
  plants: ScenePlant[];
  width: number;
  selectedId: string | null;
  watering: boolean;
  onSelect: (id: string) => void;
  gustKey: number;
  celebrationKey: number;
  wateredPlantId: string | null;
  lively: boolean;
  label: string;
  /** Presentation layers (seasons, lanterns, reunion, mist; PR 2). */
  layers?: {
    sky?: ReactNode;
    ground?: ReactNode;
    meadow?: ReactNode;
    overlay?: ReactNode;
  };
}) {
  const id = useId().replace(/:/g, '');
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

  const watered = plants.find((plant) => plant.id === wateredPlantId);
  const wateredAt = watered ? slotPosition(watered.slot) : null;
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

  return (
    <svg
      className={`garden-scene${lively ? ' is-lively' : ''}${gusting ? ' is-gusting' : ''}${celebrating ? ' is-celebrating' : ''}`}
      viewBox={`0 0 ${width} ${GARDEN_HEIGHT}`}
      style={{ width: `${((width / 340) * 100).toFixed(1)}%` }}
      aria-label={label}
      data-testid="garden-scene"
    >
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
          <stop offset=".3" stopColor="var(--garden-sun)" stopOpacity=".5" />
          <stop offset="1" stopColor="var(--garden-sun)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: decoration only; the plant buttons follow outside this group */}
      <g aria-hidden="true">
        <rect width={width} height={GARDEN_HEIGHT} fill={`url(#${skyId})`} />
        {stars.map((star) => (
          <path
            key={star.d}
            className="garden-star"
            style={{ '--garden-delay': `${star.delay}ms` } as Style}
            d={star.d}
            fill="var(--garden-star)"
          />
        ))}
        <g className="garden-clouds">
          <Cloud x={74} y={44} scale={0.9} />
          <Cloud x={212} y={68} scale={0.62} flip />
          {width > 340 ? <Cloud x={width - 150} y={36} scale={0.75} /> : null}
        </g>
        <g transform={`translate(${width - 58} 44)`}>
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
        <path d={groundPath(groundBack, width)} fill={`url(#${hillBackId})`} />
        <Tufts
          ground={groundBack}
          count={Math.round((34 * width) / 340)}
          seed={3}
          minHeight={4}
          maxHeight={8}
          width={width}
          fill="var(--garden-grass-back)"
        />
        <path
          d={groundPath(groundFront, width)}
          fill={`url(#${hillFrontId})`}
        />
        {layers?.ground}
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
        {plants.map((plant) => (
          <Plant key={plant.id} plant={plant} />
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
        {wateredAt ? (
          <g
            key={wateredPlantId}
            transform={`translate(${wateredAt.x} ${wateredAt.y - 64})`}
            className="garden-watering"
          >
            <g transform="translate(-8 -2) rotate(24)">
              <WateringCan />
            </g>
            {[-6, -1, 4].map((dx, k) => (
              <path
                key={dx}
                className="garden-rain"
                style={{ '--garden-delay': `${200 + k * 120}ms` } as Style}
                transform={`translate(${dx} 0)`}
                d="M0 -2 Q 2 1 0 3 Q -2 1 0 -2Z"
                fill="var(--garden-dew)"
              />
            ))}
          </g>
        ) : null}
        {layers?.overlay}
      </g>
      {plants.map((plant) => {
        const { x, y } = slotPosition(plant.slot);
        const selected = plant.id === selectedId;
        return (
          // biome-ignore lint/a11y/useSemanticElements: an SVG plant cannot be a native button
          <g
            key={plant.id}
            className={`garden-plant-target${selected ? ' is-selected' : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={watering ? undefined : selected}
            aria-label={plant.label}
            onClick={() => onSelect(plant.id)}
            onKeyDown={(event) => onKey(event, plant.id)}
            data-testid={`garden-plant-${plant.slot}`}
          >
            <rect
              x={x - 12}
              y={y - (14 + PLANT_HEIGHT)}
              width={24}
              height={20 + PLANT_HEIGHT}
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
  );
}

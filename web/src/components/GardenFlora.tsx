/**
 * The plants that join the garden as it grows (#1907 H3, PR 3): sunflower,
 * tulip, water lily, strawberry, the moonflower and its wrapped surprise seed.
 * Organic Bézier shapes only, no bare circles or corners (Product Owner,
 * 2026-11-16). Colours come from the `--garden-*` roles and person colours.
 */

import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type { GardenSpecies } from '../api/generated/models/GardenSpecies';
import { blob, petalPath } from '../client/garden';

type Style = CSSProperties & Record<`--${string}`, string>;

export const GROWTH_SPECIES = [
  'SUNFLOWER',
  'TULIP',
  'WATER_LILY',
  'STRAWBERRY',
  'MOONFLOWER',
  'SURPRISE',
] as const satisfies readonly GardenSpecies[];

export function isGrowthSpecies(species: GardenSpecies): boolean {
  return (GROWTH_SPECIES as readonly GardenSpecies[]).includes(species);
}

function Petal({
  length,
  width,
  rotate,
  fill,
  opacity,
}: {
  length: number;
  width: number;
  rotate: number;
  fill: string;
  opacity?: number;
}) {
  return (
    <path
      transform={`rotate(${Math.round(rotate * 10) / 10})`}
      d={petalPath(length, width)}
      fill={fill}
      opacity={opacity}
    />
  );
}

function Pop({
  opening,
  delay,
  index,
  children,
}: {
  opening: boolean;
  delay: number;
  index: number;
  children: ReactNode;
}) {
  if (!opening) return <>{children}</>;
  return (
    <g
      className="garden-pop"
      style={{ '--garden-delay': `${delay + index * 70}ms` } as Style}
    >
      {children}
    </g>
  );
}

/** A small seed-sized dot drawn as a soft blob (never a bare circle). */
export function Dot({
  x,
  y,
  r,
  fill,
  opacity,
}: {
  x: number;
  y: number;
  r: number;
  fill: string;
  opacity?: number;
}) {
  return (
    <path
      d={`M${x} ${y - r} C${x + r * 1.1} ${y - r} ${x + r * 1.1} ${y + r} ${x} ${y + r} C${x - r * 1.1} ${y + r} ${x - r * 1.1} ${y - r} ${x} ${y - r}Z`}
      fill={fill}
      opacity={opacity}
    />
  );
}

/** A wrapped surprise: a soft parcel with a ribbon and a bow. */
export function SurpriseParcel({ colour }: { colour: string }) {
  return (
    <g>
      <path
        d="M-12 -14 C-12 -16.4 -10.4 -17 -8 -17 L8 -17 C10.4 -17 12 -16.4 12 -14 L12.6 3.6 C12.6 6 11 7 8.6 7 L-8.6 7 C-11 7 -12.6 6 -12.6 3.6Z"
        fill={colour}
      />
      <path
        d="M-1.6 -17 L1.6 -17 L1.8 7 L-1.8 7Z M-12.4 -7.6 L12.4 -7.6 L12.4 -4.6 L-12.4 -4.6Z"
        fill="var(--garden-sun)"
      />
      <path
        d="M0 -17 C-3 -22 -9.6 -24 -10.4 -20 C-10.8 -17.4 -5 -16.6 0 -17Z M0 -17 C3 -22 9.6 -24 10.4 -20 C10.8 -17.4 5 -16.6 0 -17Z"
        fill="var(--garden-sun)"
      />
      <path
        d="M-8.6 -14 C-8.8 -10 -8.8 -2 -8.4 3"
        stroke="var(--garden-highlight)"
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
        opacity={0.3}
      />
    </g>
  );
}

/** Flower heads of the growth species; centred on 0,0 like the core ones. */
export function GrowthFlowerHead({
  species,
  colour,
  opening = false,
  delay = 0,
}: {
  species: GardenSpecies;
  colour: string;
  opening?: boolean;
  delay?: number;
}): ReactElement {
  if (species === 'SUNFLOWER') {
    const step = 360 / 13;
    return (
      <g>
        {Array.from({ length: 13 }, (_, k) => (
          <Pop
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed petals
            key={k}
            opening={opening}
            delay={delay}
            index={k % 6}
          >
            <Petal
              length={12.5}
              width={3.4}
              rotate={k * step}
              fill="var(--garden-sun)"
            />
            <Petal
              length={9.5}
              width={2.6}
              rotate={k * step + 14}
              fill="var(--garden-petal-shade)"
              opacity={0.35}
            />
          </Pop>
        ))}
        <Pop opening={opening} delay={delay} index={6}>
          <path d={blob(0, 0, 6.6, 6.6, 7, 0.06)} fill={colour} />
          <path
            d={blob(0, 0, 4, 4, 6, 0.1)}
            fill="var(--garden-soil)"
            opacity={0.55}
          />
        </Pop>
      </g>
    );
  }
  if (species === 'TULIP') {
    return (
      <Pop opening={opening} delay={delay} index={0}>
        <path
          d="M0 6 C-8 5.5 -9.5 -4 -6.5 -11 C-3.5 -7 -1 -2 0 6Z"
          fill={colour}
        />
        <path d="M0 6 C8 5.5 9.5 -4 6.5 -11 C3.5 -7 1 -2 0 6Z" fill={colour} />
        <path
          d="M0 6 C-4.5 2 -4.5 -8 0 -13.5 C4.5 -8 4.5 2 0 6Z"
          fill={colour}
        />
        <path
          d="M0 6 C-4.5 2 -4.5 -8 0 -13.5 C4.5 -8 4.5 2 0 6Z"
          fill="var(--garden-highlight)"
          opacity={0.16}
        />
      </Pop>
    );
  }
  if (species === 'WATER_LILY') {
    return (
      <g>
        {Array.from({ length: 7 }, (_, k) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed petals
          <Pop key={k} opening={opening} delay={delay} index={k}>
            <Petal
              length={10}
              width={3.4}
              rotate={-90 + (k - 3) * 25}
              fill={colour}
            />
          </Pop>
        ))}
        {Array.from({ length: 5 }, (_, k) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed petals
          <Pop key={`inner-${k}`} opening={opening} delay={delay} index={k + 2}>
            <Petal
              length={7.5}
              width={3}
              rotate={-90 + (k - 2) * 22}
              fill="var(--garden-highlight)"
              opacity={0.35}
            />
          </Pop>
        ))}
        <Pop opening={opening} delay={delay} index={7}>
          <path d={blob(0, -1, 2.6, 2, 5, 0.1)} fill="var(--garden-sun)" />
        </Pop>
      </g>
    );
  }
  if (species === 'STRAWBERRY') {
    const seeds: Array<[number, number]> = [
      [-1.3, -1],
      [1.4, -0.4],
      [-0.2, 1.4],
      [1.2, 2.4],
      [-1.6, 2],
    ];
    return (
      <Pop opening={opening} delay={delay} index={0}>
        <path
          d="M0 -4.6 C4.6 -4.8 4.8 1 2.6 4 C1.4 5.6 -1.4 5.6 -2.6 4 C-4.8 1 -4.6 -4.8 0 -4.6Z"
          fill="var(--garden-berry)"
        />
        <path
          d="M-3.8 -4.4 C-2 -6.2 -.8 -5 0 -6.4 C.8 -5 2 -6.2 3.8 -4.4 C2 -3.6 .9 -3.6 0 -4.2 C-.9 -3.6 -2 -3.6 -3.8 -4.4Z"
          fill="var(--garden-leaf)"
        />
        {seeds.map(([x, y]) => (
          <path
            key={`${x}-${y}`}
            d={`M${x} ${y - 0.5} C${x + 0.35} ${y} ${x} ${y + 0.5} ${x} ${y + 0.5} C${x} ${y + 0.5} ${x - 0.35} ${y} ${x} ${y - 0.5}Z`}
            fill="var(--garden-sun)"
          />
        ))}
        <path
          d="M-1.6 -3 C-2.6 -1.6 -2.6 0.4 -2 1.6"
          stroke={colour}
          strokeWidth={0.7}
          strokeLinecap="round"
          fill="none"
          opacity={0.6}
        />
      </Pop>
    );
  }
  if (species === 'SURPRISE') {
    return (
      <g transform="scale(0.62)">
        <SurpriseParcel colour={colour} />
      </g>
    );
  }
  // The moonflower glows softly at night (its halo shows in the Dark theme).
  return (
    <g>
      <path
        className="garden-moon-halo"
        d={blob(0, 0, 16, 16, 12, 0.025)}
        fill="var(--garden-moon-glow)"
      />
      {Array.from({ length: 6 }, (_, k) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed petals
        <Pop key={k} opening={opening} delay={delay} index={k}>
          <Petal
            length={12.5}
            width={4.4}
            rotate={k * 60}
            fill="var(--garden-moon-petal)"
          />
          <Petal
            length={8}
            width={1.6}
            rotate={k * 60}
            fill={colour}
            opacity={0.25}
          />
        </Pop>
      ))}
      <Pop opening={opening} delay={delay} index={6}>
        <path d={blob(0, 0, 2.8, 2.8, 5, 0.1)} fill={colour} />
      </Pop>
    </g>
  );
}

/** A tulip bulb waiting in the soil (instead of a plain seed). */
export function Bulb({ colour }: { colour: string }) {
  return (
    <g>
      <path d="M-4 0 Q -5 -5 0 -8 Q 5 -5 4 0 Q 0 2 -4 0Z" fill={colour} />
      <path
        d="M0 -8 C.2 -9 .2 -10 0 -11"
        stroke="var(--garden-stem)"
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

/** A low strawberry plant: leaves, then white blossoms, then berries. */
export function StrawberryPlant({
  stage,
  grewFrom,
  colour,
}: {
  stage: number;
  grewFrom?: number;
  colour: string;
}) {
  const grew = grewFrom !== undefined && grewFrom < stage;
  const pop = (on: boolean, delay: number, child: ReactNode) =>
    on ? (
      <g
        className="garden-pop"
        style={
          {
            '--garden-origin': '50% 100%',
            '--garden-delay': `${delay}ms`,
          } as Style
        }
      >
        {child}
      </g>
    ) : (
      child
    );
  return (
    <g>
      {pop(
        grew && (grewFrom ?? 0) <= 0,
        200,
        <g fill="var(--garden-leaf)">
          <path d={blob(-6, -5, 6, 3.6, 5, 0.08, 0.4)} />
          <path d={blob(6, -5, 6, 3.6, 5, 0.08, 2.4)} />
          <path d={blob(0, -8, 5, 3.4, 5, 0.08, 1.2)} />
        </g>,
      )}
      {stage >= 2
        ? pop(
            grew && (grewFrom ?? 0) <= 1,
            300,
            <g>
              <path
                d={blob(-7, -11, 2.4, 2.4, 5, 0.18)}
                fill="var(--garden-berry-blossom)"
              />
              <path
                d={blob(7, -12, 2.4, 2.4, 5, 0.18, 0.6)}
                fill="var(--garden-berry-blossom)"
              />
            </g>,
          )
        : null}
      {stage === 3
        ? pop(
            grew && (grewFrom ?? 0) <= 2,
            360,
            <g>
              <g transform="translate(-6 -2) scale(0.9)">
                <GrowthFlowerHead species="STRAWBERRY" colour={colour} />
              </g>
              <g transform="translate(6 -1) scale(0.8)">
                <GrowthFlowerHead species="STRAWBERRY" colour={colour} />
              </g>
            </g>,
          )
        : null}
    </g>
  );
}

/** A water lily in the pond: a pad, a bud, then the open flower. */
export function PondLily({
  stage,
  grewFrom,
  colour,
}: {
  stage: number;
  grewFrom?: number;
  colour: string;
}) {
  const grew = grewFrom !== undefined && grewFrom < stage;
  return (
    <g>
      {stage >= 1 ? (
        <path
          d="M0 -0.4 C-3 -4.4 -11.4 -4.4 -11.4 -0.4 C-11.4 3.4 -3 4.4 2 3.6 C8 2.8 11.4 1.4 11 -1 C10.6 -3.4 6.4 -4.6 1.6 -4 L0 -0.4Z"
          fill="var(--garden-leaf)"
        />
      ) : null}
      {stage === 0 ? (
        <path
          d="M-2.6 -1 C-2.6 -2.8 2.6 -3 2.8 -1 C2.8 .8 -2.6 1 -2.6 -1Z"
          fill={colour}
        />
      ) : null}
      {stage === 2 ? (
        <path
          d="M0 -9 C3 -9 3.4 -4 2.4 -1.6 C1.6 0 -1.6 0 -2.4 -1.6 C-3.4 -4 -3 -9 0 -9Z"
          fill={colour}
        />
      ) : null}
      {stage === 3 ? (
        grew && (grewFrom ?? 0) <= 2 ? (
          <g className="garden-open">
            <GrowthFlowerHead
              species="WATER_LILY"
              colour={colour}
              opening
              delay={300}
            />
          </g>
        ) : (
          <GrowthFlowerHead species="WATER_LILY" colour={colour} />
        )
      ) : null}
    </g>
  );
}

/**
 * Illustrations of the shared garden (#1907 H3): organic shapes built from
 * Bézier outlines, no bare circles or corners (Product Owner, 2026-11-16).
 * Every colour comes from the garden tokens in `GardenGamePage.css` or the
 * person colour roles, so Light and Dark both work.
 */

import type { CSSProperties, ReactNode } from 'react';
import type { GardenSpecies } from '../api/generated/models/GardenSpecies';
import { blob, type GardenMessenger, petalPath } from '../client/garden';
import {
  GrowthFlowerHead,
  isGrowthSpecies,
  SurpriseParcel,
} from './GardenFlora';

type Style = CSSProperties & Record<`--${string}`, string>;

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

/** Petals pop in one after another when `opening` is set. */
function Staggered({
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

export function FlowerHead({
  species,
  colour,
  opening = false,
  delay = 0,
}: {
  species: GardenSpecies;
  colour: string;
  opening?: boolean;
  delay?: number;
}) {
  // Species that join as the garden grows are drawn in GardenFlora (PR 3).
  if (isGrowthSpecies(species)) {
    return (
      <GrowthFlowerHead
        species={species}
        colour={colour}
        opening={opening}
        delay={delay}
      />
    );
  }
  if (species === 'POPPY') {
    return (
      <g>
        {[0, 1, 2, 3, 4].map((k) => (
          <Staggered key={k} opening={opening} delay={delay} index={k}>
            <Petal length={10} width={7.6} rotate={k * 72 + 10} fill={colour} />
            <Petal
              length={7}
              width={3.4}
              rotate={k * 72 + 10}
              fill="var(--garden-highlight)"
              opacity={0.16}
            />
          </Staggered>
        ))}
        <Staggered opening={opening} delay={delay} index={5}>
          <path
            d={blob(0, 0, 3.6, 3.4, 5, 0.12)}
            fill="var(--garden-ink)"
            opacity={0.72}
          />
        </Staggered>
      </g>
    );
  }
  if (species === 'BELLFLOWER') {
    return (
      <Staggered opening={opening} delay={delay} index={0}>
        <path
          d="M0 -12 C6 -12 7 -6 7 0 C7 3 8.5 5 9.5 7 C7.5 6 6 7.6 4.4 6.2 C3 8 1 8.2 0 6.6 C-1 8.2 -3 8 -4.4 6.2 C-6 7.6 -7.5 6 -9.5 7 C-8.5 5 -7 3 -7 0 C-7 -6 -6 -12 0 -12Z"
          fill={colour}
        />
        <path
          d="M-3.5 -9 C-5 -6 -5.2 -1 -4.6 3"
          stroke="var(--garden-highlight)"
          strokeWidth={1.4}
          fill="none"
          strokeLinecap="round"
          opacity={0.3}
        />
        <path
          d="M0 5 C.4 7 .2 8.6 -.3 9.6"
          stroke="var(--garden-sun)"
          strokeWidth={1.2}
          strokeLinecap="round"
          fill="none"
        />
      </Staggered>
    );
  }
  return (
    <g>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
        <Staggered key={k} opening={opening} delay={delay} index={k}>
          <Petal length={10.5} width={3.2} rotate={k * 45} fill={colour} />
          <Petal
            length={6}
            width={1.1}
            rotate={k * 45}
            fill="var(--garden-highlight)"
            opacity={0.25}
          />
        </Staggered>
      ))}
      <Staggered opening={opening} delay={delay} index={8}>
        <path d={blob(0, 0, 3.8, 3.8, 6, 0.1)} fill="var(--garden-sun)" />
      </Staggered>
    </g>
  );
}

/** A seed choice icon: the flower the seed will become. */
export function SeedIcon({
  species,
  colour,
  size = 52,
}: {
  species: GardenSpecies;
  colour: string;
  size?: number;
}) {
  return (
    <svg
      className="garden-seed-icon"
      width={size}
      height={size}
      viewBox="-26 -30 52 52"
      aria-hidden="true"
      focusable="false"
    >
      {species === 'SURPRISE' ? (
        <SurpriseParcel colour={colour} />
      ) : (
        <g
          transform={`translate(0 4) scale(${species === 'SUNFLOWER' ? 0.9 : 1.25})`}
        >
          <FlowerHead species={species} colour={colour} />
        </g>
      )}
    </svg>
  );
}

function Eye({ x, y, r = 0.9 }: { x: number; y: number; r?: number }) {
  return (
    <path
      d={`M${x} ${y - r} C${x + r * 1.1} ${y - r} ${x + r * 1.1} ${y + r} ${x} ${y + r} C${x - r * 1.1} ${y + r} ${x - r * 1.1} ${y - r} ${x} ${y - r}Z`}
      fill="var(--garden-dark)"
    />
  );
}

function Seed({ x, y, colour }: { x: number; y: number; colour: string }) {
  return (
    <path
      transform={`translate(${x} ${y})`}
      d="M-3.6 0 C-3.6 -2.6 3.6 -2.8 3.8 0 C3.8 2.4 -3.6 2.6 -3.6 0Z"
      fill={colour}
      stroke="var(--garden-card)"
      strokeWidth={0.8}
    />
  );
}

/** The messenger that carries a seed; faces right, centred on 0,0. */
export function Messenger({
  kind,
  colour,
}: {
  kind: GardenMessenger;
  colour: string;
}) {
  if (kind === 'ladybug') {
    return (
      <g transform="translate(0 -12)">
        <path
          d="M6 -2 C7 -6 12 -6 12.6 -2.4 C13 0 11 1 9 .8Z"
          fill="var(--garden-dark)"
        />
        <path
          d="M-9 1 C-9.5 -6 -4 -9.5 1 -9.5 C6 -9.5 9 -5.5 8.6 -1 C8.4 1 7 1.6 5 1.6 L-6.5 1.6 C-8 1.6 -9 1.4 -9 1Z"
          fill="var(--garden-bug)"
        />
        <path
          d="M-.2 -9.4 C.4 -5 .2 -1.5 -.4 1.6"
          stroke="var(--garden-dark)"
          strokeWidth={0.9}
          fill="none"
        />
        {(
          [
            [-4.6, -4.4, 1.5],
            [3.6, -4.6, 1.4],
            [-5.6, -0.6, 1.1],
            [4.6, -0.8, 1.1],
          ] as const
        ).map(([x, y, r]) => (
          <path
            key={`${x}${y}`}
            d={blob(x, y, r, r * 0.9, 4, 0.06)}
            fill="var(--garden-dark)"
          />
        ))}
        <Seed x={-1} y={-10.5} colour={colour} />
      </g>
    );
  }
  if (kind === 'bee') {
    return (
      <g transform="translate(0 -14)">
        <g className="garden-flap-y">
          <path
            d="M-3 -4 C-7 -12 -2 -15 1 -12 C2.5 -10 1.5 -6 -1 -4Z"
            fill="var(--garden-wing)"
          />
          <path
            d="M1 -4 C1 -12 7 -13 7.6 -9.6 C8 -7 5 -5 2 -4Z"
            fill="var(--garden-wing)"
          />
        </g>
        <path
          d="M-9 0 C-9 -4 -4 -6 1 -6 C6 -6 9.5 -3.5 9.5 0 C9.5 3.5 6 5.6 1 5.6 C-4 5.6 -9 4 -9 0Z"
          fill="var(--garden-bee)"
        />
        <path
          d="M-4 -5.4 C-5 -2 -5 2 -4 5.2 L-1.8 5.6 C-2.8 2 -2.8 -2 -1.8 -5.8Z M2 -5.9 C1 -2 1 2 2 5.6 L4.4 5.2 C3.4 2 3.4 -2 4.4 -5.6Z"
          fill="var(--garden-dark)"
        />
        <path
          d="M8.8 -2.2 C9.6 -.8 9.6 .8 8.8 2.2 C10.6 1.8 11.6 .8 11.6 0 C11.6 -.8 10.6 -1.8 8.8 -2.2Z"
          fill="var(--garden-dark)"
        />
        <Seed x={0} y={9} colour={colour} />
      </g>
    );
  }
  if (kind === 'balloon') {
    return (
      <g transform="translate(0 -24)">
        <path
          d="M0 -16 C9 -16 13 -9 12 -3 C11 2 6 6 3 9 L-3 9 C-6 6 -11 2 -12 -3 C-13 -9 -9 -16 0 -16Z"
          fill={colour}
        />
        <path
          d="M0 -16 C5 -12 5.6 2 2 9 M0 -16 C-5 -12 -5.6 2 -2 9"
          stroke="var(--garden-sun)"
          strokeWidth={2.2}
          fill="none"
        />
        <path
          d="M-3 9 L-3.4 14 M3 9 L3.4 14"
          stroke="var(--garden-ink)"
          strokeWidth={0.7}
          opacity={0.6}
        />
        <path
          d="M-4.4 14 C-4.4 13.2 4.4 13.2 4.4 14 L3.8 18.6 C3.6 19.4 -3.6 19.4 -3.8 18.6Z"
          fill="var(--garden-trunk)"
        />
        <Seed x={0} y={13.4} colour={colour} />
      </g>
    );
  }
  return (
    <g transform="translate(0 -14)">
      <path
        className="garden-flap-y"
        d="M-3 -2 C-3 -10 3 -15 9 -14 C6 -11 4 -6 4 -2Z"
        fill="var(--garden-bird-wing)"
      />
      <path
        d="M-12 -1 C-8 -5 0 -6 5 -5 C7 -8.6 12.6 -8.6 13.8 -5.2 L18 -4 C16.6 -2.8 15 -2.4 13.6 -2.2 C11.4 2 4 4.2 -3 2.6 C-7 2 -10 1.2 -12 -1Z"
        fill="var(--garden-bird)"
      />
      <path
        d="M-11 -1 C-14 -3 -16.6 -5.4 -18.4 -5 C-17 -2.6 -17 0 -18.6 3 C-16 2.6 -13.6 1.4 -11 .4Z"
        fill="var(--garden-bird)"
      />
      <Eye x={11.8} y={-5.6} r={0.6} />
      <Seed x={1} y={8} colour={colour} />
    </g>
  );
}

export function Cloud({
  x,
  y,
  scale,
  flip = false,
}: {
  x: number;
  y: number;
  scale: number;
  flip?: boolean;
}) {
  return (
    <g
      className="garden-drift"
      style={
        {
          '--garden-drift-duration': `calc(var(--duration-connection-travel-far) * ${((26 + scale * 30) / 6).toFixed(2)})`,
          '--garden-drift-delay': `calc(var(--duration-connection-travel-far) * ${(-x / 54).toFixed(2)})`,
        } as Style
      }
    >
      <g
        transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}
      >
        <path
          d="M-30 6 C-37 6 -38 -3 -31 -5 C-31 -14 -19 -18 -12 -11 C-9 -22 8 -24 13 -12 C18 -18 30 -15 29 -6 C36 -5 36 6 28 6Z"
          fill="var(--garden-cloud)"
        />
        <path
          d="M-8 -12.6 C-5 -18.6 4 -19.4 8.4 -13.6"
          stroke="var(--garden-cloud-highlight)"
          strokeWidth={2.4}
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}

/** A sun with a soft halo by day; a crescent moon in the Dark theme. */
export function SunAndMoon({ haloId }: { haloId: string }) {
  return (
    <>
      <g className="garden-sun">
        <path d={blob(0, 0, 30, 30, 8, 0.04)} fill={`url(#${haloId})`} />
        <path d={blob(0, 0, 13.5, 13.5, 8, 0.015)} fill="var(--garden-sun)" />
        <path
          d="M-7 -6 C-5 -9 -1.6 -10.4 1.6 -10"
          stroke="var(--garden-highlight)"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          opacity={0.6}
        />
      </g>
      <g className="garden-moon">
        <path
          d={blob(0, 0, 24, 24, 8, 0.04)}
          fill={`url(#${haloId})`}
          opacity={0.5}
        />
        <path
          d="M4 -13 C-6.6 -12 -10.6 -2 -6.6 6 C-2.6 13 8 15 14 9 C6 10.4 -1 4.6 -.2 -4 C.2 -8 1.8 -11 4 -13Z"
          fill="var(--garden-sun)"
        />
      </g>
    </>
  );
}

export function Butterfly() {
  const wing = (colour: string, flip: boolean) => (
    <g transform={`scale(${flip ? -1 : 1} 1)`}>
      <path
        d="M0 -1 C-2.6 -9 -11.6 -12.4 -13 -6.4 C-14 -1.6 -7 .8 0 0Z"
        fill={colour}
      />
      <path
        d="M0 .4 C-5.6 2 -9.6 7 -6.4 9.2 C-3.6 10.6 -1 5.6 0 1.4Z"
        fill={colour}
      />
      <path
        d="M-2 -1.6 C-4.6 -6.6 -9.6 -8.4 -10.4 -6 C-10.6 -4 -6 -1.8 -2 -1.6Z"
        fill="var(--garden-highlight)"
        opacity={0.28}
      />
    </g>
  );
  return (
    <g>
      <g className="garden-flap">
        {wing('var(--person-partner-accent)', false)}
        {wing('var(--person-own-accent)', true)}
      </g>
      <path
        d="M0 -5 C1 -5 1 6 0 7 C-1 6 -1 -5 0 -5Z"
        fill="var(--garden-ink)"
      />
    </g>
  );
}

export function WateringCan() {
  return (
    <g>
      <path
        d="M-15.4 -6 C-20.4 -6 -20.4 1.2 -15.6 .4"
        stroke="var(--garden-can)"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M-14.4 -10 C-13.6 -15 -8.4 -15 -7.8 -10"
        stroke="var(--garden-can)"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M-16 -9.4 C-16 -11 -6 -11 -6 -9.4 L-6.4 .8 C-6.4 2.6 -15.6 2.6 -15.6 .8Z"
        fill="var(--garden-can)"
      />
      <path
        d="M-6.4 -1.2 C-2 -3 1 -6 3 -9 C3.6 -8.6 4 -8.2 4.4 -7.8 C2.4 -4.8 -1 -.8 -6.2 1.6Z"
        fill="var(--garden-can)"
      />
      <path
        d="M2.6 -9.8 C3.4 -12 6.8 -10.6 6 -8.2 C5.2 -7.4 3.2 -8.2 2.6 -9.8Z"
        fill="var(--garden-can)"
      />
    </g>
  );
}

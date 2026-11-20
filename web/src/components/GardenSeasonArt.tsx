/**
 * Presentation layers of the shared garden (#1907 H3, PR 2): seasons,
 * lanterns, the reunion gate and bunting, and the sleeping garden's mist.
 * Organic Bézier shapes only (Product Owner, 2026-11-16); colours come from
 * the garden roles and the person colour roles so Light and Dark both work.
 * All layers are decoration inside the scene's hidden group.
 */

import { type CSSProperties, useId, useMemo } from 'react';
import {
  blob,
  GARDEN_HEIGHT,
  groundBack,
  groundFront,
  petalPath,
  seededRandom,
} from '../client/garden';
import { fallingLeaves } from '../client/gardenPresentation';
import './GardenSeasonArt.css';
import '../motion/garden.css';

type Style = CSSProperties & Record<`--${string}`, string>;

const PERSON = {
  own: 'var(--person-own-accent)',
  partner: 'var(--person-partner-accent)',
} as const;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A lantern on a shepherd's hook; it glows for "today in the garden". */
export function Lantern({
  x,
  lit,
  person,
}: {
  x: number;
  lit: boolean;
  person: 'own' | 'partner';
}) {
  const glowId = `garden-lantern-${useId().replace(/:/g, '')}`;
  const y = groundFront(x) + 4;
  const mirror = x > 170 ? -1 : 1;
  return (
    <g
      transform={`translate(${r1(x)} ${r1(y)}) scale(${mirror} 1)`}
      className={`garden-lantern${lit ? ' is-lit' : ''}`}
      data-testid={`garden-lantern-${person}`}
      data-lit={lit ? 'true' : 'false'}
    >
      {lit ? (
        <>
          <defs>
            <radialGradient id={glowId}>
              <stop
                offset="0"
                stopColor="var(--garden-sun)"
                stopOpacity=".75"
              />
              <stop offset="1" stopColor="var(--garden-sun)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g className="garden-flicker">
            <path
              className="garden-pop"
              style={{ '--garden-delay': '200ms' } as Style}
              d={blob(6, -23, 14, 14, 7, 0.05)}
              fill={`url(#${glowId})`}
            />
          </g>
        </>
      ) : null}
      <path
        d="M0 1 C-.4 -10 -.4 -22 0 -30 C.4 -35.6 6 -36.4 6.8 -32"
        stroke="var(--garden-ink)"
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        opacity={0.55}
      />
      <path
        d="M2.8 -27.6 C3.6 -30.4 10 -30.4 10.8 -27.6Z"
        fill="var(--garden-ink)"
        opacity={0.65}
      />
      <path
        d="M3.4 -27.4 C2.4 -24 2.8 -20.6 4.4 -19.2 L9.2 -19.2 C10.8 -20.6 11.2 -24 10.2 -27.4Z"
        fill={lit ? 'var(--garden-sun)' : 'var(--garden-lantern-off)'}
        stroke={PERSON[person]}
        strokeWidth={1.1}
      />
      <path
        d="M4.4 -19.2 C5.4 -17.6 8.2 -17.6 9.2 -19.2Z"
        fill="var(--garden-ink)"
        opacity={0.65}
      />
      {lit ? (
        <path
          d="M5.6 -25.6 C5 -23.6 5.2 -21.8 6 -20.8"
          stroke="var(--garden-highlight)"
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
          opacity={0.7}
        />
      ) : null}
    </g>
  );
}

/** A small blossom of five petals, for the gate and the spring meadow. */
function Blossom({
  x,
  y,
  size,
  fill,
  rotate = 0,
}: {
  x: number;
  y: number;
  size: number;
  fill: string;
  rotate?: number;
}) {
  return (
    <g transform={`translate(${r1(x)} ${r1(y)}) rotate(${rotate})`}>
      {[0, 72, 144, 216, 288].map((angle) => (
        <path
          key={angle}
          transform={`rotate(${angle})`}
          d={petalPath(size, size * 0.62)}
          fill={fill}
        />
      ))}
      <path
        d={blob(0, 0, size * 0.32, size * 0.32, 5, 0.12)}
        fill="var(--garden-sun)"
      />
    </g>
  );
}

/** The garden gate that waits for an upcoming reunion. */
export function ReunionGate({ x }: { x: number }) {
  const y = groundFront(x) + 4;
  return (
    <g
      transform={`translate(${r1(x)} ${r1(y)})`}
      className="garden-pop"
      style={{ '--garden-origin': '50% 100%' } as Style}
      data-testid="garden-reunion-gate"
    >
      <path
        d="M-12 0 V-26 C-12 -36 12 -36 12 -26 V0"
        fill="none"
        stroke="var(--garden-trunk)"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <path
        d="M-12 -14 C-4 -15 4 -15 12 -14 M-12 -6 C-4 -7 4 -7 12 -6"
        fill="none"
        stroke="var(--garden-trunk)"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Blossom x={-11} y={-29} size={3.2} fill={PERSON.own} />
      <Blossom x={11} y={-29} size={3.2} fill={PERSON.partner} rotate={30} />
    </g>
  );
}

/** Bunting across the sky on the reunion day, in both person colours. */
export function Bunting({ width }: { width: number }) {
  const count = Math.round((13 * width) / 340);
  const flags = Array.from({ length: count }, (_, k) => {
    const t = (k + 0.5) / count;
    const x = -4 + t * (width + 8);
    const y = 22 + 48 * t * (1 - t);
    return {
      key: k,
      d: `M${r1(x - 7)} ${r1(y)} C${r1(x - 2)} ${r1(y + 1)} ${r1(x + 2)} ${r1(y + 1)} ${r1(x + 7)} ${r1(y)} C${r1(x + 4)} ${r1(y + 5)} ${r1(x + 1.4)} ${r1(y + 10)} ${r1(x)} ${r1(y + 13)} C${r1(x - 1.4)} ${r1(y + 10)} ${r1(x - 4)} ${r1(y + 5)} ${r1(x - 7)} ${r1(y)}Z`,
      fill: k % 2 ? PERSON.partner : PERSON.own,
    };
  });
  return (
    <g data-testid="garden-bunting">
      <path
        d={`M-4 22 Q ${r1(width / 2)} 70 ${width + 4} 22`}
        fill="none"
        stroke="var(--garden-ink)"
        strokeWidth={0.8}
        opacity={0.5}
      />
      {flags.map((flag) => (
        <path
          key={flag.key}
          className="garden-pop"
          style={
            {
              '--garden-origin': '50% 0%',
              '--garden-delay': `${flag.key * 50}ms`,
            } as Style
          }
          d={flag.d}
          fill={flag.fill}
        />
      ))}
    </g>
  );
}

/** Winter: snow lies on the hills; nothing withers. */
export function WinterSnow({ width }: { width: number }) {
  const cap = (ground: (x: number) => number, depth: number, wave: number) => {
    let d = `M0 ${r1(ground(0) - 1)}`;
    for (let x = 10; x <= width; x += 10) d += ` L${x} ${r1(ground(x) - 1)}`;
    for (let x = width; x >= 0; x -= 10)
      d += ` L${x} ${r1(ground(x) + depth + 2 * Math.sin(x / wave))}`;
    return `${d}Z`;
  };
  return (
    <g fill="var(--garden-snow)" data-testid="garden-snow">
      <path d={cap(groundBack, 4, 17)} opacity={0.85} />
      <path d={cap(groundFront, 2.4, 23)} opacity={0.7} />
    </g>
  );
}

/** Spring: small blossoms open across the meadow. */
export function SpringBlossoms({ width }: { width: number }) {
  const blossoms = useMemo(() => {
    const random = seededRandom(17);
    return Array.from({ length: Math.round((12 * width) / 340) }, (_, k) => {
      const x = 8 + random() * (width - 16);
      return {
        x,
        y: groundFront(x) + 8 + random() * 26,
        size: 2.2 + random() * 1.2,
        rotate: Math.round(random() * 72),
        fill: k % 3 ? 'var(--garden-blossom)' : 'var(--garden-meadow-dot)',
      };
    });
  }, [width]);
  return (
    <g data-testid="garden-blossoms">
      {blossoms.map((item) => (
        <Blossom
          key={`${item.x}-${item.y}`}
          x={item.x}
          y={item.y}
          size={item.size}
          rotate={item.rotate}
          fill={item.fill}
        />
      ))}
    </g>
  );
}

/** Autumn: a one-shot moment of leaves drifting down when the garden opens. */
export function FallingLeaves({ width }: { width: number }) {
  const leaves = useMemo(() => fallingLeaves(width), [width]);
  return (
    <g data-testid="garden-falling-leaves">
      {leaves.map((leaf) => (
        <g
          key={`${leaf.x}-${leaf.delay}`}
          transform={`translate(${leaf.x} -8)`}
        >
          <path
            className="garden-fall"
            style={
              {
                '--garden-delay': `${leaf.delay}ms`,
                '--garden-fall-duration': `${leaf.duration}ms`,
                '--garden-dx': `${leaf.dx}px`,
                '--garden-rotate': `${leaf.rotate}deg`,
              } as Style
            }
            d="M0 -4 C2.6 -2.6 2.6 2.6 0 4 C-2.6 2.6 -2.6 -2.6 0 -4Z"
            fill={leaf.gold ? 'var(--garden-sun)' : 'var(--garden-leaf-autumn)'}
          />
        </g>
      ))}
    </g>
  );
}

/** Mist over the sleeping garden; it lifts once when the garden wakes. */
export function GardenMist({
  width,
  lifting,
}: {
  width: number;
  lifting: boolean;
}) {
  const mistId = `garden-mist-${useId().replace(/:/g, '')}`;
  return (
    <g data-testid="garden-mist">
      <defs>
        <linearGradient id={mistId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--garden-mist)" stopOpacity=".35" />
          <stop offset=".55" stopColor="var(--garden-mist)" stopOpacity=".8" />
          <stop offset="1" stopColor="var(--garden-mist)" stopOpacity=".6" />
        </linearGradient>
      </defs>
      <rect
        className={`garden-mist${lifting ? ' is-lifting' : ''}`}
        width={width}
        height={GARDEN_HEIGHT}
        fill={`url(#${mistId})`}
      />
    </g>
  );
}

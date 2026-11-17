/**
 * Things that appear in the garden as the couple keeps caring (#1907 H3, PR 3):
 * a path, the pond, a bench with a cushion in each person colour, the couple's
 * tree with a swing, a birdhouse, a rose arch, a little stream, background
 * trees and fireflies. Something new pops in once while it is announced; with
 * reduced motion it is simply there. All decoration, hidden from assistive
 * technology; the garden book names every find in text.
 */

import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { useMemo } from 'react';
import type { GardenUnlock } from '../api/generated/models/GardenUnlock';
import { blob, groundBack, groundFront, seededRandom } from '../client/garden';
import {
  ARCH_X,
  type BackgroundTree,
  BIRDHOUSE_X,
  benchX,
  POND,
  TREE_X,
} from '../client/gardenGrowth';

type Style = CSSProperties & Record<`--${string}`, string>;

const OWN = 'var(--person-own-accent)';
const PARTNER = 'var(--person-partner-accent)';
const r1 = (n: number) => Math.round(n * 10) / 10;

function PopIn({
  on,
  origin = '50% 100%',
  children,
}: {
  on: boolean;
  origin?: string;
  children: ReactNode;
}) {
  if (!on) return <>{children}</>;
  return (
    <g
      className="garden-pop"
      style={{ '--garden-origin': origin, '--garden-delay': '500ms' } as Style}
    >
      {children}
    </g>
  );
}

function Crown({
  cx,
  cy,
  r,
  seed,
}: {
  cx: number;
  cy: number;
  r: number;
  seed: number;
}) {
  return (
    <g>
      <path
        d={blob(cx, cy, r, r * 0.9, 7, 0.12, seed)}
        fill="var(--garden-tree)"
      />
      <path
        d={blob(
          cx + r * 0.18,
          cy + r * 0.28,
          r * 0.7,
          r * 0.5,
          6,
          0.12,
          seed + 1,
        )}
        fill="var(--garden-shade)"
        opacity={0.12}
      />
      <path
        d={blob(
          cx - r * 0.3,
          cy - r * 0.32,
          r * 0.36,
          r * 0.26,
          5,
          0.12,
          seed + 2,
        )}
        fill="var(--garden-highlight)"
        opacity={0.14}
      />
    </g>
  );
}

function Rose({
  x,
  y,
  colour,
  scale = 1,
}: {
  x: number;
  y: number;
  colour: string;
  scale?: number;
}) {
  return (
    <g transform={`translate(${r1(x)} ${r1(y)}) scale(${scale})`}>
      <path d={blob(0, 0, 3.2, 3, 5, 0.12)} fill={colour} />
      <path
        d="M-1.5 .4 C-1.6 -1.4 1.4 -1.8 1.5 -.2 C1.6 1 0 1.4 -.4 .4"
        stroke="var(--garden-shade)"
        strokeWidth={0.6}
        fill="none"
        opacity={0.35}
      />
    </g>
  );
}

function Leaf({
  x,
  y,
  rotate,
  scale = 1,
}: {
  x: number;
  y: number;
  rotate: number;
  scale?: number;
}) {
  return (
    <path
      transform={`translate(${r1(x)} ${r1(y)}) rotate(${r1(rotate)}) scale(${scale})`}
      d="M0 0 C1.6 -1.6 4 -1.8 5.6 0 C4 1.8 1.6 1.6 0 0Z"
      fill="var(--garden-leaf)"
    />
  );
}

/** The couple's tree; it grows bigger and gets a swing in the paradise. */
function CoupleTree({ big, swingNew }: { big: boolean; swingNew: boolean }) {
  const x = TREE_X;
  const y = groundBack(x) + 6;
  return (
    <g transform={`translate(${x} ${r1(y)}) scale(${big ? 1 : 0.68})`}>
      <g
        className="garden-sway"
        style={{ '--garden-wave': `${Math.round(x * 3.2)}ms` } as Style}
      >
        <path
          d="M-6 0 C-3.4 -4 -3.2 -18 -2.8 -36 C-2.6 -42 2.8 -42 3 -36 C3.4 -18 3.6 -4 7 0 C3 1.2 -2 1.2 -6 0Z"
          fill="var(--garden-trunk)"
        />
        <path
          d="M1 -32 C9 -36 19 -41 31 -44.6 C31.6 -43 21 -37.6 2.6 -27.6Z"
          fill="var(--garden-trunk)"
        />
        <path
          d="M-1 -26 C-6 -30 -12 -34 -17 -40 C-16.4 -41 -10 -35.6 -.6 -30Z"
          fill="var(--garden-trunk)"
        />
        <Crown cx={-14} cy={-54} r={16} seed={0.3} />
        <Crown cx={22} cy={-50} r={15} seed={1.1} />
        <Crown cx={4} cy={-64} r={22} seed={2.2} />
        {big ? (
          <PopIn on={swingNew} origin="50% 0%">
            <path
              d="M23 -41 C23.4 -32 23.6 -22 23.4 -14 M35 -45 C35.4 -35 35.4 -24 35 -14"
              stroke="var(--garden-ink)"
              strokeWidth={0.8}
              fill="none"
              opacity={0.55}
            />
            <path
              d="M20.4 -14 C20.6 -15.6 37.6 -15.6 37.8 -14 C37.8 -12.4 20.4 -12.4 20.4 -14Z"
              fill="var(--garden-trunk)"
            />
          </PopIn>
        ) : null}
      </g>
    </g>
  );
}

function Bench({ x }: { x: number }) {
  const y = groundBack(x) + 9;
  return (
    <g transform={`translate(${x} ${r1(y)})`}>
      <path
        d="M-12 -7 C-12.6 -4 -13 -2 -13.6 0 M12 -7 C12.6 -4 13 -2 13.6 0 M-11 -11 C-11.4 -14 -11.6 -16 -11.6 -19 M11 -11 C11.4 -14 11.6 -16 11.6 -19"
        stroke="var(--garden-trunk)"
        strokeWidth={1.8}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M-15 -10.2 C-15 -11.6 15 -11.6 15 -10.2 L15 -8.4 C15 -7.2 -15 -7.2 -15 -8.4Z"
        fill="var(--garden-trunk)"
      />
      <path
        d="M-14 -19.6 C-14 -21 14 -21 14 -19.6 L14 -17.8 C14 -16.8 -14 -16.8 -14 -17.8Z"
        fill="var(--garden-trunk)"
      />
      {/* One cushion in each person colour: a bench for the two of you. */}
      <path
        d="M-12.6 -11 C-12.8 -14.6 -1.6 -14.8 -1.4 -11.2 C-4 -10.2 -10 -10.2 -12.6 -11Z"
        fill={OWN}
      />
      <path
        d="M1.4 -11.2 C1.6 -14.8 12.8 -14.6 12.6 -11 C10 -10.2 4 -10.2 1.4 -11.2Z"
        fill={PARTNER}
      />
    </g>
  );
}

function Birdhouse({ withBird }: { withBird: boolean }) {
  const x = BIRDHOUSE_X;
  const y = groundBack(x) + 8;
  return (
    <g transform={`translate(${x} ${r1(y)})`}>
      <path
        d="M-1.2 0 C-1 -10 -1 -20 -.9 -29 L.9 -29 C1 -20 1 -10 1.2 0Z"
        fill="var(--garden-trunk)"
      />
      <path
        d="M-7 -31 C-7 -35 -7 -38 -7 -40 C-4.4 -42.6 -2.2 -44.6 0 -46 C2.2 -44.6 4.4 -42.6 7 -40 L7 -31 C7 -29.6 6 -29 4.6 -29 L-4.6 -29 C-6 -29 -7 -29.6 -7 -31Z"
        fill="var(--garden-house)"
      />
      <path
        d="M-10.4 -39.4 C-6.6 -43.4 -3.2 -46.6 0 -48.6 C3.2 -46.6 6.6 -43.4 10.4 -39.4 C9.4 -38.2 8.2 -38.4 7.2 -39.4 C4.4 -42 2.2 -44 0 -45.2 C-2.2 -44 -4.4 -42 -7.2 -39.4 C-8.2 -38.4 -9.4 -38.2 -10.4 -39.4Z"
        fill="var(--garden-trunk)"
      />
      <path
        d="M0 -40.4 C1.8 -40.4 2.4 -38.6 2.4 -37.4 C2.4 -35.8 1.2 -35 0 -35 C-1.2 -35 -2.4 -35.8 -2.4 -37.4 C-2.4 -38.6 -1.8 -40.4 0 -40.4Z"
        fill="var(--garden-dark)"
        opacity={0.8}
      />
      <path
        d="M-.6 -32.6 C1 -32.8 2.6 -32.8 4 -32.4"
        stroke="var(--garden-trunk)"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      {withBird ? (
        <g transform="translate(6 -52) scale(.55)">
          <path
            d="M-12 -1 C-8 -5 0 -6 5 -5 C7 -8.6 12.6 -8.6 13.8 -4.6 C15 -1 12 3 6 3.6 C0 4.4 -8 3 -12 -1Z"
            fill="var(--garden-bird)"
          />
          <path
            d="M-3 -2 C-3 -8 3 -12 8 -11 C5.4 -8.6 4 -5 4 -2Z"
            fill="var(--garden-bird-wing)"
          />
          <path
            d="M13.6 -4.6 C15.2 -4.8 16.8 -4.2 17.6 -3.4 C16.6 -2.8 15 -2.6 13.8 -3Z"
            fill="var(--garden-sun)"
          />
        </g>
      ) : null}
    </g>
  );
}

function GardenPath({ width }: { width: number }) {
  const x0 = width * 0.14;
  const x1 = width * 0.4;
  const yb = groundBack(x1) + 6;
  const at = (t: number): [number, number] => [
    (1 - t) ** 2 * x0 + 2 * (1 - t) * t * (x0 + 30) + t * t * x1,
    (1 - t) ** 2 * 214 + 2 * (1 - t) * t * 186 + t * t * yb,
  ];
  return (
    <g>
      <path
        d={`M${r1(x0)} 214 Q ${r1(x0 + 30)} 186 ${r1(x1)} ${r1(yb)}`}
        stroke="var(--garden-path)"
        strokeWidth={10}
        fill="none"
        strokeLinecap="round"
        opacity={0.7}
      />
      {[0.18, 0.42, 0.66, 0.86].map((t, k) => {
        const [x, y] = at(t);
        const r = 4.6 - t * 3;
        return (
          <path
            key={t}
            d={blob(x + (k % 2 ? 1.5 : -1.5), y, r, r * 0.46, 4, 0.1, k)}
            fill="var(--garden-stone)"
          />
        );
      })}
    </g>
  );
}

function Pond() {
  const p = POND;
  const reed = (x: number, h: number, lean: number) => (
    <path
      key={`reed-${x}`}
      d={`M${x - 1} ${p.cy} C${r1(x - 0.6)} ${r1(p.cy - h * 0.5)} ${r1(x + lean * 0.5)} ${r1(p.cy - h * 0.85)} ${x + lean} ${p.cy - h} C${r1(x + lean * 0.3 + 0.6)} ${r1(p.cy - h * 0.6)} ${r1(x + 0.8)} ${r1(p.cy - h * 0.3)} ${x + 1} ${p.cy}Z`}
      fill="var(--garden-stem)"
    />
  );
  const cattail = (x: number, h: number) => (
    <g key={`cattail-${x}`}>
      <path
        d={`M${x} ${p.cy} C${x} ${p.cy - h * 0.5} ${r1(x + 0.4)} ${p.cy - h} ${r1(x + 0.6)} ${p.cy - h - 4}`}
        stroke="var(--garden-stem)"
        strokeWidth={1}
        fill="none"
      />
      <path
        d={`M${r1(x + 0.2)} ${p.cy - h + 3} C${r1(x - 1.6)} ${p.cy - h + 1} ${r1(x - 1.4)} ${p.cy - h - 4} ${r1(x + 0.4)} ${p.cy - h - 5} C${r1(x + 2.2)} ${p.cy - h - 4} ${r1(x + 2.2)} ${p.cy - h + 1} ${r1(x + 0.2)} ${p.cy - h + 3}Z`}
        fill="var(--garden-trunk)"
      />
    </g>
  );
  return (
    <g>
      <path
        d={blob(p.cx, p.cy, p.rx + 2, p.ry + 2, 5, 0.06, 0.4)}
        fill="var(--garden-soil)"
        opacity={0.35}
      />
      <path
        d={blob(p.cx, p.cy, p.rx, p.ry, 5, 0.07, 0.4)}
        fill="var(--garden-water)"
      />
      <path
        d={`M${p.cx - p.rx * 0.6} ${p.cy - 2} C${p.cx - p.rx * 0.3} ${p.cy - 5} ${p.cx + p.rx * 0.1} ${p.cy - 5} ${p.cx + p.rx * 0.3} ${p.cy - 3.4}`}
        stroke="var(--garden-water-highlight)"
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
        opacity={0.75}
      />
      <g className="garden-ripple">
        <path
          d={`M${p.cx + 4} ${p.cy + 2} C${p.cx + 8} ${p.cy} ${p.cx + 14} ${p.cy} ${p.cx + 18} ${p.cy + 2}`}
          stroke="var(--garden-water-highlight)"
          strokeWidth={0.9}
          fill="none"
          strokeLinecap="round"
        />
      </g>
      {reed(p.cx - p.rx + 3, 16, -4)}
      {reed(p.cx - p.rx + 7, 12, 2)}
      {cattail(p.cx - p.rx + 5, 15)}
      {reed(p.cx + p.rx - 5, 14, 4)}
      {cattail(p.cx + p.rx - 2, 12)}
    </g>
  );
}

function Stream({ width }: { width: number }) {
  let d = `M${width} ${r1(groundFront(width) + 18)}`;
  for (let x = width - 20; x >= POND.cx + POND.rx - 6; x -= 20) {
    d += ` L${x} ${r1(196 + 4 * Math.sin(x / 23))}`;
  }
  return (
    <g>
      <path
        d={d}
        stroke="var(--garden-water)"
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="garden-stream-flow"
        d={d}
        stroke="var(--garden-water-highlight)"
        strokeWidth={1.2}
        fill="none"
        strokeDasharray="4 10"
        strokeLinecap="round"
      />
    </g>
  );
}

function RoseArch() {
  const x = ARCH_X;
  const y = groundFront(x) + 14;
  const deco: ReactElement[] = [];
  for (let k = 0; k <= 10; k += 1) {
    const a = Math.PI * (k / 10);
    const cx = -16 * Math.cos(a);
    const cy = -40 - 16 * Math.sin(a);
    deco.push(
      <Leaf
        key={`l${k}`}
        x={cx}
        y={cy}
        rotate={(a * 180) / Math.PI + (k % 2 ? 40 : -140)}
        scale={0.9}
      />,
    );
    if (k % 2 === 0) {
      deco.push(
        <Rose key={`r${k}`} x={cx} y={cy} colour={k % 4 ? PARTNER : OWN} />,
      );
    }
  }
  for (const side of [-16, 16]) {
    for (let k = 0; k < 4; k += 1) {
      deco.push(
        <Leaf
          key={`s${side}-${k}`}
          x={side}
          y={-6 - k * 9}
          rotate={side < 0 ? (k % 2 ? 200 : -20) : k % 2 ? -20 : 200}
          scale={0.9}
        />,
      );
      if (k === 2) {
        deco.push(
          <Rose
            key={`sr${side}`}
            x={side}
            y={-6 - k * 9}
            colour={side < 0 ? OWN : PARTNER}
            scale={0.8}
          />,
        );
      }
    }
  }
  return (
    <g transform={`translate(${x} ${r1(y)})`}>
      <path
        d="M-16 0 V-40 C-16 -61 16 -61 16 -40 V0"
        fill="none"
        stroke="var(--garden-trunk)"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      {deco}
    </g>
  );
}

/** Small trees behind the hill that keep growing with every shared day. */
export function BackgroundTrees({ trees }: { trees: BackgroundTree[] }) {
  const tier = (top: number, h: number, w: number) =>
    `M0 ${top} C${r1(w * 0.3)} ${r1(top + h * 0.45)} ${r1(w * 0.7)} ${r1(top + h * 0.8)} ${w} ${top + h} C${r1(w * 0.4)} ${r1(top + h * 1.12)} ${r1(-w * 0.4)} ${r1(top + h * 1.12)} ${-w} ${top + h} C${r1(-w * 0.7)} ${r1(top + h * 0.8)} ${r1(-w * 0.3)} ${r1(top + h * 0.45)} 0 ${top}Z`;
  return (
    <g data-testid="garden-background-trees">
      {trees.map((tree, index) => (
        <g
          key={tree.x}
          transform={`translate(${tree.x} ${r1(groundBack(tree.x) + 3)}) scale(${tree.scale})`}
          opacity={0.92}
        >
          <g
            className="garden-sway"
            style={
              { '--garden-wave': `${Math.round(tree.x * 3.2)}ms` } as Style
            }
          >
            <path
              d="M-2 0 C-1.4 -4 -1.4 -9 -1 -13 L1 -13 C1.4 -9 1.4 -4 2 0Z"
              fill="var(--garden-trunk)"
            />
            {tree.kind === 'pine' ? (
              <g fill="var(--garden-tree)">
                <path d={tier(-46, 16, 8)} />
                <path d={tier(-36, 16, 11)} />
                <path d={tier(-26, 17, 14)} />
              </g>
            ) : (
              <Crown cx={0} cy={-26} r={13} seed={index * 0.7} />
            )}
          </g>
        </g>
      ))}
    </g>
  );
}

/** Fireflies over the paradise; they only show at night (Dark theme). */
export function Fireflies({ width }: { width: number }) {
  const flies = useMemo(() => {
    const random = seededRandom(90);
    return Array.from({ length: Math.round((9 * width) / 340) }, (_, k) => ({
      d: blob(random() * width, 110 + random() * 60, 1.6, 1.6, 4, 0.05),
      delay: Math.round(random() * 2400) + k,
    }));
  }, [width]);
  return (
    <g className="garden-fireflies">
      {flies.map((fly) => (
        <path
          key={fly.d}
          className="garden-firefly"
          style={{ '--garden-delay': `${fly.delay}ms` } as Style}
          d={fly.d}
          fill="var(--garden-sun)"
        />
      ))}
    </g>
  );
}

/**
 * One layer of unlocked things. `back` stands behind the hill, `ground` lies
 * on the meadow (path, stream, pond), `arch` stands in front with the plants.
 */
export function GardenFeatures({
  layer,
  unlocks,
  width,
  fresh,
}: {
  layer: 'back' | 'ground' | 'arch';
  unlocks: ReadonlyArray<GardenUnlock>;
  width: number;
  /** Unlocks announced right now; they pop in once. */
  fresh: ReadonlySet<GardenUnlock>;
}) {
  const has = (unlock: GardenUnlock) => unlocks.includes(unlock);
  if (layer === 'back') {
    return (
      <g>
        {has('TREE') ? (
          <PopIn on={fresh.has('TREE')}>
            <CoupleTree
              big={has('SWING')}
              swingNew={fresh.has('SWING') && !fresh.has('TREE')}
            />
          </PopIn>
        ) : null}
        {has('BENCH') ? (
          <PopIn on={fresh.has('BENCH')}>
            <Bench x={benchX(unlocks)} />
          </PopIn>
        ) : null}
        {has('BIRDHOUSE') ? (
          <PopIn on={fresh.has('BIRDHOUSE')}>
            <Birdhouse withBird={has('ROSE_ARCH')} />
          </PopIn>
        ) : null}
      </g>
    );
  }
  if (layer === 'ground') {
    return (
      <g>
        {has('PATH') ? (
          <PopIn on={fresh.has('PATH')} origin="0% 100%">
            <GardenPath width={width} />
          </PopIn>
        ) : null}
        {has('STREAM') && has('POND') ? (
          <PopIn on={fresh.has('STREAM')} origin="100% 50%">
            <Stream width={width} />
          </PopIn>
        ) : null}
        {has('POND') ? (
          <PopIn on={fresh.has('POND')} origin="50% 50%">
            <Pond />
          </PopIn>
        ) : null}
      </g>
    );
  }
  return has('ROSE_ARCH') ? (
    <PopIn on={fresh.has('ROSE_ARCH')}>
      <RoseArch />
    </PopIn>
  ) : null;
}

/**
 * Rare visitors of the shared garden (#1907 H3 follow-up): an owl on the
 * couple's tree in the evening, a fox at the meadow edge in winter and
 * ducklings on the pond in spring. They come only at special times (see
 * `rareVisitors` in gardenStory), cannot be named and are not part of the
 * visitor list in the garden book. A tap plays a short reaction, which the
 * page announces in its status line; with reduced motion the reaction is a
 * still pose.
 */

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { GardenUnlock } from '../api/generated/models/GardenUnlock';
import { groundBack } from '../client/garden';
import { BIRDHOUSE_X, benchX, POND, TREE_X } from '../client/gardenGrowth';
import type { RareVisitor } from '../client/gardenStory';
import { useTranslation } from '../i18n';
import './GardenRareVisitors.css';
import '../motion/garden.css';

const REACTION_MS = 1800;

export function OwlArt() {
  return (
    <g>
      <path
        d="M-5.6 0 C-7 -4 -6.6 -10 -4.6 -12.6 C-2.6 -14.6 2.6 -14.6 4.6 -12.6 C6.6 -10 7 -4 5.6 0Z"
        fill="var(--garden-owl)"
      />
      <path
        d="M-3.4 -1 C-4 -4 -3.4 -7 0 -7.4 C3.4 -7 4 -4 3.4 -1Z"
        fill="var(--garden-owl-light)"
      />
      <path
        d="M-1.6 -4.8 l.8 .6 M1 -4.6 l.8 .6 M-.4 -2.8 l.8 .6"
        stroke="var(--garden-owl)"
        strokeWidth={0.5}
        strokeLinecap="round"
      />
      <g className="garden-owl-head">
        <path
          d="M-5 -11 C-5.6 -14.6 -4 -17 -4.4 -18.6 C-2.6 -17.4 -1.4 -16.6 0 -16.6 C1.4 -16.6 2.6 -17.4 4.4 -18.6 C4 -17 5.6 -14.6 5 -11 C3 -9.6 -3 -9.6 -5 -11Z"
          fill="var(--garden-owl)"
        />
        <circle cx={-2.2} cy={-13.4} r={2} fill="var(--garden-owl-light)" />
        <circle cx={2.2} cy={-13.4} r={2} fill="var(--garden-owl-light)" />
        <g className="garden-owl-eyes">
          <circle cx={-2.2} cy={-13.4} r={0.9} fill="var(--garden-dark)" />
          <circle cx={2.2} cy={-13.4} r={0.9} fill="var(--garden-dark)" />
        </g>
        <path d="M-.7 -12.2 L.7 -12.2 L0 -10.8Z" fill="var(--garden-sun)" />
      </g>
      <path
        d="M-2.4 0 l-.6 1.2 M-1.4 0 l0 1.4 M1.4 0 l0 1.4 M2.4 0 l.6 1.2"
        stroke="var(--garden-sun)"
        strokeWidth={0.6}
        strokeLinecap="round"
      />
    </g>
  );
}

export function FoxArt() {
  return (
    <g>
      <g className="garden-fox-tail">
        <path
          d="M-6 -2 C-13 -1 -17 -5 -16.4 -9.6 C-14.4 -7.4 -11 -6.8 -7.4 -7.4Z"
          fill="var(--garden-fox)"
        />
        <path
          d="M-16.4 -9.6 C-17 -7 -15.6 -5 -13.4 -4.6 C-14.6 -6 -15.4 -7.6 -16.4 -9.6Z"
          fill="var(--garden-fox-light)"
        />
      </g>
      <path
        d="M-8 0 C-9.6 -5 -7 -11 -1 -11.6 C3.6 -12 5.6 -8 5 -4 C4.8 -1.6 3.6 0 2 0Z"
        fill="var(--garden-fox)"
      />
      <path
        d="M1 -1 C.6 -4 1.4 -7.4 3.6 -8 C4.8 -6 4.8 -3 4 0Z"
        fill="var(--garden-fox-light)"
      />
      <g className="garden-fox-head">
        <g className="garden-fox-ears">
          <path d="M1.6 -15.6 L2.4 -21 L5 -16.4Z" fill="var(--garden-fox)" />
          <path d="M5.6 -16 L8.4 -20.6 L8.6 -15Z" fill="var(--garden-fox)" />
        </g>
        <path
          d="M1 -13.6 C1 -17 4.6 -18 7.6 -16.6 C9 -15.8 9.4 -14.4 10 -13.4 C11.6 -12.6 13 -12.2 13.6 -11.6 C12.6 -10.4 10 -10 7.6 -10 C4 -10 1 -10.6 1 -13.6Z"
          fill="var(--garden-fox)"
        />
        <path
          d="M7.6 -10 C9.6 -10 12 -10.4 13.6 -11.6 C12.6 -10 10 -9 7.6 -9.4Z"
          fill="var(--garden-fox-light)"
        />
        <circle cx={13.6} cy={-11.8} r={0.8} fill="var(--garden-dark)" />
        <path
          className="garden-fox-eye"
          d="M6.4 -14.2 C7 -14.8 7.8 -14.8 8.2 -14.2"
          stroke="var(--garden-dark)"
          strokeWidth={0.8}
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <path
        d="M-5 0 l0 -2.4 M-2.6 0 l0 -2.4 M1.6 0 l0 -2.6 M3.4 0 l0 -2.6"
        stroke="var(--garden-dark)"
        strokeWidth={1.2}
        strokeLinecap="round"
        opacity={0.6}
      />
    </g>
  );
}

function Duckling({ x, delay }: { x: number; delay: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <g className="garden-duckling" style={{ animationDelay: `${delay}ms` }}>
        <path
          d="M-3.6 0 C-4 -2.6 -1.6 -3.6 1 -3.2 C1.2 -5.4 4 -5.8 4.6 -3.8 C5 -2.4 4 -1 3.4 0Z"
          fill="var(--garden-duckling)"
        />
        <path d="M4.6 -4.2 L6.4 -3.8 L4.8 -3.2Z" fill="var(--garden-sun)" />
        <circle cx={3.4} cy={-4.2} r={0.45} fill="var(--garden-dark)" />
      </g>
    </g>
  );
}

export function DucklingsArt() {
  return (
    <g>
      <Duckling x={0} delay={0} />
      <Duckling x={-9} delay={120} />
      <Duckling x={-17} delay={240} />
    </g>
  );
}

function RareArt({ visitor }: { visitor: RareVisitor }) {
  if (visitor === 'owl') return <OwlArt />;
  if (visitor === 'fox') return <FoxArt />;
  return <DucklingsArt />;
}

/** Where a rare visitor stays, clear of the unlocked things on the hill. */
export function rarePlace(
  visitor: RareVisitor,
  width: number,
  unlocks: ReadonlyArray<GardenUnlock>,
): { x: number; y: number } {
  if (visitor === 'owl') {
    const scale = unlocks.includes('SWING') ? 1 : 0.68;
    return {
      x: TREE_X - 13 * scale,
      y: groundBack(TREE_X) + 6 - 36 * scale,
    };
  }
  if (visitor === 'ducklings') return { x: POND.cx - 10, y: POND.cy + 2 };
  const taken = [
    unlocks.includes('BENCH') ? benchX(unlocks) : null,
    unlocks.includes('TREE') ? TREE_X : null,
    unlocks.includes('BIRDHOUSE') ? BIRDHOUSE_X : null,
  ].filter((x): x is number => x !== null);
  const x =
    [width - 22, width - 62, 176].find((candidate) =>
      taken.every((other) => Math.abs(other - candidate) >= 26),
    ) ?? width - 22;
  return { x, y: groundBack(x) + 8 };
}

const HIT: Record<RareVisitor, { x: number; y: number; w: number; h: number }> =
  {
    owl: { x: -9, y: -22, w: 18, h: 25 },
    fox: { x: -18, y: -24, w: 34, h: 27 },
    ducklings: { x: -22, y: -10, w: 32, h: 13 },
  };

/** The rare visitors for the scene: art per layer and named tap targets. */
export function useRareVisitors({
  visitors,
  width,
  unlocks,
  onReaction,
}: {
  visitors: ReadonlyArray<RareVisitor>;
  width: number;
  unlocks: ReadonlyArray<GardenUnlock>;
  onReaction: (visitor: RareVisitor) => void;
}): { back: ReactNode; pond: ReactNode; targets: ReactNode } {
  const { t } = useTranslation();
  const [reacting, setReacting] = useState<{
    visitor: RareVisitor;
    key: number;
  } | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  if (visitors.length === 0) return { back: null, pond: null, targets: null };
  const tap = (visitor: RareVisitor) => {
    const key = Date.now();
    setReacting({ visitor, key });
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setReacting(null), REACTION_MS);
    onReaction(visitor);
  };
  const onKey = (event: KeyboardEvent<SVGGElement>, visitor: RareVisitor) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      tap(visitor);
    }
  };
  const art = (visitor: RareVisitor) => {
    const { x, y } = rarePlace(visitor, width, unlocks);
    const active = reacting?.visitor === visitor;
    return (
      <g
        key={active ? `${visitor}-${reacting.key}` : visitor}
        transform={`translate(${x} ${y})`}
        className={`garden-rare garden-rare-${visitor}${active ? ' is-reacting' : ''}`}
        data-testid={`garden-rare-art-${visitor}`}
      >
        <RareArt visitor={visitor} />
      </g>
    );
  };
  const present = (visitor: RareVisitor) => visitors.includes(visitor);
  return {
    back: (
      <g>
        {present('owl') ? art('owl') : null}
        {present('fox') ? art('fox') : null}
      </g>
    ),
    pond: present('ducklings') ? art('ducklings') : null,
    targets: (
      <g>
        {visitors.map((visitor) => {
          const { x, y } = rarePlace(visitor, width, unlocks);
          const hit = HIT[visitor];
          return (
            // biome-ignore lint/a11y/useSemanticElements: an SVG visitor cannot be a native button
            <g
              key={visitor}
              role="button"
              tabIndex={0}
              className="garden-animal-target"
              aria-label={t(`games.garden.story.rare.${visitor}.label`)}
              data-testid={`garden-rare-${visitor}`}
              onClick={() => tap(visitor)}
              onKeyDown={(event) => onKey(event, visitor)}
            >
              <rect
                x={x + hit.x}
                y={y + hit.y}
                width={hit.w}
                height={hit.h}
                rx={8}
                fill="transparent"
              />
            </g>
          );
        })}
      </g>
    ),
  };
}

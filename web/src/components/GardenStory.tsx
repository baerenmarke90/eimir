/**
 * The couple's story grows in the garden (#1907 H3 follow-up): the couple's
 * Milestones stand as special plants in a calm memory corner on the back
 * hill. A tap shows a small card with the Milestone and a link to it; the
 * garden book lists them. Without Milestones (or when they cannot be read)
 * the garden is simply unchanged: no placeholder and no empty corner.
 */

import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { blob } from '../client/garden';
import type {
  MemoryPiece,
  MemoryPlant,
  PlacedMemoryPlant,
} from '../client/gardenStory';
import { milestoneDetailPath } from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import './GardenStory.css';
import '../motion/garden.css';

type Style = CSSProperties & Record<`--${string}`, string>;

const OWN = 'var(--person-own-accent)';
/** Pieces stand a little larger than the flowers' leaves, so they read in front. */
const PIECE_SCALE = 1.2;
const PARTNER = 'var(--person-partner-accent)';

function Heart({
  x,
  y,
  size,
  fill,
}: {
  x: number;
  y: number;
  size: number;
  fill: string;
}) {
  const s = size;
  return (
    <path
      transform={`translate(${x} ${y})`}
      d={`M0 ${s * 0.9} C${-s * 1.3} ${s * 0.1} ${-s * 0.9} ${-s * 0.9} 0 ${-s * 0.35} C${s * 0.9} ${-s * 0.9} ${s * 1.3} ${s * 0.1} 0 ${s * 0.9}Z`}
      fill={fill}
    />
  );
}

/** One special piece at its ground point (0,0), about 14–26 units tall. */
export function MemoryPieceArt({ piece }: { piece: MemoryPiece }) {
  switch (piece) {
    case 'heartBush':
      return (
        <g>
          <path
            d={blob(0, -8, 10, 8, 6, 0.14, 0.4)}
            fill="var(--garden-tree)"
          />
          <path
            d={blob(-3, -10, 5, 3.6, 5, 0.12, 1.2)}
            fill="var(--garden-highlight)"
            opacity={0.14}
          />
          <Heart x={-5} y={-10} size={2.2} fill={OWN} />
          <Heart x={3.4} y={-13} size={2.2} fill={PARTNER} />
          <Heart x={5.6} y={-6} size={1.9} fill={OWN} />
          <Heart x={-1.2} y={-4.4} size={1.9} fill={PARTNER} />
        </g>
      );
    case 'youngTree':
      return (
        <g>
          <path
            d="M-1.4 0 C-1 -8 -1 -14 -.8 -18 L.8 -18 C1 -14 1 -8 1.4 0Z"
            fill="var(--garden-trunk)"
          />
          <path
            d="M3.4 0 L3.4 -12"
            stroke="var(--garden-trunk)"
            strokeWidth={0.8}
            strokeLinecap="round"
          />
          <path
            d="M.6 -8.6 C1.6 -9.4 2.6 -9.6 3.4 -9.4"
            stroke="var(--garden-stem)"
            strokeWidth={0.7}
            fill="none"
          />
          <path
            d={blob(0, -22, 8, 7.4, 6, 0.12, 0.2)}
            fill="var(--garden-leaf)"
          />
          <path
            d={blob(-2.4, -24.4, 3.6, 2.6, 5, 0.12, 0.9)}
            fill="var(--garden-highlight)"
            opacity={0.18}
          />
        </g>
      );
    case 'lanternFlower':
      return (
        <g>
          <path
            d="M0 0 C-.6 -8 1 -16 7 -20"
            stroke="var(--garden-stem)"
            strokeWidth={1.3}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M-.2 -7 q -5 -1 -6.4 -5.6 q 5 .4 6.4 5.6Z"
            fill="var(--garden-leaf)"
          />
          {[
            [2, -15.4, 2.6],
            [5.2, -17.8, 2.2],
            [7.6, -18.6, 2.4],
          ].map(([x, y, r]) => (
            <g key={x} transform={`translate(${x} ${y})`}>
              <path
                d={`M0 0 C${r} ${r * 0.4} ${r} ${r * 2.2} 0 ${r * 2.8} C${-r} ${r * 2.2} ${-r} ${r * 0.4} 0 0Z`}
                fill="var(--garden-memory-lantern)"
              />
              <path
                d={`M0 ${r * 0.6} L0 ${r * 2.4}`}
                stroke="var(--garden-memory-lantern-vein)"
                strokeWidth={0.5}
              />
            </g>
          ))}
        </g>
      );
    case 'steppingStones':
      return (
        <g>
          <path
            d={blob(-7, -1, 4.6, 2.2, 5, 0.1, 0.2)}
            fill="var(--garden-stone)"
          />
          <path
            d={blob(1, -3.6, 4, 1.9, 5, 0.1, 1.1)}
            fill="var(--garden-stone)"
          />
          <path
            d={blob(7.6, -6.4, 3.4, 1.6, 5, 0.1, 2.1)}
            fill="var(--garden-stone)"
          />
          <Heart
            x={1}
            y={-3.8}
            size={0.9}
            fill="var(--garden-memory-engraving)"
          />
          <path
            d="M-3.2 -2.4 q -.4 -2.4 .8 -3.4 M4.6 -5 q -.2 -2.2 1 -3"
            stroke="var(--garden-grass-mid)"
            strokeWidth={0.9}
            strokeLinecap="round"
            fill="none"
          />
        </g>
      );
    case 'roseTrellis':
      return (
        <g>
          <path
            d="M-7 0 L-7 -14 C-7 -21 7 -21 7 -14 L7 0"
            stroke="var(--garden-trunk)"
            strokeWidth={1.4}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M-7 -7 H7 M-6 -13 C-2 -15 2 -15 6 -13"
            stroke="var(--garden-trunk)"
            strokeWidth={0.7}
            fill="none"
            opacity={0.7}
          />
          <path
            d="M-7 -1 C-9 -6 -5 -9 -7 -13 C-8 -16 -4 -19 0 -19 C4 -19 8 -16 7 -13 C5 -9 9 -6 7 -1"
            stroke="var(--garden-leaf)"
            strokeWidth={1.2}
            fill="none"
            strokeLinecap="round"
          />
          {[
            [-7, -12, OWN],
            [-3, -18.4, PARTNER],
            [3.4, -18.2, OWN],
            [7, -11, PARTNER],
            [-7.4, -4.6, PARTNER],
            [7.2, -4, OWN],
          ].map(([x, y, colour]) => (
            <path
              key={`${x}-${y}`}
              d={blob(x as number, y as number, 1.9, 1.8, 5, 0.12)}
              fill={colour as string}
            />
          ))}
        </g>
      );
    case 'memoryStone':
      return (
        <g>
          <path
            d="M-8 0 C-9 -6 -6 -13 0 -13 C6 -13 9 -6 8 0 C4 1.2 -4 1.2 -8 0Z"
            fill="var(--garden-stone)"
          />
          <path
            d="M-5.4 -9 C-4 -11.4 -1.4 -12 1 -11.6"
            stroke="var(--garden-highlight)"
            strokeWidth={0.9}
            strokeLinecap="round"
            fill="none"
            opacity={0.5}
          />
          <Heart
            x={0}
            y={-6.4}
            size={2.2}
            fill="var(--garden-memory-engraving)"
          />
          <path
            d="M-9 .4 q 1.4 -3 3 -2.4 M8.6 .2 q -1 -3.4 -3.2 -2.4"
            stroke="var(--garden-grass-mid)"
            strokeWidth={1}
            strokeLinecap="round"
            fill="none"
          />
          <circle cx={-6.6} cy={-1.4} r={1} fill={OWN} />
          <circle cx={6.4} cy={-1.6} r={1} fill={PARTNER} />
        </g>
      );
  }
  return null;
}

/** A small portrait of a piece for the garden book and the card. */
export function MemoryPortrait({ piece }: { piece: MemoryPiece }) {
  return (
    <span className="garden-visitor-portrait" aria-hidden="true">
      <svg viewBox="-14 -28 28 30" focusable="false" aria-hidden="true">
        <MemoryPieceArt piece={piece} />
      </svg>
    </span>
  );
}

export function useMilestoneDate() {
  const format = new Intl.DateTimeFormat(resolvedLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (date: Date) => format.format(date);
}

/**
 * The memory corner for the scene: the art (decoration) and named tap targets.
 * `swaying` restarts a gentle one-shot sway on the tapped piece.
 */
export function useMemoryCorner({
  plants,
  selectedId,
  onSelect,
}: {
  plants: ReadonlyArray<PlacedMemoryPlant>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}): { art: ReactNode; targets: ReactNode } {
  const { t } = useTranslation();
  const date = useMilestoneDate();
  const [sway, setSway] = useState<{ id: string; key: number } | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  if (plants.length === 0) return { art: null, targets: null };
  const tap = (id: string) => {
    const key = Date.now();
    setSway({ id, key });
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSway(null), 1600);
    onSelect(id);
  };
  const onKey = (event: KeyboardEvent<SVGGElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      tap(id);
    }
  };
  const art = (
    <g className="garden-memory-corner" data-testid="garden-memory-corner">
      {plants.map((plant) => (
        <g
          key={plant.id}
          transform={`translate(${plant.x} ${plant.y}) scale(${PIECE_SCALE})`}
          data-piece={plant.piece}
        >
          <path
            d="M-9 .6 C-6 -1.2 6 -1.2 9 .6 C6 2 -6 2 -9 .6Z"
            fill="var(--garden-shade)"
            opacity={0.12}
          />
          <g
            key={sway?.id === plant.id ? sway.key : 'still'}
            className={`garden-sway${sway?.id === plant.id ? ' garden-memory-swaying' : ''}`}
            style={
              {
                '--garden-wave': `${Math.round(plant.x * 3.2)}ms`,
                '--garden-breeze': `${Math.round(-plant.x * 13)}ms`,
              } as Style
            }
          >
            <MemoryPieceArt piece={plant.piece} />
          </g>
        </g>
      ))}
    </g>
  );
  const targets = (
    <g>
      {plants.map((plant) => {
        const selected = plant.id === selectedId;
        return (
          // biome-ignore lint/a11y/useSemanticElements: an SVG piece cannot be a native button
          <g
            key={plant.id}
            role="button"
            tabIndex={0}
            className={`garden-memory-target${selected ? ' is-selected' : ''}`}
            aria-pressed={selected}
            aria-label={t('games.garden.story.memoryLabel', {
              title: plant.title,
              date: date(plant.happenedOn),
            })}
            data-testid="garden-memory-plant"
            onClick={() => tap(plant.id)}
            onKeyDown={(event) => onKey(event, plant.id)}
          >
            <rect
              x={plant.x - 9.5}
              y={plant.y - 33}
              width={19}
              height={37}
              rx={6}
              fill="transparent"
            />
            {selected ? (
              <path
                d={`M${plant.x - 10} ${plant.y} C${plant.x - 10} ${plant.y - 3} ${plant.x + 10} ${plant.y - 3} ${plant.x + 10} ${plant.y} C${plant.x + 10} ${plant.y + 3} ${plant.x - 10} ${plant.y + 3} ${plant.x - 10} ${plant.y}Z`}
                fill="none"
                stroke="var(--color-focus)"
                strokeWidth={1.4}
                strokeDasharray="3 3"
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
  return { art, targets };
}

/** The small card for a tapped Milestone plant. */
export function MemoryPlantCard({
  plant,
  onClose,
}: {
  plant: MemoryPlant;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const date = useMilestoneDate();
  return (
    <section
      className="garden-card garden-memory-card"
      aria-labelledby="garden-memory-card-title"
      aria-live="polite"
      data-testid="garden-memory-card"
    >
      <div className="garden-memory-card-head">
        <MemoryPortrait piece={plant.piece} />
        <div className="garden-memory-card-text">
          <p className="garden-eyebrow">{t('games.garden.story.eyebrow')}</p>
          <h2 id="garden-memory-card-title">{plant.title}</h2>
          <p className="garden-memory-date">{date(plant.happenedOn)}</p>
        </div>
      </div>
      <p>{t(`games.garden.story.pieces.${plant.piece}`)}</p>
      <div className="garden-card-actions">
        <button type="button" className="secondary" onClick={onClose}>
          {t('games.garden.close')}
        </button>
        <Link className="button-link" to={milestoneDetailPath(plant.id)}>
          {t('games.garden.story.open')}
        </Link>
      </div>
    </section>
  );
}

/** The garden book's story section; absent without Milestones. */
export function GardenStoryBookSection({
  plants,
}: {
  plants: ReadonlyArray<MemoryPlant>;
}) {
  const { t } = useTranslation();
  const date = useMilestoneDate();
  if (plants.length === 0) return null;
  return (
    <section
      className="garden-visitors garden-memory-book"
      aria-labelledby="garden-memory-book-title"
      data-testid="garden-memory-book"
    >
      <h3 id="garden-memory-book-title">{t('games.garden.story.bookTitle')}</h3>
      <p className="garden-hint">{t('games.garden.story.bookIntro')}</p>
      <ul className="garden-visitor-list">
        {plants.map((plant) => (
          <li key={plant.id} className="garden-visitor">
            <span className="garden-visitor-row">
              <MemoryPortrait piece={plant.piece} />
              <span className="garden-visitor-text">
                <span className="garden-visitor-name">{plant.title}</span>
                <span className="garden-visitor-sub">
                  {t('games.garden.story.bookSub', {
                    piece: t(`games.garden.story.pieceNames.${plant.piece}`),
                    date: date(plant.happenedOn),
                  })}
                </span>
              </span>
              <Link
                className="garden-memory-link"
                to={milestoneDetailPath(plant.id)}
                aria-label={t('games.garden.story.openLabel', {
                  title: plant.title,
                })}
              >
                {t('games.garden.story.open')}
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

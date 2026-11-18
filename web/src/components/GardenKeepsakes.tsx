/**
 * Small finds in the shared garden (#1907 H3 follow-up). Now and then a
 * visitor leaves something after a tap: a feather, a nut, a snail shell …
 * Which find comes when follows the couple's shared days (see gardenStory),
 * so both partners find the same things without anything new being stored.
 * A new find glints once in the scene; the garden book keeps every find in
 * "Fundstücke". There are no empty slots and no counts.
 */

import type { CSSProperties } from 'react';
import { blob } from '../client/garden';
import type { Keepsake } from '../client/gardenStory';
import { useTranslation } from '../i18n';
import './GardenKeepsakes.css';

type Style = CSSProperties & Record<`--${string}`, string>;

/** One find, centred on (0,0) and about 12 units across. */
export function KeepsakeArt({ keepsake }: { keepsake: Keepsake }) {
  switch (keepsake) {
    case 'feather':
      return (
        <g transform="rotate(-30)">
          <path
            d="M0 6 C-.2 2 -.2 -2 0 -6"
            stroke="var(--garden-trunk)"
            strokeWidth={0.7}
            strokeLinecap="round"
          />
          <path
            d="M0 -6 C3.6 -4 3.4 1 .2 4 C-3 1.6 -3.6 -3.6 0 -6Z"
            fill="var(--garden-bird-wing)"
          />
          <path
            d="M0 -3 L2 -4.2 M0 -.6 L2.4 -1.8 M0 1.6 L-2.2 .2"
            stroke="var(--garden-highlight)"
            strokeWidth={0.5}
            opacity={0.7}
          />
        </g>
      );
    case 'hazelnut':
      return (
        <g>
          <path d={blob(0, 1, 4.6, 4.2, 6, 0.04)} fill="var(--garden-shell)" />
          <path
            d="M-4.4 -1 C-3 -4.6 3 -4.6 4.4 -1 C2.6 -2 -2.6 -2 -4.4 -1Z"
            fill="var(--garden-trunk)"
          />
          <path
            d="M-1.8 2 C-1 3.2 1 3.2 1.8 2"
            stroke="var(--garden-highlight)"
            strokeWidth={0.6}
            fill="none"
            opacity={0.5}
          />
        </g>
      );
    case 'snailShell':
      return (
        <g>
          <path
            d="M-5 3.6 C-6 -2 -2 -5.6 1.4 -5 C5 -4.4 6 -.4 4.6 2.4 C3.6 4.4 -3 4.6 -5 3.6Z"
            fill="var(--garden-shell)"
          />
          <path
            d="M.6 -.4 C1.8 -.8 2.6 .4 2 1.4 C1.2 2.6 -1 2.2 -1.4 .8 C-1.8 -.8 -.4 -2.6 1.6 -2.6 C3.4 -2.6 4.6 -1 4.2 .8"
            stroke="var(--garden-highlight)"
            strokeWidth={0.7}
            fill="none"
            opacity={0.6}
          />
        </g>
      );
    case 'shinyPebble':
      return (
        <g>
          <path
            d={blob(0, 0, 5.4, 3.8, 5, 0.05, 0.3)}
            fill="var(--garden-water)"
          />
          <path
            d="M-2.6 -1.6 C-1.6 -2.6 .4 -2.8 1.6 -2.2"
            stroke="var(--garden-highlight)"
            strokeWidth={0.9}
            strokeLinecap="round"
            fill="none"
          />
        </g>
      );
    case 'clover':
      return (
        <g>
          <path
            d="M0 0 C.6 2.4 1.6 4.4 2.6 5.8"
            stroke="var(--garden-stem)"
            strokeWidth={0.8}
            strokeLinecap="round"
            fill="none"
          />
          {[0, 90, 180, 270].map((angle) => (
            <path
              key={angle}
              transform={`rotate(${angle + 45})`}
              d="M0 0 C-2.6 -1 -3 -4.6 -1 -4.8 C-.2 -4.9 0 -4 0 -3.6 C0 -4 .2 -4.9 1 -4.8 C3 -4.6 2.6 -1 0 0Z"
              fill="var(--garden-leaf)"
            />
          ))}
        </g>
      );
    case 'acorn':
      return (
        <g>
          <path
            d="M-3.6 -.6 C-3.6 3.4 -1.4 5.6 0 6 C1.4 5.6 3.6 3.4 3.6 -.6Z"
            fill="var(--garden-shell)"
          />
          <path
            d="M-4.4 -.4 C-4.6 -3.6 4.6 -3.6 4.4 -.4 C2 .4 -2 .4 -4.4 -.4Z"
            fill="var(--garden-trunk)"
          />
          <path
            d="M0 -3 C.2 -4.4 .8 -5.2 1.6 -5.6"
            stroke="var(--garden-trunk)"
            strokeWidth={0.8}
            strokeLinecap="round"
            fill="none"
          />
        </g>
      );
    case 'pineCone':
      return (
        <g>
          <path
            d="M0 -6 C3.6 -4 4.4 1.4 0 6 C-4.4 1.4 -3.6 -4 0 -6Z"
            fill="var(--garden-trunk)"
          />
          <path
            d="M-2.6 -2.4 Q0 -1 2.6 -2.4 M-3.2 .6 Q0 2 3.2 .6 M-2.2 3.4 Q0 4.6 2.2 3.4"
            stroke="var(--garden-shell)"
            strokeWidth={0.7}
            fill="none"
          />
        </g>
      );
    case 'heartLeaf':
      return (
        <g transform="rotate(12)">
          <path
            d="M0 5 C-5 1.6 -5.6 -3.6 -2.6 -4.6 C-1.2 -5 0 -4 0 -3 C0 -4 1.2 -5 2.6 -4.6 C5.6 -3.6 5 1.6 0 5Z"
            fill="var(--garden-leaf-autumn)"
          />
          <path
            d="M0 -2.6 L0 6.2"
            stroke="var(--garden-trunk)"
            strokeWidth={0.6}
            strokeLinecap="round"
          />
        </g>
      );
  }
  return null;
}

export function KeepsakeIcon({ keepsake }: { keepsake: Keepsake }) {
  return (
    <svg
      className="garden-keepsake-icon"
      viewBox="-8 -8 16 16"
      focusable="false"
      aria-hidden="true"
    >
      <KeepsakeArt keepsake={keepsake} />
    </svg>
  );
}

/** A new find glints once where the visitor left it (decoration only). */
export function KeepsakeSparkle({
  keepsake,
  x,
  y,
}: {
  keepsake: Keepsake;
  x: number;
  y: number;
}) {
  return (
    <g
      transform={`translate(${Math.round(x)} ${Math.round(y)})`}
      className="garden-keepsake-drop"
      data-testid="garden-keepsake-sparkle"
      data-keepsake={keepsake}
    >
      <g className="garden-keepsake-land">
        <KeepsakeArt keepsake={keepsake} />
      </g>
      {[
        [-8, -7, 0],
        [8, -9, 160],
        [9, 3, 320],
        [-7, 5, 480],
      ].map(([dx, dy, delay]) => (
        <path
          key={`${dx}-${dy}`}
          className="garden-keepsake-glint"
          style={{ '--garden-delay': `${delay}ms` } as Style}
          transform={`translate(${dx} ${dy})`}
          d="M0 -2.4 Q0 0 2.4 0 Q0 0 0 2.4 Q0 0 -2.4 0 Q0 0 0 -2.4Z"
          fill="var(--garden-sun)"
        />
      ))}
    </g>
  );
}

/** "Fundstücke" in the garden book: only what was found, in finding order. */
export function GardenKeepsakesBookSection({
  found,
}: {
  found: ReadonlyArray<Keepsake>;
}) {
  const { t } = useTranslation();
  if (found.length === 0) return null;
  return (
    <section
      className="garden-keepsakes"
      aria-labelledby="garden-keepsakes-title"
      data-testid="garden-keepsakes"
    >
      <h3 id="garden-keepsakes-title">
        {t('games.garden.story.keepsakesTitle')}
      </h3>
      <p className="garden-hint">{t('games.garden.story.keepsakesIntro')}</p>
      <ul className="garden-herbarium">
        {found.map((keepsake) => (
          <li key={keepsake}>
            <KeepsakeIcon keepsake={keepsake} />
            <span>{t(`games.garden.story.keepsakes.${keepsake}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

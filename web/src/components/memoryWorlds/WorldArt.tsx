/**
 * Small decorative illustrations of the memory worlds for the world choice
 * in Mehr › Einstellungen › Darstellung. They are artwork: their colours are
 * part of the picture and stay the same in Light and Dark. Always
 * `aria-hidden`; the caller names the world.
 */
import { useId } from 'react';
import './WorldArt.css';

export type WorldArtKind = 'story' | 'stack' | 'crate';

type Id = (name: string) => string;

export function WorldArt({ world }: { world: WorldArtKind }) {
  const raw = useId();
  const id = (name: string) => `wa${raw.replace(/[^a-zA-Z0-9]/g, '')}${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  return (
    <svg
      className="memory-world-art"
      viewBox="0 0 160 100"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
    >
      {art(world, id, url)}
    </svg>
  );
}

function art(world: WorldArtKind, id: Id, url: Id) {
  switch (world) {
    case 'story':
      return (
        <>
          <defs>
            <linearGradient id={id('bg')} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f3e8ff" />
              <stop offset="1" stopColor="#dfe9ff" />
            </linearGradient>
          </defs>
          <rect width="160" height="100" fill={url('bg')} />
          {[34, 58, 82, 106, 130].map((x, i) => (
            <circle
              key={x}
              cx={x}
              cy="20"
              r="9"
              fill={['#c9a4f2', '#9cc3f5', '#f5b8c6', '#a9dcc4', '#f3d38f'][i]}
              stroke="#fff"
              strokeWidth="2"
            />
          ))}
          <rect x="44" y="36" width="72" height="56" rx="9" fill="#fff" />
          <rect x="50" y="42" width="60" height="32" rx="5" fill="#b9c8ee" />
          <path
            d="M50 70 L66 56 L78 66 L88 58 L110 72 L110 74 L50 74Z"
            fill="#8ea6e0"
          />
          <rect x="50" y="79" width="40" height="4" rx="2" fill="#5b5470" />
          <rect x="50" y="86" width="26" height="3" rx="1.5" fill="#a49fb5" />
        </>
      );
    case 'stack':
      return (
        <>
          <rect width="160" height="100" fill="#efe3d0" />
          <g transform="rotate(-12 70 56)">
            <rect x="44" y="20" width="56" height="66" rx="2" fill="#fbf7ef" />
            <rect x="49" y="25" width="46" height="44" fill="#c7b8a4" />
          </g>
          <g transform="rotate(9 92 54)">
            <rect x="64" y="18" width="56" height="66" rx="2" fill="#fffaf2" />
            <rect x="69" y="23" width="46" height="44" fill="#9fb7c9" />
          </g>
          <g transform="rotate(-2 80 54)">
            <rect x="52" y="16" width="56" height="70" rx="2" fill="#fff" />
            <rect x="57" y="21" width="46" height="46" fill="#e7a98f" />
            <circle cx="72" cy="38" r="7" fill="#f6d1a8" />
            <path
              d="M57 67 L72 50 L84 60 L94 52 L103 62 L103 67Z"
              fill="#c9745a"
            />
          </g>
        </>
      );
    case 'crate':
      return (
        <>
          <rect width="160" height="100" fill="#e9dcc8" />
          {[
            [34, '#d98f7a', -10],
            [48, '#8fb1c9', -6],
            [62, '#e6c36a', -2],
            [76, '#b49ad1', 3],
          ].map(([x, c, r]) => (
            <rect
              key={x as number}
              x={x as number}
              y="18"
              width="44"
              height="44"
              rx="2"
              fill={c as string}
              transform={`rotate(${r} ${(x as number) + 22} 62)`}
            />
          ))}
          <rect x="22" y="52" width="100" height="40" rx="3" fill="#a5693f" />
          <rect x="22" y="52" width="100" height="6" fill="#bf7f4f" />
          <rect x="58" y="66" width="28" height="8" rx="4" fill="#7a4a2a" />
          <circle cx="134" cy="62" r="20" fill="#1f1d22" />
          <circle
            cx="134"
            cy="62"
            r="13"
            fill="none"
            stroke="#3a373f"
            strokeWidth="1"
          />
          <circle cx="134" cy="62" r="6" fill="#f2668b" />
          <circle cx="134" cy="62" r="1.3" fill="#fff" />
          <path
            d="M152 36 L144 56"
            stroke="#c9c9cf"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </>
      );
  }
}

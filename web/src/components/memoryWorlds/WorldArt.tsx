/**
 * Small decorative illustrations of the memory worlds for the world choice
 * in Mehr › Einstellungen › Darstellung. They are artwork: their colours are
 * part of the picture and stay the same in Light and Dark. Always
 * `aria-hidden`; the caller names the world.
 */
import { useId } from 'react';
import './WorldArt.css';

export type WorldArtKind =
  | 'story'
  | 'stack'
  | 'crate'
  | 'cloud'
  | 'booth'
  | 'fridge'
  | 'album'
  | 'scratch'
  | 'mochi';

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
    case 'cloud':
      return (
        <>
          <defs>
            <radialGradient id={id('bg')} cx="0.5" cy="0.5" r="0.75">
              <stop offset="0" stopColor="#5b4bd6" />
              <stop offset="0.55" stopColor="#24205a" />
              <stop offset="1" stopColor="#0e0f26" />
            </radialGradient>
            <radialGradient id={id('glow')} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ff8fc8" stopOpacity="0.7" />
              <stop offset="1" stopColor="#ff8fc8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="160" height="100" fill={url('bg')} />
          <circle cx="80" cy="50" r="44" fill={url('glow')} />
          {CLOUD_BUBBLES.map(([x, y, r, c]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r={r} fill={c} />
              <ellipse
                cx={x - r * 0.3}
                cy={y - r * 0.4}
                rx={r * 0.45}
                ry={r * 0.25}
                fill="#fff"
                opacity="0.45"
              />
            </g>
          ))}
          <rect
            x="52"
            y="6"
            width="56"
            height="9"
            rx="4.5"
            fill="#fff"
            opacity="0.28"
          />
        </>
      );
    case 'booth':
      return (
        <>
          <defs>
            <linearGradient id={id('curtain')} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#8e1f2b" />
              <stop offset="0.5" stopColor="#c23a45" />
              <stop offset="1" stopColor="#8e1f2b" />
            </linearGradient>
          </defs>
          <rect width="160" height="100" fill="#2e3e5c" />
          <rect x="18" y="8" width="70" height="92" rx="4" fill="#e9dfcb" />
          <rect x="26" y="20" width="54" height="80" fill={url('curtain')} />
          {[34, 46, 58, 70].map((x) => (
            <line
              key={x}
              x1={x}
              y1="20"
              x2={x}
              y2="100"
              stroke="#6e1520"
              strokeWidth="1.4"
              opacity="0.6"
            />
          ))}
          <rect x="22" y="10" width="62" height="8" rx="2" fill="#f2c94c" />
          <g transform="rotate(6 124 52)">
            <rect
              x="108"
              y="10"
              width="32"
              height="86"
              rx="1.5"
              fill="#fbf7ee"
            />
            {BOOTH_STRIP_FRAMES.map(([y, fill]) => (
              <rect key={y} x="112" y={y} width="24" height="18" fill={fill} />
            ))}
          </g>
        </>
      );
    case 'fridge':
      return (
        <>
          <rect width="160" height="100" fill="#f3ece2" />
          <rect x="30" y="4" width="100" height="96" rx="8" fill="#bfe3d4" />
          <rect x="120" y="20" width="4" height="34" rx="2" fill="#e9eef0" />
          <g transform="rotate(-6 56 34)">
            <rect x="40" y="16" width="32" height="36" fill="#fff" />
            <rect x="43" y="19" width="26" height="24" fill="#e3a98f" />
          </g>
          <circle cx="56" cy="16" r="4.5" fill="#3b82c4" />
          <g transform="rotate(5 96 36)">
            <rect x="82" y="20" width="30" height="30" fill="#f7c6d3" />
            <path
              d="M88 31 h18 M88 37 h14"
              stroke="#22325f"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </g>
          <path d={FRIDGE_HEART_MAGNET} fill="#d63c55" />
          <g transform="rotate(-3 70 70)">
            <rect x="52" y="58" width="36" height="26" fill="#fff" />
            <rect x="55" y="61" width="30" height="18" fill="#9fbfd6" />
          </g>
          <circle cx="70" cy="58" r="4" fill="#f2c94c" />
          {FRIDGE_LETTERS.map(([glyph, fill, x]) => (
            <text
              key={glyph}
              x={x}
              y="96"
              fontSize="11"
              fontWeight="800"
              fill={fill}
              fontFamily="sans-serif"
            >
              {glyph}
            </text>
          ))}
          <path d={FRIDGE_HEART_LETTER} fill="#d63c55" />
        </>
      );
    case 'album':
      return (
        <>
          <rect width="160" height="100" fill="#d9e4e1" />
          <path d="M14 22 Q48 14 80 22 L80 90 Q48 82 14 90Z" fill="#fffdf8" />
          <path
            d="M146 22 Q112 14 80 22 L80 90 Q112 82 146 90Z"
            fill="#f7f3ea"
          />
          <line
            x1="80"
            y1="22"
            x2="80"
            y2="90"
            stroke="#cfc6b6"
            strokeWidth="1.5"
          />
          <rect
            x="24"
            y="28"
            width="44"
            height="34"
            fill="#9fbfc8"
            transform="rotate(-3 46 45)"
          />
          <rect x="30" y="68" width="34" height="4" rx="2" fill="#a79f92" />
          <rect
            x="92"
            y="28"
            width="44"
            height="50"
            fill="#e3b39b"
            transform="rotate(2 114 53)"
          />
          {/* The next page lifting at its corner. */}
          <path
            d="M120 22 Q140 30 146 22 L146 90 Q130 84 120 88Z"
            fill="#ece6d9"
            opacity="0.9"
          />
        </>
      );
    case 'scratch':
      return (
        <>
          <rect width="160" height="100" fill="#ffe9a8" />
          <g transform="rotate(-5 80 52)">
            <rect
              x="22"
              y="18"
              width="116"
              height="66"
              rx="6"
              fill="#fff8e6"
              stroke="#e0a43a"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
            <rect x="32" y="28" width="96" height="38" rx="4" fill="#f3b7a3" />
            {/* The silver foil, half scratched away. */}
            <path
              d="M74 28 L128 28 L128 66 L58 66 Q66 52 74 28Z"
              fill="#b8bcc4"
            />
            <path
              d="M78 34 l40 0 M74 42 l50 0 M70 50 l54 0 M66 58 l58 0"
              stroke="#d3d6dc"
              strokeWidth="2"
            />
            <rect x="34" y="72" width="50" height="5" rx="2.5" fill="#c9893a" />
          </g>
          <circle
            cx="132"
            cy="80"
            r="12"
            fill="#e8c06a"
            stroke="#b98a2e"
            strokeWidth="2"
          />
        </>
      );
    case 'mochi':
      return (
        <>
          <defs>
            <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fde6ef" />
              <stop offset="1" stopColor="#e6f6ee" />
            </linearGradient>
          </defs>
          <rect width="160" height="100" fill={url('sky')} />
          <ellipse cx="80" cy="96" rx="96" ry="22" fill="#b8e3c4" />
          <path
            d="M80 18 C74 10 64 14 66 22 C67 28 80 34 80 34 C80 34 93 28 94 22 C96 14 86 10 80 18Z"
            fill="#f2668b"
          />
          <line
            x1="80"
            y1="34"
            x2="80"
            y2="52"
            stroke="#c98a9c"
            strokeWidth="1"
          />
          <ellipse cx="62" cy="70" rx="24" ry="19" fill="#ffd4df" />
          <ellipse cx="98" cy="70" rx="24" ry="19" fill="#cdeedd" />
          <circle cx="55" cy="68" r="2.3" fill="#3a2a30" />
          <circle cx="68" cy="68" r="2.3" fill="#3a2a30" />
          <circle cx="92" cy="68" r="2.3" fill="#2c3a33" />
          <circle cx="105" cy="68" r="2.3" fill="#2c3a33" />
          <ellipse cx="51" cy="74" rx="3.5" ry="2" fill="#f7a3b8" />
          <ellipse cx="109" cy="74" rx="3.5" ry="2" fill="#9fd9bc" />
          <path
            d="M59 74 Q61.5 77 64 74"
            stroke="#3a2a30"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M96 74 Q98.5 77 101 74"
            stroke="#2c3a33"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
  }
}

/** The letter magnets along the bottom of the fridge door (glyph, colour, x). */
const FRIDGE_LETTERS: readonly [string, string, number][] = [
  ['W', '#e4572e', 40],
  ['I', '#3b82c4', 50],
  ['R', '#f2a541', 58],
];
/** The heart magnet on the sticky note and the heart among the letters. */
const FRIDGE_HEART_MAGNET =
  'M96 22 C94 19 90.5 20 91 23 C91.4 25 96 27.5 96 27.5 C96 27.5 100.6 25 101 23 C101.5 20 98 19 96 22Z';
const FRIDGE_HEART_LETTER =
  'M80 88 C78.5 86 76 86.8 76.4 89 C76.7 90.5 80 92.5 80 92.5 C80 92.5 83.3 90.5 83.6 89 C84 86.8 81.5 86 80 88Z';

/** The four pictures of the strip beside the cabin (y, colour). */
const BOOTH_STRIP_FRAMES: readonly [number, string][] = [
  [14, '#d79b86'],
  [34, '#9db5c7'],
  [54, '#c8b48e'],
  [74, '#b9a3c9'],
];

/** The cloud's bubbles: centre, two honeycomb rings and the rim (x, y, r, colour). */
const CLOUD_BUBBLES: readonly [number, number, number, string][] = [
  [80, 50, 19, '#ff9dbf'],
  [52, 50, 11, '#8fd3ff'],
  [108, 50, 11, '#ffd36e'],
  [66, 26, 10, '#a8f0c6'],
  [94, 26, 10, '#c7a6ff'],
  [66, 74, 10, '#ffb38a'],
  [94, 74, 10, '#7fe0e0'],
  [30, 38, 6, '#ffe08a'],
  [30, 62, 6, '#ff9dbf'],
  [130, 38, 6, '#8fd3ff'],
  [130, 62, 6, '#a8f0c6'],
  [44, 16, 4, '#c7a6ff'],
  [116, 16, 4, '#ffb38a'],
  [44, 86, 4, '#7fe0e0'],
  [116, 86, 4, '#ffd36e'],
  [14, 50, 3, '#c7a6ff'],
  [146, 50, 3, '#ff9dbf'],
];

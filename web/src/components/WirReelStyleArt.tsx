import type { WirReelStyle } from '../client/wirReelStyle';

/**
 * A static sketch of a Wir reel style for the settings (#2345): sample faces
 * in the reel's tints, never real content. Colours come from the stylesheet,
 * so the sketch follows the theme and the app design.
 */
export function WirReelStyleArt({ style }: { style: WirReelStyle }) {
  return (
    <svg
      className="wir-reel-style-art"
      viewBox="0 0 160 100"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect className="wir-reel-style-art-ground" width="160" height="100" />
      {style === 'circles' ? <Circles /> : null}
      {style === 'tiles' ? <Tiles /> : null}
      {style === 'chips' ? <Chips /> : null}
    </svg>
  );
}

const TONES = ['warm', 'cool', 'action', 'paper'] as const;

function Circles() {
  return (
    <>
      {TONES.map((tone, index) => (
        <g key={tone}>
          <circle
            className={`wir-reel-style-art-${tone}`}
            cx={26 + index * 36}
            cy={44}
            r={14}
          />
          <rect
            className="wir-reel-style-art-line"
            x={14 + index * 36}
            y={66}
            width={24}
            height={4}
            rx={2}
          />
        </g>
      ))}
    </>
  );
}

function Tiles() {
  return (
    <>
      {TONES.slice(0, 3).map((tone, index) => (
        <g key={tone}>
          <rect
            className={`wir-reel-style-art-${tone}`}
            x={10 + index * 50}
            y={18}
            width={44}
            height={64}
            rx={10}
          />
          <rect
            className="wir-reel-style-art-ink"
            x={18 + index * 50}
            y={56}
            width={28}
            height={5}
            rx={2.5}
          />
          <rect
            className="wir-reel-style-art-ink"
            x={18 + index * 50}
            y={66}
            width={20}
            height={4}
            rx={2}
          />
        </g>
      ))}
    </>
  );
}

function Chips() {
  return (
    <>
      {[
        { tone: 'warm', x: 10, y: 28, width: 76 },
        { tone: 'cool', x: 92, y: 28, width: 60 },
        { tone: 'action', x: 10, y: 58, width: 60 },
        { tone: 'paper', x: 76, y: 58, width: 76 },
      ].map(({ tone, x, y, width }) => (
        <g key={`${tone}-${x}-${y}`}>
          <rect
            className={`wir-reel-style-art-${tone}`}
            x={x}
            y={y}
            width={width}
            height={22}
            rx={11}
          />
          <circle
            className="wir-reel-style-art-face"
            cx={x + 11}
            cy={y + 11}
            r={7}
          />
          <rect
            className="wir-reel-style-art-ink"
            x={x + 23}
            y={y + 9}
            width={width - 32}
            height={4}
            rx={2}
          />
        </g>
      ))}
    </>
  );
}

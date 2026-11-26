/**
 * The four animated Pro showcase scenes (#2310, accepted mockup v2).
 *
 * Scenes are artwork like `WorldArt`: their colours belong to the picture and
 * stay the same in Light, Dark and every app design. The Mochi pair from the
 * Mochi memory world guides every scene, and the photos are the bundled
 * fictional samples in `./photos` (never a couple's own content).
 *
 * Motion (Motion Contract M8, M9, M4): a scene plays only while it is
 * `active` (the current gallery card), seen (page and kept view shown, on
 * screen) and reduced motion is off (`data-ambient="on"`). Until it first
 * plays, and with reduced motion, every element rests at its composed still
 * frame. Once started it pauses in place when not seen or not current and
 * continues from there, and it rests at its still frame after
 * `--motion-ambient-repeat` cycles. Keyframes and timing roles:
 * `src/motion/pro-showcase.css`.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import { useReducedMotion } from '../../motion/reducedMotion';
import { observeVisibility } from '../../motion/visibility';
import { WorldArt, type WorldArtKind } from '../memoryWorlds/WorldArt';
import breakfast from './photos/breakfast.webp';
import lake from './photos/lake.webp';
import picnic from './photos/picnic.webp';
import ravioli from './photos/ravioli.webp';
import trier from './photos/trier.webp';
import '../../motion/pro-showcase.css';
import './ProShowcase.css';

export const PRO_SCENE_IDS = [
  'memoryWorlds',
  'recapFilms',
  'gamesGarden',
  'mapCloseness',
] as const;

export type ProSceneId = (typeof PRO_SCENE_IDS)[number];

type Ids = (name: string) => string;

const HEART_PATH =
  'M12 20.3 4.7 13a4.6 4.6 0 0 1 6.5-6.5l.8.8.8-.8a4.6 4.6 0 0 1 6.5 6.5Z';

export function ProScene({
  id,
  active,
  className,
}: {
  id: ProSceneId;
  active: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);
  const raw = useId();
  const ids: Ids = (name) => `ps${raw.replace(/[^a-zA-Z0-9]/g, '')}${name}`;
  const playing = active && visible && !reducedMotion;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return observeVisibility(element, (state) => setVisible(state.visible));
  }, []);

  // A scene that never played shows its still frame, not its first keyframe.
  useEffect(() => {
    if (playing) setStarted(true);
  }, [playing]);

  return (
    <div
      ref={ref}
      className={['pro-scene', `pro-scene-${id}`, className]
        .filter(Boolean)
        .join(' ')}
      data-scene={id}
      data-ambient={playing ? 'on' : 'paused'}
      data-started={(started && !reducedMotion) || undefined}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 240 192"
        aria-hidden="true"
        focusable="false"
        preserveAspectRatio="xMidYMid slice"
      >
        <SceneDrawing id={id} ids={ids} />
      </svg>
    </div>
  );
}

function SceneDrawing({ id, ids }: { id: ProSceneId; ids: Ids }) {
  switch (id) {
    case 'memoryWorlds':
      return <MemoryWorldsScene ids={ids} />;
    case 'recapFilms':
      return <RecapFilmScene ids={ids} />;
    case 'gamesGarden':
      return <GardenScene ids={ids} />;
    case 'mapCloseness':
      return <MapScene ids={ids} />;
  }
}

/** One of the two Mochis from the Mochi memory world. */
function Mochi({
  kind,
  x,
  y,
  width,
  height,
}: {
  kind: 'a' | 'b';
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const a = kind === 'a';
  const ink = a ? '#3a2a30' : '#2c3a33';
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox="-26 -21 52 42"
      overflow="visible"
      aria-hidden="true"
    >
      <ellipse rx="24" ry="19" fill={a ? '#ffd4df' : '#cdeedd'} />
      <g className="ps-p ps-blink">
        <circle cx={a ? -7 : -6} cy="-2" r="2.3" fill={ink} />
        <circle cx={a ? 6 : 7} cy="-2" r="2.3" fill={ink} />
      </g>
      <ellipse
        cx={a ? -11 : 11}
        cy="4"
        rx="3.5"
        ry="2"
        fill={a ? '#f7a3b8' : '#9fd9bc'}
      />
      <path
        d={a ? 'M-3 4 Q-0.5 7 2 4' : 'M-2 4 Q0.5 7 3 4'}
        stroke={ink}
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Heart({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d={HEART_PATH} fill="#f2668b" />
    </svg>
  );
}

function Photo({
  href,
  x,
  y,
  width,
  height,
  clipPath,
  className,
}: {
  href: string;
  x: number;
  y: number;
  width: number;
  height: number;
  clipPath?: string;
  className?: string;
}) {
  return (
    <image
      href={href}
      x={x}
      y={y}
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid slice"
      clipPath={clipPath}
      className={className}
    />
  );
}

const TOUR: readonly { world: WorldArtKind; className: string }[] = [
  { world: 'crate', className: 'ps1-w1' },
  { world: 'booth', className: 'ps1-w2' },
  { world: 'fridge', className: 'ps1-w3' },
  { world: 'stars', className: 'ps1-w4' },
];

/** The Mochis cuddle and a memory balloon rises, then a calm world tour. */
function MemoryWorldsScene({ ids }: { ids: Ids }) {
  const { t } = useTranslation();
  return (
    <>
      <defs>
        <linearGradient id={ids('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde6ef" />
          <stop offset="1" stopColor="#e6f6ee" />
        </linearGradient>
        <clipPath id={ids('photo')}>
          <path transform="translate(98 70) scale(1.84)" d={HEART_PATH} />
        </clipPath>
      </defs>
      <g className="ps-p ps1-mochi-world">
        <rect width="240" height="192" fill={`url(#${ids('sky')})`} />
        <circle cx="40" cy="34" r="12" fill="#fff6c8" />
        <ellipse cx="60" cy="40" rx="22" ry="7" fill="#fff" opacity=".8" />
        <ellipse cx="190" cy="28" rx="26" ry="8" fill="#fff" opacity=".8" />
        <ellipse cx="120" cy="196" rx="150" ry="42" fill="#b8e3c4" />
        <g className="ps-p ps1-balloon">
          <path
            d="M120 162 C118 150 122 140 120 122"
            stroke="#c98a9c"
            strokeWidth="1"
            fill="none"
          />
          <Heart x={91} y={62} size={58} />
          <Photo
            href={breakfast}
            x={98}
            y={76}
            width={44}
            height={38}
            clipPath={`url(#${ids('photo')})`}
          />
        </g>
        <g className="ps-p ps1-hop-a">
          <Mochi kind="a" x={44} y={132} width={52} height={42} />
        </g>
        <g className="ps-p ps1-hop-b">
          <Mochi kind="b" x={144} y={132} width={52} height={42} />
        </g>
      </g>
      <g className="ps-p ps1-tour">
        {TOUR.map(({ world, className }) => (
          <g key={world} className={`ps-p ${className}`}>
            <WorldArt world={world} />
            <text
              x="120"
              y="182"
              textAnchor="middle"
              className="ps-label"
              fontSize="11"
            >
              {t(`memoryWorldSettings.worlds.${world}.name`)}
            </text>
          </g>
        ))}
        <g className="ps-p ps1-guide">
          <Mochi kind="a" x={6} y={160} width={30} height={24} />
          <Mochi kind="b" x={26} y={162} width={30} height={24} />
        </g>
      </g>
    </>
  );
}

const FILM_PARTS = ['k1', 'k2', 'k3', 'k4', 'k5'] as const;

/** Five 3 s parts like the real recap film: cover, collage, fact, place, goodbye. */
function RecapFilmScene({ ids }: { ids: Ids }) {
  const { t } = useTranslation();
  const fill = { x: 66, y: 10, width: 108, height: 172 };
  return (
    <>
      <defs>
        <linearGradient id={ids('bg')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fde6ef" />
          <stop offset="1" stopColor="#dfe9ff" />
        </linearGradient>
        <clipPath id={ids('frame')}>
          <rect x="66" y="10" width="108" height="172" rx="12" />
        </clipPath>
        <linearGradient id={ids('shade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".6" />
        </linearGradient>
        <linearGradient id={ids('fact')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3055b8" />
          <stop offset="1" stopColor="#d13b65" />
        </linearGradient>
      </defs>
      <rect width="240" height="192" fill={`url(#${ids('bg')})`} />
      <g className="ps-p ps2-float">
        <Heart x={24} y={40} size={18} />
      </g>
      <g className="ps-p ps2-float ps2-float-late">
        <Heart x={196} y={120} size={14} />
      </g>
      <rect x="62" y="6" width="116" height="180" rx="15" fill="#19233e" />
      <g clipPath={`url(#${ids('frame')})`}>
        <rect {...fill} fill="#19233e" />
        <g className="ps-p ps2-part ps2-k1">
          <Photo
            href={lake}
            x={40}
            y={10}
            width={160}
            height={172}
            className="ps-p ps2-kb"
          />
          <rect {...fill} fill={`url(#${ids('shade')})`} />
          <g className="ps-p ps2-title">
            <text x="76" y="150" className="ps-serif" fontSize="19" fill="#fff">
              {t('proPaywall.showcase.art.recapMonth')}
            </text>
            <text x="77" y="166" fontSize="8" fill="#ffffffcc">
              {t('proPaywall.showcase.art.recapMoments')}
            </text>
          </g>
        </g>
        <g className="ps-p ps2-part ps2-k2">
          <rect {...fill} fill="#f9eaf4" />
          <g className="ps-p ps2-fly1">
            <rect x="72" y="26" width="66" height="54" rx="3" fill="#fff" />
            <Photo href={picnic} x={75} y={29} width={60} height={44} />
          </g>
          <g className="ps-p ps2-fly2">
            <rect x="102" y="70" width="66" height="54" rx="3" fill="#fff" />
            <Photo href={breakfast} x={105} y={73} width={60} height={44} />
          </g>
          <g className="ps-p ps2-fly3">
            <rect x="74" y="114" width="66" height="54" rx="3" fill="#fff" />
            <Photo href={ravioli} x={77} y={117} width={60} height={44} />
          </g>
        </g>
        <g className="ps-p ps2-part ps2-k3">
          <rect {...fill} fill={`url(#${ids('fact')})`} />
          <g className="ps-p ps2-num">
            <text
              x="120"
              y="98"
              textAnchor="middle"
              className="ps-serif"
              fontSize="46"
              fill="#fff"
            >
              3
            </text>
          </g>
          <text x="120" y="118" textAnchor="middle" fontSize="9.5" fill="#fff">
            {t('proPaywall.showcase.art.recapFact')}
          </text>
          <Heart x={110} y={130} size={20} />
        </g>
        <g className="ps-p ps2-part ps2-k4">
          <Photo
            href={trier}
            x={40}
            y={10}
            width={160}
            height={172}
            className="ps-p ps2-kb ps2-kb-late"
          />
          <g className="ps-p ps2-pin">
            <rect x="80" y="134" width="80" height="24" rx="12" fill="#fff" />
            <path
              d="M93 151 c-4 -5 -6 -7 -6 -9.5 a6 6 0 0 1 12 0 c0 2.5 -2 4.5 -6 9.5z"
              fill="#d13b65"
            />
            <text x="104" y="150" fontSize="10" fontWeight="700" fill="#19233e">
              {t('proPaywall.showcase.art.recapPlace')}
            </text>
          </g>
        </g>
        <g className="ps-p ps2-part ps2-k5">
          <rect {...fill} fill="#e6f6ee" />
          <ellipse cx="120" cy="196" rx="80" ry="40" fill="#b8e3c4" />
          <Heart x={108} y={48} size={24} />
          <text
            x="120"
            y="92"
            textAnchor="middle"
            className="ps-serif"
            fontSize="11.5"
            fill="#19233e"
          >
            {t('proPaywall.showcase.art.recapGoodbye')}
          </text>
          <g className="ps-p ps2-wave">
            <Mochi kind="a" x={78} y={120} width={40} height={32} />
          </g>
          <g className="ps-p ps2-wave ps2-wave-late">
            <Mochi kind="b" x={122} y={120} width={40} height={32} />
          </g>
        </g>
      </g>
      <g transform="translate(74 16)">
        <g fill="#ffffff55">
          {FILM_PARTS.map((part, index) => (
            <rect key={part} x={index * 19} width="17" height="2.4" rx="1.2" />
          ))}
        </g>
        <g fill="#fff">
          {FILM_PARTS.map((part, index) => (
            <rect
              key={part}
              className={`ps-p ps2-seg ps2-seg-${part}`}
              x={index * 19}
              width="17"
              height="2.4"
              rx="1.2"
            />
          ))}
        </g>
      </g>
    </>
  );
}

function Flower({
  cx,
  cy,
  petal,
  centre,
}: {
  cx: number;
  cy: number;
  petal: string;
  centre: string;
}) {
  const petals: readonly [number, number][] = [
    [0, -9],
    [10, -3],
    [-10, -3],
    [-5, 7],
    [5, 7],
  ];
  return (
    <>
      {petals.map(([dx, dy]) => (
        <circle
          key={`${dx}${dy}`}
          cx={cx + dx}
          cy={cy + dy}
          r="7"
          fill={petal}
        />
      ))}
      <circle cx={cx} cy={cy} r="5" fill={centre} />
    </>
  );
}

/** Seeds tossed between the Mochis, three flowers, then a matching game round. */
function GardenScene({ ids }: { ids: Ids }) {
  const { t } = useTranslation();
  return (
    <>
      <defs>
        <linearGradient id={ids('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e3efff" />
          <stop offset="1" stopColor="#f6fbef" />
        </linearGradient>
      </defs>
      <rect width="240" height="192" fill={`url(#${ids('sky')})`} />
      <ellipse cx="120" cy="200" rx="160" ry="48" fill="#c7e8c0" />
      <path
        d="M62 150 h116 q10 0 10 10 v8 h-136 v-8 q0 -10 10 -10z"
        fill="#a27a5c"
      />
      <path d="M62 150 h116 q10 0 10 6 h-136 q0 -6 10 -6z" fill="#8a654b" />
      <g className="ps-p ps3-grow1">
        <path
          d="M96 152 V112"
          stroke="#3f9b6e"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path d="M96 134 q-14 -3 -16 -14 q13 1 16 14" fill="#4fb07f" />
      </g>
      <g className="ps-p ps3-bloom1">
        <Flower cx={96} cy={113} petal="#f2668b" centre="#ffe28a" />
      </g>
      <g className="ps-p ps3-grow2">
        <path
          d="M144 152 V108"
          stroke="#3f9b6e"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path d="M144 130 q14 -3 16 -14 q-13 1 -16 14" fill="#4fb07f" />
      </g>
      <g className="ps-p ps3-bloom2">
        <Flower cx={144} cy={109} petal="#7fa7f5" centre="#fff" />
      </g>
      <g className="ps-p ps3-grow3">
        <path
          d="M120 152 V126"
          stroke="#3f9b6e"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      <g className="ps-p ps3-bloom3">
        <circle cx="120" cy="122" r="8" fill="#ffd25e" />
        <circle cx="120" cy="122" r="3.5" fill="#e59a3a" />
      </g>
      <g className="ps-p ps3-fly">
        <path
          d="M40 70 q-8 -10 -2 -12 q6 0 2 12 q8 -10 12 -6 q2 6 -12 6"
          fill="#c69cf5"
        />
      </g>
      <g className="ps-p ps3-toss-a">
        <Mochi kind="a" x={8} y={136} width={48} height={38} />
      </g>
      <g className="ps-p ps3-toss-b">
        <Mochi kind="b" x={184} y={136} width={48} height={38} />
      </g>
      <circle
        className="ps-p ps3-seed-a"
        cx="44"
        cy="140"
        r="4"
        fill="#8a654b"
      />
      <circle
        className="ps-p ps3-seed-b"
        cx="200"
        cy="140"
        r="4"
        fill="#8a654b"
      />
      <g className="ps-p ps3-game">
        <rect
          x="46"
          y="14"
          width="148"
          height="64"
          rx="12"
          fill="#fff"
          stroke="#19233e14"
        />
        <text
          x="120"
          y="33"
          textAnchor="middle"
          fontSize="9"
          fontWeight="700"
          fill="#3055b8"
        >
          {t('proPaywall.showcase.art.gameEyebrow')}
        </text>
        <text
          x="120"
          y="48"
          textAnchor="middle"
          className="ps-serif"
          fontSize="11"
          fill="#19233e"
        >
          {t('proPaywall.showcase.art.gameQuestion')}
        </text>
        <Mochi kind="a" x={86} y={54} width={20} height={16} />
        <Mochi kind="b" x={134} y={54} width={20} height={16} />
        <g className="ps-p ps3-tick">
          <circle cx="120" cy="62" r="8" fill="#3f9b6e" />
          <path
            d="M116 62 l3 3 l5 -6"
            stroke="#fff"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      </g>
    </>
  );
}

/**
 * The single soft arc of the real map connection (never a wavy route). The
 * glow's keyframes in `src/motion/pro-showcase.css` follow points on it.
 */
export const MAP_ARC_PATH = 'M44 146 Q96 52 196 50';

const MAP_PINS = [
  { className: 'ps4-mp1', cx: 70, cy: 70, href: breakfast },
  { className: 'ps4-mp2', cx: 150, cy: 108, href: picnic },
  { className: 'ps4-mp3', cx: 190, cy: 152, href: lake },
] as const;

/** Photo pins, the Mochis at both ends of one arc, distance and a message. */
function MapScene({ ids }: { ids: Ids }) {
  const { t } = useTranslation();
  return (
    <>
      <defs>
        {MAP_PINS.map(({ className, cx, cy }) => (
          <clipPath key={className} id={ids(className)}>
            <circle cx={cx} cy={cy} r="13" />
          </clipPath>
        ))}
      </defs>
      <rect width="240" height="192" fill="#eef1e8" />
      <path
        d="M0 120 C40 110 70 150 120 140 S200 170 240 150 V192 H0Z"
        fill="#cfe3f5"
      />
      <path d="M150 0 C170 30 210 40 240 36 V0Z" fill="#d6ebcf" />
      <rect x="14" y="16" width="50" height="34" rx="8" fill="#d6ebcf" />
      <g stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round">
        <path d="M-10 86 Q90 70 250 98" />
        <path d="M106 -10 Q96 90 122 200" />
        <path d="M-10 30 Q120 46 250 20" />
      </g>
      {MAP_PINS.map(({ className, cx, cy, href }) => (
        <g key={className} className={`ps-p ${className}`}>
          <path d={`M${cx} ${cy + 24} l-8 -10 h16z`} fill="#fff" />
          <circle cx={cx} cy={cy} r="16" fill="#fff" />
          <Photo
            href={href}
            x={cx - 13}
            y={cy - 13}
            width={26}
            height={26}
            clipPath={`url(#${ids(className)})`}
          />
        </g>
      ))}
      <path
        className="ps-p ps4-arc"
        d={MAP_ARC_PATH}
        fill="none"
        stroke="#3055b8"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity=".85"
      />
      <circle
        className="ps-p ps4-glow"
        r="5"
        fill="#fff"
        stroke="#3055b8"
        strokeWidth="2"
      />
      <g className="ps-p ps4-av">
        <circle cx="44" cy="150" r="17" fill="#fff" />
        <Mochi kind="a" x={29} y={138} width={30} height={24} />
      </g>
      <g className="ps-p ps4-av">
        <circle cx="196" cy="48" r="17" fill="#fff" />
        <Mochi kind="b" x={181} y={36} width={30} height={24} />
      </g>
      <g className="ps-p ps4-km">
        <rect x="84" y="78" width="58" height="22" rx="11" fill="#19233e" />
        <text
          x="113"
          y="93"
          textAnchor="middle"
          fontSize="10.5"
          fontWeight="700"
          fill="#fff"
        >
          {t('proPaywall.showcase.art.distance')}
        </text>
      </g>
      <g className="ps-p ps4-heart">
        <Heart x={104} y={56} size={18} />
      </g>
      <g className="ps-p ps4-msg">
        <rect
          x="92"
          y="4"
          width="90"
          height="22"
          rx="11"
          fill="#fff"
          stroke="#19233e1f"
        />
        <rect x="100" y="10" width="13" height="10" rx="2" fill="#f2668b" />
        <path
          d="M100 11 l6.5 5 l6.5 -5"
          stroke="#fff"
          strokeWidth="1.3"
          fill="none"
        />
        <text x="118" y="19" fontSize="8.5" fontWeight="700" fill="#19233e">
          {t('proPaywall.showcase.art.onceMessage')}
        </text>
      </g>
    </>
  );
}

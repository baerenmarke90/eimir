import type { WaitingGameKind } from '../api/generated/models/WaitingGameKind';

/**
 * The small picture on a waiting game's Wir tile (#2345 B). Decorative only:
 * the tile's title and line carry the meaning. Strokes use the two person
 * colours through the identity roles, so every app design restyles them.
 */
export function WirGameTileArt({ game }: { game: WaitingGameKind }) {
  return (
    <span className="wir-game-art">
      <svg viewBox="0 0 104 64" focusable="false" aria-hidden="true">
        {art(game)}
      </svg>
    </span>
  );
}

function art(game: WaitingGameKind) {
  switch (game) {
    case 'PICTURE_PING_PONG':
      return (
        <>
          <path
            className="wir-game-art-cool"
            d="M12 46c10-24 22-28 28-13s13 17 21 2"
          />
          <path
            className="wir-game-art-accent"
            d="M58 37c6-15 15-22 25-18s8 17-2 23"
          />
          <circle className="wir-game-art-sun" cx="88" cy="48" r="3.5" />
        </>
      );
    case 'GARDEN_SEED':
      return (
        <>
          <path className="wir-game-art-stem" d="M52 56V30" />
          <path
            className="wir-game-art-leaf"
            d="M52 38c-10 0-16-6-17-15 9 0 16 5 17 15zM52 32c1-10 8-16 18-16-1 10-8 15-18 16z"
          />
          <path className="wir-game-art-soil" d="M30 57h44" />
        </>
      );
    case 'GARDEN_BOUQUET':
      return (
        <>
          <path
            className="wir-game-art-stem"
            d="M52 58L44 30M52 58V26M52 58l8-28"
          />
          <circle className="wir-game-art-bloom-accent" cx="43" cy="24" r="7" />
          <circle className="wir-game-art-bloom-cool" cx="52" cy="18" r="7" />
          <circle className="wir-game-art-bloom-accent" cx="61" cy="24" r="7" />
        </>
      );
    case 'WHO_OF_US':
      return (
        <>
          <circle className="wir-game-art-fill-cool" cx="42" cy="32" r="20" />
          <circle className="wir-game-art-fill-accent" cx="62" cy="32" r="20" />
          <path
            className="wir-game-art-mark"
            d="M47 26a5 5 0 1 1 7 4.6c-1.4.6-2 1.6-2 3v1.4M52 41.5v.5"
          />
        </>
      );
    case 'WISH_DETECTIVE':
      return (
        <>
          <circle className="wir-game-art-cool" cx="46" cy="28" r="15" />
          <path className="wir-game-art-cool" d="M57 39l12 12" />
          <path
            className="wir-game-art-fill-accent"
            d="M46 35s-8-4.5-8-10a4.4 4.4 0 0 1 8-2.4 4.4 4.4 0 0 1 8 2.4c0 5.5-8 10-8 10z"
          />
        </>
      );
    case 'OUR_MOMENTS':
      return (
        <>
          <rect
            className="wir-game-art-card-cool"
            x="26"
            y="14"
            width="28"
            height="36"
            rx="5"
            transform="rotate(-8 40 32)"
          />
          <rect
            className="wir-game-art-card-accent"
            x="50"
            y="14"
            width="28"
            height="36"
            rx="5"
            transform="rotate(8 64 32)"
          />
        </>
      );
    case 'HEART_HUNT':
      return (
        <>
          <path
            className="wir-game-art-fog"
            d="M22 44c-6 0-9-5-7-9 1-4 6-6 10-4 2-6 9-9 15-6 3-5 11-6 15-1 5-2 12 1 12 7 6 0 10 5 8 10-1 3-4 4-7 4z"
          />
          <path
            className="wir-game-art-fill-accent"
            d="M72 30s-7-4-7-9a3.9 3.9 0 0 1 7-2.2 3.9 3.9 0 0 1 7 2.2c0 5-7 9-7 9z"
          />
        </>
      );
    default:
      return null;
  }
}

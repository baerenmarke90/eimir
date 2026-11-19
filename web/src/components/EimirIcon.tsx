import { type ReactNode, useId } from 'react';

/** Owner-selected icon grammar from issue #1225, drawn on a 24 px grid. */
export const EIMIR_ICON_NAMES = [
  'wir',
  'momente',
  'planen',
  'kalender',
  'listen',
  'mehr',
  'neu',
  'denken',
  'vibe',
  'gemeinsam',
  'geteilt',
  'nurfuer',
  'foto',
  'paperclip',
  'external-link',
  'download',
  'microphone',
  'photo-library',
  'tag',
  'video',
  'erinnerungen',
  'highlights',
  'wuensche',
  'reisen',
  'ziele',
  'meilensteine',
  'jahrestag',
  'benachrichtigungen',
  'nachrichten',
  'suche',
  'einstellungen',
  'privatsphaere',
  'statistiken',
  'pro',
  'hilfe',
  'logout',
  'spiele',
  'orte',
  'kapitel',
  'geburtstag',
  'profil',
  'geschenk',
  'aktivitaet',
  'hinzufuegen',
  'notes',
  'eye-off',
  'smile-plus',
  'expand',
  'quote',
  'close',
  'check',
  'lock-open',
  'lock',
  'eye',
  'square',
  'trash',
  'filter',
  'chevron-right',
  'sparkle',
  'crop',
  'rotate',
  'pen',
  'text',
  'undo',
] as const;
export type EimirIconName = (typeof EIMIR_ICON_NAMES)[number];
export type EimirIconVariant = 'outline' | 'filled' | 'duotone';

/** The heart inside the private lock (#1907 C3), shared by all variants. */
const LOCK_HEART_PATH =
  'M12 18.6s-3.3-2-3.3-4.2a1.7 1.7 0 0 1 3.3-.85 1.7 1.7 0 0 1 3.3.85c0 2.2-3.3 4.2-3.3 4.2Z';

const OUTLINE: Record<EimirIconName, ReactNode> = {
  paperclip: (
    <path d="m20 10-8.6 8.6a5 5 0 0 1-7.1-7.1l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-2.8-2.8l8.1-8.1" />
  ),
  'external-link': (
    <path d="M13 5h6v6m0-6-8 8m6 0v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5" />
  ),
  download: (
    <path d="M12 4v11m-4-4 4 4 4-4M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
  ),
  microphone: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />,
  'chevron-right': <path d="m9 5 7 7-7 7" />,
  // #1790 F2: the quiet mark of a wish on its way; filled so it stays legible
  // at caption size.
  sparkle: (
    <path
      fill="currentColor"
      d="M12 3.5c.6 4.6 2.3 6.4 7 7-4.7.6-6.4 2.4-7 7-.6-4.6-2.3-6.4-7-7 4.7-.6 6.4-2.4 7-7Z"
    />
  ),
  square: <rect x="5" y="5" width="14" height="14" rx="3" />,
  crop: (
    <path d="M7 3v12.5A1.5 1.5 0 0 0 8.5 17H21M3 7h12.5A1.5 1.5 0 0 1 17 8.5V21" />
  ),
  rotate: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
      <path d="M4.5 4.5V9H9" />
    </>
  ),
  pen: (
    <>
      <path d="M15.5 4.5 19.5 8.5 9 19H5v-4L15.5 4.5Z" />
      <path d="m13 7 4 4" />
    </>
  ),
  text: <path d="M5 6.5V5h14v1.5M12 5v14m-3 0h6" />,
  undo: (
    <>
      <path d="M9 14 4.5 9.5 9 5" />
      <path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12 4.5 4.5L19 7" />,
  lock: (
    <>
      <rect x="4.4" y="10" width="15.2" height="11" rx="2.7" />
      <path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  'lock-open': (
    <>
      <rect x="4.4" y="10" width="15.2" height="11" rx="2.7" />
      <path d="M7.5 10V7a4.5 4.5 0 0 1 8.5-2" />
    </>
  ),
  quote: (
    <>
      <path d="M4 5h6v7c0 3.5-2 6-6 7v-2c2.5-1 4-2.5 4-5H4V5ZM14 5h6v7c0 3.5-2 6-6 7v-2c2.5-1 4-2.5 4-5h-4V5Z" />
    </>
  ),
  'eye-off': (
    <>
      <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.8M6.2 6.2A18.4 18.4 0 0 0 2 12s4 7 10 7a10.9 10.9 0 0 0 5.1-1.3" />
    </>
  ),
  // #1907 C3: the plus sits inside the grid instead of being clipped.
  'smile-plus': (
    <>
      <path d="M20.5 12A8.5 8.5 0 1 1 12 3.5" />
      <path d="M8.5 14.5s1.3 1.9 3.5 1.9 3.5-1.9 3.5-1.9M9 9.6h.01M15 9.6h.01M18.5 2.3v5.4M15.8 5h5.4" />
    </>
  ),
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5" />,
  wir: (
    <>
      <circle className="cool" cx="9" cy="12" r="6.5" />
      <circle className="accent" cx="15" cy="12" r="6.5" />
    </>
  ),
  momente: (
    <>
      <path d="M12 20.5S3.5 15.3 3.5 9.5a4.6 4.6 0 0 1 8.5-2.4 4.6 4.6 0 0 1 8.5 2.4c0 5.8-8.5 11-8.5 11Z" />
      <path className="accent" d="M12 7.1a4.5 4.5 0 0 1 5.4-1.9" />
    </>
  ),
  planen: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.7" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
      <path className="accent" d="M8 3.5v4M16 3.5v4" />
    </>
  ),
  kalender: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.7" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
      <path className="accent" d="M8 3.5v4M16 3.5v4" />
    </>
  ),
  // #1907 C3: a checklist; the former plus read as "add".
  listen: (
    <>
      <path d="M10 6.5h10M10 12h10M10 17.5h6.5" />
      <path className="accent" d="m3.6 6.6 1.5 1.5 2.7-3" />
      <circle cx="5.6" cy="12" r="1.5" />
      <circle cx="5.6" cy="17.5" r="1.5" />
    </>
  ),
  mehr: (
    <>
      <circle cx="5" cy="5" r=".9" />
      <circle cx="12" cy="5" r=".9" />
      <circle cx="19" cy="5" r=".9" />
      <circle cx="5" cy="12" r=".9" />
      <circle cx="12" cy="12" r=".9" />
      <circle cx="19" cy="12" r=".9" />
      <circle cx="5" cy="19" r=".9" />
      <circle cx="12" cy="19" r=".9" />
      <circle cx="19" cy="19" r=".9" />
    </>
  ),
  neu: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v12M6 12h12" />
    </>
  ),
  // #1907 C3 (Product Owner choice C): a Heart Moment is a feeling the couple
  // shares, so the heart sits in a speech bubble.
  denken: (
    <>
      <path d="M7.5 17h-1A2.5 2.5 0 0 1 4 14.5v-9A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v9a2.5 2.5 0 0 1-2.5 2.5H12l-4.5 3.8V17Z" />
      <path
        className="icon-fill-accent"
        d="M12 14s-3.6-2.15-3.6-4.5a1.8 1.8 0 0 1 3.6-.95 1.8 1.8 0 0 1 3.6.95c0 2.35-3.6 4.5-3.6 4.5Z"
      />
    </>
  ),
  // #1907 C3: a soft wave; the former pulse line read as a medical chart.
  vibe: (
    <>
      <path d="M2.5 12C4.6 5.8 9.9 5.8 12 12s7.4 6.2 9.5 0" />
      <path className="accent" d="M12 12c2.1 6.2 7.4 6.2 9.5 0" />
    </>
  ),
  gemeinsam: (
    <>
      <circle cx="8" cy="7.3" r="3" />
      <circle className="accent" cx="16.5" cy="7.7" r="2.5" />
      <path d="M2.5 20v-2.6A5.4 5.4 0 0 1 8 12h1a5.4 5.4 0 0 1 5.5 5.4V20Z" />
      <path className="accent" d="M15.8 12.4a4.3 4.3 0 0 1 5.7 4.1V20h-4" />
    </>
  ),
  geteilt: (
    <>
      <path
        className="icon-fill-accent"
        d="M12 20.5S3.5 15.3 3.5 9.5a4.6 4.6 0 0 1 8.5-2.4 4.6 4.6 0 0 1 8.5 2.4c0 5.8-8.5 11-8.5 11Z"
      />
      <path d="M3.9 13.2c4.5 6.5 10.2 8.5 16.2 0" />
    </>
  ),
  // #1907 C3: private, but affectionate: a heart instead of a plus.
  nurfuer: (
    <>
      <rect x="4.5" y="10" width="15" height="11" rx="3" />
      <path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" />
      <path className="icon-fill-accent" d={LOCK_HEART_PATH} />
    </>
  ),
  foto: (
    <>
      <rect x="2.8" y="5" width="18.4" height="15" rx="2.5" />
      <circle className="accent" cx="8" cy="9.3" r="1.3" />
      <path d="m4 17 5-4.8 3.2 2.7 3.1-3 4.8 5" />
    </>
  ),
  'photo-library': (
    <>
      <path d="M5 7V4.5A2.5 2.5 0 0 1 7.5 2H19a2 2 0 0 1 2 2v12" />
      <rect x="2" y="7" width="15" height="14" rx="2.5" />
      <circle className="accent" cx="6.5" cy="11" r="1" />
      <path d="m3.5 18 4-4 2.5 2 2.5-2.5L16 17" />
    </>
  ),
  tag: (
    <>
      <path d="M3 3h8l10 10-8 8L3 11V3Z" />
      <circle className="accent" cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  video: (
    <>
      <rect x="2.5" y="5.3" width="14.4" height="13.4" rx="2.5" />
      <path className="accent" d="m17 9.1 4.5-2.5v10.8L17 14.9" />
    </>
  ),
  // #1907 C3: the Momente Album Polaroid with washi tape, slightly tilted.
  erinnerungen: (
    <g transform="rotate(-6 12 12)">
      <rect x="4" y="4" width="16" height="17" rx="1.2" />
      <path d="M4 16.2h16m-13.4-2.6 3.3-3.2 2.4 2.1 2.4-2.4 2.8 2.9" />
      <rect
        className="icon-fill-accent"
        x="8.6"
        y="2.2"
        width="6.8"
        height="3.4"
        rx=".5"
      />
    </g>
  ),
  // #1907 C3: a small sparkle instead of a plus that read as "add".
  highlights: (
    <>
      <path d="m11 3.5 1.9 6.6 6.6 1.9-6.6 1.9-1.9 6.6-1.9-6.6L2.5 12l6.6-1.9L11 3.5Z" />
      <path
        className="accent"
        d="M19.2 2.2c.25 1.49.91 1.8 2.4 2.4-1.49.25-1.8.91-2.4 2.4-.25-1.49-.91-1.8-2.4-2.4 1.49-.25 1.8-.91 2.4-2.4Z"
      />
    </>
  ),
  // #1907 C3: a heart with the wish sparkle (#1790), distinct from Momente.
  wuensche: (
    <>
      <path d="M10.5 20.5S3 16 3 10.9a4 4 0 0 1 7.5-2.1 4 4 0 0 1 7.5 2.1c0 5.1-7.5 9.6-7.5 9.6Z" />
      <path
        className="cool"
        d="M19 2c.25 1.61.99 1.95 2.6 2.6-1.61.25-1.95.99-2.6 2.6-.25-1.61-.99-1.95-2.6-2.6 1.61-.25 1.95-.99 2.6-2.6Z"
      />
    </>
  ),
  reisen: (
    <>
      <path d="m3 18 8-5-6-3 1.5-2 8 2.1 4.7-6.4a2 2 0 0 1 2.5-.5 2 2 0 0 1 .3 2.7l-5 6.2 2.1 8-2 1.5-3.2-6L8 22Z" />
    </>
  ),
  ziele: (
    <>
      <circle cx="11" cy="13" r="8.5" />
      <circle className="accent" cx="11" cy="13" r="4.5" />
      <path d="m11 13 9-9m-3.5 0H20v3.5" />
    </>
  ),
  // #1907 C3: a flag with the V-cut of the Album chapter ribbon.
  meilensteine: (
    <>
      <path d="M6 21V3.5M3.5 21h5" />
      <path className="accent" d="M6 4.5h12.5l-3 4.25 3 4.25H6" />
    </>
  ),
  // #1907 C3: a calendar page with a heart; it no longer repeats the Wir mark.
  jahrestag: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
      <path className="accent" d="M8 3.5v4M16 3.5v4" />
      <path
        className="icon-fill-accent"
        d="M12 18.4s-4.2-2.5-4.2-5.4a2.2 2.2 0 0 1 4.2-1.1 2.2 2.2 0 0 1 4.2 1.1c0 2.9-4.2 5.4-4.2 5.4Z"
      />
    </>
  ),
  benachrichtigungen: (
    <>
      <path d="M5 17h14l-1.8-2.4V9.5a5.2 5.2 0 0 0-10.4 0v5.1L5 17Zm5 3a2 2 0 0 0 4 0" />
      <path className="accent" d="M18.6 3.8a6.5 6.5 0 0 1 2.2 3.8" />
    </>
  ),
  nachrichten: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.7" />
      <path className="accent" d="m5.5 8 6.5 5 6.5-5" />
    </>
  ),
  suche: (
    <>
      <circle cx="10.5" cy="10.5" r="7" />
      <path className="accent" d="m16 16 5 5" />
    </>
  ),
  // #1907 C3: drawn on the grid; the former scaled path had a thinner stroke.
  einstellungen: (
    <>
      <path d="m10.19 4.72.56-2.04h2.5l.56 2.04 2.06.85 1.83-1.04 1.77 1.77-1.04 1.83.85 2.06 2.04.56v2.5l-2.04.56-.85 2.06 1.04 1.83-1.77 1.77-1.83-1.04-2.06.85-.56 2.04h-2.5l-.56-2.04-2.06-.85-1.83 1.04-1.77-1.77 1.04-1.83-.85-2.06-2.04-.56v-2.5l2.04-.56.85-2.06-1.04-1.83 1.77-1.77 1.83 1.04Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  privatsphaere: (
    <>
      <rect x="4.4" y="10" width="15.2" height="11" rx="2.7" />
      <path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" />
    </>
  ),
  statistiken: (
    <>
      <rect x="3" y="13" width="4" height="8" rx="1" />
      <rect className="accent" x="10" y="8" width="4" height="13" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </>
  ),
  pro: (
    <>
      <path
        d="M3 17 5 6l5 4 2-7 2 7 5-4 2 11H3Z"
        fill="var(--identity-icon-cool-fill)"
        stroke="none"
      />
      <path d="M4 20h16" />
      <circle className="icon-fill-accent" cx="5" cy="5" r="1.1" />
      <circle className="icon-fill-accent" cx="12" cy="2.5" r="1.1" />
      <circle className="icon-fill-accent" cx="19" cy="5" r="1.1" />
    </>
  ),
  hilfe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path
        className="accent"
        d="M9 9a3 3 0 0 1 6 .3c0 2-3 2.4-3 4.7M12 17.5h.01"
      />
    </>
  ),
  logout: (
    <>
      <path d="M13 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" />
      <path className="accent" d="m14 8 4 4-4 4m4-4H9" />
    </>
  ),
  // #1907 C3: slightly tilted dice with a heart pip; two heads read as People.
  spiele: (
    <g transform="rotate(-9 12 12)">
      <rect x="4.5" y="4.5" width="15" height="15" rx="3.5" />
      <g fill="currentColor" stroke="none">
        <circle cx="8.6" cy="8.6" r="1.25" />
        <circle cx="15.4" cy="15.4" r="1.25" />
      </g>
      <path
        className="icon-fill-accent"
        d="M12 14.1s-2.3-1.35-2.3-2.95a1.2 1.2 0 0 1 2.3-.6 1.2 1.2 0 0 1 2.3.6c0 1.6-2.3 2.95-2.3 2.95Z"
      />
    </g>
  ),
  orte: (
    <>
      <path d="M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12Z" />
      <circle className="accent" cx="12" cy="9" r="2.5" />
    </>
  ),
  // #1907 C3: a book with the V-cut ribbon of the Album chapter strips.
  kapitel: (
    <>
      <path d="M4.5 19.5v-15A1.5 1.5 0 0 1 6 3h13.5v16H6a1.5 1.5 0 0 0-1.5 1.5A1.5 1.5 0 0 0 6 22h13.5" />
      <path className="accent" d="M14 3v7.5l-1.8-1.5-1.8 1.5V3" />
    </>
  ),
  // #1907 C3: a drop flame; the former forked flame read as an antenna.
  geburtstag: (
    <>
      <path d="M4.5 21v-7.5A2.5 2.5 0 0 1 7 11h10a2.5 2.5 0 0 1 2.5 2.5V21M4.5 16c2.5-1.7 5 1.7 7.5 0s5-1.7 7.5 0M2.5 21h19M12 11V7.6" />
      <path
        className="accent"
        d="M12 5.4a1.5 1.5 0 0 1-1.5-1.5c0-1.1 1.5-2.4 1.5-2.4s1.5 1.3 1.5 2.4A1.5 1.5 0 0 1 12 5.4Z"
      />
    </>
  ),
  profil: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  // #1907 C3: lid and box; one line fewer so it does not become a grid at 16 px.
  geschenk: (
    <>
      <path d="M4.5 11.5V19a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-7.5M12 7.5V21" />
      <rect x="3" y="7.5" width="18" height="4" rx="1.5" />
      <path
        className="accent"
        d="M12 7.5H8.7a2.2 2.2 0 1 1 2.2-2.2L12 7.5Zm0 0h3.3a2.2 2.2 0 1 0-2.2-2.2L12 7.5Z"
      />
    </>
  ),
  aktivitaet: (
    <>
      <path d="M4 6h16M4 12h16M4 18h10" />
      <circle className="accent" cx="19" cy="18" r="2" />
    </>
  ),
  hinzufuegen: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  // #1907 C3: the lined Album note with its margin line, slightly tilted.
  notes: (
    <g transform="rotate(4 12 12)">
      <rect x="5" y="3" width="14" height="18" rx="1.2" />
      <path className="accent" d="M8.6 3v18" />
      <path d="M11.3 8.2h4.6M11.3 12h4.6M11.3 15.8h3" />
    </g>
  ),
};

const HEART_PATH =
  'M12 20.5S3.5 15.3 3.5 9.5a4.6 4.6 0 0 1 8.5-2.4 4.6 4.6 0 0 1 8.5 2.4c0 5.8-8.5 11-8.5 11Z';
const PLANE_PATH =
  'm3 18 8-5-6-3 1.5-2 8 2.1 4.7-6.4a2 2 0 0 1 2.5-.5 2 2 0 0 1 .3 2.7l-5 6.2 2.1 8-2 1.5-3.2-6L8 22Z';
const STAR_PATH =
  'm12 2.2 2.1 7.7 7.7 2.1-7.7 2.1-2.1 7.7-2.1-7.7-7.7-2.1 7.7-2.1 2.1-7.7Z';

const FILLED: Partial<Record<EimirIconName, (id: string) => ReactNode>> = {
  wir: (id) => (
    <>
      <circle cx="9" cy="12" r="6.5" fill={`url(#${id}-cool)`} stroke="none" />
      <circle cx="15" cy="12" r="6.5" fill={`url(#${id}-warm)`} stroke="none" />
    </>
  ),
  momente: (id) => (
    <>
      <path d={HEART_PATH} fill={`url(#${id}-heart)`} stroke="none" />
      <path
        className="icon-pressed-detail"
        d="M7.4 17.1c1.5 1.3 3.1 2.5 4.6 3.4 2.1-1.3 4.5-3.2 6.1-5.2"
        fill="none"
        stroke="var(--identity-icon-cool)"
        strokeWidth="1.8"
      />
    </>
  ),
  planen: (id) => (
    <>
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="15"
        rx="2.7"
        fill={`url(#${id}-cool)`}
        stroke="none"
      />
      <path
        d="M3.5 10h17M8 3.5v4M16 3.5v4"
        stroke="var(--identity-icon-accent)"
      />
    </>
  ),
  kalender: (id) => (
    <>
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="15"
        rx="2.7"
        fill={`url(#${id}-cool)`}
        stroke="none"
      />
      <path
        d="M3.5 10h17M8 3.5v4M16 3.5v4"
        stroke="var(--identity-icon-accent)"
      />
    </>
  ),
  reisen: (id) => (
    <path d={PLANE_PATH} fill={`url(#${id}-cool)`} stroke="none" />
  ),
  highlights: (id) => (
    <path d={STAR_PATH} fill={`url(#${id}-warm)`} stroke="none" />
  ),
  privatsphaere: (id) => (
    <>
      <rect
        x="4.4"
        y="10"
        width="15.2"
        height="11"
        rx="2.7"
        fill={`url(#${id}-cool)`}
        stroke="none"
      />
      <path
        d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3"
        stroke="var(--identity-icon-accent)"
      />
    </>
  ),
  nurfuer: (id) => (
    <>
      <rect
        x="4.5"
        y="10"
        width="15"
        height="11"
        rx="3"
        fill={`url(#${id}-lock-filled)`}
        stroke="none"
      />
      <path
        d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3"
        stroke="var(--identity-icon-accent)"
      />
      <path d={LOCK_HEART_PATH} fill="var(--color-on-accent)" stroke="none" />
    </>
  ),
  mehr: () => (
    <g fill="currentColor" stroke="none">
      {[5, 12, 19].flatMap((y) =>
        [5, 12, 19].map((x) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />
        )),
      )}
    </g>
  ),
};

const DUOTONE: Partial<Record<EimirIconName, (id: string) => ReactNode>> = {
  wir: (id) => (
    <>
      <circle cx="9" cy="12" r="6.5" fill={`url(#${id}-cool)`} stroke="none" />
      <circle
        cx="15"
        cy="12"
        r="6.5"
        fill={`url(#${id}-warm)`}
        stroke="none"
        opacity=".78"
      />
    </>
  ),
  momente: (id) => (
    <path d={HEART_PATH} fill={`url(#${id}-cool-warm)`} stroke="none" />
  ),
  kalender: (id) => (
    <>
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="15"
        rx="2.7"
        fill={`url(#${id}-cool)`}
        stroke="none"
      />
      <path
        d="M3.5 10h17M8 3.5v4M16 3.5v4"
        stroke="var(--identity-icon-accent)"
      />
    </>
  ),
  reisen: (id) => (
    <>
      <path d={PLANE_PATH} fill={`url(#${id}-cool)`} stroke="none" />
      <path
        d="m5 9 9.5 2.1 4.7-6.4"
        fill="none"
        stroke="var(--identity-icon-accent)"
        strokeWidth="2.5"
      />
    </>
  ),
  highlights: (id) => (
    <path d={STAR_PATH} fill={`url(#${id}-cool-warm)`} stroke="none" />
  ),
  privatsphaere: (id) => (
    <>
      <rect
        x="4.4"
        y="10"
        width="15.2"
        height="11"
        rx="2.7"
        fill={`url(#${id}-cool-warm)`}
        stroke="none"
      />
      <path
        d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3"
        stroke="var(--identity-icon-cool)"
      />
      <path d="M12 14.5v2" stroke="var(--color-surface-raised)" />
    </>
  ),
  nurfuer: (id) => (
    <>
      <rect
        x="4.5"
        y="10"
        width="15"
        height="11"
        rx="3"
        fill={`url(#${id}-lock-duotone)`}
        stroke="none"
      />
      <path
        d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3"
        stroke="var(--identity-icon-cool)"
      />
      <path d={LOCK_HEART_PATH} fill="var(--color-on-accent)" stroke="none" />
    </>
  ),
};

type Props = {
  name: EimirIconName;
  variant?: EimirIconVariant;
  className?: string;
};

export function EimirIcon({ name, variant = 'outline', className }: Props) {
  const id = useId().replace(/:/g, '');
  const content =
    variant === 'outline'
      ? OUTLINE[name]
      : variant === 'filled'
        ? (FILLED[name]?.(id) ?? OUTLINE[name])
        : (DUOTONE[name]?.(id) ?? OUTLINE[name]);
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={`eimir-icon eimir-icon-${name} eimir-icon-${variant}${className ? ` ${className}` : ''}`}
    >
      {variant !== 'outline' && (
        <defs>
          <linearGradient id={`${id}-cool`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop stopColor="var(--identity-icon-cool-fill)" />
            <stop
              offset="1"
              stopColor="var(--identity-icon-cool-fill)"
              stopOpacity=".65"
            />
          </linearGradient>
          <linearGradient id={`${id}-warm`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop stopColor="var(--identity-icon-warm-fill)" />
            <stop
              offset="1"
              stopColor="var(--identity-icon-warm-fill)"
              stopOpacity=".65"
            />
          </linearGradient>
          <linearGradient
            id={`${id}-cool-warm`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop stopColor="var(--identity-icon-cool-fill)" />
            <stop offset="1" stopColor="var(--identity-icon-warm-fill)" />
          </linearGradient>
          <linearGradient
            id={`${id}-heart`}
            x1="0%"
            y1="100%"
            x2="100%"
            y2="0%"
          >
            <stop stopColor="var(--identity-icon-cool-fill)" />
            <stop offset=".55" stopColor="var(--identity-icon-warm-fill)" />
            <stop offset="1" stopColor="var(--identity-icon-accent)" />
          </linearGradient>
          <linearGradient
            id={`${id}-lock-filled`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop stopColor="var(--identity-icon-warm-fill)" />
            <stop offset="1" stopColor="var(--identity-icon-cool-fill)" />
          </linearGradient>
          <linearGradient
            id={`${id}-lock-duotone`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop stopColor="var(--identity-icon-cool-fill)" />
            <stop offset="1" stopColor="var(--identity-icon-warm-fill)" />
          </linearGradient>
        </defs>
      )}
      {content}
    </svg>
  );
}

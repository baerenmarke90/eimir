import { useId, type ReactNode } from 'react';

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
] as const;
export type EimirIconName = (typeof EIMIR_ICON_NAMES)[number];
export type EimirIconVariant = 'outline' | 'filled' | 'duotone';

const OUTLINE: Record<EimirIconName, ReactNode> = {
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
  listen: (
    <>
      <path d="M3 6.5h12M3 12h15M3 17.5h10" />
      <path className="accent" d="M18 4v7m-3.5-3.5h7" />
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
  denken: (
    <>
      <path d="M11.7 19.5S3 15 3 9.6a4 4 0 0 1 7.4-2.1 4 4 0 0 1 7.4 2.1c0 1.3-.5 2.5-1.3 3.6" />
      <path
        className="icon-fill-accent"
        d="M17.5 10.8S14 8.7 14 6.7a2.1 2.1 0 0 1 3.5-1.5A2.1 2.1 0 0 1 21 6.7c0 2-3.5 4.1-3.5 4.1Z"
      />
    </>
  ),
  vibe: (
    <>
      <path d="M2 12h5l2.2-6.5 3.1 13 2.8-9 1.8 3.2H22" />
      <path className="accent" d="m9.2 5.5 3.1 13" />
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
  nurfuer: (
    <>
      <rect x="4.4" y="10" width="15.2" height="11" rx="2.7" />
      <path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" />
      <path className="accent" d="M12 14v4m-2-2h4" />
    </>
  ),
  foto: (
    <>
      <rect x="2.8" y="5" width="18.4" height="15" rx="2.5" />
      <circle className="accent" cx="8" cy="9.3" r="1.3" />
      <path d="m4 17 5-4.8 3.2 2.7 3.1-3 4.8 5" />
    </>
  ),
  video: (
    <>
      <rect x="2.5" y="5.3" width="14.4" height="13.4" rx="2.5" />
      <path className="accent" d="m17 9.1 4.5-2.5v10.8L17 14.9" />
    </>
  ),
  erinnerungen: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.7" />
      <path d="m4.6 16.8 5.2-4.2 2.6 2.3 3.5-3.5 3.6 4" />
      <path className="accent" d="M17.5 4v4" />
    </>
  ),
  highlights: (
    <>
      <path d="m12 2.2 2.1 7.7 7.7 2.1-7.7 2.1-2.1 7.7-2.1-7.7-7.7-2.1 7.7-2.1 2.1-7.7Z" />
      <path className="accent" d="M19 2v4m-2-2h4" />
    </>
  ),
  wuensche: (
    <>
      <path d="M12 20.5S3.5 15.3 3.5 9.5a4.6 4.6 0 0 1 8.5-2.4 4.6 4.6 0 0 1 8.5 2.4c0 5.8-8.5 11-8.5 11Z" />
      <path className="cool" d="M18.2 5.7 20 3.5" />
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
  meilensteine: (
    <>
      <path className="accent" d="m13 2.5 6 6-6 6-6-6 6-6Z" />
      <path d="m8.5 10 6 6-6 6-6-6 6-6Z" />
    </>
  ),
  jahrestag: (
    <>
      <circle cx="12" cy="13" r="8.5" />
      <path className="accent" d="M12 1.5v4M8 2.5 12 1l4 1.5" />
    </>
  ),
  benachrichtigungen: (
    <>
      <path d="M5 17h14l-2-2.5V9a5 5 0 0 0-10 0v5.5L5 17Zm5 3h4" />
      <path className="accent" d="M17 6a4 4 0 0 1 2 3" />
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
  einstellungen: (
    <>
      <path
        d="M10 2h4l.8 2.3 2.1.9 2.2-1.1 2.8 2.8-1.1 2.2.9 2.1L24 12l-2.3.8-.9 2.1 1.1 2.2-2.8 2.8-2.2-1.1-2.1.9L14 22h-4l-.8-2.3-2.1-.9-2.2 1.1-2.8-2.8 1.1-2.2-.9-2.1L0 12l2.3-.8.9-2.1-1.1-2.2 2.8-2.8 2.2 1.1 2.1-.9L10 2Z"
        transform="translate(2 2) scale(.83)"
      />
      <circle cx="12" cy="12" r="2.8" />
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
  spiele: (
    <>
      <circle cx="8" cy="10" r="3" />
      <circle className="accent" cx="16" cy="10" r="3" />
      <path d="M4.5 20c.8-3 2.5-4.5 5-4.5h5c2.5 0 4.2 1.5 5 4.5" />
      <path
        className="accent"
        d="m12 2 .8 1.8L14.6 4.6l-1.8.8L12 7.2l-.8-1.8-1.8-.8 1.8-.8L12 2Z"
      />
    </>
  ),
  orte: (
    <>
      <path d="M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12Z" />
      <circle className="accent" cx="12" cy="9" r="2.5" />
    </>
  ),
  kapitel: (
    <>
      <path d="M4 19.5V5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5m0 2A2.5 2.5 0 0 1 6.5 17H20" />
      <path className="accent" d="M9 7h7" />
    </>
  ),
  geburtstag: (
    <>
      <path d="M4 21v-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M4 16c3-2 5 2 8 0s5-2 8 0M2 21h20" />
      <path className="accent" d="M12 8V4m-1-2 1 2 1-2" />
    </>
  ),
  profil: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  geschenk: (
    <>
      <rect x="3" y="9" width="18" height="12" rx="2" />
      <path d="M3 13h18M12 9v12M3 9V6h18v3" />
      <path
        className="accent"
        d="M12 6H8a2.5 2.5 0 1 1 2.5-2.5L12 6Zm0 0h4a2.5 2.5 0 1 0-2.5-2.5L12 6Z"
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
  notes: (
    <>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
      <path className="accent" d="M8 8h8" />
      <path d="M8 12h8M8 16h5" />
    </>
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
        x="4.4"
        y="10"
        width="15.2"
        height="11"
        rx="2.7"
        fill={`url(#${id}-lock-filled)`}
        stroke="none"
      />
      <path
        d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3"
        stroke="var(--identity-icon-accent)"
      />
      <path d="M12 14v4m-2-2h4" stroke="var(--color-on-accent)" />
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
        x="4.4"
        y="10"
        width="15.2"
        height="11"
        rx="2.7"
        fill={`url(#${id}-lock-duotone)`}
        stroke="none"
      />
      <path
        d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3"
        stroke="var(--identity-icon-cool)"
      />
      <path d="M12 14v4m-2-2h4" stroke="var(--color-on-accent)" />
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

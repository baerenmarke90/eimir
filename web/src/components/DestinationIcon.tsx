import type { AppRouteIcon } from '../client/routes';
import {
  EimirIcon,
  type EimirIconName,
  type EimirIconVariant,
} from './EimirIcon';

const DESTINATION_MARKS: Record<AppRouteIcon, EimirIconName> = {
  today: 'wir',
  story: 'momente',
  plan: 'planen',
  games: 'spiele',
  more: 'mehr',
  search: 'suche',
  activity: 'aktivitaet',
  notifications: 'benachrichtigungen',
  people: 'gemeinsam',
  places: 'orte',
  collections: 'listen',
  chapter: 'kapitel',
  birthday: 'geburtstag',
  private: 'nurfuer',
  profile: 'profil',
  settings: 'einstellungen',
  add: 'hinzufuegen',
  milestone: 'meilensteine',
  wish: 'wuensche',
  gift: 'geschenk',
};

export function AddIcon({ className }: { className?: string } = {}) {
  return (
    <EimirIcon
      name="hinzufuegen"
      className={className ? `button-icon ${className}` : 'button-icon'}
    />
  );
}

/** Route labels own accessible names; icons remain decorative. */
export function DestinationIcon({
  icon,
  variant = 'outline',
}: {
  icon: AppRouteIcon;
  variant?: EimirIconVariant;
}) {
  return <EimirIcon name={DESTINATION_MARKS[icon]} variant={variant} />;
}

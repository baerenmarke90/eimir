import { SERVER_ADMIN_ROUTE } from '../client/routes';

/**
 * ServerAdmin pages. The `?section=` id stays the routing key so every
 * existing link keeps working; the redesign (part 1) groups them into areas.
 */
export const SERVER_ADMIN_SECTIONS = [
  'overview',
  'reports',
  'accounts',
  'spaces',
  'jobs',
  'storage',
  'security',
  'settings',
  'activity',
  'monitoring',
] as const;

export type ServerAdminSection = (typeof SERVER_ADMIN_SECTIONS)[number];

export type ServerAdminArea = 'situation' | 'people' | 'help' | 'system';

/** Each area's pages; the first one is where the area entry leads. */
export const AREA_SECTIONS: Record<
  ServerAdminArea,
  readonly ServerAdminSection[]
> = {
  situation: ['overview'],
  people: ['accounts', 'spaces'],
  help: ['reports'],
  system: ['monitoring', 'jobs', 'storage', 'security', 'activity', 'settings'],
};

export function resolveServerAdminSection(
  value: string | null,
): ServerAdminSection {
  return SERVER_ADMIN_SECTIONS.includes(value as ServerAdminSection)
    ? (value as ServerAdminSection)
    : 'overview';
}

export function areaForSection(section: ServerAdminSection): ServerAdminArea {
  const areas = Object.keys(AREA_SECTIONS) as ServerAdminArea[];
  return (
    areas.find((area) => AREA_SECTIONS[area].includes(section)) ?? 'situation'
  );
}

/** Help exists only while the operator plugin serves support reports. */
export function visibleAreas({
  supportReportsAvailable,
}: {
  supportReportsAvailable: boolean;
}): ServerAdminArea[] {
  return supportReportsAvailable
    ? ['situation', 'people', 'help', 'system']
    : ['situation', 'people', 'system'];
}

export function sectionHref(
  section: ServerAdminSection,
  params: Record<string, string> = {},
): string {
  if (section === 'overview') return SERVER_ADMIN_ROUTE;
  const query = new URLSearchParams({ section, ...params });
  return `${SERVER_ADMIN_ROUTE}?${query.toString()}`;
}

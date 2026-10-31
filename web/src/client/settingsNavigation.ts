import { SETTINGS_CATEGORY_ROUTES, type SettingsCategoryId } from './routes';

export interface SettingsCategoryDefinition {
  id: SettingsCategoryId;
  path: string;
  titleKey: string;
  descriptionKey: string;
}

export const SETTINGS_CATEGORIES: readonly SettingsCategoryDefinition[] = [
  {
    id: 'relationship',
    path: SETTINGS_CATEGORY_ROUTES.relationship,
    titleKey: 'profileIdentity.settingsRelationship',
    descriptionKey: 'profileIdentity.settingsRelationshipIntro',
  },
  {
    id: 'notifications',
    path: SETTINGS_CATEGORY_ROUTES.notifications,
    titleKey: 'profileIdentity.settingsNotifications',
    descriptionKey: 'profileIdentity.settingsNotificationsIntro',
  },
  {
    id: 'today',
    path: SETTINGS_CATEGORY_ROUTES.today,
    titleKey: 'profileIdentity.settingsToday',
    descriptionKey: 'profileIdentity.settingsTodayIntro',
  },
  {
    id: 'appearance',
    path: SETTINGS_CATEGORY_ROUTES.appearance,
    titleKey: 'theme.label',
    descriptionKey: 'profileIdentity.appearanceIntro',
  },
  {
    id: 'data',
    path: SETTINGS_CATEGORY_ROUTES.data,
    titleKey: 'profileIdentity.settingsData',
    descriptionKey: 'profileIdentity.settingsDataIntro',
  },
  {
    id: 'account',
    path: SETTINGS_CATEGORY_ROUTES.account,
    titleKey: 'profileIdentity.settingsAccount',
    descriptionKey: 'profileIdentity.settingsAccountIntro',
  },
];

export function settingsCategoryDefinition(
  id: SettingsCategoryId,
): SettingsCategoryDefinition {
  const category = SETTINGS_CATEGORIES.find((candidate) => candidate.id === id);
  if (!category) {
    throw new Error(`Unknown settings category: ${id}`);
  }
  return category;
}

import { SETTINGS_CATEGORY_ROUTES, type SettingsCategoryId } from './routes';

/** Who a group of settings belongs to; groups answer "whose is this?". */
export type SettingsGroupId = 'couple' | 'personal' | 'connections' | 'account';

export interface SettingsCategoryDefinition {
  id: SettingsCategoryId;
  path: string;
  group: SettingsGroupId;
  titleKey: string;
  descriptionKey: string;
  /** One short line for the overview; the long description stays on the page. */
  summaryKey: string;
  /** Localized Pro mark label for capabilities that need Pro. */
  proKey?: string;
}

export const SETTINGS_GROUPS: readonly {
  id: SettingsGroupId;
  titleKey: string;
}[] = [
  { id: 'couple', titleKey: 'profileIdentity.settingsGroupCouple' },
  { id: 'personal', titleKey: 'profileIdentity.settingsGroupPersonal' },
  { id: 'connections', titleKey: 'profileIdentity.settingsGroupConnections' },
  { id: 'account', titleKey: 'profileIdentity.settingsGroupAccount' },
];

export const SETTINGS_CATEGORIES: readonly SettingsCategoryDefinition[] = [
  {
    id: 'relationship',
    path: SETTINGS_CATEGORY_ROUTES.relationship,
    group: 'couple',
    titleKey: 'profileIdentity.settingsRelationship',
    descriptionKey: 'profileIdentity.settingsRelationshipIntro',
    summaryKey: 'profileIdentity.settingsRelationshipSummary',
  },
  {
    id: 'shared',
    path: SETTINGS_CATEGORY_ROUTES.shared,
    group: 'couple',
    titleKey: 'profileIdentity.spaceConfigurationTitle',
    descriptionKey: 'profileIdentity.spaceConfigurationManagerIntro',
    summaryKey: 'profileIdentity.settingsSharedSummary',
  },
  {
    id: 'notifications',
    path: SETTINGS_CATEGORY_ROUTES.notifications,
    group: 'personal',
    titleKey: 'profileIdentity.settingsNotifications',
    descriptionKey: 'profileIdentity.settingsNotificationsIntro',
    summaryKey: 'profileIdentity.settingsNotificationsSummary',
  },
  {
    id: 'today',
    path: SETTINGS_CATEGORY_ROUTES.today,
    group: 'personal',
    titleKey: 'profileIdentity.settingsToday',
    descriptionKey: 'profileIdentity.settingsTodayIntro',
    summaryKey: 'profileIdentity.settingsTodaySummary',
  },
  {
    id: 'appearance',
    path: SETTINGS_CATEGORY_ROUTES.appearance,
    group: 'personal',
    titleKey: 'theme.label',
    descriptionKey: 'profileIdentity.appearanceIntro',
    summaryKey: 'profileIdentity.settingsAppearanceSummary',
  },
  {
    id: 'media',
    path: SETTINGS_CATEGORY_ROUTES.media,
    group: 'connections',
    titleKey: 'photoSources.settingsTitle',
    descriptionKey: 'photoSources.settingsIntro',
    summaryKey: 'profileIdentity.settingsMediaSummary',
    proKey: 'photoSources.pro',
  },
  {
    id: 'calendar',
    path: SETTINGS_CATEGORY_ROUTES.calendar,
    group: 'connections',
    titleKey: 'calendarSync.settingsTitle',
    descriptionKey: 'calendarSync.settingsIntro',
    summaryKey: 'profileIdentity.settingsCalendarSummary',
    proKey: 'calendarSync.pro',
  },
  {
    id: 'data',
    path: SETTINGS_CATEGORY_ROUTES.data,
    group: 'account',
    titleKey: 'profileIdentity.settingsData',
    descriptionKey: 'profileIdentity.settingsDataIntro',
    summaryKey: 'profileIdentity.settingsDataSummary',
  },
  {
    id: 'account',
    path: SETTINGS_CATEGORY_ROUTES.account,
    group: 'account',
    titleKey: 'profileIdentity.settingsAccount',
    descriptionKey: 'profileIdentity.settingsAccountIntro',
    summaryKey: 'profileIdentity.settingsAccountSummary',
  },
  {
    id: 'updates',
    path: SETTINGS_CATEGORY_ROUTES.updates,
    group: 'personal',
    titleKey: 'appUpdates.title',
    descriptionKey: 'appUpdates.intro',
    summaryKey: 'appUpdates.intro',
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

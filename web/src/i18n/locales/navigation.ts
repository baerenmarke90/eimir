/**
 * Navigation copy.
 *
 * Product copy belongs in this directory rather than in `i18n/index.ts`: the
 * engineering-language audit treats `web/src/i18n/locales` as the sanctioned
 * home for localized text and every other module as an engineering surface.
 *
 * The destination names follow `docs/INFORMATION-ARCHITECTURE.md` section 2.
 */
const navigation = {
  today: 'Wir',
  story: 'Momente',
  plan: 'Planen',
  games: 'Spielen',
  more: 'Mehr',
  moreWithUnread_one: 'Mehr, {{count, number}} ungelesene Benachrichtigung',
  moreWithUnread_other: 'Mehr, {{count, number}} ungelesene Benachrichtigungen',
  searchAll: 'eimir. durchsuchen',
  operatorArea: 'Für Betreiber',
  search: 'Suche',
  notifications: 'Benachrichtigungen',
  notificationsWithUnread: 'Benachrichtigungen, {{count}} ungelesen',
  profileMenu: 'Profil und Konto',
  profile: 'Profil',
  settings: 'Einstellungen',
  activity: 'Aktivitäten',
  newContent: 'Neu festhalten',
  closeMenu: 'Menü schließen',
  quickCreateMemory: 'Erinnerung',
  quickCreateHeartMoment: 'Herzmoment',
  quickCreateMilestone: 'Meilenstein',
  quickCreateWish: 'Wunsch',
  quickCreatePlan: 'Plan',
  quickCreatePrivateNote: 'Notiz',
  quickCreateGiftIdea: 'Geschenkidee',
  logout: 'Abmelden',
};

export default navigation;

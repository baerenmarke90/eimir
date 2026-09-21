/**
 * Central Dashboard module catalog (#817).
 *
 * Every separately rendered Today content section is registered here with a
 * stable key and its Settings label. `DashboardSettingsPanel` and `TodayPage`
 * both read this list instead of each hardcoding which modules exist, so a
 * module cannot silently exist on one surface without a visibility control on
 * the other.
 *
 * The App Shell/navigation and the "new space" empty state are not Dashboard
 * modules: the App Shell is out of #817's scope entirely, and the empty state
 * only ever appears in place of the configurable module stack, never as one
 * of its members. `relationship_presence` (the Couple Presence hero) IS a
 * module like any other - #817 has no core/high-priority exception - it is
 * simply the one whose Today rendering doubles as the page's `<h1>`; see
 * `TodayPage.tsx` for how hiding it preserves an accessible heading.
 *
 * This list must stay in sync with the backend catalog in
 * `backend/src/eimir/dashboard/preferences.py`. Both are tested against
 * the single ordered key list in `dashboardModuleCatalog.contract.json`
 * (this directory) so the two can't silently drift - see
 * `dashboardModules.test.ts`.
 */

export type DashboardModuleKey =
  | 'relationship_presence'
  | 'upcoming'
  | 'pinned_collection'
  | 'keepsake'
  | 'relationship_signal'
  | 'monthly_highlights'
  | 'recent_shared'
  | 'shared_story_summary';

export interface DashboardModuleCatalogEntry {
  key: DashboardModuleKey;
  /** i18n key for the module's Settings-facing (and Today-facing) label. */
  labelKey: string;
}

/**
 * Deterministic Settings/Today order, matching the accepted #850 Today
 * composition in `TodayPage.tsx`: the Couple Presence hero, then Demnaechst,
 * Euer Moment, Gerade bei euch, Diesen Monat, Zuletzt bei euch.
 *
 * #809 appends `shared_story_summary` as the quiet final Today epilogue.
 */
export const DASHBOARD_MODULE_CATALOG: readonly DashboardModuleCatalogEntry[] =
  [
    { key: 'relationship_presence', labelKey: 'm5s5.today.roles.hero' },
    { key: 'upcoming', labelKey: 'm5s5.dashboard.upcomingTitle' },
    {
      key: 'pinned_collection',
      labelKey: 'm5s5.dashboard.pinnedCollectionSettingsTitle',
    },
    { key: 'keepsake', labelKey: 'm5s5.today.keepsake.kicker' },
    { key: 'relationship_signal', labelKey: 'm5s5.today.living.kicker' },
    { key: 'monthly_highlights', labelKey: 'm5s5.today.monthly.title' },
    { key: 'recent_shared', labelKey: 'm5s5.dashboard.recentTitle' },
    {
      key: 'shared_story_summary',
      labelKey: 'm5s5.dashboard.storySummarySettingsTitle',
    },
  ];

export const DASHBOARD_MODULE_KEYS: readonly DashboardModuleKey[] =
  DASHBOARD_MODULE_CATALOG.map((entry) => entry.key);

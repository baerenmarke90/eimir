import type { DashboardModulePreferenceList } from '../api/generated/models/DashboardModulePreferenceList';
import { DASHBOARD_MODULE_KEYS } from './dashboardModules';
import {
  dashboardPreferencesQueryKey,
  effectiveUpcomingItemLimit,
  isDashboardModuleVisible,
  limitUpcomingItems,
  selectedDashboardCollectionId,
} from './dashboardPreferences';

function preferences(itemLimit: number): DashboardModulePreferenceList {
  return {
    items: [{ moduleKey: 'upcoming', itemLimit }],
  } as unknown as DashboardModulePreferenceList;
}

function withVisibility(
  moduleKey: string,
  visible: boolean,
): DashboardModulePreferenceList {
  return {
    items: [{ moduleKey, visible }],
  } as unknown as DashboardModulePreferenceList;
}

describe('dashboardPreferences', () => {
  it('scopes query cache entries by account and Space', () => {
    expect(dashboardPreferencesQueryKey('account-a', 'space-a')).toEqual([
      'dashboard-preferences',
      'account-a',
      'space-a',
    ]);
    expect(dashboardPreferencesQueryKey('account-b', 'space-a')).not.toEqual(
      dashboardPreferencesQueryKey('account-a', 'space-a'),
    );
    expect(dashboardPreferencesQueryKey('account-a', 'space-b')).not.toEqual(
      dashboardPreferencesQueryKey('account-a', 'space-a'),
    );
  });

  it.each([
    [undefined, 1],
    [preferences(1), 1],
    [preferences(2), 2],
    [preferences(3), 3],
    [preferences(4), 1],
    [{ items: [] }, 1],
  ])('resolves only valid effective limits', (value, expected) => {
    expect(effectiveUpcomingItemLimit(value)).toBe(expected);
  });

  it.each([
    [undefined, ['first']],
    [preferences(1), ['first']],
    [preferences(2), ['first', 'second']],
    [preferences(3), ['first', 'second', 'third']],
  ])(
    'limits without reordering the authoritative candidates',
    (value, expected) => {
      expect(
        limitUpcomingItems(['first', 'second', 'third', 'fourth'], value),
      ).toEqual(expected);
    },
  );

  it.each([
    [[], []],
    [['first'], ['first']],
    [
      ['first', 'second'],
      ['first', 'second'],
    ],
  ])('never fabricates unavailable items', (items, expected) => {
    expect(limitUpcomingItems(items, preferences(3))).toEqual(expected);
  });

  describe('selectedDashboardCollectionId', () => {
    it('returns the selected resource only for the requested module', () => {
      const value = {
        items: [
          {
            moduleKey: 'pinned_collection',
            visible: true,
            selectedCollectionId: 'collection-1',
          },
        ],
      } as DashboardModulePreferenceList;

      expect(
        selectedDashboardCollectionId(value, 'pinned_collection'),
      ).toBe('collection-1');
      expect(selectedDashboardCollectionId(value, 'keepsake')).toBeNull();
    });

    it('returns null when no resource is selected', () => {
      expect(
        selectedDashboardCollectionId({ items: [] }, 'pinned_collection'),
      ).toBeNull();
    });
  });

  describe('isDashboardModuleVisible', () => {
    it('defaults every registered module to visible without a preferences response', () => {
      for (const key of DASHBOARD_MODULE_KEYS) {
        expect(isDashboardModuleVisible(undefined, key)).toBe(true);
      }
    });

    it('defaults to visible when the module has no explicit override', () => {
      expect(isDashboardModuleVisible({ items: [] }, 'keepsake')).toBe(true);
    });

    it('respects an explicit hidden override', () => {
      expect(
        isDashboardModuleVisible(withVisibility('keepsake', false), 'keepsake'),
      ).toBe(false);
    });

    it('respects an explicit shown override', () => {
      expect(
        isDashboardModuleVisible(withVisibility('keepsake', true), 'keepsake'),
      ).toBe(true);
    });

    it('is scoped to the exact module key, not a sibling module', () => {
      expect(
        isDashboardModuleVisible(
          withVisibility('keepsake', false),
          'recent_shared',
        ),
      ).toBe(true);
    });
  });
});

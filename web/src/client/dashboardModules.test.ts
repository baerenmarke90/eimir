import contract from './dashboardModuleCatalog.contract.json';
import {
  DASHBOARD_MODULE_CATALOG,
  DASHBOARD_MODULE_KEYS,
} from './dashboardModules';

describe('dashboardModules', () => {
  it('registers the accepted #850 Today modules plus the #809 epilogue in deterministic order', () => {
    expect(DASHBOARD_MODULE_KEYS).toEqual([
      'relationship_presence',
      'upcoming',
      'pinned_collection',
      'keepsake',
      'relationship_signal',
      'monthly_highlights',
      'recent_shared',
      'shared_story_summary',
    ]);
  });

  it('registers every module key exactly once', () => {
    expect(new Set(DASHBOARD_MODULE_KEYS).size).toBe(
      DASHBOARD_MODULE_KEYS.length,
    );
  });

  it('gives every catalog entry a non-empty i18n label key', () => {
    for (const entry of DASHBOARD_MODULE_CATALOG) {
      expect(entry.labelKey.length).toBeGreaterThan(0);
    }
  });

  it('matches the authoritative cross-layer catalog contract exactly (#817 PO correction)', () => {
    // dashboardModuleCatalog.contract.json is the single source of truth
    // both the Web and backend catalogs are independently tested against
    // (see backend/tests/unit/test_dashboard_catalog_parity.py), so neither
    // layer can register a module - or an order - the other doesn't know
    // about.
    expect(DASHBOARD_MODULE_KEYS).toEqual(contract.moduleKeys);
  });
});

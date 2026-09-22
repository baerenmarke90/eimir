import { describe, expect, it } from 'vitest';
import {
  dailyQuoteCatalogQueryKey,
  dailyQuoteEntitlementQueryKey,
  dailyQuotePreferencesQueryKey,
  dailyQuoteQueryKey,
  isDailyQuoteConflict,
  isDailyQuoteEntitlementRequired,
} from './dailyQuote';
import { ClientProblemError } from './problemDetails';

describe('dailyQuote client ownership', () => {
  it('scopes every query key by both account and Space', () => {
    const accountA = 'account-a';
    const accountB = 'account-b';
    const spaceA = 'space-a';
    const spaceB = 'space-b';
    const keyFactories = [
      dailyQuoteEntitlementQueryKey,
      dailyQuoteQueryKey,
      dailyQuoteCatalogQueryKey,
      dailyQuotePreferencesQueryKey,
    ];

    for (const makeKey of keyFactories) {
      expect(makeKey(accountA, spaceA)).not.toEqual(makeKey(accountB, spaceA));
      expect(makeKey(accountA, spaceA)).not.toEqual(makeKey(accountA, spaceB));
    }
  });

  it('recognizes entitlement downgrade and optimistic concurrency problems', () => {
    expect(
      isDailyQuoteEntitlementRequired(
        new ClientProblemError(
          'permission',
          403,
          'PREMIUM_ENTITLEMENT_REQUIRED',
        ),
      ),
    ).toBe(true);
    expect(
      isDailyQuoteConflict(
        new ClientProblemError('conflict', 409, 'RESOURCE_VERSION_CONFLICT'),
      ),
    ).toBe(true);
  });
});

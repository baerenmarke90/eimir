// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoredSession } from './sessionPersistence';
import {
  TODAY_RETROSPECTIVE_DISMISSAL_KEY,
  clearForeignRetrospectiveDismissal,
  clearRetrospectiveDismissal,
  isRetrospectiveDismissed,
  rememberRetrospectiveDismissal,
  retrospectiveDismissalToken,
} from './todayRetrospectiveDismissal';

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('Today retrospective daily suppression', () => {
  it('uses a local calendar day rather than a UTC ISO instant', () => {
    const beforeMidnight = new Date(2026, 9, 23, 23, 59, 59);
    const afterMidnight = new Date(2026, 9, 24, 0, 0, 1);
    const sameDay = new Date(2026, 9, 23, 8, 0, 0);
    const a = retrospectiveDismissalToken(
      'account-a',
      'space-a',
      beforeMidnight,
    );
    const b = retrospectiveDismissalToken(
      'account-a',
      'space-a',
      afterMidnight,
    );

    expect(a).toBe(
      retrospectiveDismissalToken('account-a', 'space-a', sameDay),
    );
    expect(a).not.toBe(b);
    expect(a).toContain('2026-10-23');
    expect(retrospectiveDismissalToken('', 'space-a')).toBeNull();
    expect(retrospectiveDismissalToken('account-a', '')).toBeNull();
    expect(
      retrospectiveDismissalToken('account-a', 'space-a', new Date(NaN)),
    ).toBeNull();
  });

  it('persists one no-content marker and never carries it across day/account/Space', () => {
    const day = new Date(2026, 9, 23, 14);
    const one = retrospectiveDismissalToken('account-a', 'space-a', day);
    const otherAccount = retrospectiveDismissalToken(
      'account-b',
      'space-a',
      day,
    );
    const otherSpace = retrospectiveDismissalToken('account-a', 'space-b', day);
    const tomorrow = retrospectiveDismissalToken(
      'account-a',
      'space-a',
      new Date(2026, 9, 24, 14),
    );
    if (!one) throw new Error('Expected valid marker');

    rememberRetrospectiveDismissal(one);
    expect(isRetrospectiveDismissed(one)).toBe(true);
    for (const different of [otherAccount, otherSpace, tomorrow]) {
      expect(isRetrospectiveDismissed(different)).toBe(false);
    }
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.getItem(TODAY_RETROSPECTIVE_DISMISSAL_KEY)).toBe(
      one,
    );
    expect(one).not.toContain('Memory');

    clearForeignRetrospectiveDismissal(otherAccount);
    expect(window.localStorage.length).toBe(0);
  });

  it('keeps valid same-scope marker and clears it on sign-out', async () => {
    const token = retrospectiveDismissalToken(
      'account-a',
      'space-a',
      new Date(2026, 9, 23),
    );
    if (!token) throw new Error('Expected valid marker');
    rememberRetrospectiveDismissal(token);
    clearForeignRetrospectiveDismissal(token);
    expect(isRetrospectiveDismissed(token)).toBe(true);
    await clearStoredSession();
    expect(isRetrospectiveDismissed(token)).toBe(false);
  });

  it('fails closed and remains dismissible in memory when local storage is blocked', () => {
    const token = retrospectiveDismissalToken(
      'account-a',
      'space-a',
      new Date(2026, 9, 23),
    );
    if (!token) throw new Error('Expected valid marker');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(isRetrospectiveDismissed(token)).toBe(false);
    expect(() => rememberRetrospectiveDismissal(token)).not.toThrow();
    expect(() => clearForeignRetrospectiveDismissal(token)).not.toThrow();
    expect(() => clearRetrospectiveDismissal()).not.toThrow();
  });
});

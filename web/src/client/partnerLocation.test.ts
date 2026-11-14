// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  currentSharingDuration,
  DEFAULT_SHARING_DURATION,
  hasStoredSharing,
  partnerLocationOnboardingKey,
  raisesVisibility,
  rememberPartnerLocationOnboardingAnswer,
  resetPartnerLocationOnboardingMemory,
  sharingDurationRequest,
  wasPartnerLocationOnboardingAnswered,
} from './partnerLocation';

describe('sharingDurationRequest', () => {
  it('preselects the bounded evening option', () => {
    expect(DEFAULT_SHARING_DURATION).toBe('evening');
  });

  it('ends one hour later for "1 hour"', () => {
    const now = new Date(2026, 10, 13, 10, 15);
    expect(sharingDurationRequest('hour', now)).toEqual({
      indefinite: false,
      expiresAt: new Date(2026, 10, 13, 11, 15),
    });
  });

  it('ends at 23:59 local time today for "until this evening"', () => {
    const now = new Date(2026, 10, 13, 9, 40);
    expect(sharingDurationRequest('evening', now)).toEqual({
      indefinite: false,
      expiresAt: new Date(2026, 10, 13, 23, 59),
    });
  });

  it('rolls "until this evening" over within the 24-hour bound', () => {
    const now = new Date(2026, 10, 13, 23, 58, 30);
    const end = sharingDurationRequest('evening', now).expiresAt as Date;
    expect(end.getDate()).toBe(14);
    expect(end.getTime() - now.getTime()).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it('requests indefinite sharing without an end only when chosen', () => {
    expect(sharingDurationRequest('indefinite')).toEqual({
      indefinite: true,
      expiresAt: null,
    });
  });

  it('describes an existing share', () => {
    expect(currentSharingDuration({ indefinite: true, expiresAt: null })).toBe(
      'indefinite',
    );
    expect(
      currentSharingDuration({ indefinite: false, expiresAt: new Date() }),
    ).toBe('evening');
  });
});

describe('visibility changes', () => {
  it('treats only wider levels as raising visibility', () => {
    expect(raisesVisibility('OFF', 'DISTANCE')).toBe(true);
    expect(raisesVisibility('DISTANCE', 'DISTANCE_AND_MAP')).toBe(true);
    expect(raisesVisibility('DISTANCE_AND_MAP', 'DISTANCE')).toBe(false);
    expect(raisesVisibility('DISTANCE', 'OFF')).toBe(false);
  });

  it('keeps Stop reachable for every stored, non-off share', () => {
    expect(hasStoredSharing({ state: 'OFF', level: 'OFF' })).toBe(false);
    expect(hasStoredSharing({ state: 'ACTIVE', level: 'DISTANCE' })).toBe(true);
    expect(
      hasStoredSharing({ state: 'SUSPENDED', level: 'DISTANCE_AND_MAP' }),
    ).toBe(true);
  });
});

describe('start sheet memory', () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    storage = new Map();
    resetPartnerLocationOnboardingMemory();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
  });
  afterEach(() => resetPartnerLocationOnboardingMemory());

  it('remembers the answer per server and account', () => {
    const key = partnerLocationOnboardingKey('https://a.example', 'account-1');
    const other = partnerLocationOnboardingKey(
      'https://b.example',
      'account-1',
    );
    expect(wasPartnerLocationOnboardingAnswered(key)).toBe(false);
    rememberPartnerLocationOnboardingAnswer(key);
    expect(wasPartnerLocationOnboardingAnswered(key)).toBe(true);
    expect(storage.get(key)).toBe('answered');
    expect(wasPartnerLocationOnboardingAnswered(other)).toBe(false);
  });

  it('does not keep asking when the device cannot store the answer', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    expect(
      wasPartnerLocationOnboardingAnswered(
        partnerLocationOnboardingKey('https://a.example', 'account-2'),
      ),
    ).toBe(true);
  });
});

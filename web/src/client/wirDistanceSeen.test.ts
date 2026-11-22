// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearWirDistanceSeen,
  DISTANCE_CHANGE_REST_MS,
  DISTANCE_SEEN_MAX_AGE_MS,
  distanceChangeMayPlay,
  forgetDistanceSeen,
  readDistanceSeen,
  rememberDistanceSeen,
} from './wirDistanceSeen';

const NOW = 1_800_000_000_000;

beforeEach(() => {
  window.localStorage.clear();
  clearWirDistanceSeen();
});

describe('the distance step this device last showed on Wir', () => {
  it('keeps only the coarse step and its times, per viewer and Space', () => {
    rememberDistanceSeen('account', 'space', 3, { now: NOW });
    const raw = window.localStorage.getItem(
      'eimir.wir.distanceSeen:account:space',
    );
    expect(Object.keys(JSON.parse(raw ?? '{}')).sort()).toEqual([
      'playedAt',
      'seenAt',
      'stage',
    ]);
    expect(readDistanceSeen('account', 'space', NOW)?.stage).toBe(3);
    expect(readDistanceSeen('account', 'other', NOW)).toBeNull();
    expect(readDistanceSeen('other', 'space', NOW)).toBeNull();
  });

  it('expires after 24 hours like a presence snapshot and removes itself', () => {
    rememberDistanceSeen('account', 'space', 3, { now: NOW });
    expect(
      readDistanceSeen('account', 'space', NOW + DISTANCE_SEEN_MAX_AGE_MS),
    ).not.toBeNull();
    expect(
      readDistanceSeen('account', 'space', NOW + DISTANCE_SEEN_MAX_AGE_MS + 1),
    ).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it.each([
    'not json',
    '{"stage":7,"seenAt":1800000000000}',
    '{"stage":1.5,"seenAt":1800000000000}',
    '{"stage":2}',
    '{"stage":2,"seenAt":1800000000001}',
  ])('drops a malformed record: %s', (raw) => {
    window.localStorage.setItem('eimir.wir.distanceSeen:account:space', raw);
    expect(readDistanceSeen('account', 'space', NOW)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it('keeps the last played time when a value is only confirmed', () => {
    rememberDistanceSeen('account', 'space', 3, { now: NOW, played: true });
    rememberDistanceSeen('account', 'space', 3, { now: NOW + 1000 });
    expect(readDistanceSeen('account', 'space', NOW + 1000)).toEqual({
      stage: 3,
      seenAt: NOW + 1000,
      playedAt: NOW,
    });
  });

  it('lets a value flipping around a band edge animate only rarely', () => {
    expect(distanceChangeMayPlay(null, NOW)).toBe(true);
    const seen = { stage: 3, seenAt: NOW, playedAt: NOW };
    expect(distanceChangeMayPlay(seen, NOW + DISTANCE_CHANGE_REST_MS - 1)).toBe(
      false,
    );
    expect(distanceChangeMayPlay(seen, NOW + DISTANCE_CHANGE_REST_MS)).toBe(
      true,
    );
  });

  it('is removed when sharing ends and on sign-out, leaving other data', () => {
    window.localStorage.setItem('eimir.other', 'kept');
    rememberDistanceSeen('account', 'space', 3, { now: NOW });
    forgetDistanceSeen('account', 'space');
    expect(readDistanceSeen('account', 'space', NOW)).toBeNull();
    rememberDistanceSeen('account', 'space', 3, { now: NOW });
    rememberDistanceSeen('account', 'second', 1, { now: NOW });
    clearWirDistanceSeen();
    expect(readDistanceSeen('account', 'space', NOW)).toBeNull();
    expect(readDistanceSeen('account', 'second', NOW)).toBeNull();
    expect(window.localStorage.getItem('eimir.other')).toBe('kept');
  });
});

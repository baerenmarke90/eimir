import { describe, expect, it } from 'vitest';
import { passportHighlights, passportLandmarks } from './relationshipPassport';
import type { DashboardView } from '../api/generated/models/DashboardView';

function duration(startedOn: string, daysTogether: number) {
  return {
    startedOn: new Date(startedOn),
    daysTogether,
    displayMode: 'DAYS' as const,
  };
}

describe('Passport calendar landmarks', () => {
  it('uses the authorized server day instead of the device clock', () => {
    const result = passportLandmarks(duration('2023-06-17', 1230));
    expect(result?.anniversary).toEqual({
      date: new Date('2027-06-17'),
      years: 4,
      daysRemaining: 231,
    });
    expect(result?.roundDay).toEqual({
      date: new Date('2027-07-26'),
      days: 1500,
      daysRemaining: 270,
    });
  });
  it('celebrates today without advancing to next year or adding a streak', () => {
    const result = passportLandmarks(duration('2024-10-29', 365));
    expect(result?.anniversary.daysRemaining).toBe(0);
    expect(result?.anniversary.years).toBe(1);
    expect(
      passportLandmarks(duration('2024-01-01', 100))?.roundDay.daysRemaining,
    ).toBe(0);
  });
  it('clamps leap-day anniversaries to February 28 in a non-leap year', () => {
    const result = passportLandmarks(duration('2024-02-29', 365));
    expect(result?.anniversary.date).toEqual(new Date('2025-02-28'));
    expect(result?.anniversary.daysRemaining).toBe(0);
  });
  it('does not invent or expose a hidden, future or corrupt start date', () => {
    expect(passportLandmarks(null)).toBeNull();
    expect(passportLandmarks(duration('invalid', 10))).toBeNull();
    expect(passportLandmarks(duration('2026-10-29', -1))).toBeNull();
    expect(
      passportLandmarks(duration('2026-10-29', 0))?.anniversary.years,
    ).toBe(1);
  });
  it('deduplicates and bounds shared highlights with real destinations', () => {
    const memory = { type: 'MEMORY', id: 'same', titleOrText: 'A memory' };
    const dashboard = {
      keepsake: memory,
      retrospective: memory,
      recentShared: [
        memory,
        { ...memory, type: 'HEART_MOMENT' },
        { ...memory, id: 'third' },
        { ...memory, id: 'fourth' },
        { type: 'PLAN', id: 'not-a-highlight' },
      ],
    } as DashboardView;
    expect(
      passportHighlights(dashboard).map((item) => `${item.type}:${item.id}`),
    ).toEqual(['MEMORY:same', 'HEART_MOMENT:same', 'MEMORY:third']);
    expect(passportHighlights(undefined)).toEqual([]);
  });
});

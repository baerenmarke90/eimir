import { describe, expect, it } from 'vitest';
import { planCalendar, planCalendarEvent } from './planCalendar';
const plan = {
  id: 'plan',
  spaceId: 'space',
  title: 'Our day',
  description: null,
  plannedOn: new Date('2028-02-29'),
  plannedStart: null,
  plannedEnd: null,
  updatedAt: new Date('2026-10-31T12:30:00Z'),
  version: 3,
};
describe('Plan calendar handoff', () => {
  it('uses the same all-day payload for native editors without timezone conversion', () => {
    expect(planCalendarEvent(plan, 'At the lake')).toEqual({
      title: plan.title,
      description: undefined,
      location: 'At the lake',
      allDay: true,
      startTime: Date.parse('2028-02-29T00:00:00Z'),
      endTime: Date.parse('2028-03-01T00:00:00Z'),
    });
    expect(plan.plannedOn.toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });
  it('hands off exact instants across DST and leaves an unknown end unset', () => {
    const timed = {
      ...plan,
      plannedOn: null,
      plannedStart: new Date('2026-10-25T02:30:00+02:00'),
    };
    expect(planCalendarEvent(timed)).toMatchObject({
      allDay: false,
      startTime: Date.parse('2026-10-25T00:30:00Z'),
      endTime: undefined,
    });
    expect(
      planCalendarEvent({
        ...timed,
        plannedEnd: new Date('2026-10-25T03:30:00+01:00'),
      })?.endTime,
    ).toBe(Date.parse('2026-10-25T02:30:00Z'));
    expect(planCalendarEvent({ ...plan, plannedOn: null })).toBeNull();
  });
  it('preserves a pure calendar day across leap and month boundaries', () => {
    const result = planCalendar(plan);
    expect(result).toContain('DTSTART;VALUE=DATE:20280229\r\n');
    expect(result).toContain('DTEND;VALUE=DATE:20280301\r\n');
    expect(result).not.toContain('DTSTART:');
    expect(result).toContain('UID:space-plan@eimir\r\n');
    expect(result).toContain('SEQUENCE:3\r\n');
  });
  it('preserves exact instants and does not invent an unknown end time', () => {
    const timed = {
      ...plan,
      plannedOn: null,
      plannedStart: new Date('2026-10-25T02:30:00+02:00'),
    };
    expect(planCalendar(timed)).toContain('DTSTART:20261025T003000Z');
    expect(planCalendar(timed)).not.toContain('DTEND');
    expect(
      planCalendar({
        ...timed,
        plannedEnd: new Date('2026-10-25T03:30:00+01:00'),
      }),
    ).toContain('DTEND:20261025T023000Z');
  });
  it('escapes content injection and folds UTF-8 without splitting characters', () => {
    const title = `${'Ü🌈'.repeat(40)}, café;\\\r\nBEGIN:VEVENT`;
    const result = planCalendar({ ...plan, title }, 'Lake, west; side')!;
    for (const line of result.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = result.replace(/\r\n /g, '');
    expect(unfolded).toContain('\\, café\\;\\\\\\nBEGIN:VEVENT');
    expect(unfolded.match(/\r\nBEGIN:VEVENT/g)).toHaveLength(1);
    expect(unfolded).toContain('LOCATION:Lake\\, west\\; side');
    expect(result).not.toContain('\uFFFD');
  });
  it('does not offer an undated idea as a made-up calendar appointment', () => {
    expect(planCalendar({ ...plan, plannedOn: null })).toBeNull();
  });
});

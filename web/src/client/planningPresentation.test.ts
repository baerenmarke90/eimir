import { describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import { planPillLabel, planScheduleLabel } from './planningPresentation';

describe('planning presentation', () => {
  it('keeps date-only Plans free of fabricated times', () => {
    const label = planScheduleLabel(
      {
        plannedOn: new Date('2026-09-05T00:00:00Z'),
        plannedStart: null,
        plannedEnd: null,
      },
      'de-DE',
    );

    expect(label).toBe('Sa., 5. Sept.');
    expect(label).not.toContain(':');
  });

  it('shows a same-day timed Plan as one human-readable range', () => {
    const plannedStart = new Date(2026, 8, 5, 10, 0);
    const plannedEnd = new Date(2026, 8, 5, 11, 30);
    const plan = {
      status: 'PLANNED' as const,
      plannedOn: null,
      plannedStart,
      plannedEnd,
    };

    expect(planScheduleLabel(plan, 'de-DE')).toBe(
      'Sa., 5. Sept. · 10:00–11:30',
    );
    expect(planPillLabel(i18n.t, plan)).toContain('10:00–11:30');
  });

  it('names both days when a timed Plan crosses a calendar boundary', () => {
    const label = planScheduleLabel(
      {
        plannedOn: null,
        plannedStart: new Date(2026, 8, 5, 22, 0),
        plannedEnd: new Date(2026, 8, 6, 1, 15),
      },
      'de-DE',
    );

    expect(label).toBe('Sa., 5. Sept. · 22:00 – So., 6. Sept. · 01:15');
  });
});

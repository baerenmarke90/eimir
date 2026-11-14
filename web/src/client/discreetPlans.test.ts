import { describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import {
  calendarPresentation,
  concealedTitle,
  discreetTitleSuggestions,
  planListTitle,
} from './discreetPlans';
import { planCalendar } from './planCalendar';

const t = i18n.t.bind(i18n);
const plan = {
  id: 'plan',
  spaceId: 'space',
  title: 'Hotel night just for us',
  description: 'Lake view room, sauna at seven',
  plannedOn: null,
  plannedStart: new Date(2026, 10, 21, 19),
  plannedEnd: new Date(2026, 10, 22, 11),
  updatedAt: new Date('2026-11-13T12:00:00Z'),
  version: 4,
  discreet: true,
  discreetTitleMode: 'PREVIEW' as const,
  previewTitle: 'Weekend for two',
};

describe('discreet plan presentation (#1790 F3)', () => {
  it('shows the preview title, the original title or the neutral fallback', () => {
    expect(planListTitle(plan, t)).toBe('Weekend for two');
    expect(planListTitle({ ...plan, discreetTitleMode: 'ORIGINAL' }, t)).toBe(
      plan.title,
    );
    expect(planListTitle({ ...plan, discreet: false }, t)).toBe(plan.title);
    expect(planListTitle({ ...plan, previewTitle: '  ' }, t)).toBe(
      t('discreetPlans.fallbackTitle'),
    );
    expect(concealedTitle(null, t)).toBe(t('discreetPlans.fallbackTitle'));
    expect(concealedTitle(' Ours ', t)).toBe('Ours');
  });

  it('exports only the list title and time to calendars', () => {
    const { plan: exported, location } = calendarPresentation(
      plan,
      'Lakeside hotel',
      t,
    );
    expect(location).toBeUndefined();
    const ics = planCalendar(exported, location) ?? '';
    expect(ics).toContain('SUMMARY:Weekend for two');
    expect(ics).not.toContain('Hotel');
    expect(ics).not.toContain('DESCRIPTION');
    expect(ics).not.toContain('LOCATION');
    expect(ics).toContain('DTSTART:');
    const open = calendarPresentation({ ...plan, discreet: false }, 'Lake', t);
    expect(open.location).toBe('Lake');
    expect(open.plan.description).toBe(plan.description);
  });

  it('suggests three neutral titles from schedule metadata only', () => {
    const suggestions = discreetTitleSuggestions(plan, t);
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]).toBe(t('discreetPlans.suggestions.weekend'));
    expect(suggestions).toContain(t('discreetPlans.suggestions.EVENING'));
    // Content never feeds the rules: changing it yields the same suggestions.
    expect(
      discreetTitleSuggestions(
        { ...plan, title: 'x', description: 'y' } as typeof plan,
        t,
      ),
    ).toEqual(suggestions);
    for (const suggestion of suggestions) {
      expect(suggestion).not.toMatch(/Hotel|sauna|Lake/i);
    }
  });

  it('covers weekday mornings, date-only days and unscheduled ideas', () => {
    const morning = discreetTitleSuggestions(
      {
        plannedOn: null,
        plannedStart: new Date(2026, 10, 18, 9),
        plannedEnd: new Date(2026, 10, 18, 10),
      },
      t,
    );
    expect(morning[0]).toBe(t('discreetPlans.suggestions.MORNING'));
    expect(new Set(morning).size).toBe(3);
    const dateOnly = discreetTitleSuggestions(
      {
        plannedOn: new Date('2026-11-21T00:00:00Z'),
        plannedStart: null,
        plannedEnd: null,
      },
      t,
    );
    expect(dateOnly).toHaveLength(3);
    const idea = discreetTitleSuggestions(
      { plannedOn: null, plannedStart: null, plannedEnd: null },
      t,
    );
    expect(idea).toEqual([
      t('discreetPlans.suggestions.together'),
      t('discreetPlans.suggestions.day'),
      t('discreetPlans.suggestions.plan'),
    ]);
  });
});

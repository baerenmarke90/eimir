// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { DashboardItemType } from '../api/generated/models/DashboardItemType';
import { DateRepeat } from '../api/generated/models/DateRepeat';
import { ImportantDateType } from '../api/generated/models/ImportantDateType';
import { collectSpaceOccasions } from '../client/occasionMatches';
import {
  DEFAULT_ROLES,
  type FakeMediaQuery,
  installReducedMotion,
  setMotionRoles,
} from '../motion/__fixtures__/fakeAnimation';
import { resetScreenBudgetForTests } from '../motion/budget';
import { resetChoreographiesForTests } from '../motion/choreography';
import { resetMomentsForTests } from '../motion/moment';
import { resetPlayRegistryForTests } from '../motion/playRegistry';
import { resetStagesForTests, useStage } from '../motion/stage';
import {
  IMPORTANT_DAY_STORAGE_KEY,
  type ImportantDayPhase,
  localDay,
  resetImportantDayForTests,
  useImportantDayMoment,
  type WirOccasion,
} from './wirImportantDay';
import { occasionTag, sharedDatesToday, wirOccasionFor } from './wirOccasion';
import { WIR_STAGE } from './wirStageMotion';

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key) as unknown as TFunction;
const noNickname = () => null;

describe('wirOccasionFor', () => {
  const occasions = collectSpaceOccasions({
    relationshipStartedOn: new Date('2023-11-20T00:00:00Z'),
    birthdays: [
      {
        accountId: 'own',
        displayName: 'Mara',
        birthday: new Date('1994-03-02T00:00:00Z'),
      },
      {
        accountId: 'partner',
        displayName: 'Alex Berg',
        birthday: new Date('1993-07-14T00:00:00Z'),
      },
    ],
    importantDates: [
      {
        id: 'private',
        label: 'Private',
        date: new Date('2020-05-05T00:00:00Z'),
        type: ImportantDateType.CUSTOM,
        repeats: DateRepeat.ANNUALLY,
        visibility: ContentVisibility.PRIVATE,
      },
      {
        id: 'shared',
        label: 'Our flat',
        date: new Date('2021-05-06T00:00:00Z'),
        type: ImportantDateType.CUSTOM,
        repeats: DateRepeat.ANNUALLY,
        visibility: ContentVisibility.SHARED,
      },
    ] as never,
    viewerAccountId: 'own',
  });

  const groupedNumber = (value: number) =>
    new Intl.NumberFormat('de').format(value);

  it('names the anniversary in the middle line and counts the days below the heart', () => {
    const occasion = wirOccasionFor(
      occasions,
      '2026-11-20',
      t,
      noNickname,
      groupedNumber,
    );
    expect(occasion?.primary).toBe(
      'occasionMarks.todayAnniversary:{"count":3}',
    );
    // 2023-11-20 to 2026-11-20, across the leap day of 2024.
    expect(occasion?.secondary).toBe(
      'occasionMarks.daysTogether:{"count":1096,"days":"1.096"}',
    );
    expect(occasion?.count).toEqual({ line: 'secondary', formatted: '1.096' });
    expect(occasion?.birthday).toBeNull();
    expect(occasion?.playKey).toBe(`2026-11-20|${occasionTag('relationship')}`);
  });

  it('keeps the first day without a count', () => {
    const occasion = wirOccasionFor(occasions, '2023-11-20', t, noNickname);
    expect(occasion?.primary).toBe('occasionMarks.todayRelationshipStart');
    expect(occasion?.count).toBeNull();
  });

  it('makes a round day together an occasion with a rolling count', () => {
    // 2023-11-20 + 1000 days.
    const occasion = wirOccasionFor(
      occasions,
      '2026-08-16',
      t,
      noNickname,
      groupedNumber,
    );
    expect(occasion?.primary).toBe(
      'occasionMarks.daysTogether:{"count":1000,"days":"1.000"}',
    );
    expect(occasion?.secondary).toBe('');
    expect(occasion?.count).toEqual({ line: 'primary', formatted: '1.000' });
    expect(occasion?.birthday).toBeNull();
    expect(occasion?.playKey).toBe(
      `2026-08-16|${occasionTag('round-day:1000')}`,
    );
  });

  it('ignores days together that are not round', () => {
    expect(wirOccasionFor(occasions, '2026-08-17', t, noNickname)).toBeNull();
  });

  it('ranks a round day before a birthday on the same day', () => {
    // 2023-11-20 + 500 days falls on the partner's birthday (2025-04-03).
    const sameDay = collectSpaceOccasions({
      relationshipStartedOn: new Date('2023-11-20T00:00:00Z'),
      birthdays: [
        {
          accountId: 'partner',
          displayName: 'Alex Berg',
          birthday: new Date('1993-04-03T00:00:00Z'),
        },
      ],
      importantDates: [],
      viewerAccountId: 'own',
    });
    const occasion = wirOccasionFor(sameDay, '2025-04-03', t, noNickname);
    expect(occasion?.count?.line).toBe('primary');
    expect(occasion?.primary).toContain('"count":500');
  });

  it("greets the partner by first name on the partner's birthday", () => {
    const occasion = wirOccasionFor(occasions, '2026-07-14', t, noNickname);
    expect(occasion?.primary).toBe(
      'occasionMarks.todayPartnerBirthday:{"name":"Alex"}',
    );
    expect(occasion?.birthday).toBe('partner');
  });

  it("marks the viewer's own birthday on the own ring", () => {
    const occasion = wirOccasionFor(occasions, '2026-03-02', t, noNickname);
    expect(occasion?.primary).toBe('occasionMarks.todayOwnBirthday');
    expect(occasion?.birthday).toBe('own');
  });

  it('uses shared dates only, never private ones', () => {
    expect(wirOccasionFor(occasions, '2026-05-05', t, noNickname)).toBeNull();
    expect(
      wirOccasionFor(occasions, '2026-05-06', t, noNickname)?.primary,
    ).toBe('Our flat');
  });

  it("takes today's shared dates from the dashboard, never other days", () => {
    const upcoming = [
      {
        type: DashboardItemType.IMPORTANT_DATE,
        id: 'today',
        titleOrText: 'Our moving day',
        occurredOn: new Date('2026-01-09T00:00:00Z'),
      },
      {
        type: DashboardItemType.IMPORTANT_DATE,
        id: 'later',
        titleOrText: 'Later',
        occurredOn: new Date('2026-01-12T00:00:00Z'),
      },
      {
        type: DashboardItemType.PLAN,
        id: 'plan',
        titleOrText: 'A plan today',
        occurredOn: new Date('2026-01-09T00:00:00Z'),
      },
    ];
    const dates = sharedDatesToday(upcoming, '2026-01-09');
    expect(dates.map((date) => date.key)).toEqual(['date:today']);
    expect(
      wirOccasionFor([...occasions, ...dates], '2026-01-09', t, noNickname)
        ?.primary,
    ).toBe('Our moving day');
  });

  it('leaves an ordinary day unchanged', () => {
    expect(wirOccasionFor(occasions, '2026-01-09', t, noNickname)).toBeNull();
  });

  it('keeps no readable occasion key on the device', () => {
    expect(occasionTag('birthday:partner-account-id')).not.toContain('partner');
  });
});

const occasion: WirOccasion = {
  playKey: `${localDay()}|abc`,
  primary: 'Heute vor 3 Jahren',
  secondary: '1.096 Tage zusammen',
  birthday: null,
  count: { line: 'secondary', formatted: '1.096' },
};

let reduced: FakeMediaQuery;
let clearRoles: () => void;
const phases: ImportantDayPhase[] = [];

function Wir({ value }: { value: WirOccasion | null }) {
  const stage = useStage<HTMLDivElement>(WIR_STAGE, { duration: 0 });
  const phase = useImportantDayMoment(value, stage);
  phases.push(phase);
  return <div ref={stage} data-phase={phase} />;
}

const shown = () =>
  document.querySelector('[data-phase]')?.getAttribute('data-phase');

beforeEach(() => {
  vi.useFakeTimers();
  reduced = installReducedMotion(false);
  clearRoles = setMotionRoles(DEFAULT_ROLES);
  resetPlayRegistryForTests();
  resetChoreographiesForTests();
  resetStagesForTests();
  resetMomentsForTests();
  resetScreenBudgetForTests();
  resetImportantDayForTests();
  localStorage.clear();
  phases.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  reduced.restore();
  clearRoles();
  document.body.innerHTML = '';
});

async function flush(ms = 0) {
  await act(async () => {
    await Promise.resolve();
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

describe('useImportantDayMoment', () => {
  it('plays once after the opening and rests for the rest of the day', async () => {
    const view = render(<Wir value={occasion} />);
    expect(shown()).toBe('before');
    await flush();
    await flush(1);
    expect(shown()).toBe('playing');
    await flush(2000);
    expect(shown()).toBe('final');
    expect(localStorage.getItem(IMPORTANT_DAY_STORAGE_KEY)).toBe(
      occasion.playKey,
    );

    // A return, refetch or remount shows the final state at once.
    view.unmount();
    phases.length = 0;
    render(<Wir value={occasion} />);
    expect(phases[0]).toBe('final');
  });

  it('shows the final state at once on a later visit the same day', () => {
    localStorage.setItem(IMPORTANT_DAY_STORAGE_KEY, occasion.playKey);
    render(<Wir value={occasion} />);
    expect(phases[0]).toBe('final');
  });

  it('shows the final state without motion when motion is reduced', async () => {
    reduced.set(true);
    render(<Wir value={occasion} />);
    await flush();
    await flush(1);
    expect(phases).not.toContain('playing');
    expect(shown()).toBe('final');
  });

  it('changes nothing on an ordinary day', () => {
    render(<Wir value={null} />);
    expect(shown()).toBe('none');
  });
});

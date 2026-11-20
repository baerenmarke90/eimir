// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
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
import { occasionTag, wirOccasionFor } from './wirOccasion';
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

  it('names the anniversary in the middle line and below the heart', () => {
    const occasion = wirOccasionFor(occasions, '2026-11-20', t, noNickname);
    expect(occasion?.primary).toBe(
      'occasionMarks.todayAnniversary:{"count":3}',
    );
    expect(occasion?.secondary).toContain('occasionMarks.anniversary');
    expect(occasion?.birthday).toBeNull();
    expect(occasion?.playKey).toBe(`2026-11-20|${occasionTag('relationship')}`);
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
  secondary: 'An eurem 3. Jahrestag',
  birthday: null,
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

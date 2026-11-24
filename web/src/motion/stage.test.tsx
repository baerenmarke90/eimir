// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ROLES,
  type FakeMediaQuery,
  installReducedMotion,
  setMotionRoles,
} from './__fixtures__/fakeAnimation';
import { resetChoreographiesForTests } from './choreography';
import { resetPlayRegistryForTests } from './playRegistry';
import {
  resetStagesForTests,
  STAGE_ATTRIBUTE,
  STAGE_JOIN_ATTRIBUTE,
  STAGE_SCOPE_ATTRIBUTE,
  stageFinished,
  stagePhase,
  useStage,
  useStageHold,
} from './stage';

function Blocked() {
  const ref = useStage<HTMLDivElement>('test.stage', {
    duration: 1000,
    hold: 400,
    canStart: () => false,
  });
  return <div data-testid="stage" ref={ref} />;
}

let reduced: FakeMediaQuery;
let clearRoles: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  reduced = installReducedMotion(false);
  clearRoles = setMotionRoles(DEFAULT_ROLES);
  resetPlayRegistryForTests();
  resetChoreographiesForTests();
  resetStagesForTests();
});

afterEach(() => {
  vi.useRealTimers();
  reduced.restore();
  clearRoles();
  document.body.innerHTML = '';
});

function Stage({ canStart }: { canStart?: () => boolean }) {
  const ref = useStage<HTMLDivElement>('test.stage', {
    duration: 1000,
    canStart,
  });
  return <div data-testid="stage" ref={ref} />;
}

const stage = () => document.querySelector('[data-testid="stage"]');

describe('useStage', () => {
  it('plays once per app start and ends on its own clock', async () => {
    const view = render(<Stage />);
    expect(stage()?.getAttribute(STAGE_ATTRIBUTE)).toBe('playing');
    let ended = false;
    void stageFinished('test.stage').then(() => {
      ended = true;
    });

    // A re-render does not end or restart it.
    view.rerender(<Stage />);
    expect(stage()?.getAttribute(STAGE_ATTRIBUTE)).toBe('playing');

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(stage()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
    expect(ended).toBe(true);

    // A remount after the opening (a kept tab, a refetch) shows the final
    // state: no attribute, nothing replays.
    view.unmount();
    render(<Stage />);
    expect(stage()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
  });

  it('keeps a remount mid-opening on the same clock', async () => {
    const view = render(<Stage />);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    view.unmount();
    render(<Stage />);
    expect(stage()?.getAttribute(STAGE_ATTRIBUTE)).toBe('playing');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(stage()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
  });

  it('never plays when it cannot start, or with reduced motion', async () => {
    render(<Stage canStart={() => false} />);
    expect(stage()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
    await expect(stageFinished('test.stage')).resolves.toBeUndefined();

    document.body.innerHTML = '';
    resetPlayRegistryForTests();
    resetChoreographiesForTests();
    resetStagesForTests();
    reduced.set(true);
    render(<Stage />);
    expect(stage()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
  });

  it('ends at once when its kept view is hidden', async () => {
    const panel = document.createElement('div');
    panel.setAttribute('data-primary-tab', 'today');
    document.body.append(panel);
    render(<Stage />, { container: panel });
    expect(stage()?.getAttribute(STAGE_ATTRIBUTE)).toBe('playing');
    await act(async () => {
      panel.hidden = true;
      await Promise.resolve();
    });
    expect(stage()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
    panel.hidden = false;
  });
});

function Held({ pending }: { pending: boolean }) {
  useStageHold('test.stage', pending);
  return null;
}

function HeldStage({
  pending,
  hold = 400,
}: {
  pending: boolean;
  hold?: number;
}) {
  const ref = useStage<HTMLDivElement>('test.stage', {
    duration: 1000,
    hold,
    scope: (root) => root.parentElement,
  });
  return (
    <section data-testid="scope">
      <div data-testid="stage" ref={ref} />
      <Held pending={pending} />
    </section>
  );
}

const scope = () => document.querySelector('[data-testid="scope"]');

describe('useStage with a data hold (#2147)', () => {
  it('waits, unpainted, while a member loads its data, then plays once', async () => {
    const view = render(<HeldStage pending />);
    expect(stage()?.getAttribute(STAGE_ATTRIBUTE)).toBe('waiting');
    expect(scope()?.getAttribute(STAGE_SCOPE_ATTRIBUTE)).toBe('waiting');
    expect(stagePhase('test.stage')).toBe('waiting');

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(stagePhase('test.stage')).toBe('waiting');

    // The data arrived: the opening plays now, on its own clock.
    view.rerender(<HeldStage pending={false} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(stage()?.getAttribute(STAGE_ATTRIBUTE)).toBe('playing');
    expect(scope()?.getAttribute(STAGE_SCOPE_ATTRIBUTE)).toBe('playing');
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(stage()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
    expect(scope()?.hasAttribute(STAGE_SCOPE_ATTRIBUTE)).toBe(false);
    expect(stagePhase('test.stage')).toBe('ended');

    // A refetch that loads again never holds or replays the opening.
    view.rerender(<HeldStage pending />);
    expect(stage()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
  });

  it('plays at the cap when a slow or failing read never arrives', async () => {
    render(<HeldStage pending hold={400} />);
    await act(async () => {
      vi.advanceTimersByTime(399);
    });
    expect(stage()?.getAttribute(STAGE_ATTRIBUTE)).toBe('waiting');
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(stage()?.getAttribute(STAGE_ATTRIBUTE)).toBe('playing');
  });

  it('does not wait when nothing is loading', async () => {
    render(<HeldStage pending={false} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(stage()?.getAttribute(STAGE_ATTRIBUTE)).toBe('playing');
  });

  it('keeps the wait with reduced motion, then shows the final state without playing', async () => {
    reduced.set(true);
    const view = render(<HeldStage pending />);
    expect(stage()?.getAttribute(STAGE_ATTRIBUTE)).toBe('waiting');
    view.rerender(<HeldStage pending={false} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(stage()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
    await expect(stageFinished('test.stage')).resolves.toBeUndefined();
  });

  it('never waits for a stage it cannot start', async () => {
    render(
      <>
        <Blocked />
        <Held pending />
      </>,
    );
    expect(stage()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
    expect(stagePhase('test.stage')).toBe('ended');
  });
});

interface FakeMember {
  animationName: string;
  startTime: number | null;
  effect: {
    target: Element;
    getTiming: () => { delay: number; duration: number };
    updateTiming: (timing: { delay: number; duration: number }) => void;
  };
  timing: { delay: number; duration: number };
  finished: boolean;
  finish: () => void;
}

function member(target: Element, delay: number, duration: number) {
  const fake: FakeMember = {
    animationName: 'eimir-motion-stage-rise',
    startTime: null,
    timing: { delay, duration },
    finished: false,
    effect: {
      target,
      getTiming: () => fake.timing,
      updateTiming: (timing) => {
        fake.timing = timing;
      },
    },
    finish: () => {
      fake.finished = true;
    },
  };
  return fake;
}

describe('useStage places late members on its clock (#2147)', () => {
  let clock = 1000;

  beforeEach(() => {
    clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setup() {
    const members: FakeMember[] = [];
    const view = render(<HeldStage pending={false} hold={0} />);
    const root = scope() as HTMLElement;
    root.getAnimations = () => members as unknown as Animation[];
    return { members, view, root };
  }

  async function mount(
    members: FakeMember[],
    view: ReturnType<typeof render>,
    join: boolean,
    delay: number,
  ) {
    const target = document.createElement('span');
    if (join) target.setAttribute(STAGE_JOIN_ATTRIBUTE, '');
    scope()?.append(target);
    const fake = member(target, delay, 400);
    members.push(fake);
    // A render of the stage (or a DOM mutation) places it.
    view.rerender(<HeldStage pending={false} hold={0} />);
    await act(async () => {
      await Promise.resolve();
    });
    return fake;
  }

  it('pins a member that arrives before its slot to the start time', async () => {
    const { members, view } = setup();
    clock = 1100;
    const fake = await mount(members, view, true, 300);
    expect(fake.startTime).toBe(1000);
    expect(fake.timing).toEqual({ delay: 300, duration: 400 });
  });

  it('lets late data join in the time that is left, ending with the stage', async () => {
    const { members, view } = setup();
    clock = 1700;
    const fake = await mount(members, view, true, 300);
    // 300 ms are left of the 1000 ms opening.
    expect(fake.startTime).toBe(1700);
    expect(fake.timing).toEqual({ delay: 0, duration: 300 });
  });

  it('shows late data at rest when too little of the opening is left', async () => {
    const { members, view } = setup();
    clock = 1900;
    const fake = await mount(members, view, true, 300);
    expect(fake.finished).toBe(true);
  });

  it('keeps a remounted member on the same point of the clock (M5)', async () => {
    const { members, view } = setup();
    clock = 1500;
    const fake = await mount(members, view, false, 300);
    expect(fake.startTime).toBe(1000);
    expect(fake.timing).toEqual({ delay: 300, duration: 400 });
  });
});

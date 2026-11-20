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
  stageFinished,
  useStage,
} from './stage';

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

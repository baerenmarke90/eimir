// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ROLES,
  type FakeMediaQuery,
  installReducedMotion,
  setMotionRoles,
} from '../motion/__fixtures__/fakeAnimation';
import { resetChoreographiesForTests } from '../motion/choreography';
import { resetPlayRegistryForTests } from '../motion/playRegistry';
import { resetStagesForTests, STAGE_ATTRIBUTE } from '../motion/stage';
import { useRootTabIntro } from './rootTabIntro';

function Page() {
  const ref = useRootTabIntro<HTMLDivElement>('plan');
  return <div className="page" data-testid="page" ref={ref} />;
}

function Panel({
  peek,
  prewarm,
  hidden,
}: {
  peek?: boolean;
  prewarm?: boolean;
  hidden?: boolean;
}) {
  return (
    <div
      data-primary-tab="/plan"
      data-primary-tab-peek={peek ? 'true' : undefined}
      data-primary-tab-prewarm={prewarm ? 'true' : undefined}
      hidden={hidden}
    >
      <Page />
    </div>
  );
}

const page = () => document.querySelector('[data-testid="page"]');

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

describe('useRootTabIntro', () => {
  it('opens a tab that is chosen and shown', () => {
    render(<Panel />);
    expect(page()?.getAttribute(STAGE_ATTRIBUTE)).toBe('playing');
  });

  it('never plays in a tab that a swipe reveals', () => {
    // The page is built under the finger: a rise there would move content
    // while it is dragged, and the tab is shown complete after the swipe.
    const view = render(<Panel peek />);
    expect(page()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
    view.rerender(<Panel />);
    expect(page()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
  });

  it('never plays in a tab prepared in the background', () => {
    const view = render(<Panel prewarm />);
    expect(page()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
    view.rerender(<Panel />);
    expect(page()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
  });

  it('opens a tab built hidden ahead when it is first chosen', async () => {
    // A neighbour built in the background enters like any tab when it is
    // tapped, so every tab opens the same way.
    const view = render(<Panel hidden />);
    expect(page()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
    view.rerender(<Panel />);
    await act(async () => {});
    expect(page()?.getAttribute(STAGE_ATTRIBUTE)).toBe('playing');
  });

  it('never opens a tab built hidden ahead that a swipe reveals', async () => {
    const view = render(<Panel hidden />);
    view.rerender(<Panel peek />);
    await act(async () => {});
    view.rerender(<Panel />);
    await act(async () => {});
    expect(page()?.hasAttribute(STAGE_ATTRIBUTE)).toBe(false);
  });
});

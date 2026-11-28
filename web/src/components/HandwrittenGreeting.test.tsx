// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import onceMessages from '../i18n/locales/onceMessages';
import {
  DEFAULT_ROLES,
  type FakeMediaQuery,
  installReducedMotion,
  setMotionRoles,
} from '../motion/__fixtures__/fakeAnimation';
import { resetScreenBudgetForTests } from '../motion/budget';
import { resetMomentsForTests } from '../motion/moment';
import { HandwrittenGreeting } from './HandwrittenGreeting';
import { HANDWRITTEN_GREETINGS } from './handwrittenGreetings';

let reduced: FakeMediaQuery;
let clearRoles: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  reduced = installReducedMotion(false);
  clearRoles = setMotionRoles(DEFAULT_ROLES);
  resetMomentsForTests();
  resetScreenBudgetForTests();
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

const phase = () =>
  document.querySelector('.once-greeting-strokes')?.getAttribute('data-phase');

describe('HandwrittenGreeting (#2372)', () => {
  it('keeps the greeting readable and its strokes decorative', () => {
    const { container } = render(<HandwrittenGreeting messageKey="m-1" />);
    expect(container.querySelector('.sr-only')?.textContent).toBe(
      onceMessages.greeting,
    );
    const strokes = container.querySelector('.once-greeting-strokes');
    expect(strokes?.getAttribute('aria-hidden')).toBe('true');
    const paths = [...container.querySelectorAll('path')];
    expect(paths).toHaveLength(HANDWRITTEN_GREETINGS.de.strokes.length);
    expect(paths.every((path) => path.getAttribute('pathLength') === '1')).toBe(
      true,
    );
  });

  it('writes itself once per message, then rests; a remount does not replay', async () => {
    const first = render(<HandwrittenGreeting messageKey="m-2" />);
    expect(phase()).toBe('before');
    await flush();
    expect(phase()).toBe('playing');
    await flush(1200);
    expect(phase()).toBe('final');
    first.unmount();

    render(<HandwrittenGreeting messageKey="m-2" />);
    await flush();
    expect(phase()).toBe('final');
  });

  it('shows the finished greeting at once with reduced motion', async () => {
    reduced.set(true);
    render(<HandwrittenGreeting messageKey="m-3" />);
    await flush();
    expect(phase()).toBe('final');
  });

  it('writes the strokes in pen order, each after the ones before it', () => {
    for (const greeting of Object.values(HANDWRITTEN_GREETINGS)) {
      let expected = 0;
      for (const stroke of greeting.strokes) {
        expect(stroke.start).toBeCloseTo(expected, 2);
        expected += stroke.share;
      }
      expect(expected).toBeCloseTo(1, 2);
    }
  });
});

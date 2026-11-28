// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ROLES,
  type FakeMediaQuery,
  installReducedMotion,
  setMotionRoles,
} from '../motion/__fixtures__/fakeAnimation';
import { resetScreenBudgetForTests } from '../motion/budget';
import { resetMomentsForTests } from '../motion/moment';
import { HandwrittenMessage } from './HandwrittenMessage';

const WORDS = 'Thinking of you tonight, my love.';
let reduced: FakeMediaQuery;
let clearRoles: () => void;
let width: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  reduced = installReducedMotion(false);
  clearRoles = setMotionRoles(DEFAULT_ROLES);
  resetMomentsForTests();
  resetScreenBudgetForTests();
  width = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockReturnValue(340);
});

afterEach(() => {
  vi.useRealTimers();
  reduced.restore();
  clearRoles();
  width.mockRestore();
  document.body.innerHTML = '';
});

async function flush(ms = 0) {
  await act(async () => {
    await Promise.resolve();
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

const strokes = () => document.querySelector('.once-handwriting-strokes');
const phase = () => strokes()?.getAttribute('data-phase');

describe('HandwrittenMessage (#2372)', () => {
  it('keeps the words readable and the pen strokes decorative', () => {
    const { container } = render(
      <HandwrittenMessage text={WORDS} messageKey="m-1" />,
    );
    expect(container.querySelector('.sr-only')?.textContent).toBe(WORDS);
    expect(strokes()?.getAttribute('aria-hidden')).toBe('true');
    const paths = [...container.querySelectorAll('path')];
    expect(paths.length).toBeGreaterThan(10);
    expect(paths.every((path) => path.getAttribute('pathLength') === '1')).toBe(
      true,
    );
  });

  it('writes once at the pen speed within the cap, then rests; a remount does not replay', async () => {
    const first = render(<HandwrittenMessage text={WORDS} messageKey="m-2" />);
    expect(phase()).toBe('before');
    await flush();
    expect(phase()).toBe('playing');
    const total = Number.parseFloat(
      (strokes() as SVGElement).style.getPropertyValue('--handwriting-total'),
    );
    expect(total).toBeGreaterThan(1000);
    expect(total).toBeLessThanOrEqual(3600);
    await flush(total);
    expect(phase()).toBe('final');
    first.unmount();

    render(<HandwrittenMessage text={WORDS} messageKey="m-2" />);
    await flush();
    expect(phase()).toBe('final');
  });

  it('shows the finished words at once on a tap', async () => {
    render(<HandwrittenMessage text={WORDS} messageKey="m-3" />);
    await flush();
    expect(phase()).toBe('playing');
    fireEvent.click(strokes() as Element);
    expect(phase()).toBe('final');
  });

  it('shows the finished words at once with reduced motion', async () => {
    reduced.set(true);
    render(<HandwrittenMessage text={WORDS} messageKey="m-4" />);
    await flush();
    expect(phase()).toBe('final');
  });

  it('keeps the normal type when the font cannot write the words', () => {
    const { container } = render(
      <HandwrittenMessage text={'Love you ❤️'} messageKey="m-5" />,
    );
    expect(strokes()).toBeNull();
    expect(container.querySelector('.once-words')?.textContent).toBe(
      'Love you ❤️',
    );
  });
});

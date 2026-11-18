// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useFirstContentSettle } from './firstContentSettle';

function Area({ empty }: { empty: boolean | undefined }) {
  return <p>{useFirstContentSettle(empty) ? 'settling' : 'still'}</p>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('settles only when an area seen empty receives its first item', () => {
  const view = render(<Area empty={undefined} />);
  view.rerender(<Area empty={true} />);
  expect(screen.getByText('still')).toBeTruthy();
  view.rerender(<Area empty={false} />);
  expect(screen.getByText('settling')).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(1500);
  });
  expect(screen.getByText('still')).toBeTruthy();
});

it('does not animate content that loads directly', () => {
  const view = render(<Area empty={undefined} />);
  view.rerender(<Area empty={false} />);
  expect(screen.getByText('still')).toBeTruthy();
});

// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  type QuietHintCandidate,
  newNoteOpen,
  quietHintKey,
  quietHintRetired,
  resetQuietHintsForTests,
  useQuietHint,
} from './quietHints';

function Screen({
  candidates,
  account = 'viewer',
}: {
  candidates: QuietHintCandidate[];
  account?: string;
}) {
  const hint = useQuietHint(account, 'space', candidates);
  return hint.activeId ? (
    <button type="button" onClick={hint.dismiss}>
      {hint.activeId}
    </button>
  ) : (
    <p>none</p>
  );
}

/** A new app session: cached stores and session views are forgotten. */
function restart() {
  cleanup();
  resetQuietHintsForTests();
}

beforeEach(() => {
  localStorage.clear();
  resetQuietHintsForTests();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 16, 9));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('shows at most one hint per screen, in priority order', () => {
  render(
    <Screen
      candidates={[
        { id: 'first', eligible: true },
        { id: 'second', eligible: true },
      ]}
    />,
  );
  expect(screen.getByRole('button').textContent).toBe('first');
});

it('starts at most one new hint per day across screens', () => {
  render(<Screen candidates={[{ id: 'plan', eligible: true }]} />);
  expect(screen.getByRole('button').textContent).toBe('plan');
  cleanup();
  render(<Screen candidates={[{ id: 'story', eligible: true }]} />);
  expect(screen.getByText('none')).toBeTruthy();

  // The hint already started today stays visible on its own screen.
  cleanup();
  render(<Screen candidates={[{ id: 'plan', eligible: true }]} />);
  expect(screen.getByRole('button').textContent).toBe('plan');

  restart();
  vi.setSystemTime(new Date(2026, 10, 17, 9));
  render(<Screen candidates={[{ id: 'story', eligible: true }]} />);
  expect(screen.getByRole('button').textContent).toBe('story');
});

it('retires a hint after three app sessions', () => {
  for (let day = 16; day < 19; day += 1) {
    restart();
    vi.setSystemTime(new Date(2026, 10, day, 9));
    render(<Screen candidates={[{ id: 'plan', eligible: true }]} />);
    expect(screen.getByRole('button').textContent).toBe('plan');
  }
  restart();
  render(<Screen candidates={[{ id: 'plan', eligible: true }]} />);
  expect(screen.getByText('none')).toBeTruthy();
  expect(quietHintRetired('viewer', 'space', 'plan')).toBe(true);
});

it('retires a hint for good after dismissal or use, per viewer', () => {
  render(<Screen candidates={[{ id: 'plan', eligible: true }]} />);
  act(() => {
    fireEvent.click(screen.getByRole('button'));
  });
  expect(screen.getByText('none')).toBeTruthy();
  restart();
  vi.setSystemTime(new Date(2026, 10, 20, 9));
  render(<Screen candidates={[{ id: 'plan', eligible: true }]} />);
  expect(screen.getByText('none')).toBeTruthy();

  // The partner on the same device keeps their own hint.
  cleanup();
  render(
    <Screen account="partner" candidates={[{ id: 'plan', eligible: true }]} />,
  );
  expect(screen.getByRole('button').textContent).toBe('plan');

  cleanup();
  render(
    <Screen
      account="partner"
      candidates={[{ id: 'plan', eligible: true, used: true }]}
    />,
  );
  expect(screen.getByText('none')).toBeTruthy();
  expect(quietHintRetired('partner', 'space', 'plan')).toBe(true);
});

it('stores opaque ids and counters only', () => {
  render(<Screen candidates={[{ id: 'plan', eligible: true }]} />);
  expect(
    JSON.parse(localStorage.getItem(quietHintKey('viewer', 'space')) ?? ''),
  ).toEqual({ hints: { plan: { views: 1 } }, lastStartDay: '2026-11-16' });
});

it('keeps working when storage is unavailable', () => {
  const getItem = vi
    .spyOn(Storage.prototype, 'getItem')
    .mockImplementation(() => {
      throw new Error('blocked');
    });
  render(<Screen candidates={[{ id: 'plan', eligible: true }]} />);
  expect(screen.getByRole('button').textContent).toBe('plan');
  getItem.mockRestore();
});

it('opens a new note for fourteen days after its release', () => {
  expect(newNoteOpen('waymarks', new Date(2026, 10, 15, 12))).toBe(false);
  expect(newNoteOpen('waymarks', new Date(2026, 10, 16, 0))).toBe(true);
  expect(newNoteOpen('waymarks', new Date(2026, 10, 29, 23))).toBe(true);
  expect(newNoteOpen('waymarks', new Date(2026, 10, 30, 0))).toBe(false);
});

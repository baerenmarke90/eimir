// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAttentionReceipt, useAttentionReceipts } from './attentionReceipt';

function Invitation({
  account = 'viewer',
  revision = 'one',
  until,
}: {
  account?: string;
  revision?: string;
  until: number;
}) {
  const receipt = useAttentionReceipt(
    ['instance', account, 'space'],
    revision,
    until,
  );
  return receipt.visible ? (
    <button type="button" onClick={receipt.consume}>
      Open invitation
    </button>
  ) : (
    <p>Consumed</p>
  );
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('retains consumption across navigation but allows a new revision and another viewer', () => {
  const until = Date.now() + 60_000;
  const view = render(<Invitation account="first" until={until} />);
  fireEvent.click(screen.getByRole('button'));
  view.unmount();
  const next = render(<Invitation account="first" until={until} />);
  expect(screen.queryByRole('button')).toBeNull();
  next.rerender(
    <Invitation account="first" revision="new-contribution" until={until} />,
  );
  expect(screen.getByRole('button')).toBeTruthy();
  next.rerender(<Invitation account="partner" until={until} />);
  expect(screen.getByRole('button')).toBeTruthy();
});

it('expires an unopened invitation while the app remains visible', async () => {
  vi.useFakeTimers();
  render(<Invitation account="expiry" until={Date.now() + 1_000} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_001);
  });
  expect(screen.queryByRole('button')).toBeNull();
});

it('hides a three-day-old invitation on its first render', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-04T10:00:00Z'));
  const createdAt = Date.parse('2026-11-01T09:00:00Z');
  render(
    <Invitation
      account="already-expired"
      until={createdAt + 3 * 24 * 60 * 60_000}
    />,
  );
  expect(screen.queryByRole('button')).toBeNull();
});

it('consumes one event without hiding another and restores the receipts after remount', () => {
  const expiresAt = Date.now() + 60_000;
  function Signals() {
    const receipts = useAttentionReceipts(
      ['instance', 'signals-account', 'space'],
      [
        { id: 'first-comment', expiresAt },
        { id: 'second-comment', expiresAt },
      ],
    );
    return (
      <>
        {[...receipts.pendingIds].map((id) => (
          <button type="button" key={id} onClick={() => receipts.consume(id)}>
            {id}
          </button>
        ))}
      </>
    );
  }
  const view = render(<Signals />);
  fireEvent.click(screen.getByRole('button', { name: 'first-comment' }));
  expect(screen.queryByRole('button', { name: 'first-comment' })).toBeNull();
  expect(screen.getByRole('button', { name: 'second-comment' })).toBeTruthy();
  view.unmount();
  render(<Signals />);
  expect(screen.queryByRole('button', { name: 'first-comment' })).toBeNull();
  expect(screen.getByRole('button', { name: 'second-comment' })).toBeTruthy();
});

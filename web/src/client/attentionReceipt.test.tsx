// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAttentionReceipt } from './attentionReceipt';

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

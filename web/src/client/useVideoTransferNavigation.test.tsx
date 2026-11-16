// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { VideoTransferOpen } from './backgroundVideoUploads';
import { useDocumentLeaveGuard } from './useDocumentLeaveGuard';
import { useVideoTransferNavigation } from './useVideoTransferNavigation';

const native = vi.hoisted(() => ({
  receive: (_event: VideoTransferOpen) => {},
  remove: vi.fn(),
  enabled: true,
}));
vi.mock('./backgroundVideoUploads', () => ({
  hasNativeVideoTransfers: () => native.enabled,
  nativeVideoTransfers: {
    addListener: vi.fn(async (_name, receive) => {
      native.receive = receive;
      return { remove: native.remove };
    }),
  },
}));
vi.mock('./snackbar', () => ({ postSnackbar: vi.fn() }));
const owner = {
  instance: 'https://api.example',
  accountId: 'owner',
  spaceId: 'space',
};
const targetId = '17382c39-b32c-456b-9016-fc53e5c11762';
const event: VideoTransferOpen = {
  ...owner,
  attachmentId: 'e1086496-f94d-45b7-83b4-f78904a95896',
  targetType: 'MEMORY',
  targetId,
};
function Harness({ dirty = false, accountId = owner.accountId }) {
  useDocumentLeaveGuard(dirty);
  useVideoTransferNavigation({ ...owner, accountId });
  return <output>{useLocation().pathname}</output>;
}
function App(props: Parameters<typeof Harness>[0]) {
  return (
    <MemoryRouter initialEntries={['/story/memories/new']}>
      <Harness {...props} />
    </MemoryRouter>
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  native.enabled = true;
});

it.each([
  ['MEMORY', '/story/memories/'],
  ['HEART_MOMENT', '/story/heart-moments/'],
] as const)(
  'opens the canonical %s target through the authenticated app',
  async (targetType, path) => {
    render(<App />);
    act(() => native.receive({ ...event, targetType }));
    expect(screen.getByRole('status').textContent).toBe(`${path}${targetId}`);
  },
);
it('retains a tap until the existing dirty-task guard releases', () => {
  const view = render(<App dirty />);
  act(() => native.receive(event));
  expect(screen.getByRole('status').textContent).toBe('/story/memories/new');
  view.rerender(<App dirty={false} />);
  expect(screen.getByRole('status').textContent).toBe(
    `/story/memories/${targetId}`,
  );
});
it.each([
  { accountId: 'foreign' },
  { spaceId: 'foreign' },
  { instance: 'https://foreign.example' },
  { targetId: 'https://foreign.example/private' },
  { attachmentId: 'not-an-id' },
  { targetType: 'PLAN' as VideoTransferOpen['targetType'] },
])('ignores a foreign or malformed target %j', (patch) => {
  render(<App />);
  act(() => native.receive({ ...event, ...patch }));
  expect(screen.getByRole('status').textContent).toBe('/story/memories/new');
});
it('drops a queued old-account tap and ignores its late callbacks after scope replacement', async () => {
  const view = render(<App dirty />);
  const oldReceive = native.receive;
  act(() => oldReceive(event));
  view.rerender(<App accountId="next-owner" />);
  act(() => oldReceive(event));
  expect(screen.getByRole('status').textContent).toBe('/story/memories/new');
  await waitFor(() => expect(native.remove).toHaveBeenCalledTimes(1));
  view.unmount();
  await waitFor(() => expect(native.remove).toHaveBeenCalledTimes(2));
});

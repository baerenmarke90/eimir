// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { appShortcuts, hasAppShortcuts } from './appShortcuts';
import { SNACKBAR_EVENT } from './snackbar';
import { useAppShortcuts } from './useAppShortcuts';
import { useDocumentLeaveGuard } from './useDocumentLeaveGuard';

vi.mock('./appShortcuts', async (original) => ({
  ...(await original<typeof import('./appShortcuts')>()),
  hasAppShortcuts: vi.fn(() => true),
  appShortcuts: { peek: vi.fn(), acknowledge: vi.fn(), addListener: vi.fn() },
}));

const request = (action: 'moment' | 'wish' | 'plan', n = 1) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  action,
});
let pending: ReturnType<typeof request> | undefined;
let opened: () => void;
const remove = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  pending = undefined;
  window.history.replaceState(null, '', '/today');
  vi.mocked(hasAppShortcuts).mockReturnValue(true);
  vi.mocked(appShortcuts.peek).mockImplementation(async () => ({
    request: pending,
  }));
  vi.mocked(appShortcuts.acknowledge).mockImplementation(async ({ id }) => {
    if (pending?.id === id) pending = undefined;
  });
  vi.mocked(appShortcuts.addListener).mockImplementation(
    async (_event, callback) => {
      opened = callback;
      return { remove };
    },
  );
});
afterEach(cleanup);
function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <BrowserRouter>{children}</BrowserRouter>
    </StrictMode>
  );
}
function setup(blocked = false) {
  return renderHook(
    ({ dirty }) => {
      useDocumentLeaveGuard(dirty);
      useAppShortcuts();
      return useLocation();
    },
    { wrapper, initialProps: { dirty: blocked } },
  );
}
it.each([
  ['moment', '/story/memories/new'],
  ['wish', '/plan/wishes/new'],
  ['plan', '/plan/plans/new'],
] as const)(
  'opens a queued %s after the authorized shell mounts, once in StrictMode',
  async (action, path) => {
    pending = request(action);
    const { result } = setup();
    await waitFor(() => expect(result.current.pathname).toBe(path));
    expect(appShortcuts.acknowledge).toHaveBeenCalledExactlyOnceWith({
      id: request(action).id,
    });
    expect(pending).toBeUndefined();
  },
);
it('keeps the latest warm action behind every active draft guard', async () => {
  const notice = vi.fn();
  window.addEventListener(SNACKBAR_EVENT, notice);
  const hook = setup(true);
  await waitFor(() => expect(appShortcuts.peek).toHaveBeenCalled());
  await act(async () => {
    pending = request('moment');
    opened();
  });
  await waitFor(() => expect(notice).toHaveBeenCalledTimes(1));
  await act(async () => {
    pending = request('plan', 2);
    opened();
  });
  expect(hook.result.current.pathname).toBe('/today');
  expect(appShortcuts.acknowledge).not.toHaveBeenCalled();
  hook.rerender({ dirty: false });
  await waitFor(() =>
    expect(hook.result.current.pathname).toBe('/plan/plans/new'),
  );
  expect(appShortcuts.acknowledge).toHaveBeenCalledExactlyOnceWith({
    id: request('plan', 2).id,
  });
  window.removeEventListener(SNACKBAR_EVENT, notice);
});
it('reselects an existing dirty task without remounting its history entry', async () => {
  window.history.replaceState(null, '', '/plan/wishes/new');
  pending = request('wish');
  const hook = setup(true);
  const key = hook.result.current.key;
  await waitFor(() => expect(appShortcuts.acknowledge).toHaveBeenCalledOnce());
  expect(hook.result.current.key).toBe(key);
  expect(hook.result.current.pathname).toBe('/plan/wishes/new');
});
it('ignores a stale peek that completes after a newer native tap', async () => {
  const hook = setup();
  await waitFor(() => expect(appShortcuts.peek).toHaveBeenCalled());
  let finish!: (result: { request: ReturnType<typeof request> }) => void;
  vi.mocked(appShortcuts.peek).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  act(() => opened());
  await act(async () => {
    pending = request('wish', 2);
    opened();
  });
  await waitFor(() =>
    expect(hook.result.current.pathname).toBe('/plan/wishes/new'),
  );
  await act(async () => finish({ request: request('moment') }));
  expect(hook.result.current.pathname).toBe('/plan/wishes/new');
});
it('does not replay consumed requests on a fresh mount', async () => {
  pending = request('moment');
  const first = setup();
  await waitFor(() =>
    expect(first.result.current.pathname).toBe('/story/memories/new'),
  );
  first.unmount();
  window.history.replaceState(null, '', '/today');
  const second = setup();
  await act(async () => {});
  expect(second.result.current.pathname).toBe('/today');
  expect(appShortcuts.acknowledge).toHaveBeenCalledTimes(1);
});
it('removes listeners and ignores late completion after the shell unmounts', async () => {
  let finish!: (result: { request: ReturnType<typeof request> }) => void;
  vi.mocked(appShortcuts.peek).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = setup();
  await waitFor(() => expect(appShortcuts.peek).toHaveBeenCalled());
  hook.unmount();
  await act(async () => finish({ request: request('plan') }));
  expect(remove).toHaveBeenCalled();
  expect(appShortcuts.acknowledge).not.toHaveBeenCalled();
});
it('leaves browsers and older native builds without the plugin alone', async () => {
  vi.mocked(hasAppShortcuts).mockReturnValue(false);
  const hook = setup();
  await act(async () => {});
  expect(hook.result.current.pathname).toBe('/today');
  expect(appShortcuts.addListener).not.toHaveBeenCalled();
});
it('tolerates an unavailable native bridge without navigating', async () => {
  vi.mocked(appShortcuts.peek).mockRejectedValue(new Error('unavailable'));
  const hook = setup();
  await act(async () => {});
  expect(hook.result.current.pathname).toBe('/today');
});

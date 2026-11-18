// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskOrigin } from '../client/taskOrigin';
import { RouteEntryHandoff } from './RouteEntryHandoff';

const route = vi.hoisted(() => ({
  location: {
    key: 'reader-entry',
    pathname: '/plan/plans/plan-1',
    search: '',
    hash: '',
    state: { taskReturnKey: 'return-1' },
  },
  resolveOrigin: vi.fn<(key: unknown) => TaskOrigin | null>(),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useLocation: () => route.location,
  useNavigationType: () => 'POP',
}));
vi.mock('../client/taskOrigin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../client/taskOrigin')>()),
  useTaskOrigin: () => ({ resolveOrigin: route.resolveOrigin }),
}));

let frames: Map<number, FrameRequestCallback>;
let sequence: number;

function flushFrame() {
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(0);
  });
}

function replaceLocation(returnKey = 'return-1') {
  route.location = {
    ...route.location,
    state: { taskReturnKey: returnKey },
  };
}

beforeEach(() => {
  route.location = {
    key: 'reader-entry',
    pathname: '/plan/plans/plan-1',
    search: '',
    hash: '',
    state: { taskReturnKey: 'return-1' },
  };
  route.resolveOrigin.mockReset();
  route.resolveOrigin.mockImplementation((key) =>
    key === 'return-1' || key === 'return-2'
      ? {
          to: '/plan/plans/plan-1',
          scrollY: key === 'return-1' ? 60 : 180,
          loadedPageCount: 1,
        }
      : null,
  );
  frames = new Map();
  sequence = 0;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = ++sequence;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RouteEntryHandoff origin completion', () => {
  it('applies one completed return for new location objects with the same entry and origin keys', () => {
    const view = render(<RouteEntryHandoff />);
    flushFrame();
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: 60,
      behavior: 'instant',
    });
    const previousLocation = route.location;
    replaceLocation();
    expect(route.location).not.toBe(previousLocation);
    expect(route.location.key).toBe(previousLocation.key);
    expect(route.location.state.taskReturnKey).toBe(
      previousLocation.state.taskReturnKey,
    );
    view.rerender(<RouteEntryHandoff />);
    flushFrame();
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('applies a fresh origin for the same reader entry', () => {
    const view = render(<RouteEntryHandoff />);
    flushFrame();
    replaceLocation('return-2');
    view.rerender(<RouteEntryHandoff />);
    flushFrame();
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
    expect(window.scrollTo).toHaveBeenLastCalledWith({
      top: 180,
      behavior: 'instant',
    });
  });

  it('does not mark a cancelled frame as a completed return', () => {
    const view = render(<RouteEntryHandoff />);
    replaceLocation();
    view.rerender(<RouteEntryHandoff />);
    flushFrame();
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: 60,
      behavior: 'instant',
    });
  });

  it.each(['before render', 'before frame'] as const)(
    'skips an expired or invalidated scoped origin %s',
    (phase) => {
      if (phase === 'before render') route.resolveOrigin.mockReturnValue(null);
      render(<RouteEntryHandoff />);
      if (phase === 'before frame') route.resolveOrigin.mockReturnValue(null);
      flushFrame();
      expect(window.scrollTo).not.toHaveBeenCalled();
    },
  );
});

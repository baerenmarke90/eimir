// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import {
  type Location,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayoutEffect, useRef, useState } from 'react';
import { TaskOriginProvider, useTaskOrigin } from '../client/taskOrigin';
import { MomentMapLink } from './MomentMapLink';

const mapPath = '/story/map?place=49%3A7';
let origin: ReturnType<typeof useTaskOrigin>;
let location: Location;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

function Probe() {
  origin = useTaskOrigin();
  location = useLocation();
  return null;
}

function MapTask({ readerPath }: { readerPath: string }) {
  const current = useLocation();
  const { requestReturn } = useTaskOrigin();
  const originKey = (current.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  return (
    <button type="button" onClick={() => requestReturn(originKey, readerPath)}>
      Return to reader
    </button>
  );
}

function Reader({
  onNavigate,
  preserveReturnFocus = false,
}: {
  onNavigate?: (proceed: () => void) => void;
  preserveReturnFocus?: boolean;
}) {
  const returnFocusEntry = useRef<string | null>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const [editing, setEditing] = useState(false);
  useLayoutEffect(() => {
    if (wasEditing.current && !editing) editTrigger.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  if (editing)
    return (
      <button type="button" onClick={() => setEditing(false)}>
        Close editor
      </button>
    );
  return (
    <>
      <input aria-label="Reader input" />
      <button ref={editTrigger} type="button" onClick={() => setEditing(true)}>
        Edit
      </button>
      <MomentMapLink
        to={mapPath}
        returnFocusKey="place:first"
        returnFocusEntryRef={preserveReturnFocus ? returnFocusEntry : undefined}
      >
        First place
      </MomentMapLink>
      <MomentMapLink
        to={mapPath}
        returnFocusKey="place:second"
        returnFocusEntryRef={preserveReturnFocus ? returnFocusEntry : undefined}
        onNavigate={onNavigate}
      >
        Second place at the same coordinates
      </MomentMapLink>
    </>
  );
}

function Harness({
  readerPath = '/story/memories/memory-1',
  accountId = 'account-a',
  spaceId = 'space-a',
  returnKey,
  onNavigate,
  preserveReturnFocus,
}: {
  readerPath?: string;
  accountId?: string;
  spaceId?: string;
  returnKey?: string;
  onNavigate?: (proceed: () => void) => void;
  preserveReturnFocus?: boolean;
}) {
  return (
    <MemoryRouter
      initialEntries={[
        {
          pathname: readerPath,
          state: returnKey ? { taskReturnKey: returnKey } : null,
        },
      ]}
    >
      <TaskOriginProvider accountId={accountId} spaceId={spaceId}>
        <Probe />
        <Routes>
          <Route
            path={readerPath}
            element={
              <Reader
                onNavigate={onNavigate}
                preserveReturnFocus={preserveReturnFocus}
              />
            }
          />
          <Route
            path="/story/map"
            element={<MapTask readerPath={readerPath} />}
          />
        </Routes>
      </TaskOriginProvider>
    </MemoryRouter>
  );
}

function advanceFrame() {
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(0);
  });
}

beforeEach(() => {
  frames = new Map();
  nextFrame = 1;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(320);
  window.history.replaceState({ usr: null }, '', '/');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Moment map reader return', () => {
  it.each([
    '/story/memories/memory-1',
    '/story/heart-moments/heart-1',
    '/plan/plans/plan-1',
  ])(
    'restores the exact invoking link and captured scroll for %s',
    async (readerPath) => {
      render(<Harness readerPath={readerPath} />);
      const previousOrigin = origin.captureOrigin({
        selectedKey: 'upstream-list-item',
        selectedOffset: 96,
        loadedPageCount: 3,
      });
      const second = screen.getByRole('link', {
        name: 'Second place at the same coordinates',
      });
      second.focus();
      fireEvent.click(second);
      await screen.findByRole('button', { name: 'Return to reader' });
      const key = (location.state as { taskOriginKey: string }).taskOriginKey;
      expect(origin.resolveOrigin(key)).toMatchObject({
        to: readerPath,
        selectedKey: 'moment-map:place:second',
        scrollY: 320,
      });
      expect(origin.resolveOrigin(previousOrigin)).toMatchObject({
        selectedKey: 'upstream-list-item',
        selectedOffset: 96,
        loadedPageCount: 3,
      });
      expect(JSON.stringify(window.history.state)).not.toContain(
        'place:second',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Return to reader' }));
      const returned = await screen.findByRole('link', {
        name: 'Second place at the same coordinates',
      });
      advanceFrame();
      expect(document.activeElement).toBe(returned);
      expect(document.activeElement).not.toBe(
        screen.getByRole('link', { name: 'First place' }),
      );
      expect(window.scrollTo).toHaveBeenLastCalledWith({
        top: 320,
        behavior: 'instant',
      });
      advanceFrame();
      expect(window.scrollTo).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['/plan/plans/plan-1'])(
    'does not replay map focus after same-route editor dismissal for %s',
    async (readerPath) => {
      render(<Harness readerPath={readerPath} preserveReturnFocus />);
      fireEvent.click(
        screen.getByRole('link', {
          name: 'Second place at the same coordinates',
        }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Return to reader' }),
      );
      const returned = await screen.findByRole('link', {
        name: 'Second place at the same coordinates',
      });
      advanceFrame();
      advanceFrame();
      expect(document.activeElement).toBe(returned);
      expect(window.scrollTo).toHaveBeenCalledTimes(2);
      const mapReturnKey = (location.state as { taskReturnKey: string })
        .taskReturnKey;

      vi.spyOn(window, 'scrollY', 'get').mockReturnValue(680);
      vi.mocked(window.scrollTo).mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      expect(screen.queryByRole('link')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
      const edit = screen.getByRole('button', { name: 'Edit' });
      expect(document.activeElement).toBe(edit);
      expect((location.state as { taskReturnKey: string }).taskReturnKey).toBe(
        mapReturnKey,
      );
      advanceFrame();
      advanceFrame();
      expect(document.activeElement).toBe(edit);
      expect(window.scrollTo).not.toHaveBeenCalled();
      expect(window.scrollY).toBe(680);

      fireEvent.click(screen.getByRole('link', { name: 'First place' }));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Return to reader' }),
      );
      const nextReturn = await screen.findByRole('link', {
        name: 'First place',
      });
      advanceFrame();
      expect(document.activeElement).toBe(nextReturn);
      expect(window.scrollTo).toHaveBeenLastCalledWith({
        top: 680,
        behavior: 'instant',
      });
    },
  );

  it('leaves ordinary reads and untrusted return markers unfocused', () => {
    const view = render(<Harness returnKey="foreign-origin" />);
    const input = screen.getByRole('textbox', { name: 'Reader input' });
    input.focus();
    advanceFrame();
    view.rerender(<Harness returnKey="foreign-origin" />);
    advanceFrame();
    expect(document.activeElement).toBe(input);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it.each([
    { accountId: 'account-b', spaceId: 'space-a' },
    { accountId: 'account-a', spaceId: 'space-b' },
  ])(
    'rejects a map return after an account or Space change: %j',
    async (scope) => {
      const view = render(<Harness />);
      fireEvent.click(
        screen.getByRole('link', {
          name: 'Second place at the same coordinates',
        }),
      );
      await screen.findByRole('button', { name: 'Return to reader' });
      const key = (location.state as { taskOriginKey: string }).taskOriginKey;
      view.rerender(<Harness {...scope} />);
      expect(origin.resolveOrigin(key)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Return to reader' }));
      const returned = await screen.findByRole('link', {
        name: 'Second place at the same coordinates',
      });
      advanceFrame();
      expect(document.activeElement).not.toBe(returned);
      expect(window.scrollTo).not.toHaveBeenCalled();
    },
  );

  it('preserves an optional task continuation before capturing and navigating', async () => {
    let proceed: (() => void) | undefined;
    const onNavigate = vi.fn((next: () => void) => {
      proceed = next;
    });
    render(<Harness onNavigate={onNavigate} />);
    fireEvent.click(
      screen.getByRole('link', {
        name: 'Second place at the same coordinates',
      }),
    );
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(location.pathname).toBe('/story/memories/memory-1');
    expect(window.history.state.usr).toBeNull();
    act(() => proceed?.());
    await screen.findByRole('button', { name: 'Return to reader' });
    fireEvent.click(screen.getByRole('button', { name: 'Return to reader' }));
    const returned = await screen.findByRole('link', {
      name: 'Second place at the same coordinates',
    });
    advanceFrame();
    expect(document.activeElement).toBe(returned);
  });
});

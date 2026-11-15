// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { type MutableRefObject, useRef } from 'react';
import {
  BrowserRouter,
  type NavigateFunction,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  previousEntryIs,
  resetHistoryEntriesForTest,
  useHistoryEntryTracker,
  useLeaveDeletedEntries,
  useReturnTo,
} from './historyEntries';
import { EDITOR_HISTORY_STATE_KEY } from './useEditorHistoryEntry';

interface Controls {
  navigate: NavigateFunction;
  returnTo: ReturnType<typeof useReturnTo>;
  leaveDeleted: ReturnType<typeof useLeaveDeletedEntries>;
  state: () => unknown;
}

function Harness({
  controls,
}: {
  controls: MutableRefObject<Controls | null>;
}) {
  useHistoryEntryTracker();
  const navigate = useNavigate();
  const returnTo = useReturnTo();
  const leaveDeleted = useLeaveDeletedEntries();
  const location = useLocation();
  const latestState = useRef<unknown>(null);
  latestState.current = location.state;
  controls.current = {
    navigate,
    returnTo,
    leaveDeleted,
    state: () => latestState.current,
  };
  return <p data-testid="path">{location.pathname}</p>;
}

function mount() {
  const controls: MutableRefObject<Controls | null> = { current: null };
  const view = render(
    <BrowserRouter>
      <Harness controls={controls} />
    </BrowserRouter>,
  );
  const get = () => {
    if (!controls.current) throw new Error('Harness not mounted');
    return controls.current;
  };
  return { ...view, get };
}

async function settle(pathname: string) {
  await waitFor(() => expect(window.location.pathname).toBe(pathname));
  await act(async () => {});
}

beforeEach(() => {
  resetHistoryEntriesForTest();
  window.history.replaceState(null, '', '/story');
});
afterEach(cleanup);

describe('history entry returns', () => {
  it('goes Back to a parent directly below instead of stacking a duplicate', async () => {
    const { get } = mount();
    act(() => void get().navigate('/story/memories/m1', { state: { k: 1 } }));
    act(() => void get().navigate('/story/memories/m1/edit'));
    const editIndex = window.history.state.idx;

    expect(previousEntryIs('/story/memories/m1')).toBe(true);
    act(() => get().returnTo('/story/memories/m1', { state: { k: 2 } }));
    await settle('/story/memories/m1');

    expect(window.history.state.idx).toBe(editIndex - 1);
    // The restored entry keeps its own state; the fallback state is unused.
    expect(get().state()).toEqual({ k: 1 });
    expect(previousEntryIs('/story')).toBe(true);
  });

  it('merges restored state into the parent entry after going Back', async () => {
    const { get } = mount();
    act(() => void get().navigate('/story/memories/m1', { state: { k: 1 } }));
    act(() => void get().navigate('/story/memories/m1/edit'));
    const editIndex = window.history.state.idx;

    act(() =>
      get().returnTo('/story/memories/m1', {
        state: { k: 2 },
        restoredState: { memorySaved: true },
      }),
    );
    await waitFor(() =>
      expect(get().state()).toEqual({ k: 1, memorySaved: true }),
    );
    expect(window.location.pathname).toBe('/story/memories/m1');
    expect(window.history.state.idx).toBe(editIndex - 1);
  });

  it('replaces the child when the parent is not directly below', async () => {
    const { get } = mount();
    act(() => void get().navigate('/story/memories/m1/edit'));
    const editIndex = window.history.state.idx;

    act(() =>
      get().returnTo('/story/memories/m1', {
        state: { k: 2 },
        restoredState: { memorySaved: true },
      }),
    );
    await settle('/story/memories/m1');
    expect(window.history.state.idx).toBe(editIndex);
    expect(get().state()).toEqual({ k: 2, memorySaved: true });
  });

  it('never goes Back while a layer owns the current entry', () => {
    const { get } = mount();
    act(() => void get().navigate('/more/people/p1'));
    expect(previousEntryIs('/story')).toBe(true);
    window.history.pushState(
      { ...window.history.state, [EDITOR_HISTORY_STATE_KEY]: 'editor-1' },
      '',
      window.location.href,
    );
    expect(previousEntryIs('/story')).toBe(false);
  });

  it('forgets entries ahead of a new push', async () => {
    const { get } = mount();
    act(() => void get().navigate('/plan'));
    act(() => void get().navigate(-1));
    await settle('/story');
    act(() => void get().navigate('/today'));
    act(() => void get().navigate('/story/years'));
    expect(previousEntryIs('/today')).toBe(true);
    expect(previousEntryIs('/plan')).toBe(false);
  });
});

describe('leaving a deleted resource', () => {
  it('goes Back past its detail and editor entries', async () => {
    const { get } = mount();
    act(() => void get().navigate('/today'));
    const originIndex = window.history.state.idx;
    act(() => void get().navigate('/story/memories/m1'));
    act(() => void get().navigate('/story/memories/m1/edit'));

    act(() => get().leaveDeleted('/story/memories/m1', '/story'));
    await settle('/today');
    expect(window.history.state.idx).toBe(originIndex);
  });

  it('replaces with the fallback when the origin is unknown', async () => {
    const { get } = mount();
    resetHistoryEntriesForTest();
    act(() => void get().navigate('/story/memories/m1/edit'));
    const editIndex = window.history.state.idx;

    act(() => get().leaveDeleted('/story/memories/m1', '/story'));
    await settle('/story');
    expect(window.history.state.idx).toBe(editIndex);
  });

  it('does not leave a page outside the deleted resource', async () => {
    const { get } = mount();
    act(() => void get().navigate('/more/people'));
    const listIndex = window.history.state.idx;

    act(() => get().leaveDeleted('/more/people/p1', '/more/people'));
    await settle('/more/people');
    expect(window.history.state.idx).toBe(listIndex);
  });

  it('keeps sibling paths apart from the deleted resource', async () => {
    const { get } = mount();
    act(() => void get().navigate('/story/memories/m10'));
    act(() => void get().navigate('/story/memories/m1'));

    act(() => get().leaveDeleted('/story/memories/m1', '/story'));
    await settle('/story/memories/m10');
  });
});

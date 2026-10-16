// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EDITOR_HISTORY_STATE_KEY,
  releaseEditorHistoryForDocumentNavigation,
  useEditorHistoryEntry,
} from './useEditorHistoryEntry';

beforeEach(() =>
  window.history.replaceState(
    { idx: 3, key: 'private-task', usr: { taskOriginKey: 'origin-1' } },
    '',
    '/more/private/notes/new',
  ),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('editor history handoff to document navigation', () => {
  function task() {
    return renderHook(() =>
      useEditorHistoryEntry({
        isDirty: true,
        onDiscardRequested: vi.fn(),
        onClose: vi.fn(),
      }),
    );
  }

  it('preserves Router state and prevents a cleanup Back from competing with sign-out', async () => {
    const h = task();
    await act(async () => {});
    expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).toBeTruthy();
    const back = vi.spyOn(window.history, 'back');
    await releaseEditorHistoryForDocumentNavigation();
    h.unmount();
    expect(back).not.toHaveBeenCalled();
    expect(window.history.state).toEqual({
      idx: 3,
      key: 'private-task',
      usr: { taskOriginKey: 'origin-1' },
    });
    expect(window.location.pathname).toBe('/more/private/notes/new');
  });

  it('waits for an entry removal already in flight before handing off the document', async () => {
    const h = task();
    await act(async () => {});
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    act(() => h.result.current());
    expect(back).toHaveBeenCalledTimes(1);
    const ready = vi.fn();
    const handoff = releaseEditorHistoryForDocumentNavigation().then(ready);
    h.unmount();
    await act(async () => {});
    expect(ready).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
      await handoff;
    });
    expect(ready).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('leaves history without an editor entry untouched', async () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    const back = vi.spyOn(window.history, 'back');
    await releaseEditorHistoryForDocumentNavigation();
    expect(replace).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    expect(window.history.state.usr).toEqual({ taskOriginKey: 'origin-1' });
  });
});

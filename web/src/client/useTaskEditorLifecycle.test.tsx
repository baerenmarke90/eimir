// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskEditorLifecycle } from './useTaskEditorLifecycle';

const history = vi.hoisted(() => ({
  close: vi.fn(),
  options: null as Record<string, unknown> | null,
}));

vi.mock('./useEditorHistoryEntry', () => ({
  useEditorHistoryEntry: (options: Record<string, unknown>) => {
    history.options = options;
    return history.close;
  },
}));

function options() {
  if (!history.options) throw new Error('History lifecycle was not registered');
  return history.options as {
    isDirty: boolean;
    isCloseBlocked: boolean;
    onDiscardRequested: () => void;
  };
}

beforeEach(() => {
  history.close.mockReset();
  history.options = null;
});

afterEach(cleanup);

describe('useTaskEditorLifecycle', () => {
  it('closes a clean editor immediately', () => {
    const { result } = renderHook(() =>
      useTaskEditorLifecycle({
        isDirty: false,
        onClose: vi.fn(),
      }),
    );

    act(() => result.current.requestClose());

    expect(history.close).toHaveBeenCalledTimes(1);
    expect(result.current.showDiscardConfirm).toBe(false);
  });

  it('requests discard for dirty close attempts and closes after confirmation', () => {
    const { result } = renderHook(() =>
      useTaskEditorLifecycle({
        isDirty: true,
        onClose: vi.fn(),
      }),
    );

    act(() => result.current.requestClose());
    expect(history.close).not.toHaveBeenCalled();
    expect(result.current.showDiscardConfirm).toBe(true);

    act(() => result.current.keepEditing());
    expect(result.current.showDiscardConfirm).toBe(false);

    act(() => options().onDiscardRequested());
    expect(result.current.showDiscardConfirm).toBe(true);

    act(() => result.current.closeConfirmed());
    expect(history.close).toHaveBeenCalledTimes(1);
  });

  it('blocks close while pending without opening discard confirmation', () => {
    const { result } = renderHook(() =>
      useTaskEditorLifecycle({
        isDirty: true,
        isCloseBlocked: true,
        onClose: vi.fn(),
      }),
    );

    act(() => result.current.requestClose());

    expect(history.close).not.toHaveBeenCalled();
    expect(result.current.showDiscardConfirm).toBe(false);
    expect(options().isDirty).toBe(true);
    expect(options().isCloseBlocked).toBe(true);
  });

  it('registers beforeunload only while dirty or blocked and removes it on cleanup', () => {
    const { rerender, unmount } = renderHook(
      ({ dirty, blocked }) =>
        useTaskEditorLifecycle({
          isDirty: dirty,
          isCloseBlocked: blocked,
          onClose: vi.fn(),
        }),
      {
        initialProps: { dirty: false, blocked: false },
      },
    );

    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    rerender({ dirty: true, blocked: false });
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);

    rerender({ dirty: false, blocked: false });
    const cleaned = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleaned);
    expect(cleaned.defaultPrevented).toBe(false);

    rerender({ dirty: false, blocked: true });
    const blocked = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);

    unmount();
    const afterUnmount = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
  });
});

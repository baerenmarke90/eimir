// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useRef, useState } from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  EDITOR_HISTORY_STATE_KEY,
  useEditorHistoryEntry,
} from '../client/useEditorHistoryEntry';
import taskSheets from '../i18n/locales/taskSheets';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() =>
  window.history.replaceState(
    { key: 'editor-route', idx: 0 },
    '',
    '/story/memories/new',
  ),
);
afterEach(async () => {
  cleanup();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
});
async function back() {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

function Task({
  onExit,
  onDiscard,
  blocked = false,
  onBlocked = () => {},
}: {
  onExit: () => void;
  onDiscard: () => void;
  blocked?: boolean;
  onBlocked?: () => void;
}) {
  const [sheet, setSheet] = useState(false);
  const sheetRef = useRef<ShortTaskSheetHandle>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTask = useEditorHistoryEntry({
    isDirty: true,
    isCloseBlocked: blocked,
    onCloseBlocked: onBlocked,
    onDiscardRequested: () => {
      onDiscard();
      setSheet(true);
    },
    onClose: onExit,
  });
  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setSheet(true)}>
        Task choices
      </button>
      <ShortTaskSheet
        ref={sheetRef}
        open={sheet}
        title="Task choice"
        onClose={() => setSheet(false)}
        restoreFocusRef={triggerRef}
      >
        <button
          type="button"
          onClick={() =>
            sheetRef.current?.closeForNavigation(() => closeTask())
          }
        >
          Continue to result
        </button>
      </ShortTaskSheet>
    </>
  );
}

describe('ShortTaskSheet history ownership', () => {
  it('lets only the innermost task consume Back and preserves the parent guard', async () => {
    const onExit = vi.fn();
    const onDiscard = vi.fn();
    render(<Task onExit={onExit} onDiscard={onDiscard} />);
    await waitFor(() =>
      expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).toBeTruthy(),
    );
    const parentMarker = window.history.state[EDITOR_HISTORY_STATE_KEY];
    fireEvent.click(screen.getByText('Task choices'));
    await waitFor(() =>
      expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).not.toBe(
        parentMarker,
      ),
    );
    await back();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).toBe(parentMarker);
    await back();
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeDefined();
    await back();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
  });

  it('consumes child then parent history before handing off one destination', async () => {
    const onDiscard = vi.fn();
    const onExit = vi.fn(() => {
      expect(document.querySelector('dialog[open]')).toBeNull();
      expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).toBeUndefined();
    });
    render(<Task onExit={onExit} onDiscard={onDiscard} />);
    await waitFor(() =>
      expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).toBeTruthy(),
    );
    const parentMarker = window.history.state[EDITOR_HISTORY_STATE_KEY];
    fireEvent.click(screen.getByText('Task choices'));
    await waitFor(() =>
      expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).not.toBe(
        parentMarker,
      ),
    );
    fireEvent.click(screen.getByText('Continue to result'));
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('retains a pending task and signals why Back is blocked', async () => {
    const onExit = vi.fn();
    const onDiscard = vi.fn();
    const onBlocked = vi.fn();
    render(
      <Task
        onExit={onExit}
        onDiscard={onDiscard}
        onBlocked={onBlocked}
        blocked
      />,
    );
    await waitFor(() =>
      expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).toBeTruthy(),
    );
    const marker = window.history.state[EDITOR_HISTORY_STATE_KEY];
    await back();
    expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).toBe(marker);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('restores trigger focus and the preexisting scroll policy on cancellation', async () => {
    document.body.style.overflow = 'auto';
    render(<Task onExit={vi.fn()} onDiscard={vi.fn()} />);
    const trigger = screen.getByText('Task choices');
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: taskSheets.close }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.body.style.overflow).toBe('auto');
  });

  it('keeps one localized semantic dismissal control for Compact and Expanded', () => {
    render(<Task onExit={vi.fn()} onDiscard={vi.fn()} />);
    fireEvent.click(screen.getByText('Task choices'));

    const closeButton = screen.getByRole('button', { name: taskSheets.close });
    expect(closeButton.getAttribute('title')).toBe(taskSheets.close);
    expect(closeButton.classList.contains('short-task-sheet-drag-zone')).toBe(
      true,
    );
    expect(
      closeButton.querySelector('.short-task-sheet-drag-handle'),
    ).not.toBeNull();
    expect(closeButton.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('uses the Compact grip as the primary touch dismissal gesture', async () => {
    render(<Task onExit={vi.fn()} onDiscard={vi.fn()} />);
    const trigger = screen.getByText('Task choices');
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    const dragZone = dialog.querySelector<HTMLElement>(
      '.short-task-sheet-drag-zone',
    );
    expect(dragZone).not.toBeNull();
    if (!dragZone) throw new Error('Missing short sheet drag zone');

    fireEvent.pointerDown(dragZone, {
      pointerId: 1,
      button: 0,
      clientY: 100,
    });
    fireEvent.pointerMove(dragZone, { pointerId: 1, clientY: 140 });
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('40px');
    fireEvent.pointerUp(dragZone, { pointerId: 1, clientY: 140 });
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('0px');

    // A release after a real but sub-threshold drag must not turn into the
    // button's synthetic click and accidentally dismiss the sheet.
    fireEvent.click(dragZone);
    expect(screen.getByRole('dialog')).toBeDefined();

    fireEvent.pointerDown(dragZone, {
      pointerId: 2,
      button: 0,
      clientY: 100,
    });
    fireEvent.pointerMove(dragZone, { pointerId: 2, clientY: 180 });
    fireEvent.pointerUp(dragZone, { pointerId: 2, clientY: 180 });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

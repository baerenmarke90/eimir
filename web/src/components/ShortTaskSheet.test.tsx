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
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import taskBoundary from '../i18n/locales/taskBoundary';
import taskSheets from '../i18n/locales/taskSheets';
import { DraftExitPrompt } from './DraftExitPrompt';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';

function fireReactAnimationEnd(element: Element): void {
  fireEvent.animationEnd(element);
  if (element.isConnected) {
    fireEvent(element, new Event('webkitAnimationEnd', { bubbles: true }));
  }
}

function mockMatchMedia(reducedMotion: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches:
        query === '(prefers-reduced-motion: reduce)' ? reducedMotion : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  mockMatchMedia(true);
  window.history.replaceState(
    { key: 'editor-route', idx: 0 },
    '',
    '/story/memories/new',
  );
});
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
        <div data-testid="sheet-surface">Swipe surface</div>
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
  for (const reducedMotion of [true, false]) {
    it(`hands a discard destination off after child and parent teardown (reduced motion: ${reducedMotion})`, async () => {
      mockMatchMedia(reducedMotion);
      const onDefaultExit = vi.fn();
      const destination = vi.fn(() => {
        expect(document.querySelector('dialog[open]')).toBeNull();
        expect(document.body.style.overflow).not.toBe('hidden');
        expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).toBeUndefined();
      });
      function DraftTask() {
        const editor = useTaskEditorLifecycle({
          isDirty: true,
          onClose: onDefaultExit,
        });
        return (
          <>
            <input aria-label="Draft" defaultValue="A thought worth keeping" />
            <button
              type="button"
              onClick={() => editor.requestClose(destination)}
            >
              Leave draft
            </button>
            <DraftExitPrompt
              open={editor.showDiscardConfirm}
              onKeep={editor.keepEditing}
              onDiscard={editor.closeConfirmed}
            />
          </>
        );
      }
      render(<DraftTask />);
      await waitFor(() =>
        expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).toBeTruthy(),
      );
      const parent = window.history.state[EDITOR_HISTORY_STATE_KEY];
      fireEvent.click(screen.getByText('Leave draft'));
      await waitFor(() =>
        expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).not.toBe(parent),
      );
      fireEvent.click(
        screen.getByRole('button', { name: taskBoundary.discard }),
      );
      if (!reducedMotion) {
        const dialog = screen.getByRole('dialog');
        await waitFor(() =>
          expect(dialog.getAttribute('data-presence')).toBe('exiting'),
        );
        expect(destination).not.toHaveBeenCalled();
        fireReactAnimationEnd(dialog);
      }
      await waitFor(() => expect(destination).toHaveBeenCalledTimes(1));
      expect(onDefaultExit).not.toHaveBeenCalled();
    });
  }

  it('keeps the draft and parent guard when Back dismisses its discard prompt', async () => {
    const onExit = vi.fn();
    function DraftTask() {
      const editor = useTaskEditorLifecycle({ isDirty: true, onClose: onExit });
      return (
        <>
          <input aria-label="Draft" defaultValue="A thought worth keeping" />
          <DraftExitPrompt
            open={editor.showDiscardConfirm}
            onKeep={editor.keepEditing}
            onDiscard={editor.closeConfirmed}
          />
        </>
      );
    }
    render(<DraftTask />);
    await waitFor(() =>
      expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).toBeTruthy(),
    );
    const parent = window.history.state[EDITOR_HISTORY_STATE_KEY];
    await back();
    expect(screen.getByRole('dialog')).toBeDefined();
    await back();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('textbox').getAttribute('value')).toBe(
      'A thought worth keeping',
    );
    expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).toBe(parent);
    expect(onExit).not.toHaveBeenCalled();
    await back();
    fireEvent.click(screen.getByRole('button', { name: taskBoundary.discard }));
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
  });

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

  it('waits for animated exit before handing off deliberate navigation', async () => {
    mockMatchMedia(false);
    document.body.style.overflow = 'auto';
    const onExit = vi.fn(() => {
      expect(document.querySelector('dialog[open]')).toBeNull();
      expect(document.body.style.overflow).toBe('auto');
    });
    render(<Task onExit={onExit} onDiscard={vi.fn()} />);
    await waitFor(() =>
      expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).toBeTruthy(),
    );
    fireEvent.click(screen.getByText('Task choices'));
    const dialog = screen.getByRole('dialog') as HTMLDialogElement;

    fireEvent.click(screen.getByText('Continue to result'));

    await waitFor(() =>
      expect(dialog.getAttribute('data-presence')).toBe('exiting'),
    );
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(document.body.style.overflow).toBe('hidden');

    fireReactAnimationEnd(dialog);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    expect(document.body.style.overflow).toBe('auto');
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

  it('captures implicit focus return before native showModal moves focus', async () => {
    const nativeLikeShowModal = vi
      .spyOn(HTMLDialogElement.prototype, 'showModal')
      .mockImplementation(function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
        this.querySelector<HTMLElement>('button')?.focus();
      });

    const trigger = document.createElement('button');
    trigger.textContent = 'Implicit trigger';
    document.body.append(trigger);

    try {
      const sheetProps = {
        title: 'Implicit restore',
        onClose: vi.fn(),
      };
      const { rerender } = render(
        <ShortTaskSheet open={false} {...sheetProps}>
          <button type="button">Inside</button>
        </ShortTaskSheet>,
      );

      trigger.focus();
      expect(document.activeElement).toBe(trigger);

      rerender(
        <ShortTaskSheet open={true} {...sheetProps}>
          <button type="button">Inside</button>
        </ShortTaskSheet>,
      );
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(document.activeElement).not.toBe(trigger);

      rerender(
        <ShortTaskSheet open={false} {...sheetProps}>
          <button type="button">Inside</button>
        </ShortTaskSheet>,
      );

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    } finally {
      trigger.remove();
      nativeLikeShowModal.mockRestore();
    }
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

  describe('nested native cancel ownership', () => {
    async function openNestedSheets(guard: 'none' | 'dirty' | 'blocked') {
      const onParentClose = vi.fn();
      const onChildClose = vi.fn();
      const onDiscardRequested = vi.fn();
      const onCloseBlocked = vi.fn();
      function NestedSheets() {
        const [parentOpen, setParentOpen] = useState(false);
        const [childOpen, setChildOpen] = useState(false);
        const parentTrigger = useRef<HTMLButtonElement>(null);
        const childTrigger = useRef<HTMLButtonElement>(null);
        return (
          <>
            <button
              ref={parentTrigger}
              type="button"
              onClick={() => setParentOpen(true)}
            >
              Open parent
            </button>
            <ShortTaskSheet
              open={parentOpen}
              title="Parent choice"
              restoreFocusRef={parentTrigger}
              onClose={() => {
                onParentClose();
                setParentOpen(false);
              }}
            >
              <button
                ref={childTrigger}
                type="button"
                onClick={() => setChildOpen(true)}
              >
                Open child
              </button>
              <ShortTaskSheet
                open={childOpen}
                title="Child choice"
                restoreFocusRef={childTrigger}
                isDirty={guard === 'dirty'}
                isCloseBlocked={guard === 'blocked'}
                onDiscardRequested={onDiscardRequested}
                onCloseBlocked={onCloseBlocked}
                onClose={() => {
                  onChildClose();
                  setChildOpen(false);
                }}
              >
                <input aria-label="Child draft" defaultValue="Unsaved choice" />
              </ShortTaskSheet>
            </ShortTaskSheet>
          </>
        );
      }
      render(<NestedSheets />);
      fireEvent.click(screen.getByRole('button', { name: 'Open parent' }));
      await waitFor(() =>
        expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).toBeTruthy(),
      );
      const parentMarker = window.history.state[EDITOR_HISTORY_STATE_KEY];
      const trigger = screen.getByRole('button', { name: 'Open child' });
      trigger.focus();
      fireEvent.click(trigger);
      await waitFor(() =>
        expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).not.toBe(
          parentMarker,
        ),
      );
      const parent = screen.getByRole('dialog', { name: 'Parent choice' });
      const child = screen.getByRole('dialog', { name: 'Child choice' });
      expect(child.parentElement).toBe(document.body);
      expect(parent.contains(child)).toBe(false);
      const input = screen.getByRole('textbox', { name: 'Child draft' });
      input.focus();
      return {
        parent,
        child,
        input,
        trigger,
        parentMarker,
        onParentClose,
        onChildClose,
        onDiscardRequested,
        onCloseBlocked,
      };
    }

    it('closes only the child portal and returns focus to its parent control', async () => {
      const task = await openNestedSheets('none');
      const cancel = new Event('cancel', { cancelable: true });
      fireEvent(task.child, cancel);
      expect(cancel.defaultPrevented).toBe(true);
      await waitFor(() => expect(task.onChildClose).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Child choice' }),
        ).toBeNull(),
      );
      expect(task.onParentClose).not.toHaveBeenCalled();
      expect(task.onDiscardRequested).not.toHaveBeenCalled();
      expect(task.onCloseBlocked).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Parent choice' })).toBe(
        task.parent,
      );
      expect(task.parent.hasAttribute('open')).toBe(true);
      expect(window.history.state[EDITOR_HISTORY_STATE_KEY]).toBe(
        task.parentMarker,
      );
      await waitFor(() => expect(document.activeElement).toBe(task.trigger));
      expect(document.body.style.overflow).toBe('hidden');
    });

    for (const guard of ['dirty', 'blocked'] as const) {
      it(`keeps both portals open when the child cancel is ${guard}`, async () => {
        const task = await openNestedSheets(guard);
        const cancel = new Event('cancel', { cancelable: true });
        fireEvent(task.child, cancel);
        expect(cancel.defaultPrevented).toBe(true);
        expect(task.onChildClose).not.toHaveBeenCalled();
        expect(task.onParentClose).not.toHaveBeenCalled();
        expect(task.onDiscardRequested).toHaveBeenCalledTimes(
          guard === 'dirty' ? 1 : 0,
        );
        expect(task.onCloseBlocked).toHaveBeenCalledTimes(
          guard === 'blocked' ? 1 : 0,
        );
        expect(screen.getByRole('dialog', { name: 'Parent choice' })).toBe(
          task.parent,
        );
        expect(screen.getByRole('dialog', { name: 'Child choice' })).toBe(
          task.child,
        );
        expect(task.parent.hasAttribute('open')).toBe(true);
        expect(task.child.hasAttribute('open')).toBe(true);
        expect(task.input.getAttribute('value')).toBe('Unsaved choice');
        expect(document.activeElement).toBe(task.input);
        expect(document.body.style.overflow).toBe('hidden');
      });
    }
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

  it('keeps modality and scroll locking through animated Close until the real exit signal', async () => {
    mockMatchMedia(false);
    document.body.style.overflow = 'auto';
    render(<Task onExit={vi.fn()} onDiscard={vi.fn()} />);
    const trigger = screen.getByText('Task choices');
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    fireEvent.click(screen.getByRole('button', { name: taskSheets.close }));

    await waitFor(() =>
      expect(dialog.getAttribute('data-presence')).toBe('exiting'),
    );
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).not.toBe(trigger);

    fireReactAnimationEnd(dialog);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.body.style.overflow).toBe('auto');
  });

  it('ignores a stale exit completion after a rapid reopen', async () => {
    mockMatchMedia(false);
    document.body.style.overflow = 'auto';
    const triggerRef = { current: document.createElement('button') };
    document.body.append(triggerRef.current);
    const { rerender } = render(
      <ShortTaskSheet
        open={true}
        title="Presence"
        onClose={vi.fn()}
        restoreFocusRef={triggerRef}
      >
        <button type="button">Inside</button>
      </ShortTaskSheet>,
    );
    const dialog = screen.getByRole('dialog') as HTMLDialogElement;

    rerender(
      <ShortTaskSheet
        open={false}
        title="Presence"
        onClose={vi.fn()}
        restoreFocusRef={triggerRef}
      >
        <button type="button">Inside</button>
      </ShortTaskSheet>,
    );
    expect(dialog.getAttribute('data-presence')).toBe('exiting');

    rerender(
      <ShortTaskSheet
        open={true}
        title="Presence"
        onClose={vi.fn()}
        restoreFocusRef={triggerRef}
      >
        <button type="button">Inside</button>
      </ShortTaskSheet>,
    );
    expect(dialog.getAttribute('data-presence')).toBe('open');

    fireReactAnimationEnd(dialog);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <ShortTaskSheet
        open={false}
        title="Presence"
        onClose={vi.fn()}
        restoreFocusRef={triggerRef}
      >
        <button type="button">Inside</button>
      </ShortTaskSheet>,
    );
    expect(dialog.getAttribute('data-presence')).toBe('exiting');
    fireReactAnimationEnd(dialog);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.style.overflow).toBe('auto');
    triggerRef.current.remove();
  });

  it('requires a deliberate downward drag and lets reversal cancel dismissal', async () => {
    mockMatchMedia(false);
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

    // The previous fixed 72px threshold was too eager. A 100px pull now
    // settles back and must not fall through into the button's synthetic click.
    fireEvent.pointerDown(dragZone, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      clientY: 100,
    });
    fireEvent.pointerMove(dragZone, { pointerId: 1, clientY: 200 });
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('100px');
    fireEvent.pointerUp(dragZone, { pointerId: 1, clientY: 200 });
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('0px');
    fireEvent.click(dragZone, { detail: 1 });
    expect(screen.getByRole('dialog')).toBeDefined();

    // Crossing the commit distance is still cancellable when the user
    // deliberately reverses upward before release.
    fireEvent.pointerDown(dragZone, {
      pointerId: 2,
      button: 0,
      isPrimary: true,
      clientY: 100,
    });
    fireEvent.pointerMove(dragZone, { pointerId: 2, clientY: 290 });
    fireEvent.pointerMove(dragZone, { pointerId: 2, clientY: 240 });
    fireEvent.pointerUp(dragZone, { pointerId: 2, clientY: 240 });
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('0px');
    fireEvent.click(dragZone, { detail: 1 });
    expect(screen.getByRole('dialog')).toBeDefined();

    // A fresh, steadily downward gesture beyond the bounded threshold closes.
    fireEvent.pointerDown(dragZone, {
      pointerId: 3,
      button: 0,
      isPrimary: true,
      clientY: 100,
    });
    fireEvent.pointerMove(dragZone, { pointerId: 3, clientY: 260 });
    fireEvent.pointerUp(dragZone, { pointerId: 3, clientY: 260 });
    await waitFor(() =>
      expect(dialog.getAttribute('data-presence')).toBe('exiting'),
    );
    fireReactAnimationEnd(dialog);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('lets direct manipulation start on plain sheet content, not only the handle', async () => {
    mockMatchMedia(false);
    render(<Task onExit={vi.fn()} onDiscard={vi.fn()} />);
    fireEvent.click(screen.getByText('Task choices'));

    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    const surface = screen.getByTestId('sheet-surface');

    fireEvent.pointerDown(surface, {
      pointerId: 11,
      button: 0,
      isPrimary: true,
      clientX: 40,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 11,
      clientX: 43,
      clientY: 180,
    });

    expect(dialog.getAttribute('data-dragging')).toBe('true');
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('80px');
    fireEvent.pointerUp(surface, {
      pointerId: 11,
      clientX: 43,
      clientY: 180,
    });
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('0px');

    fireEvent.pointerDown(surface, {
      pointerId: 12,
      button: 0,
      isPrimary: true,
      clientX: 40,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 12,
      clientX: 42,
      clientY: 270,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 12,
      clientX: 42,
      clientY: 270,
    });

    await waitFor(() =>
      expect(dialog.getAttribute('data-presence')).toBe('exiting'),
    );
    fireReactAnimationEnd(dialog);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('lets a pull start on buttons and rows without activating them', () => {
    mockMatchMedia(false);
    const onChoose = vi.fn();
    render(
      <ShortTaskSheet open title="Places" onClose={vi.fn()}>
        <button type="button" onClick={onChoose}>
          Riverside cafe
        </button>
      </ShortTaskSheet>,
    );
    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    const row = screen.getByText('Riverside cafe');

    fireEvent.pointerDown(row, {
      pointerId: 21,
      button: 0,
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(row, { pointerId: 21, clientX: 102, clientY: 180 });
    expect(dialog.getAttribute('data-dragging')).toBe('true');
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('80px');
    fireEvent.pointerUp(row, { pointerId: 21, clientX: 102, clientY: 180 });
    // The settled pull's synthetic click must not choose the row.
    fireEvent.click(row, { detail: 1 });
    expect(onChoose).not.toHaveBeenCalled();
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('0px');

    // A fresh ordinary press still activates the row.
    fireEvent.pointerDown(row, {
      pointerId: 22,
      button: 0,
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(row, { pointerId: 22, clientX: 100, clientY: 100 });
    fireEvent.click(row, { detail: 1 });
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it('does not claim text entry or primarily horizontal gestures', () => {
    mockMatchMedia(false);
    render(
      <ShortTaskSheet open title="Places" onClose={vi.fn()}>
        <input aria-label="Search places" />
        <div data-testid="sheet-surface">Swipe surface</div>
      </ShortTaskSheet>,
    );

    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    const field = screen.getByLabelText('Search places');
    const surface = screen.getByTestId('sheet-surface');

    fireEvent.pointerDown(field, {
      pointerId: 23,
      button: 0,
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(field, {
      pointerId: 23,
      clientX: 102,
      clientY: 180,
    });
    fireEvent.pointerUp(field, {
      pointerId: 23,
      clientX: 102,
      clientY: 180,
    });

    expect(dialog.getAttribute('data-dragging')).toBeNull();
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('0px');

    fireEvent.pointerDown(surface, {
      pointerId: 24,
      button: 0,
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 24,
      clientX: 180,
      clientY: 120,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 24,
      clientX: 180,
      clientY: 120,
    });

    expect(dialog.getAttribute('data-dragging')).toBeNull();
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('0px');
  });

  it.each(['pointer', 'touch'] as const)(
    'leaves a downward %s drag on map tiles to the map',
    (input) => {
      mockMatchMedia(false);
      const onClose = vi.fn();
      render(
        <ShortTaskSheet open title="Map" onClose={onClose}>
          <div className="leaflet-container">
            <span data-testid="map-tile">Map tile</span>
          </div>
        </ShortTaskSheet>,
      );
      const dialog = screen.getByRole('dialog');
      const tile = screen.getByTestId('map-tile');
      if (input === 'touch') {
        fireEvent.touchStart(tile, {
          touches: [{ identifier: 41, clientX: 100, clientY: 100 }],
        });
        fireEvent.touchMove(tile, {
          touches: [{ identifier: 41, clientX: 100, clientY: 300 }],
        });
      } else {
        fireEvent.pointerDown(tile, {
          pointerId: 41,
          button: 0,
          isPrimary: true,
          clientX: 100,
          clientY: 100,
        });
        fireEvent.pointerMove(tile, {
          pointerId: 41,
          clientX: 100,
          clientY: 300,
        });
      }
      expect(dialog.getAttribute('data-dragging')).toBeNull();
      expect(
        dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
      ).toBe('0px');
      if (input === 'touch') {
        fireEvent.touchEnd(tile, {
          touches: [],
          changedTouches: [{ identifier: 41, clientX: 100, clientY: 300 }],
        });
      } else {
        fireEvent.pointerUp(tile, {
          pointerId: 41,
          clientX: 100,
          clientY: 300,
        });
      }
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBe(dialog);
    },
  );

  it('keeps scroll ownership until the sheet body is at its top boundary', () => {
    mockMatchMedia(false);
    render(<Task onExit={vi.fn()} onDiscard={vi.fn()} />);
    fireEvent.click(screen.getByText('Task choices'));

    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    const body = dialog.querySelector<HTMLElement>('.short-task-sheet-body');
    const surface = screen.getByTestId('sheet-surface');
    expect(body).not.toBeNull();
    if (!body) throw new Error('Missing short sheet body');

    body.scrollTop = 32;
    fireEvent.pointerDown(surface, {
      pointerId: 31,
      button: 0,
      isPrimary: true,
      clientX: 50,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 31,
      clientX: 50,
      clientY: 180,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 31,
      clientX: 50,
      clientY: 180,
    });

    expect(dialog.getAttribute('data-dragging')).toBeNull();
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('0px');

    body.scrollTop = 0;
    fireEvent.pointerDown(surface, {
      pointerId: 32,
      button: 0,
      isPrimary: true,
      clientX: 50,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 32,
      clientX: 50,
      clientY: 180,
    });

    expect(dialog.getAttribute('data-dragging')).toBe('true');
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('80px');

    fireEvent.pointerCancel(surface, {
      pointerId: 32,
      clientX: 50,
      clientY: 180,
    });
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('0px');
  });

  it('supports touch drag arbitration without taking ordinary touch taps', async () => {
    mockMatchMedia(false);
    render(<Task onExit={vi.fn()} onDiscard={vi.fn()} />);
    fireEvent.click(screen.getByText('Task choices'));

    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    const surface = screen.getByTestId('sheet-surface');

    fireEvent.touchStart(surface, {
      touches: [{ identifier: 41, clientX: 20, clientY: 100 }],
    });
    fireEvent.touchMove(surface, {
      touches: [{ identifier: 41, clientX: 22, clientY: 260 }],
    });

    expect(dialog.getAttribute('data-dragging')).toBe('true');
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('160px');

    fireEvent.touchEnd(surface, {
      changedTouches: [{ identifier: 41, clientX: 22, clientY: 260 }],
      touches: [],
    });

    await waitFor(() =>
      expect(dialog.getAttribute('data-presence')).toBe('exiting'),
    );
    fireReactAnimationEnd(dialog);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('routes Close through dirty and blocked guards before confirmed dismissal', () => {
    const onClose = vi.fn();
    const onDiscardRequested = vi.fn();
    const onCloseBlocked = vi.fn();
    const { rerender } = render(
      <ShortTaskSheet
        open={true}
        title="Guarded task"
        onClose={onClose}
        isDirty
        onDiscardRequested={onDiscardRequested}
      >
        <input aria-label="Draft" defaultValue="unsaved" />
      </ShortTaskSheet>,
    );

    fireEvent.click(screen.getByRole('button', { name: taskSheets.close }));
    expect(onDiscardRequested).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeDefined();

    rerender(
      <ShortTaskSheet
        open={true}
        title="Guarded task"
        onClose={onClose}
        isCloseBlocked
        onCloseBlocked={onCloseBlocked}
      >
        <input aria-label="Draft" defaultValue="unsaved" />
      </ShortTaskSheet>,
    );

    fireEvent.click(screen.getByRole('button', { name: taskSheets.close }));
    expect(onCloseBlocked).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('settles a blocked drag back instead of leaving the sheet displaced', () => {
    mockMatchMedia(false);
    const onClose = vi.fn();
    const onCloseBlocked = vi.fn();
    render(
      <ShortTaskSheet
        open={true}
        title="Blocked"
        onClose={onClose}
        isCloseBlocked
        onCloseBlocked={onCloseBlocked}
      >
        <div data-testid="blocked-surface">Swipe surface</div>
      </ShortTaskSheet>,
    );

    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    const surface = screen.getByTestId('blocked-surface');

    fireEvent.pointerDown(surface, {
      pointerId: 51,
      button: 0,
      isPrimary: true,
      clientX: 10,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 51,
      clientX: 10,
      clientY: 280,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 51,
      clientX: 10,
      clientY: 280,
    });

    expect(onCloseBlocked).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(
      dialog.style.getPropertyValue('--short-task-sheet-drag-offset'),
    ).toBe('0px');
  });
});

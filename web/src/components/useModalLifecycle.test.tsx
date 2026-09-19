// @vitest-environment jsdom
import { cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  containModalTabFocus,
  useModalLifecycle,
} from './useModalLifecycle';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  document.body.replaceChildren();
});

describe('useModalLifecycle', () => {
  it('keeps body scroll locked until the final nested modal releases it', () => {
    document.body.style.overflow = 'scroll';

    const first = renderHook(
      ({ active }) => useModalLifecycle({ active, restoreFocus: false }),
      { initialProps: { active: true } },
    );
    const second = renderHook(
      ({ active }) => useModalLifecycle({ active, restoreFocus: false }),
      { initialProps: { active: true } },
    );

    expect(document.body.style.overflow).toBe('hidden');

    first.rerender({ active: false });
    expect(document.body.style.overflow).toBe('hidden');

    second.rerender({ active: false });
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('places initial focus and restores the connected previous element', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'trigger';
    document.body.append(trigger);
    trigger.focus();

    function Harness({ active }: { active: boolean }) {
      const initialRef = useRef<HTMLButtonElement>(null);
      useModalLifecycle({ active, initialFocusRef: initialRef });
      return <button ref={initialRef}>inside</button>;
    }

    const view = render(<Harness active={false} />);
    trigger.focus();
    view.rerender(<Harness active />);

    expect(document.activeElement?.textContent).toBe('inside');

    view.rerender(<Harness active={false} />);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe('containModalTabFocus', () => {
  it('wraps Tab and Shift+Tab within a custom dialog', () => {
    const view = render(
      <section>
        <button>first</button>
        <button>last</button>
      </section>,
    );
    const container = view.container.querySelector('section');
    const [first, last] = Array.from(
      view.container.querySelectorAll<HTMLButtonElement>('button'),
    );

    last.focus();
    const forward = {
      key: 'Tab',
      shiftKey: false,
      preventDefault: () => undefined,
    };
    expect(containModalTabFocus(forward, container)).toBe(true);
    expect(document.activeElement).toBe(first);

    first.focus();
    const backward = {
      key: 'Tab',
      shiftKey: true,
      preventDefault: () => undefined,
    };
    expect(containModalTabFocus(backward, container)).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('can pull focus back into a custom dialog when requested', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const view = render(
      <section>
        <button>first</button>
        <button>last</button>
      </section>,
    );
    const container = view.container.querySelector('section');
    const first = view.getByText('first');

    outside.focus();
    const event = {
      key: 'Tab',
      shiftKey: false,
      preventDefault: () => undefined,
    };

    expect(
      containModalTabFocus(event, container, { wrapFromOutside: true }),
    ).toBe(true);
    expect(document.activeElement).toBe(first);
  });
});
